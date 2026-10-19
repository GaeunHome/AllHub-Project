// 氣象署與環境部的資料都寫「臺」 使用者打的「台」先換掉才對得上
export const COUNTIES = [
  "臺北市",
  "新北市",
  "基隆市",
  "桃園市",
  "新竹市",
  "新竹縣",
  "苗栗縣",
  "臺中市",
  "彰化縣",
  "南投縣",
  "雲林縣",
  "嘉義市",
  "嘉義縣",
  "臺南市",
  "高雄市",
  "屏東縣",
  "宜蘭縣",
  "花蓮縣",
  "臺東縣",
  "澎湖縣",
  "金門縣",
  "連江縣",
] as const;
export type County = (typeof COUNTIES)[number];

export function normalizeCounty(value: string): County | null {
  const name = value.trim().replaceAll("台", "臺");
  return (COUNTIES as readonly string[]).includes(name) ? (name as County) : null;
}
