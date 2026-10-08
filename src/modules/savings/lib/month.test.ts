import { describe, expect, it } from "vitest";
import { ICU_VARIANTS, simulateIcu } from "@/dev/icu-simulation";
import {
  addMonths,
  dateToMonth,
  formatMonth,
  formatMonthShort,
  monthToDate,
  parseMonth,
  recentMonths,
  resolveMonth,
  selectableMonths,
  taipeiMonth,
} from "./month";

describe("taipeiMonth", () => {
  it("UTC 9/30 16:00 是台北 10/1 零點_算 10 月", () => {
    expect(taipeiMonth(new Date("2026-09-30T16:00:00Z"))).toBe("2026-10");
  });

  it("UTC 9/30 15:59:59 是台北 9/30 23:59:59_還是 9 月", () => {
    expect(taipeiMonth(new Date("2026-09-30T15:59:59Z"))).toBe("2026-09");
  });

  it("UTC 12/31 16:00 是台北隔年 1/1_跨年", () => {
    expect(taipeiMonth(new Date("2026-12-31T16:00:00Z"))).toBe("2027-01");
  });

  it.each(ICU_VARIANTS)("ICU 版本不同（$name）_台北 9/1 還是 2026-09", (variant) => {
    simulateIcu(variant);

    expect(taipeiMonth(new Date("2026-08-31T16:00:00Z"))).toBe("2026-09");
  });
});

describe("parseMonth", () => {
  it.each(["2026-10", "2000-01", "2099-12"])("%s_合法", (raw) => {
    expect(parseMonth(raw)).toBe(raw);
  });

  it.each([["", "空字串"], ["2026-13", "沒有 13 月"], ["2026-00", "沒有 0 月"], ["2026-1", "月份少補零"], ["26-10", "年份兩位數"], ["2026/10", "斜線"], [" 2026-10", "前面有空白"], ["2026-10-01", "多了日期"], ["1999-12", "早於 2000 年"]])(
    "%j（%s）_不合法",
    (raw) => {
      expect(parseMonth(raw)).toBeNull();
    },
  );

  it.each([undefined, null, 202610])("非字串 %j_不合法", (raw) => {
    expect(parseMonth(raw)).toBeNull();
  });
});

describe("addMonths", () => {
  it.each([
    ["2026-10", 1, "2026-11"],
    ["2026-12", 1, "2027-01"],
    ["2026-01", -1, "2025-12"],
    ["2026-10", -11, "2025-11"],
    ["2026-10", 0, "2026-10"],
    ["2026-10", 27, "2029-01"],
    ["2026-03", -27, "2023-12"],
  ])("%s 加 %i 個月_是 %s", (month, delta, expected) => {
    expect(addMonths(month, delta)).toBe(expected);
  });
});

describe("recentMonths", () => {
  it("最近 12 個月_由舊到新_最後是指定月份_跨年也連續", () => {
    expect(recentMonths("2026-03", 12)).toEqual([
      "2025-04", "2025-05", "2025-06", "2025-07", "2025-08", "2025-09",
      "2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03",
    ]);
  });
});

describe("資料庫日期轉換", () => {
  it("月份存成當月 1 號", () => {
    expect(monthToDate("2026-10")).toBe("2026-10-01");
  });

  it("資料庫的日期轉回月份", () => {
    expect(dateToMonth("2026-10-01")).toBe("2026-10");
  });
});

describe("resolveMonth（網址上的 ?month=）", () => {
  const current = "2026-10";

  it("沒帶_用本月", () => {
    expect(resolveMonth(undefined, current)).toBe(current);
  });

  it("過去的月份_照用", () => {
    expect(resolveMonth("2025-03", current)).toBe("2025-03");
  });

  it("未來的月份_改回本月", () => {
    expect(resolveMonth("2026-11", current)).toBe(current);
  });

  it("格式不對_改回本月", () => {
    expect(resolveMonth("abc", current)).toBe(current);
  });

  it("重複帶了好幾個_用第一個", () => {
    expect(resolveMonth(["2026-05", "2026-06"], current)).toBe("2026-05");
  });
});

describe("selectableMonths（下拉選單）", () => {
  it("沒有紀錄_列出最近 12 個月_新的在前", () => {
    const months = selectableMonths("2026-10", null, "2026-10");
    expect(months).toHaveLength(12);
    expect(months[0]).toBe("2026-10");
    expect(months.at(-1)).toBe("2025-11");
  });

  it("最早的紀錄更早_一路列到最早紀錄的月份", () => {
    const months = selectableMonths("2026-10", "2024-02", "2026-10");
    expect(months[0]).toBe("2026-10");
    expect(months.at(-1)).toBe("2024-02");
    expect(months).toHaveLength(33);
  });

  it("正在看的月份比清單還早_也列進去", () => {
    expect(selectableMonths("2026-10", "2026-01", "2023-05").at(-1)).toBe("2023-05");
  });
});

describe("月份顯示", () => {
  it("完整寫法", () => {
    expect(formatMonth("2026-03")).toBe("2026 年 3 月");
  });

  it("圖表用的簡短寫法", () => {
    expect(formatMonthShort("2026-03")).toBe("3 月");
  });
});
