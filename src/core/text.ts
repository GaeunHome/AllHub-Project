// 使用者打的名稱與標題 存檔前的整理與字數 瀏覽器的表單也用
// 不 import 任何東西 哪裡都能用

/** NFC 正規化 連續空白縮成一個 去掉頭尾 同一個字的不同寫法才不會被當成兩個 */
export const tidyText = (input: string): string => input.normalize("NFC").replace(/\s+/g, " ").trim();

/** 用 code point 算字數 emoji 才不會算成兩個字 */
export const charLength = (text: string): number => [...text].length;
