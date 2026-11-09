import { describe, expect, it } from "vitest";
import type { WeatherPlace } from "../../data/schema";
import { PLACE_HOME, placeTabs } from "../place-tabs";

const place = (id: number, kind: "county" | "world", name: string): WeatherPlace =>
  ({ id, userId: "u", kind, name, country: kind === "world" ? "jp" : null, latitude: null, longitude: null, timezone: null, sortOrder: id, createdAt: new Date(0) }) as WeatherPlace;
const PLACES = [place(1, "county", "桃園市"), place(2, "county", "基隆市"), place(3, "world", "東京")];

describe("天氣頁的城市膠囊", () => {
  it("使用者回報的：首頁原本新竹、天氣頁加了桃園與基隆，首頁改成桃園後只出現一個桃園，排在第一個", () => {
    const tabs = placeTabs({ county: "桃園市" }, PLACES);

    expect(tabs.map(({ key, name }) => [key, name])).toEqual([
      [PLACE_HOME, "桃園市"],
      ["2", "基隆市"],
      ["3", "東京"],
    ]);
  });

  it("首頁改回新竹：存著的桃園照樣出現", () => {
    expect(placeTabs({ county: "新竹市" }, PLACES).map(({ name }) => name)).toEqual(["新竹市", "桃園市", "基隆市", "東京"]);
  });

  it("還沒選首頁的縣市：只有存著的城市", () => {
    expect(placeTabs(null, PLACES).map(({ key }) => key)).toEqual(["1", "2", "3"]);
  });
});
