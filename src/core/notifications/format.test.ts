import { describe, expect, it } from "vitest";
import { ICU_VARIANTS, simulateIcu } from "@/dev/icu-simulation";
import { absoluteTime, relativeTime } from "./format";

describe("relativeTime（鈴鐺面板與提示卡片用）", () => {
  const now = new Date("2026-10-21T12:00:00Z");

  it.each([
    ["2026-10-21T11:59:40Z", "剛剛"],
    ["2026-10-21T12:00:30Z", "剛剛"],
    ["2026-10-21T11:55:00Z", "5 分鐘前"],
    ["2026-10-21T09:00:00Z", "3 小時前"],
    ["2026-10-19T12:00:00Z", "2 天前"],
  ])("%s → %s", (iso, expected) => {
    expect(relativeTime(iso, now)).toBe(expected);
  });
});

describe("absoluteTime（通知頁用，固定台北時間，伺服器與瀏覽器算出來一樣）", () => {
  it("2026-10-21T04:05:00Z → 2026/10/21 12:05", () => {
    expect(absoluteTime("2026-10-21T04:05:00Z")).toBe("2026/10/21 12:05");
  });

  it.each(ICU_VARIANTS)("ICU 版本不同（$name）_還是 2026/10/21 12:05", (variant) => {
    simulateIcu(variant);

    expect(absoluteTime("2026-10-21T04:05:00Z")).toBe("2026/10/21 12:05");
  });
});
