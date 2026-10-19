import { describe, expect, it } from "vitest";
import { relativeTime } from "./format";

describe("relativeTime（鈴鐺面板與提示卡片用）", () => {
  const now = new Date("2026-10-21T12:00:00Z");

  it.each([
    ["2026-10-21T11:59:40Z", "剛剛"],
    ["2026-10-21T12:00:30Z", "剛剛"],
    ["2026-10-21T11:55:00Z", "5 分鐘前"],
    ["2026-10-21T09:00:00Z", "3 小時前"],
    ["2026-10-19T12:00:00Z", "2 天前"],
    ["2026-10-11T12:00:00Z", "10 天前"],
  ])("%s → %s", (iso, expected) => {
    expect(relativeTime(iso, now)).toBe(expected);
  });
});
