import { describe, expect, it } from "vitest";
import { cityGroups, lineGroups } from "../station-groups";

const station = (id: string, name: string, city?: string) => ({ id, name, ...(city ? { city } : {}) });
const summary = (groups: { name: string; stations: { name: string }[] }[]) => groups.map((group) => [group.name, group.stations.map(({ name }) => name)]);

describe("cityGroups：台鐵照縣市分組", () => {
  it("使用者要的：照台鐵官網的順序 不是資料的順序", () => {
    const counties = ["宜蘭縣", "花蓮縣", "臺東縣", "屏東縣", "高雄市", "臺南市", "雲林縣", "南投縣", "彰化縣", "臺中市", "苗栗縣", "桃園市", "臺北市", "新北市", "基隆市"];

    const groups = cityGroups(counties.map((city, index) => station(String(index), city, city)));

    expect(groups.map((group) => group.name)).toEqual(["基隆市", "新北市", "臺北市", "桃園市", "苗栗縣", "臺中市", "彰化縣", "南投縣", "雲林縣", "臺南市", "高雄市", "屏東縣", "臺東縣", "花蓮縣", "宜蘭縣"]);
  });

  it("使用者要的：新竹與嘉義的縣市併成一組 排在原本的位置", () => {
    const groups = cityGroups([station("1", "新竹", "新竹市"), station("2", "竹北", "新竹縣"), station("3", "嘉義", "嘉義市"), station("4", "民雄", "嘉義縣"), station("5", "苗栗", "苗栗縣"), station("6", "桃園", "桃園市"), station("7", "斗六", "雲林縣"), station("8", "臺南", "臺南市")]);

    expect(summary(groups)).toEqual([
      ["桃園市", ["桃園"]],
      ["新竹", ["新竹", "竹北"]],
      ["苗栗縣", ["苗栗"]],
      ["雲林縣", ["斗六"]],
      ["嘉義", ["嘉義", "民雄"]],
      ["臺南市", ["臺南"]],
    ]);
  });

  it("縣市寫成台也認得", () => {
    expect(summary(cityGroups([station("1", "臺北", "台北市")]))).toEqual([["臺北市", ["臺北"]]]);
  });

  it("認不得縣市的站排在最後的其他 不能讓人選不了站", () => {
    const groups = cityGroups([station("1", "神祕", "火星市"), station("2", "沒寫"), station("3", "臺北", "臺北市")]);

    expect(summary(groups)).toEqual([
      ["臺北市", ["臺北"]],
      ["其他", ["神祕", "沒寫"]],
    ]);
  });

  it("全部都沒有縣市時不分組 面板改列完整清單", () => {
    expect(cityGroups([station("1", "臺北"), station("2", "板橋")])).toEqual([]);
    expect(cityGroups([])).toEqual([]);
  });
});

describe("lineGroups：捷運照路線分組", () => {
  const STATIONS = [station("R10", "台北車站"), station("R07", "東門"), station("BL12", "台北車站"), station("BL15", "忠孝復興")];

  it("使用者要的：用路線的名稱與顏色 車站照路線上的順序 名稱用車站清單的", () => {
    const groups = lineGroups("TRTC", STATIONS, [{ id: "BL", stationIds: ["BL12", "BL15"] }, { id: "R", stationIds: ["R07", "R10"] }]);

    expect(groups).toEqual([
      { id: "BL", name: "板南線", color: "#0070bd", stations: [station("BL12", "台北車站"), station("BL15", "忠孝復興")] },
      { id: "R", name: "淡水信義線", color: "#e3002c", stations: [station("R07", "東門"), station("R10", "台北車站")] },
    ]);
  });

  it("轉乘站同一個代碼在兩條線 兩組都列", () => {
    const groups = lineGroups("TRTC", [station("G09", "古亭")], [{ id: "G", stationIds: ["G09"] }, { id: "O", stationIds: ["G09"] }]);

    expect(summary(groups)).toEqual([
      ["松山新店線", ["古亭"]],
      ["中和新蘆線", ["古亭"]],
    ]);
  });

  it("車站清單沒有的站不列 查不到名稱 新增常用路線也會被拒絕", () => {
    const groups = lineGroups("TRTC", [station("R10", "台北車站")], [{ id: "R", stationIds: ["R10", "R99"] }, { id: "BL", stationIds: ["BL99"] }]);

    expect(summary(groups)).toEqual([["淡水信義線", ["台北車站"]]]);
  });

  it("不在任何一條線的站排在最後的其他 不能讓人選不了站", () => {
    const groups = lineGroups("TRTC", STATIONS, [{ id: "R", stationIds: ["R07", "R10"] }]);

    expect(summary(groups)).toEqual([
      ["淡水信義線", ["東門", "台北車站"]],
      ["其他", ["台北車站", "忠孝復興"]],
    ]);
  });

  it("認不得的路線照寫代碼 不能整組不見", () => {
    expect(lineGroups("TRTC", [station("X1", "新站")], [{ id: "X", stationIds: ["X1"] }])[0]).toMatchObject({ name: "X 線", color: expect.stringMatching(/^#/) });
  });

  it("讀不到路線或一站都對不上時不分組 面板改列完整清單", () => {
    expect(lineGroups("TRTC", STATIONS, [])).toEqual([]);
    expect(lineGroups("TRTC", STATIONS, [{ id: "R", stationIds: ["R99"] }])).toEqual([]);
  });
});
