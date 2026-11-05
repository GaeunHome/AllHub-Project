import { AVATAR_PIXELS, type AvatarCrop } from "./avatar-rules";

const JPEG_QUALITY = 0.85;

/** 透明的地方鋪白底 JPEG 沒有透明 預覽與上傳畫的是同一張 */
export function drawAvatar(canvas: HTMLCanvasElement, bitmap: ImageBitmap, { x, y, side }: AvatarCrop): void {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, x, y, side, side, 0, 0, canvas.width, canvas.height);
}

/** 在瀏覽器裁好縮好才上傳 5MB 的照片也只送幾十 KB */
export function shrinkAvatar(bitmap: ImageBitmap, crop: AvatarCrop): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_PIXELS;
  canvas.height = AVATAR_PIXELS;
  drawAvatar(canvas, bitmap, crop);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob"))), "image/jpeg", JPEG_QUALITY));
}
