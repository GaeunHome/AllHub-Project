import { describe, expect, it } from "vitest";
import { effectiveMode, modeLockedBy, recurringFormReducer, recurringTypeOf, startMonthOptions, type RecurringFormState } from "./recurring-choice";

const state = (fields: Partial<RecurringFormState>): RecurringFormState => ({
  type: "expense",
  intervalMonths: 1,
  startMonth: "2026-10",
  day: 10,
  holidayRule: "none",
  mode: "auto",
  allocate: false,
  suggest: true,
  ...fields,
});

describe("換類型時建議的假日規則（只在新增時）", () => {
  it("換成定期定額_遇假日改成延後（臺銀證券的扣款日遇假日順延到下一個交易日）", () => {
    expect(recurringFormReducer(state({}), { type: "type", value: "regular" }).holidayRule).toBe("after");
  });

  it("自己選過提前_不被換掉", () => {
    expect(recurringFormReducer(state({ holidayRule: "before" }), { type: "type", value: "regular" }).holidayRule).toBe("before");
  });

  it("修改舊規則_不動原本的設定", () => {
    expect(recurringFormReducer(state({ suggest: false }), { type: "type", value: "regular" }).holidayRule).toBe("none");
  });
});

describe("記帳方式", () => {
  it("定期定額要確認股數、薪水要確認實際金額，都只能「到期請我確認」", () => {
    expect(modeLockedBy({ type: "regular", allocate: false })).toBe("regular");
    expect(modeLockedBy({ type: "income", allocate: true })).toBe("salary");
    expect(effectiveMode(state({ type: "regular", mode: "auto" }))).toBe("confirm");
    expect(effectiveMode(state({ type: "income", allocate: true, mode: "auto" }))).toBe("confirm");
  });

  it("一般的收支與轉帳_照自己選的", () => {
    expect(modeLockedBy({ type: "transfer", allocate: false })).toBeNull();
    expect(effectiveMode(state({ type: "expense", mode: "auto" }))).toBe("auto");
  });

  it("薪水只有收入才有：換成別的類型時勾選取消，記帳方式回到自己選的", () => {
    const next = recurringFormReducer(state({ type: "income", allocate: true }), { type: "type", value: "expense" });

    expect(next.allocate).toBe(false);
    expect(effectiveMode(next)).toBe("auto");
  });
});

describe("recurringTypeOf：修改時的類型", () => {
  it("有持股的轉帳是定期定額，其他照紀錄的類型", () => {
    expect(recurringTypeOf({ kind: "transfer", holdingId: 51 })).toBe("regular");
    expect(recurringTypeOf({ kind: "transfer", holdingId: null })).toBe("transfer");
    expect(recurringTypeOf({ kind: "income", holdingId: null })).toBe("income");
  });
});

describe("startMonthOptions：從哪個月開始", () => {
  it("從這個月起 12 個月，間隔最長一年，每一種排法都選得到", () => {
    const months = startMonthOptions("2026-10-14");

    expect(months).toHaveLength(12);
    expect([months[0], months.at(-1)]).toEqual(["2026-10", "2027-09"]);
  });

  it("修改時原本的月份在範圍外_也列出來，照時間排", () => {
    expect(startMonthOptions("2026-10-14", "2026-08").slice(0, 2)).toEqual(["2026-08", "2026-10"]);
    expect(startMonthOptions("2026-10-14", "2026-11")).toHaveLength(12);
  });
});
