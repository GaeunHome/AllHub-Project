import { afterEach, describe, expect, it, vi } from "vitest";
import { inOrder, fakeFetch as recordFetch, type FakeFetchCall } from "@/dev/fake-fetch";
import { AiError, DEFAULT_MODELS, translateBatch, type AiConfig, type AiProvider } from "./translate";
import type { Cue } from "./format";

const cues: Cue[] = [
  { start: 0, end: 1000, text: "안녕하세요" },
  { start: 1000, end: 2000, text: "지수입니다" },
  { start: 2000, end: 3000, text: "블랙핑크\n화이팅" },
  { start: 3000, end: 4000, text: "감사합니다" },
];
const batch = { start: 1, end: 3 };
const glossary = [{ source: "지수", target: "Jisoo" }];
const KEY = "sk-test-SUPERSECRET123";

/** 各家回應格式不同，這裡包成同一種寫法 */
function providerBody(provider: AiProvider, text: string): unknown {
  switch (provider) {
    case "anthropic":
      return { content: [{ type: "thinking", thinking: "" }, { type: "text", text }], stop_reason: "end_turn" };
    case "openai":
      return { choices: [{ message: { content: text }, finish_reason: "stop" }] };
    case "gemini":
      return { candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }] };
  }
}

type Call = FakeFetchCall;

/** 依序回應的假 fetch */
const fakeFetch = (responses: Array<() => Response>) => recordFetch(inOrder(...responses));

const ok = (provider: AiProvider, text: string) => () => Response.json(providerBody(provider, text));
const lines = (...l: string[]) => JSON.stringify({ lines: l });
const ai = (provider: AiProvider): AiConfig => ({ provider, apiKey: KEY, model: DEFAULT_MODELS[provider] });
const headersOf = (call: Call) => new Headers(call.init.headers);
const promptText = (call: Call) => JSON.stringify(call.body);

afterEach(() => vi.unstubAllEnvs());

describe("translateBatch：各家請求格式", () => {
  it("Anthropic：x-api-key、anthropic-version、預設 claude-haiku-4-5、不送 temperature", async () => {
    const { impl, calls } = fakeFetch([ok("anthropic", lines("Jisoo 我是", "BLACKPINK\n加油"))]);

    const result = await translateBatch({ cues, batch, ai: ai("anthropic"), glossary, fetchImpl: impl });

    expect(result).toEqual(["Jisoo 我是", "BLACKPINK\n加油"]);
    expect(calls[0].url).toBe("https://api.anthropic.com/v1/messages");
    expect(calls[0].init.method).toBe("POST");
    expect(headersOf(calls[0]).get("x-api-key")).toBe(KEY);
    expect(headersOf(calls[0]).get("anthropic-version")).toBe("2023-06-01");
    expect(calls[0].body.model).toBe("claude-haiku-4-5");
    expect(calls[0].body).not.toHaveProperty("temperature");
    expect(calls[0].body.max_tokens).toEqual(expect.any(Number));
  });

  it("OpenAI：Bearer、chat/completions、json_object", async () => {
    const { impl, calls } = fakeFetch([ok("openai", lines("a", "b"))]);
    await translateBatch({ cues, batch, ai: ai("openai"), glossary, fetchImpl: impl });
    expect(calls[0].url).toBe("https://api.openai.com/v1/chat/completions");
    expect(headersOf(calls[0]).get("authorization")).toBe(`Bearer ${KEY}`);
    expect(calls[0].body.response_format).toEqual({ type: "json_object" });
    expect(calls[0].body.model).toBe(DEFAULT_MODELS.openai);
  });

  it("Gemini：模型放在網址、x-goog-api-key、responseMimeType", async () => {
    const { impl, calls } = fakeFetch([ok("gemini", lines("a", "b"))]);
    await translateBatch({ cues, batch, ai: { ...ai("gemini"), model: "gemini-test" }, glossary, fetchImpl: impl });
    expect(calls[0].url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent");
    expect(headersOf(calls[0]).get("x-goog-api-key")).toBe(KEY);
    expect(calls[0].url).not.toContain(KEY);
    expect(calls[0].body).toMatchObject({ generationConfig: { responseMimeType: "application/json" } });
  });

  it.each<AiProvider>(["anthropic", "openai", "gemini"])("%s：prompt 含本批原文、專有名詞表與前後文", async (provider) => {
    const { impl, calls } = fakeFetch([ok(provider, lines("a", "b"))]);
    await translateBatch({
      cues, batch, ai: ai(provider), glossary, fetchImpl: impl,
      context: { before: ["안녕하세요"], after: ["감사합니다"] },
    });
    const prompt = promptText(calls[0]);
    for (const expected of ["지수입니다", "블랙핑크", "Jisoo", "안녕하세요", "감사합니다", "繁體中文"]) {
      expect(prompt).toContain(JSON.stringify(expected).slice(1, -1));
    }
  });

  it("請求會經過 externalUrl", async () => {
    vi.stubEnv("DEV_EXTERNAL_ORIGIN", "http://127.0.0.1:4010");
    const { impl, calls } = fakeFetch([ok("openai", lines("a", "b"))]);
    await translateBatch({ cues, batch, ai: ai("openai"), glossary, fetchImpl: impl });
    expect(calls[0].url).toBe("http://127.0.0.1:4010/v1/chat/completions");
  });
});

describe("translateBatch：解析輸出", () => {
  it("空批次直接回空陣列，不呼叫 API", async () => {
    const { impl, calls } = fakeFetch([]);
    expect(await translateBatch({ cues, batch: { start: 2, end: 2 }, ai: ai("openai"), glossary, fetchImpl: impl })).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("容忍 ```json code fence 與前後空白", async () => {
    const { impl } = fakeFetch([ok("anthropic", "```json\n" + lines(" 你好 ", "再見") + "\n```")]);
    expect(await translateBatch({ cues, batch, ai: ai("anthropic"), glossary, fetchImpl: impl })).toEqual(["你好", "再見"]);
  });

  it("句數不符時重試一次，第二次正確就成功", async () => {
    const { impl, calls } = fakeFetch([ok("openai", lines("只有一句")), ok("openai", lines("一", "二"))]);
    expect(await translateBatch({ cues, batch, ai: ai("openai"), glossary, fetchImpl: impl })).toEqual(["一", "二"]);
    expect(calls).toHaveLength(2);
  });

  it("連續兩次句數不符 → AiError(bad_output)", async () => {
    const { impl, calls } = fakeFetch([ok("openai", lines("一"))]);
    await expect(translateBatch({ cues, batch, ai: ai("openai"), glossary, fetchImpl: impl })).rejects.toMatchObject({
      kind: "bad_output",
    });
    expect(calls).toHaveLength(2);
  });

  it.each([
    ["不是 JSON", "抱歉我無法翻譯"],
    ["lines 不是陣列", JSON.stringify({ lines: "一,二" })],
    ["元素不是字串", JSON.stringify({ lines: ["一", 2] })],
  ])("%s → 重試後仍錯則 bad_output", async (_name, text) => {
    const { impl } = fakeFetch([ok("gemini", text)]);
    const error = await translateBatch({ cues, batch, ai: ai("gemini"), glossary, fetchImpl: impl }).catch((e) => e);
    expect(error).toBeInstanceOf(AiError);
    expect(error.kind).toBe("bad_output");
  });

  it("Anthropic 拒答（refusal）→ AiError，不當成翻譯結果", async () => {
    const { impl } = fakeFetch([() => Response.json({ content: [], stop_reason: "refusal" })]);
    const error = await translateBatch({ cues, batch, ai: ai("anthropic"), glossary, fetchImpl: impl }).catch((e) => e);
    expect(error).toBeInstanceOf(AiError);
  });
});

describe("translateBatch：HTTP 200 但內容不對", () => {
  const html200 = () => new Response("<html>502 Bad Gateway</html>", { status: 200, headers: { "content-type": "text/html" } });

  it.each<AiProvider>(["anthropic", "openai", "gemini"])("%s：回應不是 JSON（例如閘道錯誤頁）→ 重試一次，仍錯則 bad_output", async (provider) => {
    const { impl, calls } = fakeFetch([html200]);
    const error = await translateBatch({ cues, batch, ai: ai(provider), glossary, fetchImpl: impl }).catch((e) => e);
    expect(error).toBeInstanceOf(AiError);
    expect(error.kind).toBe("bad_output");
    expect(calls).toHaveLength(2);
  });

  it("回應不是 JSON、重試時正常 → 成功", async () => {
    const { impl } = fakeFetch([html200, ok("gemini", lines("一", "二"))]);
    expect(await translateBatch({ cues, batch, ai: ai("gemini"), glossary, fetchImpl: impl })).toEqual(["一", "二"]);
  });

  it.each<[AiProvider, unknown]>([
    ["anthropic", { content: "not-an-array" }],
    ["openai", { choices: [{ message: { content: 123 } }] }],
    ["gemini", { candidates: [{ content: { parts: "x" } }] }],
    ["anthropic", null],
  ])("%s：JSON 結構不對 → bad_output（第 %#）", async (provider, body) => {
    const { impl, calls } = fakeFetch([() => Response.json(body)]);
    const error = await translateBatch({ cues, batch, ai: ai(provider), glossary, fetchImpl: impl }).catch((e) => e);
    expect(error).toBeInstanceOf(AiError);
    expect(error.kind).toBe("bad_output");
    expect(calls).toHaveLength(2);
  });

  it("讀取回應內容時斷線 → network，訊息不含細節", async () => {
    const broken = () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new TypeError(`terminated ${KEY}`));
          },
        }),
        { status: 200 },
      );
    const { impl } = fakeFetch([broken]);
    const error = await translateBatch({ cues, batch, ai: ai("openai"), glossary, fetchImpl: impl }).catch((e) => e);
    expect(error).toBeInstanceOf(AiError);
    expect(error.kind).toBe("network");
    expect(error.message).not.toContain(KEY);
  });
});

describe("translateBatch：beforeCall（翻譯鎖的心跳）", () => {
  it("每次呼叫 AI 前都先執行，句數不符的重試也算", async () => {
    const order: string[] = [];
    const tracked = (respond: () => Response) => () => {
      order.push("AI");
      return respond();
    };
    const { impl } = fakeFetch([tracked(ok("openai", lines("只有一句"))), tracked(ok("openai", lines("一", "二")))]);
    const beforeCall = async () => {
      order.push("心跳");
    };

    expect(await translateBatch({ cues, batch, ai: ai("openai"), glossary, fetchImpl: impl, beforeCall })).toEqual(["一", "二"]);
    expect(order).toEqual(["心跳", "AI", "心跳", "AI"]);
  });

  it("beforeCall 丟錯（例如鎖已被拿走）→ 不呼叫 AI，錯誤原樣往上丟", async () => {
    const lost = new Error("lock lost");
    const { impl, calls } = fakeFetch([ok("openai", lines("一", "二"))]);
    const beforeCall = async () => {
      throw lost;
    };
    await expect(translateBatch({ cues, batch, ai: ai("openai"), glossary, fetchImpl: impl, beforeCall })).rejects.toBe(lost);
    expect(calls).toHaveLength(0);
  });
});

describe("translateBatch：錯誤分類與金鑰保護", () => {
  const status = (code: number, body: unknown, headers?: HeadersInit) => () =>
    new Response(JSON.stringify(body), { status: code, headers: { "content-type": "application/json", ...headers } });

  it.each<[AiProvider, () => Response, AiError["kind"]]>([
    ["anthropic", status(401, { error: { message: `invalid x-api-key ${KEY}` } }), "auth"],
    ["openai", status(403, { error: { message: "forbidden" } }), "auth"],
    ["gemini", status(400, { error: { status: "INVALID_ARGUMENT", message: "API key not valid. Please pass a valid API key.", details: [{ reason: "API_KEY_INVALID" }] } }), "auth"],
    ["gemini", status(400, { error: { status: "INVALID_ARGUMENT", message: "bad request" } }), "other"],
    ["anthropic", status(429, { error: { message: "rate limited" } }, { "retry-after": "20" }), "rate_limit"],
    ["openai", status(429, { error: { code: "insufficient_quota", message: "You exceeded your current quota" } }), "quota"],
    ["gemini", status(500, { error: { message: "internal" } }), "other"],
  ])("%s HTTP 錯誤 → %s 類（第 %#）", async (provider, response, kind) => {
    const { impl, calls } = fakeFetch([response]);
    const error = await translateBatch({ cues, batch, ai: ai(provider), glossary, fetchImpl: impl }).catch((e) => e);
    expect(error).toBeInstanceOf(AiError);
    expect(error.kind).toBe(kind);
    expect(calls).toHaveLength(1);
  });

  it("429 帶 retry-after 時訊息提示等待秒數", async () => {
    const { impl } = fakeFetch([status(429, {}, { "retry-after": "20" })]);
    const error = await translateBatch({ cues, batch, ai: ai("anthropic"), glossary, fetchImpl: impl }).catch((e) => e);
    expect(error.message).toContain("20");
  });

  it("網路例外 → network", async () => {
    const { impl } = recordFetch(() => {
      throw new TypeError(`fetch failed for key ${KEY}`);
    });
    const error = await translateBatch({ cues, batch, ai: ai("openai"), glossary, fetchImpl: impl }).catch((e) => e);
    expect(error).toBeInstanceOf(AiError);
    expect(error.kind).toBe("network");
    expect(error.message).not.toContain(KEY);
  });

  it.each([
    ["完整金鑰", `Incorrect API key provided: ${KEY}`],
    ["OpenAI 遮罩過的部分金鑰", "Incorrect API key provided: sk-test-****T123. You can find your API key at ..."],
    ["Gemini 金鑰格式", "API key AIzaSyA1234567890abcdefghijklmnopqrstu is invalid"],
  ])("其他錯誤會帶出供應商訊息，但不含 API key（%s）", async (_name, message) => {
    const { impl } = fakeFetch([status(400, { error: { message } })]);
    const error = await translateBatch({ cues, batch, ai: ai("openai"), glossary, fetchImpl: impl }).catch((e) => e);
    expect(error.message).not.toContain(KEY);
    expect(error.message).not.toMatch(/sk-[A-Za-z0-9*_-]{4,}/);
    expect(error.message).not.toMatch(/AIza[0-9A-Za-z_-]{10,}/);
    expect(error.kind).toBe("other");
    expect(error.message).toContain("HTTP 400");
  });
});
