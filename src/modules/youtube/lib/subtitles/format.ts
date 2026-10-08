import { codePointToString } from "../code-point";

export type Cue = { start: number; end: number; text: string }; // 毫秒

export class SubtitleParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SubtitleParseError";
  }
}

// SRT 用逗號、WebVTT 用句點；WebVTT 的小時可以省略
const TIME = String.raw`(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{3})`;
const TIMING_LINE = new RegExp(String.raw`^${TIME}\s*-->\s*${TIME}(?:\s+.*)?$`);
/** YouTube 自動字幕的過場 cue 只有 10ms；這麼短的 cue 畫面上看不到，也不用翻 */
const TRANSITION_MS = 50;

/** 自動判斷 SRT 或 WebVTT；結果依開始時間排序（播放器用二分搜尋找目前的句子） */
export function parseSubtitles(text: string): Cue[] {
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const isVtt = /^\s*WEBVTT/.test(normalized);
  // WebVTT 只有真正的空行才結束一個 cue（自動字幕裡只有一個空白的行是內容）；SRT 常見只有空白的分隔行
  const endsCue = isVtt ? (line: string) => line === "" : (line: string) => line.trim() === "";

  const cues: Cue[] = [];
  let current: { start: number; end: number; lines: string[] } | null = null;
  const finish = () => {
    const content = current ? cleanText(current.lines.join("\n")) : "";
    if (current && content) cues.push({ start: current.start, end: current.end, text: content });
    current = null;
  };

  // 不在 cue 裡的行（標頭、序號、cue id、NOTE／STYLE／REGION 區塊）都略過
  for (const line of normalized.split("\n")) {
    // cue 內容裡格式不對的箭頭行當成文字；合格的時間行就算前面少了空行也開始新的 cue
    if (line.includes("-->") && (!current || TIMING_LINE.test(line.trim()))) {
      finish();
      const [start, end] = parseTiming(line);
      current = { start, end, lines: [] };
    } else if (endsCue(line)) {
      finish();
    } else {
      current?.lines.push(line);
    }
  }
  finish();

  const result = collapseRolling(cues.sort((a, b) => a.start - b.start));
  if (result.length === 0) throw new SubtitleParseError("讀不到任何字幕，請確認檔案是 SRT 或 WebVTT 格式");
  return result;
}

/** 自動字幕是滾動格式（每句在下一個 cue 再出現一次、中間夾 10ms 過場），不整理會重複送 AI；只拿掉多行 cue 的第一行，連續相同的單行 cue（重複的歌詞）是真的重複 */
function collapseRolling(cues: Cue[]): Cue[] {
  const result: Cue[] = [];
  for (const cue of cues) {
    if (cue.end - cue.start <= TRANSITION_MS) continue;
    const lines = cue.text.split("\n");
    if (lines.length > 1 && lines[0] === result.at(-1)?.text.split("\n").at(-1)) lines.shift();
    result.push({ ...cue, text: lines.join("\n") });
  }
  return result;
}

function parseTiming(line: string): [number, number] {
  const match = TIMING_LINE.exec(line.trim());
  if (!match) throw new SubtitleParseError(`字幕時間格式錯誤：「${line.trim().slice(0, 60)}」`);

  const toMs = (h = "0", m: string, s: string, ms: string) => ((Number(h) * 60 + Number(m)) * 60 + Number(s)) * 1000 + Number(ms);
  const start = toMs(match[1], match[2], match[3], match[4]);
  const end = toMs(match[5], match[6], match[7], match[8]);
  if (end < start) throw new SubtitleParseError(`字幕結束時間早於開始時間：「${line.trim().slice(0, 60)}」`);
  return [start, end];
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

// 先拿掉標籤再解碼實體，否則 &lt;3 解碼後會被當成標籤刪掉
function cleanText(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, "")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (whole, name: string) => {
      if (name[0] === "#") {
        const code = name[1].toLowerCase() === "x" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
        return codePointToString(code) ?? whole;
      }
      return ENTITIES[name.toLowerCase()] ?? whole;
    })
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function formatTime(ms: number, separator: "," | "."): string {
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}${separator}${pad(ms % 1000, 3)}`;
}

// 文字中的空行會被讀成 cue 的結尾，輸出前要壓掉
function cueBody(text: string): string {
  return text.split("\n").map((line) => line.trim()).filter(Boolean).join("\n") || " ";
}

export function toSrt(cues: Cue[]): string {
  const blocks = cues.map(
    (cue, i) => `${i + 1}\n${formatTime(cue.start, ",")} --> ${formatTime(cue.end, ",")}\n${cueBody(cue.text)}`,
  );
  return blocks.join("\n\n") + "\n";
}

// WebVTT 的 cue 文字裡 & 與 < 一定要跳脫（否則 <3 會被當成標籤），> 一起跳脫也避免出現 -->
const escapeVtt = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function toVtt(cues: Cue[]): string {
  const blocks = cues.map((cue) => `${formatTime(cue.start, ".")} --> ${formatTime(cue.end, ".")}\n${escapeVtt(cueBody(cue.text))}`);
  return "WEBVTT\n\n" + blocks.join("\n\n") + "\n";
}

/** 只收 UTF-8 與韓文 Windows 預設的 CP949；Node 的 euc-kr 缺 CP949 擴充字，解不出時變成 C1 控制字元而不報錯，所以出現 C1 也當成解不開 */
export function decodeSubtitleBytes(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    // 不是 UTF-8，改試 CP949
  }
  try {
    const text = new TextDecoder("euc-kr", { fatal: true }).decode(bytes);
    return /[\u0080-\u009f]/.test(text) ? null : text;
  } catch {
    return null;
  }
}
