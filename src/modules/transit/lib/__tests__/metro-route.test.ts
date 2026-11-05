import { describe, expect, it } from "vitest";
import { fareSystemOf, metroNetwork, planRoute, type MetroLeg } from "../metro-route";
import type { Station } from "../timetable";

// 照臺北捷運的路線圖手寫的 答案也是對著路線圖數站數算出來的

const NAMES: Record<string, string[]> = {
  BL: ["頂埔", "永寧", "土城", "海山", "亞東醫院", "府中", "板橋", "新埔", "江子翠", "龍山寺", "西門", "台北車站", "善導寺", "忠孝新生", "忠孝復興", "忠孝敦化", "國父紀念館", "市政府", "永春", "後山埤", "昆陽", "南港", "南港展覽館"],
  BR: ["動物園", "木柵", "萬芳社區", "萬芳醫院", "辛亥", "麟光", "六張犁", "科技大樓", "大安", "忠孝復興", "南京復興", "中山國中", "松山機場", "大直", "劍南路", "西湖", "港墘", "文德", "內湖", "大湖公園", "葫洲", "東湖", "南港軟體園區", "南港展覽館"],
  G: ["新店", "新店區公所", "七張", "大坪林", "景美", "萬隆", "公館", "台電大樓", "古亭", "中正紀念堂", "小南門", "西門", "北門", "中山", "松江南京", "南京復興", "台北小巨蛋", "南京三民", "松山"],
  O: ["南勢角", "景安", "永安市場", "頂溪", "古亭", "東門", "忠孝新生", "松江南京", "行天宮", "中山國小", "民權西路", "大橋頭", "台北橋", "菜寮", "三重", "先嗇宮", "頭前庄", "新莊", "輔大", "丹鳳", "迴龍"],
};
const RED = ["象山", "台北101/世貿", "信義安和", "大安", "大安森林公園", "東門", "中正紀念堂", "台大醫院", "台北車站", "中山", "雙連", "民權西路", "圓山", "劍潭", "士林", "芝山", "明德", "石牌", "唭哩岸", "奇岩", "北投", "復興崗", "忠義", "關渡", "竹圍", "紅樹林", "淡水"];
const CIRCULAR = ["大坪林", "十四張", "秀朗橋", "景平", "景安", "中和", "橋和", "中原", "板新", "板橋", "新埔民生", "頭前庄", "幸福", "新北產業園區"];
// 機場線的 A1 在 TDX 寫的是臺 跟其他線的台要算同一站
const AIRPORT = ["臺北車站", "三重", "新北產業園區", "新莊副都心", "泰山", "泰山貴和", "體育大學", "長庚醫院", "林口", "山鼻", "坑口", "機場第一航廈", "機場第二航廈"];

const numbered = (prefix: string, start: number, names: string[], width = 2) => names.map((name, index) => ({ id: `${prefix}${String(start + index).padStart(width, "0")}`, name }));
const lineOf = (id: string, list: Station[]) => ({ id, stationIds: list.map((station) => station.id) });

const blue = numbered("BL", 1, NAMES.BL);
const brown = numbered("BR", 1, NAMES.BR);
const green = numbered("G", 1, NAMES.G);
const orange = numbered("O", 1, NAMES.O);
const red = numbered("R", 2, RED);
const xiaobitan = [green[2], { id: "G03A", name: "小碧潭" }];
const yellow = numbered("Y", 7, CIRCULAR);
const purple = numbered("A", 1, AIRPORT, 1);

const NETWORK = metroNetwork([
  { system: "TRTC", stations: [...blue, ...brown, ...green, ...xiaobitan, ...orange, ...red], lines: [lineOf("BL", blue), lineOf("BR", brown), lineOf("G", green), lineOf("G", xiaobitan), lineOf("O", orange), lineOf("R", red)] },
  { system: "NTMC", stations: yellow, lines: [lineOf("Y", yellow)] },
  { system: "TYMC", stations: purple, lines: [lineOf("A", purple)] },
]);

const plan = (from: string, to: string) => planRoute(NETWORK, from, to);
const brief = (legs: MetroLeg[] | null) => legs?.map(({ line, from, to, towardName, stops }) => [line, from.name, to.name, towardName, stops]);

describe("planRoute：捷運任兩站怎麼搭", () => {
  it("同一條線直達 不用轉乘", () => {
    expect(brief(plan("R10", "R28"))).toEqual([["淡水信義線", "台北車站", "淡水", "淡水", 18]]);
  });

  it("使用者的例子：府中到淡水 板南線到台北車站轉淡水信義線", () => {
    expect(brief(plan("BL06", "R28"))).toEqual([
      ["板南線", "府中", "台北車站", "南港展覽館", 6],
      ["淡水信義線", "台北車站", "淡水", "淡水", 18],
    ]);
  });

  it("反方向的終點跟著換", () => {
    expect(brief(plan("R28", "BL06"))).toEqual([
      ["淡水信義線", "淡水", "台北車站", "象山", 18],
      ["板南線", "台北車站", "府中", "頂埔", 6],
    ]);
  });

  it("每段都帶系統與終點代碼 時刻表與存成常用路線都要用", () => {
    const [first, second] = plan("BL06", "R28")!;

    expect(first).toMatchObject({ system: "TRTC", towardId: "BL23", color: "#0070bd", from: { id: "BL06" }, to: { id: "BL12" } });
    expect(second).toMatchObject({ system: "TRTC", towardId: "R28", color: "#e3002c", from: { id: "R10" } });
  });

  it("轉兩次：十四張到動物園 走大坪林與南京復興 比走板橋與忠孝復興少兩站", () => {
    expect(brief(plan("Y08", "BR01"))).toEqual([
      ["環狀線", "十四張", "大坪林", "大坪林", 1],
      ["松山新店線", "大坪林", "南京復興", "松山", 12],
      ["文湖線", "南京復興", "動物園", "動物園", 10],
    ]);
  });

  it("支線是自己一條線：小碧潭到新店要在七張轉 不能當成同一條線坐過去", () => {
    expect(brief(plan("G03A", "G01"))).toEqual([
      ["松山新店線", "小碧潭", "七張", "七張", 1],
      ["松山新店線", "七張", "新店", "新店", 2],
    ]);
  });

  describe("蘆洲支線的車直通南勢角，不是接駁車（路線圖上是同一條線）", () => {
    const ludiao = numbered("O", 50, ["三重國小", "三和國中", "徐匯中學", "三民高中", "蘆洲"]);
    const stations = [...orange, ...ludiao];
    // TDX 的 LineNo 主線與支線都是 O
    const network = metroNetwork([{ system: "TRTC", stations, lines: [lineOf("O", orange), { id: "O", stationIds: ["O12", ...ludiao.map((station) => station.id)] }] }]);
    const legs = (from: string, to: string) => planRoute(network, stations.find((station) => station.name === from)!.id, stations.find((station) => station.name === to)!.id);

    it("蘆洲到古亭_一班車到，方向是南勢角，不用在大橋頭轉乘", () => {
      expect(legs("蘆洲", "古亭")?.map((leg) => [leg.from.name, leg.to.name, leg.towardName])).toEqual([["蘆洲", "古亭", "南勢角"]]);
    });

    it("古亭到蘆洲_方向是蘆洲，不是迴龍", () => {
      expect(legs("古亭", "蘆洲")?.map((leg) => [leg.from.name, leg.to.name, leg.towardName])).toEqual([["古亭", "蘆洲", "蘆洲"]]);
    });

    it("支線沒有列出大橋頭也一樣接得上", () => {
      const without = metroNetwork([{ system: "TRTC", stations, lines: [lineOf("O", orange), { id: "O", stationIds: ludiao.map((station) => station.id) }] }]);

      expect(planRoute(without, "O54", "O05")?.map((leg) => [leg.from.name, leg.to.name, leg.towardName])).toEqual([["蘆洲", "古亭", "南勢角"]]);
    });

    it("蘆洲到輔大_兩邊都是支線，要在大橋頭轉", () => {
      expect(legs("蘆洲", "輔大")?.map((leg) => [leg.from.name, leg.to.name, leg.towardName])).toEqual([["蘆洲", "大橋頭", "南勢角"], ["大橋頭", "輔大", "迴龍"]]);
    });
  });

  it("支線接主線再轉別條線：小碧潭到台北車站 在中正紀念堂轉比在西門轉少一站", () => {
    expect(brief(plan("G03A", "BL12"))).toEqual([
      ["松山新店線", "小碧潭", "七張", "七張", 1],
      ["松山新店線", "七張", "中正紀念堂", "松山", 7],
      ["淡水信義線", "中正紀念堂", "台北車站", "淡水", 2],
    ]);
  });

  it("跨系統：機場到淡水 機場線的臺北車站跟淡水信義線的台北車站是同一站", () => {
    const legs = plan("A12", "R28");

    expect(brief(legs)).toEqual([
      ["機場線", "機場第一航廈", "臺北車站", "臺北車站", 11],
      ["淡水信義線", "台北車站", "淡水", "淡水", 18],
    ]);
    expect(legs?.map((leg) => leg.system)).toEqual(["TYMC", "TRTC"]);
  });

  it("轉乘一樣多時選站數少的：府中到新北產業園區 走環狀線比繞台北車站近", () => {
    const legs = plan("BL06", "A3");

    expect(brief(legs)).toEqual([
      ["板南線", "府中", "板橋", "南港展覽館", 1],
      ["環狀線", "板橋", "新北產業園區", "新北產業園區", 4],
    ]);
    expect(legs?.[1]).toMatchObject({ system: "NTMC", from: { id: "Y16" }, towardId: "Y20" });
  });

  it("轉乘少的優先 站數多也一樣：南港展覽館到大安 文湖線直達 15 站 不換板南線的 9 站", () => {
    expect(brief(plan("BR24", "BR09"))).toEqual([["文湖線", "南港展覽館", "大安", "動物園", 15]]);
  });

  it("選的是同名的另一個代碼也不用先轉一次：從板南線的台北車站到淡水是直達", () => {
    expect(plan("BL12", "R28")).toMatchObject([{ line: "淡水信義線", from: { id: "R10" }, towardId: "R28" }]);
  });

  it("同名的站就是同一站 不用搭車", () => {
    expect(plan("BL12", "R10")).toEqual([]);
    expect(plan("A1", "BL12")).toEqual([]);
  });

  it("車站不在路網裡或走不到時是 null", () => {
    expect(plan("Z99", "R28")).toBeNull();
    expect(planRoute({ stations: [{ id: "R28", name: "淡水" }, { id: "X1", name: "孤島" }], lines: [{ id: "R", system: "TRTC", stationIds: ["R28"] }] }, "R28", "X1")).toBeNull();
  });
});

describe("metroNetwork：三個系統併成一張路網", () => {
  it("照系統的順序 同一站只留一個", () => {
    const network = metroNetwork([
      { system: "TRTC", stations: [{ id: "R10", name: "台北車站" }], lines: [{ id: "R", stationIds: ["R10"] }] },
      { system: "TYMC", stations: [{ id: "R10", name: "台北車站" }, { id: "A1", name: "臺北車站" }], lines: [{ id: "A", stationIds: ["A1"] }] },
    ]);

    expect(network.stations.map((station) => station.id)).toEqual(["R10", "A1"]);
    expect(network.lines.map((line) => [line.system, line.id])).toEqual([["TRTC", "R"], ["TYMC", "A"]]);
  });

  it("環狀線在 TDX 是新北捷運 臺北捷運也列一份時只留一份 不然選站面板與規劃都會重複", () => {
    const yellowLine = { id: "Y", stationIds: ["Y07"] };

    const { lines } = metroNetwork([
      { system: "TRTC", stations: [], lines: [yellowLine, { id: "R", stationIds: ["R10"] }] },
      { system: "NTMC", stations: [], lines: [yellowLine] },
    ]);

    expect(lines.map((line) => [line.system, line.id])).toEqual([["TRTC", "R"], ["NTMC", "Y"]]);
  });

  it("支線跟主線同一個代碼 兩條都留著", () => {
    const { lines } = metroNetwork([{ system: "TRTC", stations: [], lines: [{ id: "G", stationIds: ["G01", "G03"] }, { id: "G", stationIds: ["G03", "G03A"] }] }]);

    expect(lines).toHaveLength(2);
  });
});

describe("每一段經過的車站 算總時間要用", () => {
  it("照搭車的方向列出來 頭尾是這一段的起訖站", () => {
    const [first] = plan("BL06", "BL09")!;

    expect(first.stationIds).toEqual(["BL06", "BL07", "BL08", "BL09"]);
  });

  it("反方向的順序也跟著反過來", () => {
    expect(plan("BL09", "BL06")![0].stationIds).toEqual(["BL09", "BL08", "BL07", "BL06"]);
  });

  it("每一段的站數跟經過的車站對得起來", () => {
    for (const leg of plan("BL06", "R28")!) expect(leg.stationIds).toHaveLength(leg.stops + 1);
  });
});

describe("fareSystemOf：票價要在同一個系統裡", () => {
  it("同一個系統的轉乘照樣有一個票價", () => {
    expect(fareSystemOf(plan("BL06", "R28")!)).toBe("TRTC");
  });

  it("使用者要的：跨進機場捷運沒有合併的票價 不自己加", () => {
    expect(fareSystemOf(plan("A12", "R28")!)).toBeNull();
  });

  it("臺北捷運轉環狀線 TDX 也沒有跨系統的那一列 不多問一次", () => {
    expect(fareSystemOf(plan("BL06", "Y10")!)).toBeNull();
  });

  it("選板橋時整趟可能只坐環狀線 系統與起站都要看規劃出來的路段 不是表單的代碼", () => {
    const legs = plan("BL07", "Y10")!;

    expect(fareSystemOf(legs)).toBe("NTMC");
    expect(legs[0].from.id).toBe("Y16");
  });

  it("沒有路段時沒有票價", () => {
    expect(fareSystemOf([])).toBeNull();
  });
});
