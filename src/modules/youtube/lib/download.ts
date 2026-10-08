import { toSrt, toVtt, type Cue } from "./subtitles";

export type DownloadFormat = "srt" | "vtt";
export type DownloadLang = "zh" | "ko" | "both";

export function parseDownloadQuery(params: URLSearchParams): { format: DownloadFormat; lang: DownloadLang } | null {
  const format = params.get("format") ?? "srt";
  const lang = params.get("lang") ?? "zh";
  if (format !== "srt" && format !== "vtt") return null;
  if (lang !== "zh" && lang !== "ko" && lang !== "both") return null;
  return { format, lang };
}

/** 中文版還沒翻到的句子用韓文原文補上，下載下來的時間軸才完整 */
export function buildSubtitleFile(cues: Cue[], translated: (string | null)[], lang: DownloadLang, format: DownloadFormat): string {
  const lines = cues.map((cue, i) => {
    const zh = translated[i] ?? cue.text;
    const text = lang === "ko" ? cue.text : lang === "zh" ? zh : `${zh}\n${cue.text}`;
    return { ...cue, text };
  });
  return format === "srt" ? toSrt(lines) : toVtt(lines);
}
