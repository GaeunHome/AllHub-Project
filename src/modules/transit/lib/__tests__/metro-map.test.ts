import { describe, expect, it } from "vitest";
import { labelBox, metroMap, type MetroMap, type MapPoint } from "../metro-map";
import { plainName } from "../station-search";
import type { Station } from "../timetable";

// 代碼與站名照 TDX 的寫法 機場線的 A1 寫臺
// 廣慈/奉天宮 2026-08-30 通車 三鶯線 2026-06-30 通車

const numbered = (prefix: string, start: number, names: string[], width = 2): Station[] => names.map((name, index) => ({ id: `${prefix}${String(start + index).padStart(width, "0")}`, name }));

const BLUE = numbered("BL", 1, ["頂埔", "永寧", "土城", "海山", "亞東醫院", "府中", "板橋", "新埔", "江子翠", "龍山寺", "西門", "台北車站", "善導寺", "忠孝新生", "忠孝復興", "忠孝敦化", "國父紀念館", "市政府", "永春", "後山埤", "昆陽", "南港", "南港展覽館"]);
const BROWN = numbered("BR", 1, ["動物園", "木柵", "萬芳社區", "萬芳醫院", "辛亥", "麟光", "六張犁", "科技大樓", "大安", "忠孝復興", "南京復興", "中山國中", "松山機場", "大直", "劍南路", "西湖", "港墘", "文德", "內湖", "大湖公園", "葫洲", "東湖", "南港軟體園區", "南港展覽館"]);
const RED = [{ id: "R01", name: "廣慈/奉天宮" }, ...numbered("R", 2, ["象山", "台北101/世貿", "信義安和", "大安", "大安森林公園", "東門", "中正紀念堂", "台大醫院", "台北車站", "中山", "雙連", "民權西路", "圓山", "劍潭", "士林", "芝山", "明德", "石牌", "唭哩岸", "奇岩", "北投", "復興崗", "忠義", "關渡", "竹圍", "紅樹林", "淡水"])];
const XINBEITOU = [RED[21], { id: "R22A", name: "新北投" }];
const GREEN = numbered("G", 1, ["新店", "新店區公所", "七張", "大坪林", "景美", "萬隆", "公館", "台電大樓", "古亭", "中正紀念堂", "小南門", "西門", "北門", "中山", "松江南京", "南京復興", "台北小巨蛋", "南京三民", "松山"]);
const XIAOBITAN = [GREEN[2], { id: "G03A", name: "小碧潭" }];
const ORANGE = numbered("O", 1, ["南勢角", "景安", "永安市場", "頂溪", "古亭", "東門", "忠孝新生", "松江南京", "行天宮", "中山國小", "民權西路", "大橋頭", "台北橋", "菜寮", "三重", "先嗇宮", "頭前庄", "新莊", "輔大", "丹鳳", "迴龍"]);
const LUZHOU = [ORANGE[11], ...numbered("O", 50, ["三重國小", "三和國中", "徐匯中學", "三民高中", "蘆洲"])];
const YELLOW = numbered("Y", 7, ["大坪林", "十四張", "秀朗橋", "景平", "景安", "中和", "橋和", "中原", "板新", "板橋", "新埔民生", "頭前庄", "幸福", "新北產業園區"]);
const SANYING = numbered("LB", 1, ["頂埔", "媽祖田", "長壽山", "橫溪", "龍埔", "三峽", "臺北大學", "鶯歌車站", "陶瓷老街", "國華", "永吉公園", "鶯桃福德"]);
const AIRPORT = [
  ...numbered("A", 1, ["臺北車站", "三重", "新北產業園區", "新莊副都心", "泰山", "泰山貴和", "體育大學", "長庚醫院", "林口", "山鼻", "坑口", "機場第一航廈", "機場第二航廈"], 1),
  { id: "A14a", name: "機場旅館" },
  ...numbered("A", 15, ["大園", "橫山", "領航", "高鐵桃園站", "桃園體育園區", "興南", "環北", "老街溪"], 1),
];

/** TDX 的每一條線 支線是自己一條 */
const LINES = [BLUE, BROWN, RED, XINBEITOU, GREEN, XIAOBITAN, ORANGE, LUZHOU, YELLOW, SANYING, AIRPORT];
const unique = (stations: Station[]) => [...new Map(stations.map((station) => [station.id, station])).values()];
const STATIONS = unique(LINES.flat());
const TRTC_ONLY = unique([BLUE, BROWN, RED, XINBEITOU, GREEN, XIAOBITAN, ORANGE, LUZHOU].flat());

const map = metroMap(STATIONS);
const nodeOf = (drawn: MetroMap, id: string) => drawn.stations.find((station) => station.ids.includes(id));
const distance = (a: MapPoint, b: MapPoint) => Math.hypot(a.x - b.x, a.y - b.y);

/** 點在折線的某一段上 */
function onPolyline(point: MapPoint, points: MapPoint[]): boolean {
  return points.slice(1).some((end, index) => {
    const start = points[index];
    const length = distance(start, end);
    return Math.abs(distance(start, point) + distance(point, end) - length) < 1e-6;
  });
}

describe("捷運的路線圖", () => {
  it("真實路網的每一站都在圖上 包括支線與機場線", () => {
    expect(map.missing).toEqual([]);
    expect(STATIONS.filter((station) => !nodeOf(map, station.id)).map((station) => station.id)).toEqual([]);
  });

  it("同名的轉乘站是同一個點 台與臺算同一站", () => {
    const names = new Set(STATIONS.map((station) => plainName(station.name)));

    expect(map.stations).toHaveLength(names.size);
    expect(nodeOf(map, "BL12")?.ids.toSorted()).toEqual(["A1", "BL12", "R10"]);
    expect(nodeOf(map, "G09")?.ids.toSorted()).toEqual(["G09", "O05"]);
    expect(nodeOf(map, "Y20")?.ids.toSorted()).toEqual(["A3", "Y20"]);
  });

  it("每一站都畫在經過它的每一條線上", () => {
    const off = STATIONS.flatMap((station) => {
      const node = nodeOf(map, station.id)!;
      return map.lines.filter((line) => line.ids.includes(station.id) && !onPolyline(node, line.points)).map((line) => `${station.id} 不在 ${line.key} 上`);
    });

    expect(off).toEqual([]);
  });

  it("線段只有水平 垂直與 45 度", () => {
    const slanted = map.lines.flatMap((line) =>
      line.points.slice(1).flatMap((end, index) => {
        const dx = Math.abs(end.x - line.points[index].x);
        const dy = Math.abs(end.y - line.points[index].y);
        return dx < 1e-9 || dy < 1e-9 || Math.abs(dx - dy) < 1e-9 ? [] : [`${line.key} 第 ${index + 1} 段`];
      }),
    );

    expect(slanted).toEqual([]);
  });

  it("站的順序跟真實的路線一樣 相鄰的站在圖上也相鄰", () => {
    const adjacent = (a: string, b: string) => map.lines.some((line) => line.ids.some((id, index) => (id === a && line.ids[index + 1] === b) || (id === b && line.ids[index + 1] === a)));
    const broken = LINES.flatMap((line) => line.slice(1).flatMap((station, index) => (adjacent(line[index].id, station.id) ? [] : [`${line[index].id}-${station.id}`])));

    expect(broken).toEqual([]);
  });

  it("不同的站不會疊在一起", () => {
    const close = map.stations.flatMap((a, index) => map.stations.slice(index + 1).flatMap((b) => (distance(a, b) < 1 ? [`${a.name}／${b.name}`] : [])));

    expect(close).toEqual([]);
  });

  it("新埔與新埔民生是兩站 畫在隔壁並用轉乘通道連起來", () => {
    const xinpu = nodeOf(map, "BL08")!;
    const minsheng = nodeOf(map, "Y17")!;
    const joined = (a: MapPoint, b: MapPoint) => map.links.some(([from, to]) => (distance(from, a) < 1e-9 && distance(to, b) < 1e-9) || (distance(from, b) < 1e-9 && distance(to, a) < 1e-9));

    expect(xinpu).not.toBe(minsheng);
    expect(distance(xinpu, minsheng)).toBeLessThanOrEqual(1.5);
    expect(joined(xinpu, minsheng)).toBe(true);
  });

  it("報讀器聽得到轉乘站的每一條線", () => {
    expect(nodeOf(map, "BL12")?.lines).toEqual(expect.arrayContaining(["板南線", "淡水信義線", "機場線"]));
    expect(nodeOf(map, "BL06")?.lines).toEqual(["板南線"]);
  });

  it("點到的站傳回路網裡真的有的代碼", () => {
    const ids = new Set(STATIONS.map((station) => station.id));

    expect(map.stations.filter((station) => !ids.has(station.id) || !station.ids.includes(station.id))).toEqual([]);
  });

  it("路網裡沒有座標的站不畫 留給搜尋", () => {
    const drawn = metroMap([...STATIONS, { id: "K01", name: "雙城" }]);

    expect(drawn.missing).toEqual([{ id: "K01", name: "雙城" }]);
    expect(nodeOf(drawn, "K01")).toBeUndefined();
  });

  it("沒有座標但跟圖上的站同名 就是同一站 不用另外列", () => {
    const drawn = metroMap([...STATIONS, { id: "V01", name: "紅樹林" }]);

    expect(drawn.missing).toEqual([]);
    expect(nodeOf(drawn, "V01")?.ids).toContain("R27");
  });

  it("路網沒有的站不畫 整條線都讀不到時線也不畫", () => {
    const drawn = metroMap(TRTC_ONLY);

    expect(drawn.stations.flatMap((station) => station.ids).filter((id) => /^[AY]/.test(id))).toEqual([]);
    expect(drawn.lines.filter((line) => line.ids.some((id) => /^[AY]/.test(id)))).toEqual([]);
    expect(nodeOf(drawn, "BL12")?.lines).not.toContain("機場線");
  });

  type Box = { left: number; right: number; top: number; bottom: number };
  const labels = map.stations.map((station) => ({ name: station.name, ...labelBox(station) }));
  /** 兩個框之間空多少 負的是疊在一起 */
  const gapOf = (a: Box, b: Box) => Math.max(a.left - b.right, b.left - a.right, a.top - b.bottom, b.top - a.bottom);

  it("站名不會疊到別的站名 也不會蓋住別的站", () => {
    // 點在畫面上的半徑大約是 0.2 格 轉乘站大一點
    const DOT = 0.2;
    const onLabels = labels.flatMap((a, index) => labels.slice(index + 1).flatMap((b) => (gapOf(a, b) < 0 ? [`${a.name}／${b.name}`] : [])));
    const onDots = labels.flatMap((label) => map.stations.flatMap((station) => (station.name !== label.name && gapOf(label, { left: station.x - DOT, right: station.x + DOT, top: station.y - DOT, bottom: station.y + DOT }) < 0 ? [`${label.name}／${station.name}`] : [])));

    expect(onLabels).toEqual([]);
    expect(onDots).toEqual([]);
  });

  it("使用者回報過：新北產業園區與三重的站名跟別的站名擠在一起 現在至少隔半格", () => {
    const nearest = (name: string) => {
      const own = labels.find((label) => label.name === name)!;
      return Math.min(...labels.filter((label) => label !== own).map((label) => gapOf(own, label)));
    };

    expect(nearest("新北產業園區")).toBeGreaterThanOrEqual(0.5);
    expect(nearest("三重")).toBeGreaterThanOrEqual(0.5);
  });

  it("圖的範圍包得住每一站", () => {
    const outside = map.stations.filter(({ x, y }) => x <= 0 || y <= 0 || x >= map.width || y >= map.height);

    expect(outside).toEqual([]);
  });
});
