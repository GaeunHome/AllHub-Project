import { describe, expect, it } from "vitest";
import { AVATAR_FILE_MAX_BYTES, AVATAR_MAX_ZOOM, avatarFileProblem, avatarZoom, centerSquare, isJpeg, panCrop, zoomCrop } from "../avatar-rules";

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

describe("zoomCrop：使用者要的 上傳前可以放大縮小", () => {
  const FULL = { x: 50, y: 0, side: 300 };

  it("放大兩倍 裁切範圍減半 中心不動", () => {
    expect(zoomCrop(400, 300, FULL, 2)).toEqual({ x: 125, y: 75, side: 150 });
  });

  it("從角落縮回來 不能超出照片 超出就貼回邊上", () => {
    expect(zoomCrop(400, 300, { x: 250, y: 150, side: 150 }, 1)).toEqual({ x: 100, y: 0, side: 300 });
  });

  it("不會縮到比整張照片還大 也不會放大超過上限", () => {
    expect(zoomCrop(400, 300, FULL, 0.5).side).toBe(300);
    expect(zoomCrop(400, 300, FULL, 100).side).toBe(300 / AVATAR_MAX_ZOOM);
  });
});

describe("panCrop：使用者要的 上傳前可以移動", () => {
  it("往右移 超過就貼在右邊", () => {
    expect(panCrop(400, 300, { x: 50, y: 0, side: 300 }, 30, 0)).toEqual({ x: 80, y: 0, side: 300 });
    expect(panCrop(400, 300, { x: 50, y: 0, side: 300 }, 999, 0).x).toBe(100);
  });

  it("往左移 不會變成負的", () => {
    expect(panCrop(400, 300, { x: 50, y: 0, side: 300 }, -999, 0).x).toBe(0);
  });

  it("橫的照片沒放大時 上下沒有空間可以移", () => {
    expect(panCrop(400, 300, { x: 50, y: 0, side: 300 }, 0, 50).y).toBe(0);
  });

  it("放大後上下也能移", () => {
    expect(panCrop(400, 300, { x: 125, y: 75, side: 150 }, 0, 50).y).toBe(125);
  });
});

describe("avatarZoom：滑桿的位置", () => {
  it("整張是 1 倍 裁一半是 2 倍", () => {
    expect(avatarZoom(400, 300, { x: 50, y: 0, side: 300 })).toBe(1);
    expect(avatarZoom(400, 300, { x: 125, y: 75, side: 150 })).toBe(2);
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
