import { text } from "@/core/json";

// HoYoLAB 的回應沒有公開格式 欄位一律用 core/json 檢查型別 圖片網址另外檢查

/** 只收 http 與 https 網址 協定相對網址補成 https */
export function image(value: unknown): string | null {
  const url = text(value);
  if (!url) return null;
  if (url.startsWith("//")) return `https:${url}`;
  return /^https?:\/\//i.test(url) ? url : null;
}
