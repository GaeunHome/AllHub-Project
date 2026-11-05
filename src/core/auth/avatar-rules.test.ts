import { describe, expect, it } from "vitest";
import { AVATAR_FILE_MAX_BYTES, avatarFileProblem, centerSquare, isJpeg } from "./avatar-rules";

describe("avatarFileProblem：使用者要的 頭貼檔案最大 5MB", () => {
  it("剛好 5MB 可以 多一個 byte 不行", () => {
    expect(avatarFileProblem({ size: 5 * 1024 * 1024, type: "image/jpeg" })).toBeNull();
    expect(avatarFileProblem({ size: AVATAR_FILE_MAX_BYTES + 1, type: "image/jpeg" })).toContain("5MB");
  });

  it.each([["image/png"], ["image/webp"], ["image/heic"]])("%s 可以", (type) => {
    expect(avatarFileProblem({ size: 1000, type })).toBeNull();
  });

  it.each([["application/pdf"], ["text/html"], [""], ["image/svg+xml"]])("%s 不是照片 SVG 裡面能放腳本", (type) => {
    expect(avatarFileProblem({ size: 1000, type })).toBe("請選擇照片檔");
  });
});

describe("centerSquare：裁成正中間的正方形", () => {
  it("橫的照片裁左右", () => {
    expect(centerSquare(400, 300)).toEqual({ x: 50, y: 0, side: 300 });
  });

  it("直的照片裁上下", () => {
    expect(centerSquare(300, 500)).toEqual({ x: 0, y: 100, side: 300 });
  });

  it("本來就是正方形不用裁", () => {
    expect(centerSquare(256, 256)).toEqual({ x: 0, y: 0, side: 256 });
  });
});

describe("isJpeg：看檔案內容 不看副檔名", () => {
  it("JPEG 的開頭", () => {
    expect(isJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(true);
  });

  it("其他內容 例如 PNG 或假裝成圖片的網頁", () => {
    expect(isJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false);
    expect(isJpeg(new TextEncoder().encode("<html>"))).toBe(false);
    expect(isJpeg(new Uint8Array([]))).toBe(false);
  });
});
