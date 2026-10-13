/** 已保留的影片最多 15 部，篩選在瀏覽器裡做：輸入的每個詞（空白分開）都出現在標題或頻道名稱裡才算，不分大小寫 */
export function matchesQuery(text: string, query: string): boolean {
  const haystack = text.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}
