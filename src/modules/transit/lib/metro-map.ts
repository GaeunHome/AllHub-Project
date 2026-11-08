import { metroLine, metroLineName } from "./lines";
import { plainName } from "./station-search";
import type { Station } from "./timetable";

// 自己畫的示意圖 大致照官方的方位 x 往東 y 往南
// 只寫轉彎與轉乘站 中間平均分 橫的一段兩格才放得下站名

export type MapPoint = { x: number; y: number };
/** 站名放在點的哪一邊 n 是上面 e 是右邊 */
export type LabelSide = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

type Point = readonly [x: number, y: number];
type Hub = { at: Point; side: LabelSide };
type Stop = { id: string; side: LabelSide; at?: Point } | { bend: Point };
type LineSpec = { key: string; line: string; system: string; stops: Stop[] };

/** 站名的字級與離點的距離 單位是格 畫面照這三個數字排 斜角的站名靠近一點 */
export const LABEL_EM = 0.42;
export const LABEL_GAP = 0.3;
export const LABEL_SLANT_GAP = LABEL_GAP * 0.7;

const at = (id: string, point: Point, side: LabelSide): Stop => ({ id, side, at: point });
const hub = (id: string, { at: point, side }: Hub): Stop => ({ id, side, at: point });
const bend = (x: number, y: number): Stop => ({ bend: [x, y] });
const run = (side: LabelSide, ...ids: string[]): Stop[] => ids.map((id) => ({ id, side }));
const codes = (prefix: string, from: number, to: number, width = 2) => Array.from({ length: to - from + 1 }, (_, index) => `${prefix}${String(from + index).padStart(width, "0")}`);

/** 好幾條線經過的站 每條線都用同一個點 */
const TAIPEI: Hub = { at: [0, 0], side: "ne" };
const XIMEN: Hub = { at: [-2, 0], side: "sw" };
const ZHONGSHAN: Hub = { at: [0, -3], side: "se" };
const SONGJIANG_NANJING: Hub = { at: [4, -3], side: "ne" };
const NANJING_FUXING: Hub = { at: [8, -3], side: "se" };
const ZHONGXIAO_XINSHENG: Hub = { at: [4, 0], side: "ne" };
const ZHONGXIAO_FUXING: Hub = { at: [8, 0], side: "ne" };
const CKS_MEMORIAL: Hub = { at: [0, 3], side: "sw" };
const DONGMEN: Hub = { at: [4, 3], side: "se" };
const DAAN: Hub = { at: [8, 3], side: "sw" };
const GUTING: Hub = { at: [2, 5], side: "e" };
const MINQUAN_W: Hub = { at: [0, -5], side: "se" };
const DAPINGLIN: Hub = { at: [2, 11], side: "e" };
const JINGAN: Hub = { at: [-4, 11], side: "nw" };
const BANQIAO: Hub = { at: [-9, 3], side: "e" };
const TOUQIANZHUANG: Hub = { at: [-10, -2], side: "nw" };
const SANCHONG: Hub = { at: [-6, -2], side: "sw" };
const INDUSTRIAL_PARK: Hub = { at: [-10, -6], side: "n" };
const NANGANG_EXHIBITION: Hub = { at: [23, -1], side: "e" };

// 支線的起點跟主線同一個點
const DINGPU: Point = [-15, 9];
const BEITOU: Point = [0, -14];
const QIZHANG: Point = [2, 12];
const DAQIAOTOU: Point = [-3, -5];

const LINES: LineSpec[] = [
  {
    key: "BL",
    line: "BL",
    system: "TRTC",
    stops: [
      at("BL01", DINGPU, "w"),
      ...run("w", ...codes("BL", 2, 6)),
      hub("BL07", BANQIAO),
      at("BL08", [-8, 2], "e"),
      at("BL09", [-6, 0], "nw"),
      ...run("s", "BL10"),
      hub("BL11", XIMEN),
      hub("BL12", TAIPEI),
      ...run("s", "BL13"),
      hub("BL14", ZHONGXIAO_XINSHENG),
      hub("BL15", ZHONGXIAO_FUXING),
      ...run("s", ...codes("BL", 16, 21)),
      at("BL22", [22, 0], "s"),
      hub("BL23", NANGANG_EXHIBITION),
    ],
  },
  {
    key: "BR",
    line: "BR",
    system: "TRTC",
    stops: [
      at("BR01", [11, 11], "e"),
      ...run("e", "BR02", "BR03"),
      at("BR04", [8, 8], "e"),
      ...run("e", ...codes("BR", 5, 8)),
      hub("BR09", DAAN),
      hub("BR10", ZHONGXIAO_FUXING),
      hub("BR11", NANJING_FUXING),
      ...run("w", "BR12"),
      at("BR13", [8, -5], "w"),
      at("BR14", [8, -7], "w"),
      at("BR15", [9, -8], "n"),
      ...run("n", ...codes("BR", 16, 20)),
      at("BR21", [21, -8], "n"),
      at("BR22", [23, -6], "e"),
      ...run("e", "BR23"),
      hub("BR24", NANGANG_EXHIBITION),
    ],
  },
  {
    key: "R",
    line: "R",
    system: "TRTC",
    stops: [
      at("R01", [16, 3], "e"),
      at("R02", [14, 3], "n"),
      ...run("n", "R03", "R04"),
      hub("R05", DAAN),
      ...run("n", "R06"),
      hub("R07", DONGMEN),
      hub("R08", CKS_MEMORIAL),
      ...run("e", "R09"),
      hub("R10", TAIPEI),
      hub("R11", ZHONGSHAN),
      ...run("w", "R12"),
      hub("R13", MINQUAN_W),
      ...run("w", ...codes("R", 14, 21)),
      at("R22", BEITOU, "w"),
      ...run("w", ...codes("R", 23, 27)),
      at("R28", [-6, -20], "w"),
    ],
  },
  { key: "R22A", line: "R", system: "TRTC", stops: [at("R22", BEITOU, "w"), at("R22A", [1, -15], "e")] },
  {
    key: "G",
    line: "G",
    system: "TRTC",
    stops: [
      at("G01", [2, 14], "e"),
      ...run("e", "G02"),
      at("G03", QIZHANG, "e"),
      hub("G04", DAPINGLIN),
      ...run("e", ...codes("G", 5, 8)),
      hub("G09", GUTING),
      hub("G10", CKS_MEMORIAL),
      ...run("w", "G11"),
      bend(-2, 1),
      hub("G12", XIMEN),
      at("G13", [-2, -2], "e"),
      bend(-1, -3),
      hub("G14", ZHONGSHAN),
      hub("G15", SONGJIANG_NANJING),
      hub("G16", NANJING_FUXING),
      ...run("n", "G17", "G18"),
      at("G19", [14, -3], "n"),
    ],
  },
  { key: "G03A", line: "G", system: "TRTC", stops: [at("G03", QIZHANG, "e"), at("G03A", [1, 13], "w")] },
  {
    key: "O",
    line: "O",
    system: "TRTC",
    stops: [
      at("O01", [-4, 12.5], "e"),
      hub("O02", JINGAN),
      ...run("e", "O03", "O04"),
      hub("O05", GUTING),
      hub("O06", DONGMEN),
      hub("O07", ZHONGXIAO_XINSHENG),
      hub("O08", SONGJIANG_NANJING),
      at("O09", [4, -5], "e"),
      ...run("n", "O10"),
      hub("O11", MINQUAN_W),
      at("O12", DAQIAOTOU, "ne"),
      ...run("w", "O13", "O14"),
      hub("O15", SANCHONG),
      // 三重的站名在左下 先嗇宮放線的上面才不會連成一串
      ...run("n", "O16"),
      hub("O17", TOUQIANZHUANG),
      ...run("s", ...codes("O", 18, 20)),
      at("O21", [-18, -2], "s"),
    ],
  },
  { key: "O50", line: "O", system: "TRTC", stops: [at("O12", DAQIAOTOU, "ne"), ...run("w", ...codes("O", 50, 53)), at("O54", [-8, -10], "w")] },
  {
    key: "Y",
    line: "Y",
    system: "NTMC",
    stops: [
      hub("Y07", DAPINGLIN),
      ...run("s", "Y08", "Y09", "Y10"),
      hub("Y11", JINGAN),
      ...run("s", "Y12"),
      bend(-7, 11),
      bend(-9, 9),
      ...run("e", "Y13", "Y14", "Y15"),
      hub("Y16", BANQIAO),
      at("Y17", [-9, 2], "w"),
      bend(-9, -1),
      hub("Y18", TOUQIANZHUANG),
      ...run("w", "Y19"),
      hub("Y20", INDUSTRIAL_PARK),
    ],
  },
  // 三鶯線從頂埔往南到三峽再往西 橫的一段站距一格半 站名上下交錯才放得下
  {
    key: "LB",
    line: "LB",
    system: "NTMC",
    stops: [
      at("LB01", DINGPU, "w"),
      ...run("e", ...codes("LB", 2, 5)),
      at("LB06", [-15, 14], "e"),
      at("LB07", [-16.5, 14], "s"),
      at("LB08", [-18, 14], "n"),
      at("LB09", [-19.5, 14], "s"),
      at("LB10", [-21, 14], "n"),
      at("LB11", [-22.5, 14], "s"),
      at("LB12", [-24, 14], "n"),
    ],
  },
  {
    key: "A",
    line: "A",
    system: "TYMC",
    stops: [
      hub("A1", TAIPEI),
      bend(-1, -1),
      bend(-5, -1),
      hub("A2", SANCHONG),
      hub("A3", INDUSTRIAL_PARK),
      // 新莊副都心放線的下面 兩站都是直排的長站名 並排會擠在一起
      ...run("s", "A4"),
      ...run("n", ...codes("A", 5, 8, 1)),
      at("A9", [-22, -6], "n"),
      ...run("e", ...codes("A", 10, 13, 1), "A14a", ...codes("A", 15, 21, 1)),
      at("A22", [-22, 7], "e"),
    ],
  },
];

/** 不同名但相連的站 畫一段轉乘通道 */
const LINKS: [string, string][] = [["BL08", "Y17"]];

const lengthOf = (path: readonly Point[]) => path.slice(1).reduce((total, [x, y], index) => total + Math.hypot(x - path[index][0], y - path[index][1]), 0);

/** 沿著折線走 distance 格的位置 */
function along(path: readonly Point[], distance: number): Point {
  let left = distance;
  for (let index = 1; index < path.length; index += 1) {
    const [fromX, fromY] = path[index - 1];
    const [toX, toY] = path[index];
    const length = Math.hypot(toX - fromX, toY - fromY);
    if (left <= length && length > 0) return [fromX + ((toX - fromX) * left) / length, fromY + ((toY - fromY) * left) / length];
    left -= length;
  }
  return path[path.length - 1];
}

type Placed = { id: string; side: LabelSide; at: Point };
type LineLayout = { key: string; line: string; system: string; path: Point[]; placed: Placed[] };

/** 兩個有座標的站之間 沒有座標的站照折線的長度平均分 */
function layoutLine({ key, line, system, stops }: LineSpec): LineLayout {
  const path: Point[] = [];
  const placed: Placed[] = [];
  let since: Point[] = [];
  let pending: { id: string; side: LabelSide }[] = [];
  for (const stop of stops) {
    if ("bend" in stop) {
      path.push(stop.bend);
      since.push(stop.bend);
    } else if (!stop.at) {
      pending.push(stop);
    } else {
      since.push(stop.at);
      const total = lengthOf(since);
      pending.forEach(({ id, side }, index) => placed.push({ id, side, at: along(since, (total * (index + 1)) / (pending.length + 1)) }));
      placed.push({ id: stop.id, side: stop.side, at: stop.at });
      path.push(stop.at);
      since = [stop.at];
      pending = [];
    }
  }
  return { key, line, system, path, placed };
}

const LAYOUT = LINES.map(layoutLine);

export type MapStation = MapPoint & {
  /** 點了交出去的代碼 */
  id: string;
  /** 同名的站都算這一點 台與臺同字 */
  ids: string[];
  name: string;
  side: LabelSide;
  /** 經過這一站的路線名稱 給報讀器 */
  lines: string[];
  /** 只有一條線時點的顏色 */
  color: string;
  transfer: boolean;
};
export type MapLine = { key: string; color: string; ids: string[]; points: MapPoint[] };
export type MetroMap = {
  width: number;
  height: number;
  /** 還沒選站時畫面先對準台北車站 */
  center: MapPoint;
  lines: MapLine[];
  links: [MapPoint, MapPoint][];
  stations: MapStation[];
  missing: Station[];
};

/** 站名大概佔多大 跟畫面的排法一樣 中文一格字 英數字窄一點 橫排的站名最多四個半字就換行 */
export function labelBox({ x, y, name, side }: Pick<MapStation, "x" | "y" | "name" | "side">) {
  const wide = [...name].reduce((total, char) => total + (/[\x20-\x7e]/.test(char) ? 0.6 : 1), 0) * LABEL_EM;
  const stacked = side === "n" || side === "s";
  const width = stacked ? Math.min(wide, 4.5 * LABEL_EM) : wide;
  const height = (stacked && wide > width ? 2 : 1) * LABEL_EM * 1.2;
  const gap = side.length === 2 ? LABEL_SLANT_GAP : LABEL_GAP;
  const left = side.includes("w") ? x - gap - width : side.includes("e") ? x + gap : x - width / 2;
  const top = side.startsWith("n") ? y - gap - height : side.startsWith("s") ? y + gap : y - height / 2;
  return { left, right: left + width, top, bottom: top + height };
}

const MARGIN = 0.8;

/**
 * 路網裡有的站才畫 同名的站併成一點 一條線有兩站以上才畫線
 * 沒有座標也沒有同名站的放進 missing 選站時列在圖的下面
 */
export function metroMap(stations: Station[]): MetroMap {
  const byId = new Map(stations.map((station) => [station.id, station]));
  const drawn = LAYOUT.filter((line) => line.placed.filter((stop) => byId.has(stop.id)).length >= 2);
  const nodes = new Map<string, MapStation>();
  for (const { line, system, placed } of drawn) {
    for (const stop of placed) {
      const station = byId.get(stop.id);
      if (!station) continue;
      const key = plainName(station.name);
      const node = nodes.get(key) ?? { id: stop.id, ids: [], name: station.name, side: stop.side, x: stop.at[0], y: stop.at[1], lines: [], color: metroLine(system, line).color, transfer: false };
      if (!node.ids.includes(stop.id)) node.ids.push(stop.id);
      const lineName = metroLineName(system, line);
      if (!node.lines.includes(lineName)) node.lines.push(lineName);
      node.transfer = node.lines.length > 1;
      nodes.set(key, node);
    }
  }
  const missing: Station[] = [];
  for (const station of stations) {
    const node = nodes.get(plainName(station.name));
    if (!node) missing.push(station);
    else if (!node.ids.includes(station.id)) node.ids.push(station.id);
  }

  const boxes = [...nodes.values()].map(labelBox);
  const points = drawn.flatMap((line) => line.path);
  const minX = Math.min(...boxes.map((box) => box.left), ...points.map(([x]) => x)) - MARGIN;
  const maxX = Math.max(...boxes.map((box) => box.right), ...points.map(([x]) => x)) + MARGIN;
  const minY = Math.min(...boxes.map((box) => box.top), ...points.map(([, y]) => y)) - MARGIN;
  const maxY = Math.max(...boxes.map((box) => box.bottom), ...points.map(([, y]) => y)) + MARGIN;
  const shift = ([x, y]: Point): MapPoint => ({ x: x - minX, y: y - minY });
  const pointOf = (id: string) => drawn.flatMap((line) => line.placed).find((stop) => stop.id === id && byId.has(id))?.at;

  return {
    width: nodes.size > 0 ? maxX - minX : 0,
    height: nodes.size > 0 ? maxY - minY : 0,
    center: shift(TAIPEI.at),
    lines: drawn.map(({ key, line, system, path, placed }) => ({ key, color: metroLine(system, line).color, ids: placed.map((stop) => stop.id), points: path.map(shift) })),
    links: LINKS.flatMap(([a, b]) => {
      const [from, to] = [pointOf(a), pointOf(b)];
      return from && to ? [[shift(from), shift(to)] as [MapPoint, MapPoint]] : [];
    }),
    stations: [...nodes.values()].map((node) => ({ ...node, ...shift([node.x, node.y]) })),
    missing,
  };
}
