import { describe, expect, it } from "vitest";
import { groupDigits, interpretLedger, ledgerMonthOf, monthLabel, parseLedger, previousMonth } from "./ledger";

/** 依 genshin.py 的 StarRailDiary 整理的 month_info 回應（data 的部分） */
const sample = () => ({
  uid: 900000001,
  region: "prod_official_cht",
  nickname: "開拓者",
  data_month: 202610,
  optional_month: [202608, 202609, 202610],
  month_data: {
    current_hcoin: 4250,
    current_rails_pass: 12,
    last_hcoin: 6120,
    last_rails_pass: 9,
    hcoin_rate: -31,
    rails_rate: 33,
    group_by: [
      { action: "daily_reward", action_name: "每日獎勵", num: 1800, percent: 42 },
      { action: "event_reward", action_name: "活動獎勵", num: 1600, percent: 38 },
      { action: "other", action_name: "其他", num: 850, percent: 20 },
    ],
  },
  day_data: { current_hcoin: 120, current_rails_pass: 0, last_hcoin: 90, last_rails_pass: 1 },
});

describe("parseLedger：開拓月曆", () => {
  it("本月與上個月的星瓊、車票，比上個月增減幾 %，今天拿到的數量", () => {
    const { ledger, missing } = parseLedger(sample(), "202610");

    expect(missing).toEqual([]);
    expect(ledger).toMatchObject({
      month: "202610",
      current: { jade: 4250, passes: 12 },
      last: { jade: 6120, passes: 9 },
      jadeRate: -31,
      passRate: 33,
      today: { jade: 120, passes: 0 },
    });
  });

  it("各來源：名稱、數量、比例，依數量由多到少", () => {
    const data = sample();
    data.month_data.group_by.reverse();

    expect(parseLedger(data, "202610").ledger.sources).toEqual([
      { id: "daily_reward", name: "每日獎勵", amount: 1800, percent: 42 },
      { id: "event_reward", name: "活動獎勵", amount: 1600, percent: 38 },
      { id: "other", name: "其他", amount: 850, percent: 20 },
    ]);
  });

  it("可以切換的月份：照時間排序；只有月份數字（1–12）時依查詢的月份補上年份", () => {
    expect(parseLedger(sample(), "202610").ledger.months).toEqual(["202608", "202609", "202610"]);

    const data = { ...sample(), optional_month: [11, 12, 1], data_month: 1 };
    expect(parseLedger(data, "202701").ledger).toMatchObject({ month: "202701", months: ["202611", "202612", "202701"] });
  });

  it("沒有 optional_month_只有查詢的這個月", () => {
    const data = sample() as Record<string, unknown>;
    delete data.optional_month;

    expect(parseLedger(data, "202610").ledger.months).toEqual(["202610"]);
  });

  it("讀不到的欄位給 null_missing 記下欄位路徑", () => {
    const data = sample() as Record<string, unknown>;
    data.month_data = { current_hcoin: "4250", group_by: [{ action_name: "每日獎勵", num: "x" }] };

    const { ledger, missing } = parseLedger(data, "202610");

    expect(ledger.current).toEqual({ jade: 4250, passes: null });
    expect(ledger.sources).toEqual([{ id: null, name: "每日獎勵", amount: null, percent: null }]);
    expect(missing).toEqual([
      "month_data.current_rails_pass",
      "month_data.group_by[].num",
      "month_data.group_by[].percent",
      "month_data.hcoin_rate",
      "month_data.last_hcoin",
      "month_data.last_rails_pass",
      "month_data.rails_rate",
    ]);
  });

  it("整個 data 不對_各欄位 null，月份用查詢的月份", () => {
    const { ledger, missing } = parseLedger(null, "202610");

    expect(ledger).toMatchObject({ month: "202610", months: ["202610"], current: { jade: null, passes: null }, sources: [] });
    expect(missing).toContain("month_data");
  });
});

describe("interpretLedger：HoYoLAB 的回應", () => {
  it("成功_回傳整理好的月曆", () => {
    const result = interpretLedger({ retcode: 0, message: "OK", data: sample() }, "202610");

    expect(result.ok && result.data.ledger.current.jade).toBe(4250);
  });

  it("cookie 失效_標記失效；其他錯誤給中文訊息", () => {
    expect(interpretLedger({ retcode: -100, message: "Please login" }, "202610")).toMatchObject({ ok: false, cookieInvalid: true });
    expect(interpretLedger({ retcode: 10102, message: "not public" }, "202610")).toMatchObject({ ok: false, cookieInvalid: false });
  });
});

describe("月份工具", () => {
  it("previousMonth：上一個月，跨年也對", () => {
    expect(previousMonth("202610")).toBe("202609");
    expect(previousMonth("202701")).toBe("202612");
  });

  it("monthLabel：例如「2026 年 10 月」；看不懂的原樣回傳", () => {
    expect(monthLabel("202610")).toBe("2026 年 10 月");
    expect(monthLabel("202601")).toBe("2026 年 1 月");
    expect(monthLabel("abc")).toBe("abc");
  });
});

describe("ledgerMonthOf：查詢用的月份（台北時間）", () => {
  it("台北的年月；UTC 還在上個月時也以台北為準", () => {
    expect(ledgerMonthOf(new Date("2026-10-08T04:00:00Z"))).toBe("202610");
    expect(ledgerMonthOf(new Date("2026-09-30T16:30:00Z"))).toBe("202610");
  });
});

describe("groupDigits：數字加千分位", () => {
  it("一般數字與負數", () => {
    expect(groupDigits(0)).toBe("0");
    expect(groupDigits(4250)).toBe("4,250");
    expect(groupDigits(1234567)).toBe("1,234,567");
    expect(groupDigits(-31)).toBe("-31");
  });
});
