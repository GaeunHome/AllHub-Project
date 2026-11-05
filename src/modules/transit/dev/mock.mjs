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
const TRA = ["1000:臺北", "1020:板橋", "1080:桃園", "1210:新竹", "3300:臺中", "4220:臺南", "4400:高雄"];
const TRTC = ["R10:台北車站", "R07:東門", "BL12:台北車站(板南線)", "BL18:市政府", "G09:古亭", "O07:古亭(中和新蘆線)", "BR10:忠孝復興"];
const stations = (list) => list.map((row) => ({ StationID: row.split(":")[0], StationName: { Zh_tw: row.split(":")[1], En: "Station" } }));

function dailyRows(url, ending, kinds, trainBase, step, ride) {
  const date = url.pathname.split("/").at(-1);
  return range(6 * 60, 23 * 60, step).map((minute, index) => ({
    TrainDate: date,
    DailyTrainInfo: { TrainNo: String(trainBase + index), Direction: 0, EndingStationName: { Zh_tw: ending }, ...(kinds ? { TrainTypeName: { Zh_tw: kinds[index % kinds.length] } } : {}) },
    OriginStopTime: { StationID: "1", DepartureTime: clock(minute), ArrivalTime: clock(minute) },
    DestinationStopTime: { StationID: "2", ArrivalTime: clock(minute + ride), DepartureTime: clock(minute + ride) },
  }));
}

const ALL_WEEK = { Monday: true, Tuesday: true, Wednesday: true, Thursday: true, Friday: true, Saturday: true, Sunday: true };

function metroTimetable(stationId) {
  const directions = stationId.startsWith("R") ? [["R28", "淡水"], ["R02", "象山"]] : stationId.startsWith("BL") ? [["BL01", "頂埔"], ["BL23", "南港展覽館"]] : stationId.startsWith("BR") ? [] : [["G19", "松山"], ["G01", "新店"]];
  return directions.map(([id, name]) => ({
    StationID: stationId,
    Direction: 0,
    DestinationStaionID: id,
    DestinationStationName: { Zh_tw: name },
    ServiceDay: ALL_WEEK,
    Timetables: range(6 * 60, 23 * 60 + 54, 6).map((minute, index) => ({ Sequence: index + 1, ArrivalTime: clock(minute), DepartureTime: clock(minute) })),
  }));
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

export async function handle({ url, req, json }) {
  if (url.pathname === TOKEN_PATH && req.method === "POST") {
    json(200, { access_token: "mock-tdx-token", expires_in: 86400, token_type: "Bearer" });
    return true;
  }
  if (url.pathname.startsWith("/api/basic/v2/Bus/")) {
    const known = decodeURIComponent(url.pathname).endsWith("/307");
    if (url.pathname.includes("/StopOfRoute/")) return json(200, known ? busRoute() : []);
    if (url.pathname.includes("/EstimatedTimeOfArrival/")) return json(200, known ? busEta() : []);
    if (url.pathname.includes("/Schedule/")) return json(200, known ? busSchedule() : []);
    return false;
  }
  if (!url.pathname.startsWith("/api/basic/v2/Rail/")) return false;
  const path = url.pathname.slice("/api/basic/v2/Rail/".length);
  const filter = /StationID eq '([^']+)'/.exec(url.searchParams.get("$filter") ?? "")?.[1] ?? "";
  if (path === "THSR/Station") json(200, stations(THSR));
  else if (path === "TRA/Station") json(200, stations(TRA));
  else if (path.startsWith("Metro/Station/")) json(200, stations(TRTC));
  else if (path.startsWith("THSR/DailyTimetable/OD/")) json(200, dailyRows(url, "左營", null, 600, 15, 94));
  else if (path.startsWith("TRA/DailyTimetable/OD/")) json(200, dailyRows(url, "高雄", ["自強(3000)", "區間", "莒光"], 100, 20, 55));
  else if (path.startsWith("TRA/LiveBoard/Station/")) json(200, [{ TrainNo: "103", DelayTime: 3 }]);
  else if (path.startsWith("Metro/StationTimeTable/")) json(200, metroTimetable(filter));
  else if (path.startsWith("Metro/LiveBoard/")) json(200, metroTimetable(filter).map((row) => ({ StationID: filter, DestinationStationID: row.DestinationStaionID, DestinationStationName: row.DestinationStationName, EstimateTime: 3, ServiceStatus: 0 })));
  else return false;
  return true;
}
