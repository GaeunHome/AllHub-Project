import { describe, expect, it } from "vitest";
import { subtitleDisplay } from "./subtitle-display";

describe("subtitleDisplay：疊在影片上的字幕", () => {
  it("已翻好：中文模式只有中文，雙語模式中文在上、韓文在下，韓文模式只有原文", () => {
    expect(subtitleDisplay("안녕", "你好", "zh", true)).toEqual({ primary: "你好" });
    expect(subtitleDisplay("안녕", "你好", "both", true)).toEqual({ primary: "你好", secondary: "안녕" });
    expect(subtitleDisplay("안녕", "你好", "ko", true)).toEqual({ primary: "안녕" });
  });

  it("還沒翻好、翻譯進行中：中文與雙語模式先顯示韓文原文，加上「翻譯中」標示，不留白", () => {
    expect(subtitleDisplay("안녕", null, "zh", true)).toEqual({ primary: "안녕", badge: "翻譯中" });
    expect(subtitleDisplay("안녕", undefined, "both", true)).toEqual({ primary: "안녕", badge: "翻譯中" });
  });

  it("還沒翻好、沒有在翻（失敗或暫停）：標示「尚未翻譯」，不誤導成翻譯中", () => {
    expect(subtitleDisplay("안녕", null, "zh", false)).toEqual({ primary: "안녕", badge: "尚未翻譯" });
  });

  it("韓文模式不管翻譯進度，不加標示", () => {
    expect(subtitleDisplay("안녕", null, "ko", true)).toEqual({ primary: "안녕" });
  });
});
