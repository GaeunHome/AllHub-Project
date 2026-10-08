import { describe, expect, it } from "vitest";
import { MAX_UPLOAD_BYTES, prepareUpload, readSubtitleFile } from "./upload";

const header = "1\n00:00:01,000 --> 00:00:02,000\n";
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
const cp949 = (...bytes: number[]) => Uint8Array.from([...ascii(header), ...bytes, 0x0a]);
const ANNYEONG = [0xbe, 0xc8, 0xb3, 0xe7]; // 「안녕」的 CP949 編碼

function form(file: File | null) {
  const data = new FormData();
  data.set("videoId", "dQw4w9WgXcQ");
  if (file) data.set("file", file);
  return data;
}

describe("readSubtitleFile", () => {
  it("UTF-8 與 CP949 都讀成正確的文字", async () => {
    expect(await readSubtitleFile(new File([`${header}안녕\n`], "a.srt"))).toEqual({ text: `${header}안녕\n` });
    expect(await readSubtitleFile(new File([cp949(...ANNYEONG)], "a.srt"))).toEqual({ text: `${header}안녕\n` });
  });

  it("沒選檔案、空檔、太大、看不懂的編碼 → 錯誤訊息", async () => {
    expect(await readSubtitleFile(null)).toEqual({ error: expect.stringContaining("請選擇") });
    expect(await readSubtitleFile(new File([], "a.srt"))).toEqual({ error: expect.stringContaining("請選擇") });
    expect(await readSubtitleFile(new File([new Uint8Array(MAX_UPLOAD_BYTES + 1)], "a.srt"))).toEqual({ error: expect.stringContaining("太大") });
    expect(await readSubtitleFile(new File([Uint8Array.from([0xff, 0xfe, 0x31, 0x00])], "a.srt"))).toEqual({ error: expect.stringContaining("UTF-8") });
  });
});

describe("prepareUpload（瀏覽器送出前）", () => {
  it("超過上限 → 直接回錯誤，不送出（Server Action 超過 1MB 會整頁出錯）", async () => {
    const result = await prepareUpload(form(new File([new Uint8Array(MAX_UPLOAD_BYTES + 1)], "big.srt")));
    expect(result).toEqual({ error: expect.stringContaining("太大") });
  });

  it("CP949 → 換成 UTF-8 的檔案再送出，其他欄位不變", async () => {
    const result = await prepareUpload(form(new File([cp949(...ANNYEONG)], "video.ko.srt")));

    if ("error" in result) throw new Error(result.error);
    const file = result.formData.get("file") as File;
    expect(file.name).toBe("video.ko.srt");
    expect(await file.text()).toBe(`${header}안녕\n`);
    expect(result.formData.get("videoId")).toBe("dQw4w9WgXcQ");
  });

  it("CP949 轉成 UTF-8 後變大、超過上限 → 擋下", async () => {
    // 韓文在 CP949 是 2 bytes、UTF-8 是 3 bytes
    const bytes = new Uint8Array(Math.floor(MAX_UPLOAD_BYTES / 2) * 2).map((_, i) => ANNYEONG[i % 2]);
    const result = await prepareUpload(form(new File([bytes], "big-cp949.srt")));
    expect(result).toEqual({ error: expect.stringContaining("太大") });
  });

  it("看不懂的編碼 → 提示轉成 UTF-8", async () => {
    expect(await prepareUpload(form(new File([Uint8Array.from([0xff, 0xfe, 0x31, 0x00])], "x.srt")))).toEqual({
      error: expect.stringContaining("UTF-8"),
    });
  });
});
