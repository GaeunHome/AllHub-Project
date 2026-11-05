import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { WORLD_CITIES, parsePlaceChoice } from "../cities";
import { COUNTIES } from "../counties";

describe("parsePlaceChoice：表單送來的地點", () => {
  it("縣市只收清單上的", () => {
    expect(parsePlaceChoice("臺北市")).toEqual({ ok: true, value: { kind: "county", name: "臺北市", country: null, latitude: null, longitude: null, timezone: null } });
    expect(parsePlaceChoice("火星市").ok).toBe(false);
  });

  it("國外城市的座標 時區與國碼都用清單的值", () => {
    expect(parsePlaceChoice("首爾")).toEqual({ ok: true, value: { kind: "world", name: "首爾", country: "kr", latitude: 37.5665, longitude: 126.978, timezone: "Asia/Seoul" } });
  });

  it("清單以外的城市不收：不再讓人加別的城市", () => {
    expect(parsePlaceChoice("Seattle, United States").ok).toBe(false);
  });

  it("舊表單的 JSON 不收：座標 時區與國碼不能由表單決定", () => {
    expect(parsePlaceChoice(JSON.stringify({ kind: "world", name: "首爾", country: "jp", latitude: 0, longitude: 0, timezone: "Asia/Tokyo" })).ok).toBe(false);
  });

  it.each([[""], ["oops"], ["constructor"], ["__proto__"]])("%s 不會讓伺服器出錯", (value) => {
    expect(parsePlaceChoice(value).ok).toBe(false);
  });

  it("內建的地點都過得了檢查 國旗的圖都在", () => {
    for (const name of COUNTIES) expect(parsePlaceChoice(name).ok, name).toBe(true);
    for (const place of WORLD_CITIES) {
      expect(parsePlaceChoice(place.name), place.name).toEqual({ ok: true, value: { kind: "world", ...place } });
      expect(existsSync(`public/images/flags/${place.country}.svg`), place.name).toBe(true);
    }
  });
});
