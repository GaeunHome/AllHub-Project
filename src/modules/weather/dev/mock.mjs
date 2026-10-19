// 假的氣象署 F-C0032-001 與環境部 aqx_p_432 格式照真的回應
// 時段照現在的台北時間算 每個縣市的天氣不同 畫面看得出有沒有對應到

const HOUR = 3_600_000;
const pad = (value) => String(value).padStart(2, "0");
const taipei = (ms) => new Date(ms + 8 * HOUR);

/** 例如 2026-10-16T18:00:00+08:00 */
function cwaTime(ms) {
  const t = taipei(ms);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}T${pad(t.getUTCHours())}:00:00+08:00`;
}

/** 最近一個 6 點或 18 點 跟氣象署一樣三個 12 小時的時段 */
export function periodStarts(now = new Date()) {
  const t = taipei(now.getTime());
  const base = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()) - 8 * HOUR;
  const hour = t.getUTCHours();
  const first = hour >= 18 ? base + 18 * HOUR : hour >= 6 ? base + 6 * HOUR : base - 6 * HOUR;
  return [0, 1, 2].map((i) => first + i * 12 * HOUR);
}

// 沒帶 locationName 時氣象署回全部的縣市
const COUNTIES = ["臺北市", "新北市", "基隆市", "桃園市", "新竹市", "新竹縣", "苗栗縣", "臺中市", "彰化縣", "南投縣", "雲林縣", "嘉義市", "嘉義縣", "臺南市", "高雄市", "屏東縣", "宜蘭縣", "花蓮縣", "臺東縣", "澎湖縣", "金門縣", "連江縣"];

// 現在與下一段決定卡片的提醒 臺北市要帶傘 高雄市帶把折傘 臺中市不用
// 每個縣市是哪一種列在 docs/development.md
const SKIES = [
  ["陰短暫雨", "70", "稍有寒意"],
  ["多雲午後短暫雷陣雨", "60", "悶熱"],
  ["多雲時陰", "40", "舒適"],
  ["晴時多雲", "10", "舒適"],
  ["多雲時晴", "20", "舒適"],
];

// 臺南市是最壞情況 天氣描述 11 個字 舒適度 7 個字 降雨機率 100% 要帶傘
// 用來看卡片最擠時的排版 空氣品質也是字比較多的對敏感族群不健康
const WORST_COUNTY = "臺南市";
const WORST_SKIES = [
  ["多雲時晴午後短暫雷陣雨", "100", "稍有寒意至舒適"],
  ["多雲時陰短暫陣雨或雷雨", "90", "寒冷至稍有寒意"],
  ["陰時多雲短暫陣雨", "70", "稍有寒意"],
];

function location(county, now) {
  const seed = [...county].reduce((sum, ch) => sum + ch.codePointAt(0), 0);
  const slots = periodStarts(now).map((start, i) => {
    const [wx, pop, ci] = county === WORST_COUNTY ? WORST_SKIES[i] : SKIES[(seed + i) % SKIES.length];
    return { startTime: cwaTime(start), endTime: cwaTime(start + 12 * HOUR), wx, pop, ci, min: String(20 + (seed % 5) - i), max: String(27 + (seed % 4) - i) };
  });
  const element = (elementName, pick, unit) => ({ elementName, time: slots.map((slot) => ({ startTime: slot.startTime, endTime: slot.endTime, parameter: { parameterName: pick(slot), ...(unit ? { parameterUnit: unit } : {}) } })) });
  return {
    locationName: county,
    weatherElement: [element("Wx", (s) => s.wx), element("PoP", (s) => s.pop, "百分比"), element("MinT", (s) => s.min, "C"), element("CI", (s) => s.ci), element("MaxT", (s) => s.max, "C")],
  };
}

export function forecastResponse(counties = COUNTIES, now = new Date()) {
  return {
    success: "true",
    result: { resource_id: "F-C0032-001" },
    records: { datasetDescription: "三十六小時天氣預報", location: counties.map((county) => location(county, now)) },
  };
}

// 每個縣市一到三個測站 臺北市最差的是萬華 新北市有一個維修中 AQI 是空的
const STATIONS = [
  ["臺北市", "士林", "35"],
  ["臺北市", "萬華", "62"],
  ["臺北市", "松山", "48"],
  ["新北市", "板橋", "71"],
  ["新北市", "汐止", ""],
  ["桃園市", "桃園", "88"],
  ["臺中市", "西屯", "104"],
  ["臺南市", "臺南", "121"],
  ["高雄市", "前鎮", "156"],
  ["花蓮縣", "花蓮", "18"],
];

export function aqiResponse(now = new Date()) {
  const t = taipei(now.getTime());
  const publishtime = `${t.getUTCFullYear()}/${pad(t.getUTCMonth() + 1)}/${pad(t.getUTCDate())} ${pad(t.getUTCHours())}:00:00`;
  return { fields: [], records: STATIONS.map(([county, sitename, aqi]) => ({ sitename, county, aqi, pollutant: "", status: "", publishtime })) };
}

/** Authorization 或 api_key 是 bad 開頭時回 401 像授權碼打錯 */
export async function handle({ url, json }) {
  if (url.pathname === "/api/v1/rest/datastore/F-C0032-001") {
    const key = url.searchParams.get("Authorization") ?? "";
    if (!key || key.startsWith("bad")) return json(401, { message: "Unauthorized" });
    const names = url.searchParams.get("locationName");
    return json(200, forecastResponse(names ? names.split(",") : COUNTIES));
  }
  if (url.pathname === "/api/v2/aqx_p_432") {
    const key = url.searchParams.get("api_key") ?? "";
    if (!key || key.startsWith("bad")) return json(401, { message: "api_key 錯誤" });
    return json(200, aqiResponse());
  }
  return false;
}
