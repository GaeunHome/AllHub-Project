import { describe, expect, it } from "vitest";
import { charLength, tidyText } from "../text";

describe("tidyText：名稱與標題存檔前的整理", () => {
  it("連續空白（含全形空白與換行）縮成一個 頭尾去掉", () => {
    expect(tidyText("  京都　　 三日\n遊 ")).toBe("京都 三日 遊");
  });

  it("NFC 正規化：分開打的 e 加重音符號跟一個字的 é 存成一樣", () => {
    expect(tidyText("Café")).toBe("Café");
  });
});

describe("charLength：照看到的字算", () => {
  it("emoji 算一個字 不是兩個", () => {
    expect(charLength("🗾京都")).toBe(3);
  });
});
