import { errorKind } from "@/core/errors";
import { asRecord } from "@/core/json";
import { VIDEO_ID } from "../parse";
import { tidyLines } from "../text";
import { isYoutubeHttpsUrl, youtubeWatchUrl } from "../urls";
import { fetchInnertubePlayer, fetchYoutubePage } from "../youtube-fetch";
import type { Cue } from "./format";

// 官方 API 只能抓自己頻道的字幕 先讀觀看頁的 ytInitialPlayerResponse 讀不到再問 InnerTube
// 兩個都非官方 雲端主機可能一起被擋 那時改請使用者上傳字幕檔

export type CaptionFetchResult =
  | { ok: true; cues: Cue[]; kind: "manual" | "auto"; language: string }
  | { ok: false; reason: "no_korean" | "blocked" | "unavailable" | "error"; message: string };

type PageFailure = { ok: false; reason: "blocked" | "unavailable" | "error"; message: string };
type Player = Record<string, unknown>;
type PlayerResult = { ok: true; player: Player } | PageFailure;
type LoadedPlayer = { ok: true; player: Player; source: "watch" | "innertube" };
type CaptionTrack = { baseUrl?: string; languageCode?: string; kind?: string; vssId?: string };
type Json3Event = { tStartMs?: number; dDurationMs?: number; segs?: Array<{ utf8?: string }> };

const UPLOAD_HINT = "請改上傳字幕檔（例如 yt-dlp --write-subs --write-auto-subs --sub-langs ko --skip-download <影片網址>）";
const NO_PLAYER_MESSAGE = `YouTube 沒有回傳播放資訊（可能要求同意條款或驗證）。${UPLOAD_HINT}`;

type FailureReason = Extract<CaptionFetchResult, { ok: false }>["reason"];

// reason 保留字面型別 回傳值才能當成讀取失敗或抓字幕失敗用
const fail = <R extends FailureReason>(reason: R, message: string) => ({ ok: false as const, reason, message });

export async function fetchKoreanCaptions(videoId: string, opts: { fetchImpl?: typeof fetch } = {}): Promise<CaptionFetchResult> {
  if (!VIDEO_ID.test(videoId)) return fail("error", "影片 ID 格式不正確");
  const fetchImpl = opts.fetchImpl ?? fetch;

  const loaded = await loadPlayer(videoId, fetchImpl);
  if (!loaded.ok) return loaded;
  const result = await downloadKorean(loaded.player, fetchImpl);
  if (result.ok || result.reason !== "blocked" || loaded.source === "innertube") return result;

  // 觀看頁的字幕網址要 PO token 下載回空內容 InnerTube 給的網址不用
  const second = await readSource(() => loadInnertube(videoId, fetchImpl));
  return second.ok ? downloadKorean(second.player, fetchImpl) : result;
}

async function downloadKorean(player: Player, fetchImpl: typeof fetch): Promise<CaptionFetchResult> {
  try {
    const tracks = readTracks(player);
    const korean = tracks.filter((t) => t.baseUrl && /^ko(-|$)/i.test(t.languageCode ?? ""));
    const track = korean.find((t) => t.kind !== "asr") ?? korean[0];
    if (!track?.baseUrl) {
      return fail("no_korean", tracks.length ? "這支影片沒有韓文字幕" : "這支影片沒有任何字幕");
    }

    const download = new URL(track.baseUrl, "https://www.youtube.com");
    // 網址來自頁面內容 只收 YouTube 自己的 免得被導去抓別的地方
    if (!isYoutubeHttpsUrl(download)) return fail("error", "字幕網址不是 YouTube 的網址");
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

/**
 * 觀看頁讀不到時再問 InnerTube
 * 兩個都讀不到才算失敗 原因用觀看頁的 影片不存在時也一樣多問一次
 */
async function loadPlayer(videoId: string, fetchImpl: typeof fetch): Promise<LoadedPlayer | PageFailure> {
  const page = await readSource(() => loadWatchPage(videoId, fetchImpl));
  if (page.ok) return { ...page, source: "watch" };
  const second = await readSource(() => loadInnertube(videoId, fetchImpl));
  return second.ok ? { ...second, source: "innertube" } : page;
}

/** 連線錯誤也算這個來源讀不到 才換得到下一個來源 */
async function readSource(load: () => Promise<PlayerResult>): Promise<PlayerResult> {
  try {
    return await load();
  } catch (error) {
    return fail("error", `連不上 YouTube（${errorKind(error)}）`);
  }
}

async function loadWatchPage(videoId: string, fetchImpl: typeof fetch): Promise<PlayerResult> {
  const page = await fetchYoutubePage(youtubeWatchUrl(videoId), { cache: "no-store", fetchImpl });
  if (page.status === 429) return fail("blocked", `YouTube 暫時拒絕這台伺服器的請求。${UPLOAD_HINT}`);
  if (!page.ok) return fail("unavailable", `讀取影片頁面失敗（HTTP ${page.status}）`);

  const player = extractPlayerResponse(await page.text());
  if (!player) return fail("blocked", NO_PLAYER_MESSAGE);

  return readPlayability(player) ?? { ok: true, player };
}

async function loadInnertube(videoId: string, fetchImpl: typeof fetch): Promise<PlayerResult> {
  const response = await fetchInnertubePlayer(videoId, { fetchImpl });
  if (!response.ok) return fail("unavailable", `讀取播放資訊失敗（HTTP ${response.status}）`);

  // 其他 JSON 當成沒有字幕的話 會誤判成影片沒有字幕
  const player: unknown = await response.json();
  if (!isPlayerResponse(player)) return fail("blocked", NO_PLAYER_MESSAGE);

  return readPlayability(player) ?? { ok: true, player };
}

function isPlayerResponse(value: unknown): value is Player {
  const record = asRecord(value);
  return record !== null && ("playabilityStatus" in record || "captions" in record);
}

/** 標題或說明裡也可能出現這段字 所以逐一嘗試 取第一個真的是播放資訊的 */
function extractPlayerResponse(html: string): Player | null {
  for (const match of html.matchAll(/ytInitialPlayerResponse\s*=\s*\{/g)) {
    const json = balancedObject(html, match.index + match[0].length - 1);
    if (!json) continue;
    try {
      const parsed: unknown = JSON.parse(json);
      if (isPlayerResponse(parsed)) return parsed;
    } catch {
      // 不是這一段 試下一個
    }
  }
  return null;
}

/** 有巢狀物件與字串裡的大括號 所以一個個配對 不用正規表示式 */
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

function readPlayability(player: Player): PageFailure | null {
  const status = (player.playabilityStatus ?? {}) as { status?: string; reason?: string };
  if (!status.status || status.status === "OK") return null;

  const reason = status.reason ?? status.status;
  if (status.status === "LOGIN_REQUIRED" && /bot|機器人|봇/i.test(reason)) {
    return fail("blocked", `YouTube 要求驗證不是機器人。${UPLOAD_HINT}`);
  }
  return fail("unavailable", `影片無法播放：${reason}`);
}

function readTracks(player: Player): CaptionTrack[] {
  const captions = player.captions as { playerCaptionsTracklistRenderer?: { captionTracks?: unknown } } | undefined;
  const tracks = captions?.playerCaptionsTracklistRenderer?.captionTracks;
  return Array.isArray(tracks) ? (tracks as CaptionTrack[]) : [];
}

/** 自動字幕的事件會重疊 結束時間截到下一句開始 免得兩句同時顯示 */
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
      text: tidyLines(e.segs!.map((s) => s.utf8 ?? "").join("")),
    }))
    .filter((cue) => cue.text)
    // 寫進資料庫前排好 句子的位置就是譯文的編號 播放器也用二分搜尋
    // sort 是穩定的 同時開始的句子保持原本的順序
    .sort((a, b) => a.start - b.start);

  return cues.map((cue, i) => {
    const next = cues[i + 1];
    return next && next.start < cue.end && next.start > cue.start ? { ...cue, end: next.start } : cue;
  });
}
