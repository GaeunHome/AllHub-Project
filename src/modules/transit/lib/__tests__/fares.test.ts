import { describe, expect, it } from "vitest";
import { lowestTraFare, parseMetroFare, parseThsrFares, parseTraFares, traFareOf, type TraFare } from "../fares";

// 價錢與代碼都抄自 TDX 的真實回應與 swagger 不是照程式算的

describe("parseThsrFares：高鐵的全票", () => {
  // 台北到左營 其他票種 學生票 早鳥不是全票
  const row = (Fares: unknown[]) => [{ OriginStationID: "1000", DestinationStationID: "1070", Direction: 0, Fares }];
  const FARES = [
    { TicketType: 1, FareClass: 1, CabinClass: 1, Price: 1490 },
    { TicketType: 1, FareClass: 1, CabinClass: 2, Price: 2440 },
    { TicketType: 1, FareClass: 1, CabinClass: 3, Price: 1445 },
    { TicketType: 1, FareClass: 9, CabinClass: 1, Price: 745 },
    { TicketType: 8, FareClass: 1, CabinClass: 1, Price: 1192 },
  ];

  it("使用者要的：標準 商務 自由各一個全票 優待票與早鳥不算", () => {
    expect(parseThsrFares(row(FARES), "1000", "1070").fares).toEqual([
      { cabin: "標準", price: 1490 },
      { cabin: "商務", price: 2440 },
      { cabin: "自由", price: 1445 },
    ]);
  });

  it("別的起訖站不算 網址被改寫或篩選沒生效時不能顯示錯的價錢", () => {
    expect(parseThsrFares(row(FARES), "1000", "1040").fares).toEqual([]);
  });

  it("同一個車廂有兩個價錢時不知道哪個對 那個車廂不顯示", () => {
    const fares = [...FARES, { TicketType: 1, FareClass: 1, CabinClass: 2, Price: 2000 }];

    expect(parseThsrFares(row(fares), "1000", "1070").fares.map((fare) => fare.cabin)).toEqual(["標準", "自由"]);
  });

  it("欄位不同時回空的 只記欄位名稱", () => {
    const { fares, missing } = parseThsrFares([{ OriginStationID: "1000", DestinationStationID: "1070" }], "1000", "1070");

    expect(fares).toEqual([]);
    expect(missing).toEqual(["Fares"]);
  });

  it("票價不是正數不收", () => {
    expect(parseThsrFares(row([{ TicketType: 1, FareClass: 1, CabinClass: 1, Price: 0 }]), "1000", "1070").fares).toEqual([]);
  });
});

describe("台鐵的票價要同一種車 同一個方向", () => {
  // 臺北到高雄的真實回應 方向 0 是繞東部 方向 1 才是走西部幹線
  const row = (Direction: number, TrainType: number, Price: number) => ({ OriginStationID: "1000", DestinationStationID: "4400", Direction, TrainType, Fares: [{ TicketType: 1, FareClass: 1, CabinClass: 1, Price }, { TicketType: 1, FareClass: 3, CabinClass: 1, Price: Math.round(Price / 2) }] });
  const REAL = { ODFares: [row(0, 3, 1286), row(0, 4, 993), row(0, 7, 535), row(1, 3, 994), row(1, 4, 767), row(1, 11, 994), row(1, 7, 394)] };
  const fares = parseTraFares(REAL, "1000", "4400").fares;

  it("回應裡每一列都讀成車種 方向與全票", () => {
    expect(fares).toContainEqual({ trainType: 3, direction: 0, price: 1286 });
    expect(fares).toContainEqual({ trainType: 3, direction: 1, price: 994 });
    expect(fares).toHaveLength(7);
  });

  it("自強往南走西部是 994 不是繞東部的 1286", () => {
    expect(traFareOf(fares, { trainType: 3, direction: 1 })).toBe(994);
  });

  it("莒光與自強的價錢不同", () => {
    expect(traFareOf(fares, { trainType: 4, direction: 1 })).toBe(767);
  });

  it("認不得的車種或沒有車種時不顯示 不猜價錢", () => {
    expect(traFareOf(fares, { trainType: 8, direction: 1 })).toBeNull();
    expect(traFareOf(fares, undefined)).toBeNull();
  });

  it("起價只算列出來的班次 繞東部的 300 元與這一班沒有的車種都不能混進去", () => {
    const eastbound: TraFare[] = [{ trainType: 7, direction: 0, price: 300 }, ...fares];

    expect(lowestTraFare(eastbound, [{ fareKey: { trainType: 3, direction: 1 } }])).toBe(994);
  });

  it("班次都不知道車種與方向_不寫起價", () => {
    expect(lowestTraFare(fares, [{}])).toBeNull();
  });

  it("起價只算列出來的班次對得到的價錢：票價表裡有、但沒有一班是那個車種的不算", () => {
    const table = [{ trainType: 3, direction: 0, price: 994 }, { trainType: 7, direction: 0, price: 500 }];

    expect(lowestTraFare(table, [{ fareKey: { trainType: 11, direction: 0 } }])).toBeNull();
    expect(lowestTraFare(table, [{ fareKey: { trainType: 3, direction: 0 } }, { fareKey: { trainType: 11, direction: 0 } }])).toBe(994);
  });

  it("沒有任何票價時沒有起價", () => {
    expect(lowestTraFare([], [{}])).toBeNull();
  });

  it("同一種車同一個方向有兩個價錢時不知道哪個對 都不用", () => {
    const { fares: parsed } = parseTraFares({ ODFares: [row(1, 3, 994), row(1, 3, 500), row(1, 4, 767)] }, "1000", "4400");

    expect(traFareOf(parsed, { trainType: 3, direction: 1 })).toBeNull();
    expect(traFareOf(parsed, { trainType: 4, direction: 1 })).toBe(767);
  });

  it("欄位不同時回空的 只記欄位名稱", () => {
    expect(parseTraFares({ ODFares: [{ Fares: [] }] }, "1000", "4400")).toMatchObject({ fares: [], missing: ["ODFares[].Direction", "ODFares[].TrainType"] });
  });

  it("回應不是 ODFares 時回空的 不會出錯", () => {
    expect(parseTraFares([], "1000", "4400").fares).toEqual([]);
  });
});

describe("parseMetroFare：捷運的單程全票", () => {
  // 台北車站到頂埔的真實回應 同一個全票列兩次 還有依縣市的孩童票
  const row = (Fares: unknown[]) => [{ OriginStationID: "BL12", DestinationStationID: "BL01", TrainType: 0, Fares, TravelDistance: 15.99 }];
  const REAL = [{ TicketType: 1, FareClass: 1, Price: 40 }, { TicketType: 1, FareClass: 1, Price: 40 }, { TicketType: 1, FareClass: 3, CitizenCode: "NWT", Price: 16 }, { TicketType: 1, FareClass: 4, Price: 16 }];

  it("單程全票 真實回應會重複列 一樣的價錢算一個", () => {
    expect(parseMetroFare(row(REAL), "BL12", "BL01").fare).toBe(40);
  });

  it("只有孩童敬老票時不顯示 不把 16 元當成全票", () => {
    expect(parseMetroFare(row(REAL.slice(2)), "BL12", "BL01").fare).toBeNull();
  });

  it("全票有兩個價錢時不知道哪個對", () => {
    expect(parseMetroFare(row([...REAL, { TicketType: 1, FareClass: 1, Price: 35 }]), "BL12", "BL01").fare).toBeNull();
  });

  it("別的起訖站不算", () => {
    expect(parseMetroFare(row(REAL), "BL12", "R28").fare).toBeNull();
  });

  it("空的回 null", () => {
    expect(parseMetroFare([], "BL12", "BL01")).toEqual({ fare: null, missing: [] });
  });
});
