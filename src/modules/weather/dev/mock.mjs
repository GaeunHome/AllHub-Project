// 格式照真的回應 時段照現在的台北時間算
// 每個縣市的天氣不同 看得出有沒有對應到

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

// 最壞情況 描述 11 字 舒適度 7 字 降雨 100% 空氣品質字也多
// 用來看卡片最擠時的排版
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

// 氣象署的縣市代碼 特報的回應會帶 網站沒有用到
const GEOCODES = {
  臺北市: "63",
  新北市: "65",
  基隆市: "10017",
  桃園市: "68",
  新竹市: "10018",
  新竹縣: "10004",
  苗栗縣: "10005",
  臺中市: "66",
  彰化縣: "10007",
  南投縣: "10008",
  雲林縣: "10009",
  嘉義市: "10020",
  嘉義縣: "10010",
  臺南市: "67",
  高雄市: "64",
  屏東縣: "10013",
  宜蘭縣: "10002",
  花蓮縣: "10015",
  臺東縣: "10014",
  澎湖縣: "10016",
  金門縣: "09020",
  連江縣: "09007",
};

// 臺北市一種特報 多半今天結束 標籤只寫時間
// 臺南市是最壞情況 四種特報的結束時間都不在今天 標籤最長 其他縣市沒有特報
const WARNINGS = new Map([
  ["臺北市", [["大雨", "特報", 3]]],
  [
    "臺南市",
    [
      ["海上陸上颱風", "警報", 48],
      ["超大豪雨", "特報", 36],
      ["陸上強風", "特報", 36],
      ["濃霧", "特報", 30],
    ],
  ],
]);

/** 例如 2026-11-02 08:00:00 */
const warningTime = (ms) => cwaTime(ms).replace("T", " ").replace("+08:00", "");

export function warningResponse(counties = COUNTIES, now = new Date()) {
  const start = now.getTime();
  return {
    success: "true",
    result: { resource_id: "W-C0033-001" },
    records: {
      location: counties.map((county) => ({
        locationName: county,
        geocode: GEOCODES[county],
        hazardConditions: {
          hazards: (WARNINGS.get(county) ?? []).map(([phenomena, significance, hours]) => ({
            info: { language: "zh-TW", phenomena, significance },
            validTime: { startTime: warningTime(start), endTime: warningTime(start + hours * HOUR) },
          })),
        },
      })),
    },
  };
}

// 臺北市七個測站最差的是萬華 新北市有一個維修中 AQI 是空的 汐止的污染物也是空的
// 欄位照環境部 aqx_p_432 AQI 超過 50 才有主要污染物
const STATIONS = [
  ["臺北市", "士林", "35", "11", "24", "28", ""],
  ["臺北市", "萬華", "62", "21", "38", "33", "細懸浮微粒"],
  ["臺北市", "松山", "48", "14", "30", "31", ""],
  ["臺北市", "中山", "55", "18", "35", "29", "細懸浮微粒"],
  ["臺北市", "古亭", "44", "13", "27", "30", ""],
  ["臺北市", "大同", "51", "17", "33", "26", "細懸浮微粒"],
  ["臺北市", "陽明", "29", "6", "15", "38", ""],
  ["新北市", "板橋", "71", "24", "45", "36", "細懸浮微粒"],
  ["新北市", "汐止", "", "", "", "", ""],
  ["桃園市", "桃園", "88", "29", "52", "41", "細懸浮微粒"],
  ["臺中市", "西屯", "104", "38", "61", "52", "細懸浮微粒"],
  ["臺南市", "臺南", "121", "45", "72", "58", "細懸浮微粒"],
  ["高雄市", "前鎮", "156", "66", "95", "71", "細懸浮微粒"],
  ["花蓮縣", "花蓮", "18", "4", "12", "35", ""],
];

export function aqiResponse(now = new Date()) {
  const t = taipei(now.getTime());
  const publishtime = `${t.getUTCFullYear()}/${pad(t.getUTCMonth() + 1)}/${pad(t.getUTCDate())} ${pad(t.getUTCHours())}:00:00`;
  return {
    fields: [],
    records: STATIONS.map(([county, sitename, aqi, pm25, pm10, o3, pollutant]) => ({ sitename, county, aqi, pollutant, status: "", "pm2.5": pm25, pm10, o3, publishtime })),
  };
}

// 氣象署的寫法 跟網站換算 Open-Meteo 角度用的是同一套
const WIND_DIRECTIONS = ["偏北風", "東北風", "偏東風", "東南風", "偏南風", "西南風", "偏西風", "西北風"];
// 氣象署的舒適度 指數越高越熱
const COMFORT = [
  [15, "稍有寒意"],
  [20, "舒適"],
  [27, "悶熱"],
];
// 每秒 2 到 6 公尺照蒲福風級表是 2 到 4 級
const BEAUFORT = { 2: "2", 3: "2", 4: "3", 5: "3", 6: "4" };
const uvExposure = (index) => (index <= 2 ? "低量級" : index <= 5 ? "中量級" : index <= 7 ? "高量級" : index <= 10 ? "過量級" : "危險級");

/** F-D0047-091 每個縣市七天 每天白天與晚上各一段 紫外線只有白天那一段 */
function weekResponse(names) {
  const element = (ElementName, key, values) => ({ ElementName, Time: values.map(([StartTime, EndTime, value]) => ({ StartTime, EndTime, ElementValue: [{ [key]: value }] })) });
  const records = (ElementName, values) => ({ ElementName, Time: values.map(([StartTime, EndTime, value]) => ({ StartTime, EndTime, ElementValue: [value] })) });
  const WEATHER = ["多雲", "晴時多雲", "短暫雨", "陰", "晴", "多雲時陰", "午後短暫雷陣雨"];
  const periods = Array.from({ length: 14 }, (_, index) => {
    const start = periodStarts()[0] + index * 12 * HOUR;
    return { time: cwaTime(start), end: cwaTime(start + 12 * HOUR), day: Math.floor(index / 2), daytime: taipei(start).getUTCHours() === 6 };
  });
  const each = (offset, valueOf) => periods.map((period) => [period.time, period.end, valueOf(period.day + offset, period)]);
  return {
    success: "true",
    records: {
      Locations: [
        {
          LocationsName: "臺灣",
          Location: names.map((LocationName, offset) => ({
            LocationName,
            WeatherElement: [
              element("最高溫度", "MaxTemperature", each(offset, (seed) => String(24 + (seed % 5)))),
              element("最低溫度", "MinTemperature", each(offset, (seed) => String(17 + (seed % 4)))),
              element("12小時降雨機率", "ProbabilityOfPrecipitation", each(offset, (seed) => String((seed % 7) * 10))),
              element("天氣現象", "Weather", each(offset, (seed) => WEATHER[seed % WEATHER.length])),
              element("最高體感溫度", "MaxApparentTemperature", each(offset, (seed) => String(26 + (seed % 5)))),
              element("最低體感溫度", "MinApparentTemperature", each(offset, (seed) => String(16 + (seed % 4)))),
              element("平均相對濕度", "RelativeHumidity", each(offset, (seed) => String(60 + (seed % 6) * 5))),
              element("平均露點溫度", "DewPoint", each(offset, (seed) => String(14 + (seed % 5)))),
              records("最大舒適度指數", each(offset, (seed, { daytime }) => ({ MaxComfortIndex: String(COMFORT[daytime ? 1 + (seed % 2) : 1][0]), MaxComfortIndexDescription: COMFORT[daytime ? 1 + (seed % 2) : 1][1] }))),
              records("最小舒適度指數", each(offset, (seed, { daytime }) => ({ MinComfortIndex: String(COMFORT[daytime ? 1 : seed % 2][0]), MinComfortIndexDescription: COMFORT[daytime ? 1 : seed % 2][1] }))),
              records("風速", each(offset, (seed, { daytime }) => ({ WindSpeed: String(2 + ((seed + Number(daytime)) % 5)), BeaufortScale: BEAUFORT[2 + ((seed + Number(daytime)) % 5)] }))),
              element("風向", "WindDirection", each(offset, (seed, { daytime }) => WIND_DIRECTIONS[(seed + Number(daytime)) % WIND_DIRECTIONS.length])),
              records(
                "紫外線指數",
                each(offset, (seed) => ({ UVIndex: String(2 + (seed % 8)), UVExposureLevel: uvExposure(2 + (seed % 8)) })).filter((_, index) => periods[index].daytime),
              ),
            ],
          })),
        },
      ],
    },
  };
}

/** F-D0047-089 三天 溫度每小時一點 降雨機率與天氣每 3 小時一段 */
function hoursResponse(names) {
  const first = periodStarts()[0];
  const points = Array.from({ length: 72 }, (_, index) => first + index * HOUR);
  const spans = Array.from({ length: 24 }, (_, index) => first + index * 3 * HOUR);
  const WEATHER = ["多雲", "晴時多雲", "短暫雨", "陰", "午後短暫雷陣雨"];
  const span = (key, valueOf) => spans.map((start, index) => ({ StartTime: cwaTime(start), EndTime: cwaTime(start + 3 * HOUR), ElementValue: [{ [key]: valueOf(index) }] }));
  return {
    success: "true",
    records: {
      Locations: [
        {
          LocationsName: "臺灣",
          Location: names.map((LocationName, offset) => ({
            LocationName,
            WeatherElement: [
              { ElementName: "溫度", Time: points.map((time, index) => ({ DataTime: cwaTime(time), ElementValue: [{ Temperature: String(20 + ((index + offset) % 7)) }] })) },
              { ElementName: "體感溫度", Time: points.map((time, index) => ({ DataTime: cwaTime(time), ElementValue: [{ ApparentTemperature: String(21 + ((index + offset) % 8)) }] })) },
              { ElementName: "相對濕度", Time: points.map((time, index) => ({ DataTime: cwaTime(time), ElementValue: [{ RelativeHumidity: String(55 + (((index + offset) * 7) % 36)) }] })) },
              { ElementName: "3小時降雨機率", Time: span("ProbabilityOfPrecipitation", (index) => String(((index + offset) % 8) * 10)) },
              { ElementName: "天氣現象", Time: span("Weather", (index) => WEATHER[(index + offset) % WEATHER.length]) },
            ],
          })),
        },
      ],
    },
  };
}

/** 跟真的一樣 沒帶 wind_speed_unit=ms 時風速是每小時公里 */
function openMeteoResponse(url) {
  const base = Number(url.searchParams.get("latitude") ?? 0);
  const speedUnit = url.searchParams.get("wind_speed_unit") === "ms" ? 1 : 3.6;
  const start = Date.now();
  const time = Array.from({ length: 7 }, (_, index) => new Date(start + index * 24 * HOUR).toISOString().slice(0, 10));
  const hours = Array.from({ length: 168 }, (_, index) => `${time[Math.floor(index / 24)]}T${pad(index % 24)}:00`);
  const max = time.map((_, index) => 18.4 + ((index + Math.round(base)) % 6));
  const min = time.map((_, index) => 9.6 + ((index + Math.round(base)) % 4));
  return {
    timezone: url.searchParams.get("timezone"),
    utc_offset_seconds: 0,
    hourly: {
      time: hours,
      temperature_2m: hours.map((_, index) => 12.4 + ((index + Math.round(base)) % 9)),
      precipitation_probability: hours.map((_, index) => (index % 6) * 15),
      weather_code: hours.map((_, index) => [0, 2, 3, 61, 80, 1, 95][index % 7]),
      relative_humidity_2m: hours.map((_, index) => 55 + ((index * 7) % 35)),
      dew_point_2m: hours.map((_, index) => 6.5 + ((index * 3) % 7)),
      apparent_temperature: hours.map((_, index) => 10.2 + ((index + Math.round(base)) % 9)),
      // 白天中午最強 晚上是 0
      uv_index: hours.map((_, index) => Math.max(0, Math.round((5.5 - Math.abs((index % 24) - 12) * 0.9) * 10) / 10)),
    },
    daily: {
      time,
      weather_code: [0, 2, 3, 61, 80, 1, 95],
      temperature_2m_max: max,
      temperature_2m_min: min,
      precipitation_probability_max: [5, 20, 40, 90, 70, 10, 60],
      apparent_temperature_max: max.map((value) => Math.round((value - 1.3) * 10) / 10),
      apparent_temperature_min: min.map((value) => Math.round((value - 2.4) * 10) / 10),
      wind_speed_10m_max: time.map((_, index) => Math.round((1.8 + ((index + Math.round(base)) % 6) * 1.3) * speedUnit * 10) / 10),
      wind_direction_10m_dominant: time.map((_, index) => (index * 53 + Math.round(base) * 7) % 360),
      wind_gusts_10m_max: time.map((_, index) => Math.round((4.6 + ((index + Math.round(base)) % 6) * 1.9) * speedUnit * 10) / 10),
      uv_index_max: time.map((_, index) => Math.round((1.4 + ((index + Math.round(base)) % 7) * 1.25) * 100) / 100),
      sunrise: time.map((date, index) => `${date}T06:${pad(5 + index)}`),
      sunset: time.map((date, index) => `${date}T17:${pad(12 - index)}`),
    },
  };
}

const CWA_DATASETS = new Map([
  ["/api/v1/rest/datastore/F-C0032-001", forecastResponse],
  ["/api/v1/rest/datastore/W-C0033-001", warningResponse],
  ["/api/v1/rest/datastore/F-D0047-091", weekResponse],
  ["/api/v1/rest/datastore/F-D0047-089", hoursResponse],
]);

/** Authorization 或 api_key 是 bad 開頭時回 401 像授權碼打錯 */
export async function handle({ url, json }) {
  const dataset = CWA_DATASETS.get(url.pathname);
  if (dataset) {
    const key = url.searchParams.get("Authorization") ?? "";
    if (!key || key.startsWith("bad")) return json(401, { message: "Unauthorized" });
    const names = url.searchParams.get("locationName") ?? url.searchParams.get("LocationName");
    return json(200, dataset(names ? names.split(",") : COUNTIES));
  }
  if (url.pathname === "/v1/forecast") return json(200, openMeteoResponse(url));
  if (url.pathname === "/api/v2/aqx_p_432") {
    const key = url.searchParams.get("api_key") ?? "";
    if (!key || key.startsWith("bad")) return json(401, { message: "api_key 錯誤" });
    return json(200, aqiResponse());
  }
  return false;
}
