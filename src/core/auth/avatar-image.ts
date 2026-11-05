import { AVATAR_PIXELS, centerSquare } from "./avatar-rules";

const JPEG_QUALITY = 0.85;

/** 在瀏覽器裁好縮好才上傳 5MB 的照片也只送幾十 KB 透明的地方鋪白底 JPEG 沒有透明 */
export async function shrinkAvatar(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const { x, y, side } = centerSquare(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_PIXELS;
  canvas.height = AVATAR_PIXELS;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, AVATAR_PIXELS, AVATAR_PIXELS);
  context.drawImage(bitmap, x, y, side, side, 0, 0, AVATAR_PIXELS, AVATAR_PIXELS);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob"))), "image/jpeg", JPEG_QUALITY));
}
