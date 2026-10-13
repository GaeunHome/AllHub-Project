export type SubtitleMode = "zh" | "ko" | "both";

/** 標在字幕那一行的 lang：選對字型，韓文換行時也不會從一個詞的中間斷開 */
export type SubtitleLang = "zh-Hant" | "ko";

/** 第二行一律是韓文原文 */
export type SubtitleDisplay = { primary: string; primaryLang: SubtitleLang; secondary?: string; badge?: string };

/** 還沒翻好的句子先顯示韓文原文加小標示，不留白；沒有在翻（失敗、暫停）時不能說「翻譯中」 */
export function subtitleDisplay(source: string, target: string | null | undefined, mode: SubtitleMode, translating: boolean): SubtitleDisplay {
  if (mode === "ko") return { primary: source, primaryLang: "ko" };
  if (target == null) return { primary: source, primaryLang: "ko", badge: translating ? "翻譯中" : "尚未翻譯" };
  return mode === "both" ? { primary: target, primaryLang: "zh-Hant", secondary: source } : { primary: target, primaryLang: "zh-Hant" };
}
