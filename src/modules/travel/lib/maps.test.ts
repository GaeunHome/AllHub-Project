import { describe, expect, it } from "vitest";
import { dayRouteUrl, directionsUrl, isMapsUrl, isShortMapsUrl, mapsSearchUrl, parseMapsUrl } from "./maps";

const KIYOMIZU = "https://www.google.com/maps/place/%E6%B8%85%E6%B0%B4%E5%AF%BA/@34.9948561,135.7850463,17z/data=!3m1!4b1!4m6!3m5!1s0x60!8m2!3d34.9946662!4d135.7849782";

describe("Google Maps 連結", () => {
  it.each([
    [KIYOMIZU],
    ["https://maps.google.com/?q=34.99,135.78"],
    ["https://www.google.com.tw/maps/place/台北101"],
    ["https://maps.app.goo.gl/AbCdEf123"],
    ["https://goo.gl/maps/AbCdEf123"],
  ])("%s 收", (url) => {
    expect(isMapsUrl(url)).toBe(true);
  });

  it.each([
    ["不是 https", "http://www.google.com/maps/place/x"],
    ["別的網站", "https://evil.example.com/maps/place/x"],
    ["網域只是長得像", "https://www.google.com.evil.example/maps/place/x"],
    ["google 但不是地圖", "https://www.google.com/search?q=x"],
    ["goo.gl 但不是地圖", "https://goo.gl/AbCdEf"],
    ["根本不是網址", "清水寺"],
  ])("%s 不收：短網址會由伺服器問一次，不能被拿來抓別的地方", (_name, url) => {
    expect(isMapsUrl(url)).toBe(false);
  });

  it("只有 maps.app.goo.gl 與 goo.gl/maps 算短網址", () => {
    expect(isShortMapsUrl("https://maps.app.goo.gl/AbC")).toBe(true);
    expect(isShortMapsUrl(KIYOMIZU)).toBe(false);
  });

  it("從完整連結讀出地點名稱與座標：地點本身的座標優先於畫面中心", () => {
    expect(parseMapsUrl(KIYOMIZU)).toMatchObject({ name: "清水寺", lat: 34.9946662, lng: 135.7849782 });
  });

  it("名稱裡的加號是空格", () => {
    expect(parseMapsUrl("https://www.google.com/maps/place/Taipei+101/@25.03,121.56,17z")?.name).toBe("Taipei 101");
  });

  it("q 是文字時當名稱，是座標時只當座標", () => {
    expect(parseMapsUrl("https://www.google.com/maps?q=故宮")).toMatchObject({ name: "故宮", lat: null });
    expect(parseMapsUrl("https://maps.google.com/?q=25.1,121.5")).toMatchObject({ name: null, lat: 25.1, lng: 121.5 });
  });

  it("短網址看不出名稱：照收，名稱手動填", () => {
    expect(parseMapsUrl("https://maps.app.goo.gl/AbC")).toEqual({ url: "https://maps.app.goo.gl/AbC", name: null, lat: null, lng: null });
  });

  it("座標超出範圍不收", () => {
    expect(parseMapsUrl("https://www.google.com/maps/@95.5,121.5,17z")?.lat).toBeNull();
  });
});

describe("打開 Google Maps 的網址（免費，不用金鑰）", () => {
  const A = { title: "清水寺", lat: 34.99, lng: 135.78 };
  const B = { title: "嵐山", lat: null, lng: null };

  it("查地點：名稱加目的地，查得比較準", () => {
    expect(new URL(mapsSearchUrl("嵐山", "京都")).searchParams.get("query")).toBe("嵐山 京都");
    expect(new URL(mapsSearchUrl("嵐山", null)).searchParams.get("query")).toBe("嵐山");
  });

  it("兩點之間：有座標用座標，沒有用名稱，大眾運輸", () => {
    const url = new URL(directionsUrl(A, B));

    expect(url.searchParams.get("origin")).toBe("34.99,135.78");
    expect(url.searchParams.get("destination")).toBe("嵐山");
    expect(url.searchParams.get("travelmode")).toBe("transit");
  });

  it("整天路線：頭尾是起訖，中間是中途點，用 | 隔開", () => {
    const url = new URL(dayRouteUrl([A, B, { title: "祇園", lat: null, lng: null }, B])!);

    expect(url.searchParams.get("waypoints")).toBe("嵐山|祇園");
  });

  it("中途點最多 9 個：Google Maps 的網址只收這麼多", () => {
    const stops = Array.from({ length: 13 }, (_, i) => ({ title: `點${i}`, lat: null, lng: null }));

    expect(new URL(dayRouteUrl(stops)!).searchParams.get("waypoints")!.split("|")).toHaveLength(9);
  });

  it("不到兩個點沒有路線", () => {
    expect(dayRouteUrl([A])).toBeNull();
    expect(dayRouteUrl([])).toBeNull();
  });
});
