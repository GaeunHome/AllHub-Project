import { describe, expect, it } from "vitest";
import { metroDirections, parseDailyTimetable, parseMetroLines, parseMetroTimetable, parseStations } from "../timetable";

const at = (date: string, time: string) => Date.parse(`${date}T${time}:00+08:00`);
const DATE = "2026-11-05"; // 星期四

const thsrRow = (trainNo: string, departs: string, arrives: string) => ({
  TrainDate: DATE,
  DailyTrainInfo: { TrainNo: trainNo, Direction: 0, EndingStationName: { Zh_tw: "左營", En: "Zuoying" } },
  OriginStopTime: { StationID: "1000", DepartureTime: departs, ArrivalTime: departs },
  DestinationStopTime: { StationID: "1070", ArrivalTime: arrives, DepartureTime: arrives },
});

describe("parseDailyTimetable：高鐵與台鐵的起訖站時刻表", () => {
  it("每一班寫出車次 開車與到站時間 開車時間是台灣時間 照時間排", () => {
    const rows = [thsrRow("0651", "08:46", "10:20"), thsrRow("0627", "08:16", "09:50")];

    expect(parseDailyTimetable(rows, DATE)).toEqual([
      { at: at(DATE, "08:16"), arrivesAt: at(DATE, "09:50"), trainNo: "0627", kind: null, toward: "左營" },
      { at: at(DATE, "08:46"), arrivesAt: at(DATE, "10:20"), trainNo: "0651", kind: null, toward: "左營" },
    ]);
  });

  it("台鐵寫出車種", () => {
    const row = { ...thsrRow("123", "08:16", "09:50"), DailyTrainInfo: { TrainNo: "123", TrainTypeName: { Zh_tw: "自強(3000)" }, EndingStationName: { Zh_tw: "花蓮" } } };

    expect(parseDailyTimetable([row], DATE)[0]).toMatchObject({ kind: "自強(3000)", toward: "花蓮" });
  });

  it("時間帶秒也收", () => {
    expect(parseDailyTimetable([thsrRow("0627", "08:16:00", "09:50:00")], DATE)[0].at).toBe(at(DATE, "08:16"));
  });

  it("停駛的班次不列（台鐵 SuspendedFlag 1）", () => {
    const row = thsrRow("123", "08:16", "09:50");
    const suspended = { ...row, DailyTrainInfo: { ...row.DailyTrainInfo, SuspendedFlag: 1 } };

    expect(parseDailyTimetable([suspended], DATE)).toEqual([]);
  });

  it("到站時間比開車早 代表過了午夜 算隔天", () => {
    const [train] = parseDailyTimetable([thsrRow("0999", "23:30", "00:40")], DATE);

    expect(train.arrivesAt).toBe(at("2026-11-06", "00:40"));
  });

  it("跨夜車次在凌晨才經過起站 開車時間算隔天", () => {
    const row = thsrRow("555", "00:20", "01:10");
    const overnight = { ...row, DailyTrainInfo: { ...row.DailyTrainInfo, OverNightStationID: "1100" } };

    expect(parseDailyTimetable([overnight], DATE)[0].at).toBe(at("2026-11-06", "00:20"));
  });

  it("少了時間的班次略過 其他照常 回應不是陣列時是空的", () => {
    expect(parseDailyTimetable([{ DailyTrainInfo: { TrainNo: "1" } }, thsrRow("0627", "08:16", "09:50")], DATE)).toHaveLength(1);
    expect(parseDailyTimetable({ message: "error" }, DATE)).toEqual([]);
  });
});

const metroRow = (destinationId: string, name: string, times: string[], service: Record<string, boolean>) => ({
  StationID: "G09",
  DestinationStaionID: destinationId,
  DestinationStationName: { Zh_tw: name },
  ServiceDay: service,
  Timetables: times.map((time, index) => ({ Sequence: index + 1, ArrivalTime: time, DepartureTime: time })),
});
const WEEKDAY = { Monday: true, Tuesday: true, Wednesday: true, Thursday: true, Friday: true, Saturday: false, Sunday: false };
const WEEKEND = { Monday: false, Tuesday: false, Wednesday: false, Thursday: false, Friday: false, Saturday: true, Sunday: true };

describe("parseMetroTimetable：捷運的站別時刻表", () => {
  const rows = [metroRow("R28", "淡水", ["08:00", "08:06"], WEEKDAY), metroRow("R28", "淡水", ["09:00"], WEEKEND), metroRow("R02", "象山", ["08:03"], WEEKDAY)];

  it("只列選的方向與今天營運的那一份", () => {
    expect(parseMetroTimetable(rows, DATE, "R28").map((train) => train.at)).toEqual([at(DATE, "08:00"), at(DATE, "08:06")]);
  });

  it("星期六用假日的那一份 2026-11-07 是星期六", () => {
    expect(parseMetroTimetable(rows, "2026-11-07", "R28").map((train) => train.at)).toEqual([at("2026-11-07", "09:00")]);
  });

  it("過了午夜的末班車照發車順序算隔天", () => {
    const late = [metroRow("R28", "淡水", ["23:58", "00:04"], WEEKDAY)];

    expect(parseMetroTimetable(late, DATE, "R28").map((train) => train.at)).toEqual([at(DATE, "23:58"), at("2026-11-06", "00:04")]);
  });

  it("捷運沒有車次號碼 寫出開往哪裡", () => {
    expect(parseMetroTimetable(rows, DATE, "R28")[0]).toMatchObject({ trainNo: null, toward: "淡水", arrivesAt: null });
  });
});

describe("metroDirections：這一站有哪些方向", () => {
  it("每個終點站一個選項 不重複 文湖線這種沒有時刻表時是空的", () => {
    const rows = [metroRow("R28", "淡水", [], WEEKDAY), metroRow("R28", "淡水", [], WEEKEND), metroRow("R02", "象山", [], WEEKDAY)];

    expect(metroDirections(rows)).toEqual([{ id: "R28", name: "淡水" }, { id: "R02", name: "象山" }]);
    expect(metroDirections([])).toEqual([]);
  });
});

describe("parseStations", () => {
  it("取代碼與中文名稱 同一站出現在兩條線時只留一個", () => {
    const rows = [{ StationID: "1000", StationName: { Zh_tw: "臺北", En: "Taipei" } }, { StationID: "1000", StationName: { Zh_tw: "臺北" } }, { StationID: "1070", StationName: { Zh_tw: "左營" } }];

    expect(parseStations(rows)).toEqual([{ id: "1000", name: "臺北" }, { id: "1070", name: "左營" }]);
  });
});

describe("parseStations：車站的縣市", () => {
  it("台鐵的車站帶 LocationCity 分組才不用多問一次 TDX", () => {
    expect(parseStations([{ StationID: "1000", StationName: { Zh_tw: "臺北" }, LocationCity: "臺北市" }])).toEqual([{ id: "1000", name: "臺北", city: "臺北市" }]);
  });

  it("沒有縣市或型別不對 車站照樣留著", () => {
    expect(parseStations([{ StationID: "1000", StationName: { Zh_tw: "臺北" } }, { StationID: "1020", StationName: { Zh_tw: "板橋" }, LocationCity: { Zh_tw: "新北市" } }])).toEqual([{ id: "1000", name: "臺北" }, { id: "1020", name: "板橋" }]);
  });
});

describe("parseMetroLines：每條線上的車站", () => {
  const stop = (Sequence: unknown, StationID: unknown) => ({ Sequence, StationID, StationName: { Zh_tw: "站" } });

  it("車站照 Sequence 排 不是回應的順序", () => {
    expect(parseMetroLines([{ LineNo: "R", LineID: "R", Stations: [stop(3, "R10"), stop(1, "R02"), stop(2, "R07")] }])).toEqual([{ id: "R", stationIds: ["R02", "R07", "R10"] }]);
  });

  it("支線跟主線同一個 LineNo 併成一條 重複的站只留一次", () => {
    const rows = [{ LineNo: "R", LineID: "R", Stations: [stop(1, "R22"), stop(2, "R23")] }, { LineNo: "R", LineID: "R-1", Stations: [stop(1, "R22"), stop(2, "R22A")] }];

    expect(parseMetroLines(rows)).toEqual([{ id: "R", stationIds: ["R22", "R23", "R22A"] }]);
  });

  it("同一站在兩條線 兩條都留著", () => {
    const rows = [{ LineNo: "G", Stations: [stop(1, "G09")] }, { LineNo: "O", Stations: [stop(1, "G09")] }];

    expect(parseMetroLines(rows)).toEqual([{ id: "G", stationIds: ["G09"] }, { id: "O", stationIds: ["G09"] }]);
  });

  it("沒有 LineNo 時用 LineID", () => {
    expect(parseMetroLines([{ LineID: "BL", Stations: [stop(1, "BL01")] }])).toEqual([{ id: "BL", stationIds: ["BL01"] }]);
  });

  it("沒有 Sequence 的站排在最後 不能不見", () => {
    expect(parseMetroLines([{ LineNo: "R", Stations: [stop(null, "R99"), stop(1, "R02")] }])).toEqual([{ id: "R", stationIds: ["R02", "R99"] }]);
  });

  it("欄位不同時略過讀不到的 不丟錯", () => {
    expect(parseMetroLines([{ LineNo: "R" }, { LineNo: "BL", Stations: [{ Sequence: 1 }] }, { Stations: [stop(1, "R02")] }, null])).toEqual([]);
    expect(parseMetroLines({ error: "nope" })).toEqual([]);
  });
});
