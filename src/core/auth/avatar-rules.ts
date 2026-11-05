// 瀏覽器與伺服器共用 不 import 任何東西
// 使用者要的：檔案最大 5MB 瀏覽器先縮小才上傳 資料庫存的是小圖 每人一張

export const AVATAR_FILE_MAX_BYTES = 5 * 1024 * 1024;
export const AVATAR_PIXELS = 256;
/** 256 見方的 JPEG 遠小於這個數字 超過就是沒經過畫面直接送來的 */
export const AVATAR_STORED_MAX_BYTES = 200 * 1024;
/** 視窗裡選了目前這張照片 代表不用換 */
export const KEEP_AVATAR = "keep";

/** 回 null 代表可以用 手機相簿的圖常常沒有副檔名 只看瀏覽器給的類型 */
export function avatarFileProblem({ size, type }: { size: number; type: string }): string | null {
  if (!type.startsWith("image/") || type === "image/svg+xml") return "請選擇照片檔";
  return size > AVATAR_FILE_MAX_BYTES ? "照片最大 5MB，請換一張小一點的" : null;
}

/** 原圖上要留下的正方形 單位是原圖的像素 */
export type AvatarCrop = { x: number; y: number; side: number };

/** 使用者要的 上傳前可以放大縮小 再大就糊了 */
export const AVATAR_MAX_ZOOM = 4;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** 裁成正中間的正方形 頭像是圓的 不裁會變形 */
export function centerSquare(width: number, height: number): AvatarCrop {
  const side = Math.min(width, height);
  return { x: Math.round((width - side) / 2), y: Math.round((height - side) / 2), side };
}

/** 移動裁切範圍 超出照片就貼回邊上 */
export function panCrop(width: number, height: number, crop: AvatarCrop, dx: number, dy: number): AvatarCrop {
  return { ...crop, x: clamp(crop.x + dx, 0, width - crop.side), y: clamp(crop.y + dy, 0, height - crop.side) };
}

/** 中心不動換倍率 1 倍是照片的短邊 */
export function zoomCrop(width: number, height: number, crop: AvatarCrop, zoom: number): AvatarCrop {
  const side = Math.min(width, height) / clamp(zoom, 1, AVATAR_MAX_ZOOM);
  const next = { x: crop.x + (crop.side - side) / 2, y: crop.y + (crop.side - side) / 2, side };
  return panCrop(width, height, next, 0, 0);
}

export const avatarZoom = (width: number, height: number, crop: AvatarCrop) => Math.min(width, height) / crop.side;

/** 檔案開頭是 JPEG 的標記 副檔名與類型都可以假造 只有內容騙不了 */
export const isJpeg = (bytes: Uint8Array) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
