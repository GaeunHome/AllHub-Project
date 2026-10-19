import type { SubtitleMode } from "../lib/subtitles/format";

/** 標在字幕那一行的 lang 字型才選得對 韓文換行也不會從詞中間斷開 */
export type SubtitleLang = "zh-Hant" | "ko";

/** 第二行一律是韓文原文 */
export type SubtitleDisplay = { primary: string; primaryLang: SubtitleLang; secondary?: string; badge?: string };

/** 還沒翻好的先顯示韓文加小標示 不留白 失敗或暫停時不能說翻譯中 */
export function subtitleDisplay(source: string, target: string | null | undefined, mode: SubtitleMode, translating: boolean): SubtitleDisplay {
  if (mode === "ko") return { primary: source, primaryLang: "ko" };
  if (target == null) return { primary: source, primaryLang: "ko", badge: translating ? "翻譯中" : "尚未翻譯" };
  return mode === "both" ? { primary: target, primaryLang: "zh-Hant", secondary: source } : { primary: target, primaryLang: "zh-Hant" };
}
