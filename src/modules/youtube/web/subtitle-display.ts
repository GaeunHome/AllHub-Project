export type SubtitleMode = "zh" | "ko" | "both";

export type SubtitleDisplay = { primary: string; secondary?: string; badge?: string };

/** 還沒翻好的句子先顯示韓文原文加小標示，不留白；沒有在翻（失敗、暫停）時不能說「翻譯中」 */
export function subtitleDisplay(source: string, target: string | null | undefined, mode: SubtitleMode, translating: boolean): SubtitleDisplay {
  if (mode === "ko") return { primary: source };
  if (target == null) return { primary: source, badge: translating ? "翻譯中" : "尚未翻譯" };
  return mode === "both" ? { primary: target, secondary: source } : { primary: target };
}
