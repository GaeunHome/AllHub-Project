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
