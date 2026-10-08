import { errorKind } from "@/core/errors";
import { VIDEO_ID } from "../parse";
import { youtubeWatchUrl } from "../urls";
import { fetchYoutubePage } from "../youtube-fetch";
import type { Cue } from "./format";

// 官方 API 只能下載自己頻道的字幕，只好讀觀看頁的 ytInitialPlayerResponse（非官方、未經真實 YouTube 驗證）；雲端主機常被要求驗證或 PO token，那時改請使用者上傳字幕檔

export type CaptionFetchResult =
  | { ok: true; cues: Cue[]; kind: "manual" | "auto"; language: string }
  | { ok: false; reason: "no_korean" | "blocked" | "unavailable" | "error"; message: string };

/** automatic：自動產生（asr）；translated：YouTube 自動翻譯出來的（網址帶 tlang） */
export type CaptionTrackInfo = { languageCode: string; automatic: boolean; translated: boolean };
export type CaptionListResult = { ok: true; tracks: CaptionTrackInfo[] } | { ok: false; reason: "blocked" | "unavailable" | "error"; message: string };

type PageFailure = Extract<CaptionListResult, { ok: false }>;
type CaptionTrack = { baseUrl?: string; languageCode?: string; kind?: string; vssId?: string };
type Json3Event = { tStartMs?: number; dDurationMs?: number; segs?: Array<{ utf8?: string }> };

const UPLOAD_HINT = "請改上傳字幕檔（例如 yt-dlp --write-subs --write-auto-subs --sub-langs ko --skip-download <影片網址>）";

type FailureReason = Extract<CaptionFetchResult, { ok: false }>["reason"];

// 回傳的 reason 保留字面型別，同一個 helper 才能同時給韓文字幕與字幕清單用
const fail = <R extends FailureReason>(reason: R, message: string) => ({ ok: false as const, reason, message });

// 中文字幕只認這些語言代碼的人工字幕；自動產生與自動翻譯的都不算
const CHINESE_LANGUAGES = new Set(["zh-hant", "zh-tw", "zh-hk", "zh", "zh-hans", "zh-cn"]);

export async function fetchKoreanCaptions(videoId: string, opts: { fetchImpl?: typeof fetch } = {}): Promise<CaptionFetchResult> {
  if (!VIDEO_ID.test(videoId)) return fail("error", "影片 ID 格式不正確");
  const fetchImpl = opts.fetchImpl ?? fetch;

  try {
    const loaded = await loadPlayer(videoId, fetchImpl);
    if (!loaded.ok) return loaded;

    const tracks = readTracks(loaded.player);
    const korean = tracks.filter((t) => t.baseUrl && /^ko(-|$)/i.test(t.languageCode ?? ""));
    const track = korean.find((t) => t.kind !== "asr") ?? korean[0];
    if (!track?.baseUrl) {
      return fail("no_korean", tracks.length ? "這支影片沒有韓文字幕" : "這支影片沒有任何字幕");
    }

    const download = new URL(track.baseUrl, "https://www.youtube.com");
    // 網址來自頁面內容，只接受 YouTube 自己的網址，避免被導去抓別的地方
    if (!isYoutubeUrl(download)) return fail("error", "字幕網址不是 YouTube 的網址");
    download.searchParams.set("fmt", "json3");
    const response = await fetchYoutubePage(download.toString(), { cache: "no-store", fetchImpl });
    if (response.status === 429) return fail("blocked", `YouTube 暫時拒絕下載字幕。${UPLOAD_HINT}`);
    if (!response.ok) return fail("error", `下載字幕失敗（HTTP ${response.status}）`);

    const body = await response.text();
    // 需要 PO token 時 YouTube 會回 200 但內容是空的
    if (!body.trim()) return fail("blocked", `YouTube 沒有回傳字幕內容（可能需要額外驗證）。${UPLOAD_HINT}`);

    const cues = json3ToCues(body);
    if (!cues) return fail("error", "字幕內容格式無法辨識");
    if (cues.length === 0) return fail("no_korean", "韓文字幕是空的");

    return { ok: true, cues, kind: track.kind === "asr" ? "auto" : "manual", language: track.languageCode ?? "ko" };
  } catch (error) {
    return fail("error", `連不上 YouTube（${errorKind(error)}）`);
  }
}

/** 列出影片的字幕軌，用來判斷有沒有人工上傳的中文字幕；跟抓韓文字幕一樣讀觀看頁的 ytInitialPlayerResponse */
export async function listCaptionTracks(videoId: string, opts: { fetchImpl?: typeof fetch } = {}): Promise<CaptionListResult> {
  if (!VIDEO_ID.test(videoId)) return fail("error", "影片 ID 格式不正確");
  try {
    const loaded = await loadPlayer(videoId, opts.fetchImpl ?? fetch);
    if (!loaded.ok) return loaded;
    return { ok: true, tracks: readTracks(loaded.player).flatMap(toTrackInfo) };
  } catch (error) {
    return fail("error", `連不上 YouTube（${errorKind(error)}）`);
  }
}

export function hasChineseCaptions(tracks: CaptionTrackInfo[]): boolean {
  return tracks.some((track) => !track.automatic && !track.translated && CHINESE_LANGUAGES.has(track.languageCode.toLowerCase()));
}

function toTrackInfo(track: CaptionTrack): CaptionTrackInfo[] {
  if (!track.languageCode) return [];
  return [
    {
      languageCode: track.languageCode,
      automatic: track.kind === "asr" || Boolean(track.vssId?.startsWith("a.")),
      translated: Boolean(track.baseUrl && /[?&]tlang=/.test(track.baseUrl)),
    },
  ];
}

/** 讀觀看頁並取出播放資訊；抓韓文字幕與判斷中文字幕共用 */
async function loadPlayer(videoId: string, fetchImpl: typeof fetch): Promise<{ ok: true; player: Record<string, unknown> } | PageFailure> {
  const page = await fetchYoutubePage(youtubeWatchUrl(videoId), { cache: "no-store", fetchImpl });
  if (page.status === 429) return fail("blocked", `YouTube 暫時拒絕這台伺服器的請求。${UPLOAD_HINT}`);
  if (!page.ok) return fail("unavailable", `讀取影片頁面失敗（HTTP ${page.status}）`);

  const player = extractPlayerResponse(await page.text());
  if (!player) return fail("blocked", `YouTube 沒有回傳播放資訊（可能要求同意條款或驗證）。${UPLOAD_HINT}`);

  return readPlayability(player) ?? { ok: true, player };
}

function isYoutubeUrl(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  return url.protocol === "https:" && (host === "youtube.com" || host.endsWith(".youtube.com"));
}

/** 標題、說明裡也可能出現這段字，所以逐一嘗試，取第一個解析得出、而且真的是播放資訊的那一段 */
function extractPlayerResponse(html: string): Record<string, unknown> | null {
  for (const match of html.matchAll(/ytInitialPlayerResponse\s*=\s*\{/g)) {
    const json = balancedObject(html, match.index + match[0].length - 1);
    if (!json) continue;
    try {
      const parsed: unknown = JSON.parse(json);
      if (parsed && typeof parsed === "object" && ("playabilityStatus" in parsed || "captions" in parsed)) return parsed as Record<string, unknown>;
    } catch {
      // 不是這一段，試下一個
    }
  }
  return null;
}

/** 從 start 的 { 開始配對到對應的 }；用括號配對而不是正規表示式，因為內容含巢狀物件與字串中的大括號 */
function balancedObject(html: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return html.slice(start, i + 1);
  }
  return null;
}

function readPlayability(player: Record<string, unknown>): PageFailure | null {
  const status = (player.playabilityStatus ?? {}) as { status?: string; reason?: string };
  if (!status.status || status.status === "OK") return null;

  const reason = status.reason ?? status.status;
  if (status.status === "LOGIN_REQUIRED" && /bot|機器人|로봇/i.test(reason)) {
    return fail("blocked", `YouTube 要求驗證不是機器人。${UPLOAD_HINT}`);
  }
  return fail("unavailable", `影片無法播放：${reason}`);
}

function readTracks(player: Record<string, unknown>): CaptionTrack[] {
  const captions = player.captions as { playerCaptionsTracklistRenderer?: { captionTracks?: unknown } } | undefined;
  const tracks = captions?.playerCaptionsTracklistRenderer?.captionTracks;
  return Array.isArray(tracks) ? (tracks as CaptionTrack[]) : [];
}

/** json3 → cue；自動字幕的事件會重疊，結束時間截到下一句開始，避免兩句同時顯示 */
function json3ToCues(body: string): Cue[] | null {
  let events: Json3Event[];
  try {
    const parsed = JSON.parse(body) as { events?: unknown };
    if (!Array.isArray(parsed.events)) return null;
    events = parsed.events as Json3Event[];
  } catch {
    return null;
  }

  const cues = events
    .filter((e) => Array.isArray(e.segs) && typeof e.tStartMs === "number")
    .map((e) => ({
      start: e.tStartMs!,
      end: e.tStartMs! + (e.dDurationMs ?? 0),
      text: e.segs!.map((s) => s.utf8 ?? "").join("").split("\n").map((l) => l.trim()).filter(Boolean).join("\n"),
    }))
    .filter((cue) => cue.text);

  return cues.map((cue, i) => {
    const next = cues[i + 1];
    return next && next.start < cue.end && next.start > cue.start ? { ...cue, end: next.start } : cue;
  });
}
