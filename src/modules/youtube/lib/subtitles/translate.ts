import { errorKind } from "@/core/errors";
import { externalFetch } from "@/core/external-url";
import { relevantGlossary, type GlossaryEntry } from "../parse";
import type { Batch } from "./batches";
import type { Cue } from "./format";
import { AI_PROVIDER_NAMES, type AiProvider } from "./providers";

export type { AiProvider } from "./providers";
export type AiConfig = { provider: AiProvider; apiKey: string; model: string };

/** Claude 選便宜的 Haiku；OpenAI 與 Gemini 的模型更新很快，這兩個只是建議值 */
export const DEFAULT_MODELS: Record<AiProvider, string> = {
  anthropic: "claude-haiku-4-5",
  openai: "gpt-4.1-mini",
  gemini: "gemini-3.8-flash",
};

/** 單次呼叫 AI（含讀完回應）的上限；翻譯鎖的期限要比這個長 */
export const AI_TIMEOUT_MS = 120_000;

/** refused：模型拒絕翻譯這段內容；它跟 bad_output 是字幕內容的問題，換誰的 API Key 都一樣，其他是觀看者自己的金鑰、額度或連線問題 */
export class AiError extends Error {
  constructor(
    readonly kind: "auth" | "rate_limit" | "quota" | "bad_output" | "refused" | "network" | "other",
    message: string,
  ) {
    super(message);
    this.name = "AiError";
  }
}

const SYSTEM_PROMPT = `你是專業的韓文字幕譯者，專門翻譯 K-pop 團體、韓國綜藝與直播影片，把韓文字幕翻成台灣觀眾習慣的繁體中文。

# 輸入與輸出
- 輸入是 JSON：lines 是要翻譯的字幕，一個元素一句；context_before／context_after 是前後文，只用來理解語意，不要翻譯也不要輸出。
- glossary 是專有名詞表：遇到 source 一律譯成 target（成員名、團名、節目名以此為準）。
- 只輸出 JSON 物件 {"lines": [...]}，句數與順序必須和輸入完全相同：一句對一句，不合併、不拆開、不省略。

# 翻譯原則
- 台灣口語、自然簡短，一眼就能讀完；用台灣用詞（影片、品質、粉絲），不用中國用語（視頻、質量）。
- 依前後文翻出語氣與情緒，意譯優先、不逐字直譯；韓式玩笑或諧音梗改成中文觀眾看得懂的說法。
- 오빠／언니／형／누나 依情境譯成「哥」「姊」或直接稱名字，不要音譯；敬語與半語用語氣呈現，不必刻意加「您」。
- 感嘆詞與狀聲詞（와、헐、대박…）翻成自然的中文反應（哇、天啊、太扯了），不保留韓文。
- 歌詞照意思翻，保持簡短有節奏。
- 團名與藝名沿用粉絲慣用寫法（通常是英文，例如 NewJeans、IVE）；沒有慣用譯名的人名、地名、品牌保留原文，不自創音譯。
- 數字、英文、表情符號照原樣保留；原句有換行就保留換行。
- 不加註解、說明、括號補充或譯者的話。`;

type TranslateArgs = {
  cues: Cue[];
  batch: Batch;
  ai: AiConfig;
  glossary: GlossaryEntry[];
  context?: { before: string[]; after: string[] };
  /** 每次呼叫 AI 前執行（更新翻譯鎖的心跳）；丟錯就中止，不呼叫 AI */
  beforeCall?: () => Promise<void>;
  fetchImpl?: typeof fetch;
};

export async function translateBatch(args: TranslateArgs): Promise<string[]> {
  const source = args.cues.slice(args.batch.start, args.batch.end).map((cue) => cue.text);
  if (source.length === 0) return [];

  const before = args.context?.before ?? [];
  const after = args.context?.after ?? [];
  const input = JSON.stringify({
    glossary: relevantGlossary(args.glossary, [...before, ...source, ...after]),
    context_before: before,
    context_after: after,
    lines: source,
  });

  // 模型偶爾會合併或拆開句子，句數不符時重試一次並明確提醒
  for (const reminder of ["", `\n\n注意：上一次輸出的句數不對。lines 必須剛好 ${source.length} 句。`]) {
    await args.beforeCall?.();
    const text = await callProvider(args.ai, input + reminder, args.fetchImpl ?? fetch);
    const lines = parseLines(text, source.length);
    if (lines) return lines;
  }
  throw new AiError("bad_output", `AI 回傳的格式或句數不正確（預期 ${source.length} 句），請重試或換一個模型`);
}

function parseLines(text: string, expected: number): string[] | null {
  let body = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(body);
  if (fenced) body = fenced[1];

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    const first = body.indexOf("{");
    const last = body.lastIndexOf("}");
    if (first < 0 || last <= first) return null;
    try {
      parsed = JSON.parse(body.slice(first, last + 1));
    } catch {
      return null;
    }
  }

  const lines = (parsed as { lines?: unknown } | null)?.lines;
  if (!Array.isArray(lines) || lines.length !== expected || !lines.every((l) => typeof l === "string")) return null;
  return lines.map((l: string) => l.trim());
}

type ProviderRequest = { url: string; headers: Record<string, string>; body: unknown; read: (json: unknown) => string };

function buildRequest(ai: AiConfig, user: string): ProviderRequest {
  switch (ai.provider) {
    case "anthropic":
      return {
        url: "https://api.anthropic.com/v1/messages",
        headers: { "x-api-key": ai.apiKey, "anthropic-version": "2023-06-01" },
        // 不送 temperature：較新的 Claude 模型設定非預設值會回 400
        body: { model: ai.model, max_tokens: 16000, system: SYSTEM_PROMPT, messages: [{ role: "user", content: user }] },
        read: (json) => {
          const message = json as { content?: Array<{ type: string; text?: string }>; stop_reason?: string };
          if (message.stop_reason === "refusal") throw new AiError("refused", "Claude 拒絕翻譯這段內容");
          return (message.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
        },
      };
    case "openai":
      return {
        url: "https://api.openai.com/v1/chat/completions",
        headers: { Authorization: `Bearer ${ai.apiKey}` },
        // 不送 temperature：推理類模型只接受預設值
        body: {
          model: ai.model,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: user },
          ],
        },
        read: (json) => {
          const message = (json as { choices?: Array<{ message?: { content?: string | null; refusal?: string | null } }> })
            .choices?.[0]?.message;
          if (message?.refusal) throw new AiError("refused", "OpenAI 拒絕翻譯這段內容");
          return message?.content ?? "";
        },
      };
    case "gemini":
      return {
        url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(ai.model)}:generateContent`,
        headers: { "x-goog-api-key": ai.apiKey },
        body: {
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
        },
        read: (json) => {
          const result = json as {
            promptFeedback?: { blockReason?: string };
            candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
          };
          if (result.promptFeedback?.blockReason) throw new AiError("refused", "Gemini 拒絕翻譯這段內容");
          return (result.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
        },
      };
  }
}

async function callProvider(ai: AiConfig, user: string, fetchImpl: typeof fetch): Promise<string> {
  const request = buildRequest(ai, user);
  const name = AI_PROVIDER_NAMES[ai.provider];

  let response: Response;
  try {
    response = await externalFetch(
      request.url,
      { method: "POST", headers: { "Content-Type": "application/json", ...request.headers }, body: JSON.stringify(request.body), cache: "no-store" },
      { timeoutMs: AI_TIMEOUT_MS, fetchImpl },
    );
  } catch (error) {
    // 例外訊息可能帶有請求內容，只回報錯誤種類
    throw new AiError("network", `連不上 ${name} API（${errorKind(error)}）`);
  }

  let text: string;
  try {
    text = await response.text();
  } catch (error) {
    throw new AiError("network", `讀取 ${name} API 回應時中斷（${errorKind(error)}）`);
  }
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    // 非 JSON 的錯誤頁，下面只用狀態碼判斷
  }

  if (!response.ok) throw classify(ai, name, response, json);
  // 200 但不是 JSON 或結構不對（例如閘道錯誤頁）：回空字串，交給上層當成輸出格式錯誤重試
  try {
    const output = request.read(json);
    return typeof output === "string" ? output : "";
  } catch (error) {
    if (error instanceof AiError) throw error;
    return "";
  }
}

function classify(ai: AiConfig, name: string, response: Response, json: unknown): AiError {
  const error = ((json as { error?: unknown } | null)?.error ?? {}) as {
    message?: string;
    code?: string;
    type?: string;
    details?: Array<{ reason?: string }>;
  };
  const detail = redact(String(error.message ?? ""), ai.apiKey);
  const status = response.status;

  const invalidGeminiKey =
    ai.provider === "gemini" && (error.details?.some((d) => d.reason === "API_KEY_INVALID") || /API key not valid/i.test(detail));
  if (status === 401 || status === 403 || invalidGeminiKey) {
    return new AiError("auth", `${name} API Key 無效或沒有權限，請到設定頁確認`);
  }
  if (status === 429) {
    if (error.code === "insufficient_quota" || error.type === "insufficient_quota") {
      return new AiError("quota", `${name} 帳號額度已用完，請到 ${name} 後台確認付費設定`);
    }
    const retryAfter = response.headers.get("retry-after");
    const wait = retryAfter && /^\d+$/.test(retryAfter) ? `，請約 ${retryAfter} 秒後再試` : "，請稍後再試";
    return new AiError("rate_limit", `${name} 請求太頻繁${wait}`);
  }
  return new AiError("other", `${name} API 錯誤（HTTP ${status}）${detail ? `：${detail.slice(0, 200)}` : ""}`);
}

/** 供應商的錯誤訊息有時會回顯金鑰（完整或部分遮罩），一律換掉 */
function redact(message: string, apiKey: string): string {
  let out = apiKey ? message.split(apiKey).join("***") : message;
  out = out.replace(/sk-[A-Za-z0-9*_-]{4,}/g, "***").replace(/AIza[0-9A-Za-z_-]{10,}/g, "***");
  return out;
}
