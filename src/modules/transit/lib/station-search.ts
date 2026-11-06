// 車站搜尋在瀏覽器裡篩 不問伺服器

/** 比對用的寫法 全形半形 大小寫與空白不算差別 台與臺視為同一個字 */
export const plainName = (value: string) => value.normalize("NFKC").toLowerCase().replace(/\s+/g, "").replaceAll("台", "臺");

/** 結尾的站可打可不打 只打一個站字時照字面找 */
export function matchesStation(name: string, query: string): boolean {
  const key = plainName(query);
  return plainName(name).includes(key.replace(/站$/, "") || key);
}

type NamedStation = { id: string; name: string };

/** 起訖不能是同一站 同名的轉乘站代碼不同 也算同一站 */
export const isSameStation = (a: NamedStation, b: NamedStation) => a.id === b.id || plainName(a.name) === plainName(b.name);
