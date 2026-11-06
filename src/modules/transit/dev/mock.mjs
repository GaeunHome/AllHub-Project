// 假的 TDX 格式照 OpenAPI 文件 時間照現在的台灣時間排 打開頁面時永遠有下一班
// 高鐵每 15 分鐘一班 台鐵每 20 分鐘一班 捷運每 6 分鐘一班 跨到明天的日期也有車

const TOKEN_PATH = "/auth/realms/TDXConnect/protocol/openid-connect/token";
const pad = (value) => String(value).padStart(2, "0");
const clock = (minutes) => `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`;

function range(from, to, step) {
  const out = [];
  for (let minute = from; minute <= to; minute += step) out.push(minute);
  return out;
}

const THSR = ["1000:台北", "1010:板橋", "1020:桃園", "1030:新竹", "1040:台中", "1050:嘉義", "1060:台南", "1070:左營"];
// 新竹與嘉義的縣市分開寫 看得到併成一組
const TRA = ["0900:基隆:基隆市", "1000:臺北:臺北市", "1020:板橋:新北市", "1080:桃園:桃園市", "1180:竹北:新竹縣", "1210:新竹:新竹市", "3160:苗栗:苗栗縣", "3300:臺中:臺中市", "3360:彰化:彰化縣", "3430:集集:南投縣", "3470:斗六:雲林縣", "4060:民雄:嘉義縣", "4080:嘉義:嘉義市", "4220:臺南:臺南市", "4400:高雄:高雄市", "5000:屏東:屏東縣", "6000:臺東:臺東縣", "7000:花蓮:花蓮縣", "7190:宜蘭:宜蘭縣"];
// 跟真的一樣 轉乘站在每條線各有代碼而且同名 機場線的 A1 故意寫臺 看得到台與臺算同一站 小碧潭 新北投 蘆洲是同一個 LineNo 的支線
const named = (prefix, start, names) => names.map((name, index) => `${prefix}${String(start + index).padStart(2, "0")}:${name}`);
const METRO = {
  TRTC: [
    ["BL", "BL", named("BL", 1, ["頂埔", "永寧", "土城", "海山", "亞東醫院", "府中", "板橋", "新埔", "江子翠", "龍山寺", "西門", "台北車站", "善導寺", "忠孝新生", "忠孝復興", "忠孝敦化", "國父紀念館", "市政府", "永春", "後山埤", "昆陽", "南港", "南港展覽館"])],
    ["BR", "BR", named("BR", 1, ["動物園", "木柵", "萬芳社區", "萬芳醫院", "辛亥", "麟光", "六張犁", "科技大樓", "大安", "忠孝復興", "南京復興", "中山國中", "松山機場", "大直", "劍南路", "西湖", "港墘", "文德", "內湖", "大湖公園", "葫洲", "東湖", "南港軟體園區", "南港展覽館"])],
    ["G", "G", named("G", 1, ["新店", "新店區公所", "七張", "大坪林", "景美", "萬隆", "公館", "台電大樓", "古亭", "中正紀念堂", "小南門", "西門", "北門", "中山", "松江南京", "南京復興", "台北小巨蛋", "南京三民", "松山"])],
    ["G", "G-1", ["G03:七張", "G03A:小碧潭"]],
    ["O", "O", named("O", 1, ["南勢角", "景安", "永安市場", "頂溪", "古亭", "東門", "忠孝新生", "松江南京", "行天宮", "中山國小", "民權西路", "大橋頭", "台北橋", "菜寮", "三重", "先嗇宮", "頭前庄", "新莊", "輔大", "丹鳳", "迴龍"])],
    ["O", "O-1", ["O12:大橋頭", ...named("O", 50, ["三重國小", "三和國中", "徐匯中學", "三民高中", "蘆洲"])]],
    ["R", "R", named("R", 2, ["象山", "台北101/世貿", "信義安和", "大安", "大安森林公園", "東門", "中正紀念堂", "台大醫院", "台北車站", "中山", "雙連", "民權西路", "圓山", "劍潭", "士林", "芝山", "明德", "石牌", "唭哩岸", "奇岩", "北投", "復興崗", "忠義", "關渡", "竹圍", "紅樹林", "淡水"])],
    ["R", "R-1", ["R22:北投", "R22A:新北投"]],
  ],
  NTMC: [["Y", "Y", named("Y", 7, ["大坪林", "十四張", "秀朗橋", "景平", "景安", "中和", "橋和", "中原", "板新", "板橋", "新埔民生", "頭前庄", "幸福", "新北產業園區"])]],
  TYMC: [["A", "A", ["臺北車站", "三重", "新北產業園區", "新莊副都心", "泰山", "泰山貴和", "體育大學", "長庚醫院", "林口", "山鼻", "坑口", "機場第一航廈", "機場第二航廈"].map((name, index) => `A${index + 1}:${name}`)]],
};
const idOf = (row) => row.split(":")[0];
const nameOf = (row) => row.split(":")[1];
const stations = (list) => list.map((row) => ({ StationID: idOf(row), StationName: { Zh_tw: nameOf(row), En: "Station" }, ...(row.split(":")[2] ? { LocationCity: row.split(":")[2] } : {}) }));
const metroStations = (system) => [...new Set((METRO[system] ?? []).flatMap(([, , list]) => list))];
const stationsOfLine = (system) => METRO[system].map(([LineNo, LineID, list]) => ({ LineNo, LineID, Stations: list.map((row, index) => ({ Sequence: index + 1, StationID: idOf(row), StationName: { Zh_tw: nameOf(row), En: "Station" } })) }));

function dailyRows(url, ending, kinds, trainBase, step, ride) {
  const date = url.pathname.split("/").at(-1);
  return range(6 * 60, 23 * 60, step).map((minute, index) => ({
    TrainDate: date,
    DailyTrainInfo: { TrainNo: String(trainBase + index), Direction: kinds ? 1 : 0, EndingStationName: { Zh_tw: ending }, ...(kinds ? { TrainTypeCode: kinds[index % kinds.length][1], TrainTypeName: { Zh_tw: kinds[index % kinds.length][0] } } : {}) },
    OriginStopTime: { StationID: "1", DepartureTime: clock(minute), ArrivalTime: clock(minute) },
    DestinationStopTime: { StationID: "2", ArrivalTime: clock(minute + ride), DepartureTime: clock(minute + ride) },
  }));
}

const ALL_WEEK = { Monday: true, Tuesday: true, Wednesday: true, Thursday: true, Friday: true, Saturday: true, Sunday: true };

/** 這一站開往每條線兩端的終點 文湖線跟真的一樣沒有站別時刻表 別的系統查不到這一站 */
function metroTimetable(system, stationId) {
  const directions = new Map();
  for (const [LineNo, LineID, list] of METRO[system] ?? []) {
    if (LineNo === "BR" || !list.some((row) => idOf(row) === stationId)) continue;
    // 蘆洲支線的車直通南勢角 跟真的一樣 終點不是支線的第一站
    const first = LineID === "O-1" ? METRO[system].find(([, id]) => id === "O")[2][0] : list[0];
    for (const end of [first, list.at(-1)]) if (idOf(end) !== stationId) directions.set(idOf(end), nameOf(end));
  }
  return [...directions].map(([id, name]) => ({
    StationID: stationId,
    Direction: 0,
    DestinationStaionID: id,
    DestinationStationName: { Zh_tw: name },
    ServiceDay: ALL_WEEK,
    Timetables: range(6 * 60, 23 * 60 + 54, 6).map((minute, index) => ({ Sequence: index + 1, ArrivalTime: clock(minute), DepartureTime: clock(minute) })),
  }));
}

// 票價 高鐵台北到左營是真實的票價 其他照站數比例算 台鐵照每公里的費率 捷運照代碼的距離 只求看起來合理
const fare = (TicketType, FareClass, Price, CabinClass) => ({ TicketType, FareClass, ...(CabinClass ? { CabinClass } : {}), Price });
const roundToFive = (price) => Math.round(price / 5) * 5;

function thsrFares(originId, destinationId) {
  const hops = Math.abs(THSR.findIndex((row) => idOf(row) === originId) - THSR.findIndex((row) => idOf(row) === destinationId));
  if (hops === 0) return [];
  const price = (full) => roundToFive((full * hops) / (THSR.length - 1));
  return [{ OriginStationID: originId, DestinationStationID: destinationId, Direction: 0, Fares: [fare(1, 1, price(1490), 1), fare(1, 1, price(2440), 2), fare(1, 1, price(1445), 3), fare(1, 9, price(745), 1), fare(8, 1, price(1192), 1)] }];
}

// 代碼照真的 3 自強 4 莒光 6 區間 7 普快 11 自強(3000)
const TRA_RATES = { 3: 2.27, 4: 1.75, 6: 1.46, 7: 1.06, 11: 2.27 };
const KM_BETWEEN_STATIONS = 20;
const AROUND_THE_ISLAND_KM = 600;

/** 臺北到基隆只列時刻表沒有的車種 本機才看得到標題的起價 */
function traFares(originId, destinationId) {
  const hops = Math.abs(TRA.findIndex((row) => idOf(row) === originId) - TRA.findIndex((row) => idOf(row) === destinationId));
  const types = originId === "1000" && destinationId === "0900" ? [3, 7] : Object.keys(TRA_RATES).map(Number);
  const row = (Direction, km) => types.map((TrainType) => ({ OriginStationID: originId, DestinationStationID: destinationId, Direction, TrainType, TravelDistance: km, Fares: [fare(1, 1, Math.round(km * TRA_RATES[TrainType]), 1), fare(1, 3, Math.round((km * TRA_RATES[TrainType]) / 2), 1)] }));
  const km = hops * KM_BETWEEN_STATIONS;
  return { UpdateTime: "2026-11-05T00:00:00+08:00", ODFares: [...row(1, km), ...row(0, km + AROUND_THE_ISLAND_KM)] };
}

const codeNumber = (id) => Number(/\d+/.exec(id)?.[0] ?? 0);

/** 跟真的一樣 全票列兩次 還有孩童票 跨系統查不到 */
function metroFares(system, originId, destinationId) {
  const ids = metroStations(system).map(idOf);
  if (!ids.includes(originId) || !ids.includes(destinationId)) return [];
  const Price = Math.min(65, 20 + 5 * Math.floor(Math.abs(codeNumber(originId) - codeNumber(destinationId)) / 3));
  return [{ OriginStationID: originId, DestinationStationID: destinationId, TrainType: 0, TravelDistance: 12.3, Fares: [fare(1, 1, Price), fare(1, 1, Price), { ...fare(1, 3, Math.round(Price * 0.4)), CitizenCode: "NWT" }, fare(1, 4, Math.round(Price * 0.4))] }];
}

const DWELL_SECONDS = 30;
const RUN_SECONDS = 110;

/** 臺北捷運與環狀線只列一個方向 第一段沒有停站時間 */
function adjacentTravelTimes(system) {
  return METRO[system].map(([LineNo, LineID, list]) => {
    const stops = list.toReversed().map(idOf);
    return { LineNo, LineID, RouteID: `${LineID}-1`, TrainType: 1, TravelTimes: stops.slice(1).map((ToStationID, index) => ({ Sequence: index + 1, FromStationID: stops[index], ToStationID, RunTime: RUN_SECONDS, StopTime: index === 0 ? 0 : DWELL_SECONDS })) };
  });
}

const AIRPORT_EXPRESS_STOPS = ["A1", "A3", "A8", "A12", "A13"];

/** 機場捷運是任兩站的累計時間 普通車與直達車各一組 */
function airportTravelTimes() {
  const ids = METRO.TYMC[0][2].map(idOf);
  const pairs = (list, secondsPerStop) => list.flatMap((from, start) => list.flatMap((to, end) => (start === end ? [] : [{ Sequence: 1, FromStationID: from, ToStationID: to, RunTime: Math.abs(start - end) * secondsPerStop, StopTime: 0 }])));
  return [{ LineNo: "A", LineID: "A", RouteID: "", TrainType: 1, TravelTimes: pairs(ids, 240) }, { LineNo: "A", LineID: "A", RouteID: "", TrainType: 2, TravelTimes: pairs(AIRPORT_EXPRESS_STOPS, 500) }];
}

// 公車 307 假資料 去程往臺北車站 一站比一站晚 兩分鐘 最後一站末班車已過 看得到每一種狀態
const BUS_STOPS = ["板橋公車站", "新埔", "西門", "臺北車站"];

function busRoute() {
  const stops = (names, prefix) => names.map((name, index) => ({ StopUID: `TPE${prefix}${index}`, StopName: { Zh_tw: name }, StopSequence: index + 1 }));
  return [{ Direction: 0, Stops: stops(BUS_STOPS, 0) }, { Direction: 1, Stops: stops(BUS_STOPS.toReversed(), 1) }];
}

function busEta() {
  return [0, 1].flatMap((direction) =>
    BUS_STOPS.map((_, index) => ({ StopUID: `TPE${direction}${index}`, Direction: direction, EstimateTime: index === 3 ? null : 95 + index * 120, StopStatus: index === 3 ? 3 : 0 })),
  );
}

const EVERY_DAY = { Sunday: 1, Monday: 1, Tuesday: 1, Wednesday: 1, Thursday: 1, Friday: 1, Saturday: 1 };
const busSchedule = () => [0, 1].map((direction) => ({ Direction: direction, Frequencys: [{ StartTime: "00:00", EndTime: "23:59", MinHeadwayMins: 8, MaxHeadwayMins: 12, ServiceDay: EVERY_DAY }] }));

// 免費會員每把金鑰每分鐘的上限 設了 MOCK_TDX_PER_MINUTE 才擋 平常開發不用等
let usedMinute = 0;
let usedCalls = 0;

function secondsUntilFree() {
  const limit = Number(process.env.MOCK_TDX_PER_MINUTE);
  if (!limit) return 0;
  const now = Date.now();
  const minute = Math.floor(now / 60_000);
  if (minute !== usedMinute) [usedMinute, usedCalls] = [minute, 0];
  usedCalls += 1;
  return usedCalls > limit ? Math.ceil((minute + 1) * 60 - now / 1000) : 0;
}

export async function handle({ url, req, json }) {
  if (url.pathname === TOKEN_PATH && req.method === "POST") {
    json(200, { access_token: "mock-tdx-token", expires_in: 86400, token_type: "Bearer" });
    return true;
  }
  if (url.pathname.startsWith("/api/basic/")) {
    const wait = secondsUntilFree();
    if (wait > 0) return json(429, { message: "API rate limit exceeded" }, { "Retry-After": String(wait) });
  }
  if (url.pathname.startsWith("/api/basic/v2/Bus/")) {
    const known = decodeURIComponent(url.pathname).endsWith("/307");
    if (url.pathname.includes("/StopOfRoute/")) return json(200, known ? busRoute() : []);
    if (url.pathname.includes("/EstimatedTimeOfArrival/")) return json(200, known ? busEta() : []);
    if (url.pathname.includes("/Schedule/")) return json(200, known ? busSchedule() : []);
    return false;
  }
  const traFare = /^\/api\/basic\/v3\/Rail\/TRA\/ODFare\/([^/]+)\/to\/([^/]+)$/.exec(url.pathname);
  if (traFare) return json(200, traFares(traFare[1], traFare[2]));
  if (!url.pathname.startsWith("/api/basic/v2/Rail/")) return false;
  const path = url.pathname.slice("/api/basic/v2/Rail/".length);
  const query = url.searchParams.get("$filter") ?? "";
  const filter = /StationID eq '([^']+)'/.exec(query)?.[1] ?? "";
  const system = path.split("/")[2];
  if (path === "THSR/Station") json(200, stations(THSR));
  else if (path === "TRA/Station") json(200, stations(TRA));
  else if (path.startsWith("Metro/Station/")) json(200, stations(metroStations(system)));
  else if (path.startsWith("Metro/StationOfLine/")) json(METRO[system] ? 200 : 404, METRO[system] ? stationsOfLine(system) : []);
  else if (path.startsWith("THSR/DailyTimetable/OD/")) json(200, dailyRows(url, "左營", null, 600, 15, 94));
  else if (path.startsWith("TRA/DailyTimetable/OD/")) json(200, dailyRows(url, "高雄", [["自強(3000)", "11"], ["區間", "6"], ["莒光", "4"]], 100, 20, 55));
  else if (path.startsWith("THSR/ODFare/")) json(200, thsrFares(...path.slice("THSR/ODFare/".length).split("/to/")));
  else if (path.startsWith("Metro/ODFare/")) json(200, metroFares(system, /OriginStationID eq '([^']+)'/.exec(query)?.[1], /DestinationStationID eq '([^']+)'/.exec(query)?.[1]));
  else if (path.startsWith("Metro/S2STravelTime/")) json(200, system === "TYMC" ? airportTravelTimes() : adjacentTravelTimes(system));
  else if (path.startsWith("TRA/LiveBoard/Station/")) json(200, [{ TrainNo: "103", DelayTime: 3 }]);
  else if (path.startsWith("Metro/StationTimeTable/")) json(200, metroTimetable(system, filter));
  else if (path.startsWith("Metro/LiveBoard/")) json(200, metroTimetable(system, filter).map((row) => ({ StationID: filter, DestinationStationID: row.DestinationStaionID, DestinationStationName: row.DestinationStationName, EstimateTime: 3, ServiceStatus: 0 })));
  else return false;
  return true;
}
