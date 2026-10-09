export const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
export const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;
// YouTube 的 handle 可以用各國文字；\p{M} 是泰文、印地文等的組合符號。放進網址時另外 encodeURIComponent
const HANDLE = /^[\p{L}\p{M}\p{N}._-]{3,30}$/u;
const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"]);

function toUrl(input: string): URL | null {
  try {
    return new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    return null;
  }
}

/** 接受 watch、youtu.be、shorts、embed、live 網址或 11 碼影片 id */
export function parseVideoId(input: string): string | null {
  const value = input.trim();
  if (VIDEO_ID.test(value)) return value;

  const url = toUrl(value);
  if (!url) return null;
  const host = url.hostname.toLowerCase();

  let candidate: string | null | undefined;
  if (host === "youtu.be") candidate = url.pathname.split("/")[1];
  else if (YOUTUBE_HOSTS.has(host)) {
    const [first, second] = url.pathname.split("/").filter(Boolean);
    candidate = first === "watch" ? url.searchParams.get("v") : ["shorts", "embed", "live", "v"].includes(first) ? second : null;
  }
  return candidate && VIDEO_ID.test(candidate) ? candidate : null;
}

export type ChannelInput = { kind: "id"; channelId: string } | { kind: "handle"; handle: string };

/** 接受 UC 開頭的頻道 id、/channel/UC… 網址、@handle 或 /@handle 網址 */
export function parseChannelInput(input: string): ChannelInput | null {
  const value = input.trim();
  if (CHANNEL_ID.test(value)) return { kind: "id", channelId: value };
  if (value.startsWith("@")) return HANDLE.test(value.slice(1)) ? { kind: "handle", handle: value.slice(1) } : null;

  const url = toUrl(value);
  if (!url || !YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) return null;
  const [first, second] = url.pathname.split("/").filter(Boolean);
  if (first === "channel" && second && CHANNEL_ID.test(second)) return { kind: "id", channelId: second };
  // 網址裡的非 ASCII handle 是百分比編碼過的
  const handle = first?.startsWith("@") ? decodePathSegment(first.slice(1)) : null;
  if (handle && HANDLE.test(handle)) return { kind: "handle", handle };
  return null;
}

export type YoutubeInput = { kind: "video"; videoId: string } | { kind: "channel"; channel: ChannelInput } | { kind: "invalid" };

/** 列表頁上方只有一個輸入框：影片網址開觀看頁、頻道網址或 @帳號就追蹤（兩種格式不會重疊） */
export function classifyYoutubeInput(input: string): YoutubeInput {
  const videoId = parseVideoId(input);
  if (videoId) return { kind: "video", videoId };
  const channel = parseChannelInput(input);
  return channel ? { kind: "channel", channel } : { kind: "invalid" };
}

function decodePathSegment(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

export type GlossaryEntry = { source: string; target: string };

/** 專有名詞表：每行「原文=譯文」（全形＝也可以），格式不對的行直接略過；同一原文以最後一行為準 */
export function parseGlossary(text: string): GlossaryEntry[] {
  const entries = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const index = line.search(/[=＝]/);
    if (index < 0) continue;
    const source = line.slice(0, index).trim();
    const target = line.slice(index + 1).trim();
    if (!source || !target) continue;
    entries.delete(source);
    entries.set(source, target);
  }
  return [...entries].map(([source, target]) => ({ source, target }));
}

/** 專有名詞表的上限：發起時的表會跟著翻譯保存，之後每個接著翻的人每批都會送出；字數照看到的字算 */
export const GLOSSARY_LIMITS = { entries: 200, termLength: 50, totalLength: 5000 } as const;

const charCount = (text: string) => [...text].length;
/** 錯誤訊息裡的數字加千分位；不用 toLocaleString，輸出不隨執行環境的 ICU 版本改變 */
export const withCommas = (n: number) => String(n).replace(/\B(?=(\d{3})+$)/g, ",");
const preview = (text: string) => (charCount(text) > 10 ? `${[...text].slice(0, 10).join("")}…` : text);

/** 存檔前檢查，回傳給使用者看的錯誤，沒問題回 null */
export function glossaryProblem(entries: GlossaryEntry[]): string | null {
  const { entries: maxEntries, termLength, totalLength } = GLOSSARY_LIMITS;
  if (entries.length > maxEntries) return `專有名詞表最多 ${maxEntries} 筆（目前 ${entries.length} 筆），請刪掉用不到的`;
  for (const { source, target } of entries) {
    if (charCount(source) > termLength) return `專有名詞表每個詞最多 ${termLength} 字：「${preview(source)}」太長`;
    if (charCount(target) > termLength) return `專有名詞表每個詞最多 ${termLength} 字：「${preview(source)}」的譯名太長`;
  }
  const total = entries.reduce((sum, { source, target }) => sum + charCount(source) + charCount(target), 0);
  if (total > totalLength) return `專有名詞表合計最多 ${withCommas(totalLength)} 字（目前 ${withCommas(total)} 字），請刪掉用不到的`;
  return null;
}

const comparable = (text: string) => text.normalize("NFC").toLowerCase();

/** 只留這些句子裡實際出現的詞條：沒出現的詞每批都送，只是讓接著翻的人多付 token */
export function relevantGlossary(glossary: GlossaryEntry[], texts: string[]): GlossaryEntry[] {
  const haystack = comparable(texts.join("\n"));
  return glossary.filter((entry) => haystack.includes(comparable(entry.source)));
}
