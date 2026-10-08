import { describe, expect, it } from "vitest";
import { buildSubtitleFile, parseDownloadQuery } from "./download";

const cues = [
  { start: 0, end: 1000, text: "안녕" },
  { start: 1000, end: 2000, text: "하세요" },
];

describe("buildSubtitleFile", () => {
  it("中文：未翻的句子用韓文原文補，時間軸完整", () => {
    expect(buildSubtitleFile(cues, ["你好", null], "zh", "srt")).toBe("1\n00:00:00,000 --> 00:00:01,000\n你好\n\n2\n00:00:01,000 --> 00:00:02,000\n하세요\n");
  });

  it("雙語：中文在上、韓文在下", () => {
    expect(buildSubtitleFile(cues, ["你好", "大家"], "both", "vtt")).toContain("00:00:00.000 --> 00:00:01.000\n你好\n안녕\n");
  });

  it("韓文：原文", () => {
    expect(buildSubtitleFile(cues, ["你好", "大家"], "ko", "srt")).toContain("\n안녕\n");
  });
});

describe("parseDownloadQuery", () => {
  it("預設 srt + zh", () => {
    expect(parseDownloadQuery(new URLSearchParams())).toEqual({ format: "srt", lang: "zh" });
  });

  it("接受 vtt 與 both", () => {
    expect(parseDownloadQuery(new URLSearchParams("format=vtt&lang=both"))).toEqual({ format: "vtt", lang: "both" });
  });

  it("不認得的值 → null", () => {
    expect(parseDownloadQuery(new URLSearchParams("format=ass"))).toBeNull();
    expect(parseDownloadQuery(new URLSearchParams("lang=en"))).toBeNull();
  });
});
