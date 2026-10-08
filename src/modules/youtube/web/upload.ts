import { decodeSubtitleBytes } from "../lib/subtitles/format";

/** Server Action 的請求上限預設 1MB，留一點給 multipart 的額外內容 */
export const MAX_UPLOAD_BYTES = 900 * 1024;
const TOO_LARGE = "字幕檔太大（上限 900 KB）";

/** 檢查大小並解碼（UTF-8 或 CP949）；瀏覽器送出前與 Server Action 收到後都用這個 */
export async function readSubtitleFile(file: FormDataEntryValue | null): Promise<{ text: string } | { error: string }> {
  if (!(file instanceof File) || file.size === 0) return { error: "請選擇 .srt 或 .vtt 字幕檔" };
  if (file.size > MAX_UPLOAD_BYTES) return { error: TOO_LARGE };
  const text = decodeSubtitleBytes(new Uint8Array(await file.arrayBuffer()));
  return text === null ? { error: "看不懂字幕檔的編碼（只支援 UTF-8 與 CP949），請轉成 UTF-8 再上傳" } : { text };
}

/** 在瀏覽器先檢查並轉成 UTF-8：超過 Server Action 上限時 Next 直接回 413 讓整頁出錯，而完整的 CP949 只有瀏覽器解得開 */
export async function prepareUpload(formData: FormData): Promise<{ formData: FormData } | { error: string }> {
  const file = formData.get("file");
  const read = await readSubtitleFile(file);
  if ("error" in read) return read;

  // 韓文從 CP949 轉成 UTF-8 會變大（2 → 3 bytes）
  const utf8 = new File([read.text], (file as File).name, { type: "text/plain" });
  if (utf8.size > MAX_UPLOAD_BYTES) return { error: TOO_LARGE };
  formData.set("file", utf8);
  return { formData };
}
