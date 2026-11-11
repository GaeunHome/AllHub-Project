import { describe, expect, it } from "vitest";
import { parseSalaryFields } from "../salary-fields";
import { NOT_FOUND } from "../validation";

const TODAY = "2026-10-14";

describe("parseSalaryFields（發薪分配）", () => {
  const salary = (
    fields: Partial<{ accountId: string; categoryId: string; amount: string; date: string; note: string; transfers: { accountId: string; amount: string }[]; ruleId: string; period: string }> = {},
  ) => ({
    accountId: "1",
    categoryId: "7",
    amount: "43,000",
    date: TODAY,
    note: "",
    transfers: [
      { accountId: "2", amount: "5000" },
      { accountId: "3", amount: "0" },
      { accountId: "4", amount: "" },
      { accountId: "5", amount: "6,000" },
    ],
    ...fields,
  });

  it("金額 0 或留空的分配略過_其他照順序", () => {
    expect(parseSalaryFields(salary(), TODAY)).toEqual({
      ok: true,
      value: {
        accountId: 1,
        categoryId: 7,
        amount: 43_000,
        date: TODAY,
        note: null,
        transfers: [
          { accountId: 2, amount: 5000 },
          { accountId: 5, amount: 6000 },
        ],
        recurring: null,
      },
    });
  });

  it("從待處理確認薪水那一期_帶上是哪一條固定收支的哪一期（YYYY-MM）", () => {
    expect(parseSalaryFields(salary({ ruleId: "30", period: "2026-10" }), TODAY)).toMatchObject({ ok: true, value: { recurring: { ruleId: 30, period: "2026-10" } } });
    expect(parseSalaryFields(salary({ ruleId: "abc", period: "2026-10" }), TODAY)).toEqual({ ok: false, error: NOT_FOUND.recurring });
    expect(parseSalaryFields(salary({ ruleId: "30", period: "10 月" }), TODAY)).toEqual({ ok: false, error: expect.stringContaining("這一期") });
  });

  it("分類可以留空", () => {
    expect(parseSalaryFields(salary({ categoryId: "", transfers: [] }), TODAY)).toMatchObject({ ok: true, value: { categoryId: null, transfers: [] } });
  });

  it("分出去的剛好等於薪水_可以", () => {
    expect(parseSalaryFields(salary({ amount: "11000" }), TODAY)).toMatchObject({ ok: true });
  });

  it("分出去的超過薪水_錯誤", () => {
    expect(parseSalaryFields(salary({ amount: "10999" }), TODAY)).toEqual({ ok: false, error: expect.stringContaining("超過薪水") });
  });

  it("沒選入帳帳戶_錯誤", () => {
    expect(parseSalaryFields(salary({ accountId: "" }), TODAY)).toEqual({ ok: false, error: expect.stringContaining("入帳的帳戶") });
  });

  it("分配金額不合法_寫出是分配金額", () => {
    expect(parseSalaryFields(salary({ transfers: [{ accountId: "2", amount: "-5" }] }), TODAY)).toEqual({ ok: false, error: expect.stringMatching(/^分配金額.*整數/) });
  });

  it("分配到入帳帳戶自己_轉出和轉入不能是同一個帳戶", () => {
    expect(parseSalaryFields(salary({ transfers: [{ accountId: "1", amount: "100" }] }), TODAY)).toEqual({ ok: false, error: expect.stringContaining("同一個帳戶") });
  });

  it("有金額卻沒選帳戶_錯誤", () => {
    expect(parseSalaryFields(salary({ transfers: [{ accountId: "", amount: "100" }] }), TODAY)).toEqual({ ok: false, error: expect.stringContaining("轉入的帳戶") });
  });

  it("分配的帳戶 id 格式不對_當作找不到帳戶", () => {
    expect(parseSalaryFields(salary({ transfers: [{ accountId: "abc", amount: "100" }] }), TODAY)).toEqual({ ok: false, error: NOT_FOUND.account });
  });

  it("薪水與日期不合法_回各自的錯誤", () => {
    expect(parseSalaryFields(salary({ amount: "" }), TODAY)).toEqual({ ok: false, error: expect.stringContaining("金額") });
    expect(parseSalaryFields(salary({ date: "2026-11-01" }), TODAY)).toEqual({ ok: false, error: expect.stringContaining("未來") });
  });

  const LINES_INVALID = expect.stringContaining("分配的帳戶");
  /** 使用者全部的帳戶 id 對到名稱 */
  const mine = new Map([
    [1, "國泰"],
    [2, "郵局"],
    [3, "證券"],
    [4, "台新"],
    [5, "舊帳戶"],
  ]);

  it("同一個帳戶有兩行金額_表單被改過，錯誤", () => {
    const twice = salary({
      transfers: [
        { accountId: "2", amount: "100" },
        { accountId: "2", amount: "200" },
      ],
    });

    expect(parseSalaryFields(twice, TODAY)).toEqual({ ok: false, error: LINES_INVALID });
    expect(parseSalaryFields(twice, TODAY, mine)).toEqual({ ok: false, error: LINES_INVALID });
  });

  it("重複的那一行金額是 0 或留空_略過，不算重複", () => {
    const parsed = parseSalaryFields(
      salary({
        transfers: [
          { accountId: "2", amount: "100" },
          { accountId: "2", amount: "0" },
          { accountId: "2", amount: "" },
        ],
      }),
      TODAY,
      mine,
    );

    expect(parsed).toMatchObject({ ok: true, value: { transfers: [{ accountId: 2, amount: 100 }] } });
  });

  it("行數比使用者的帳戶還多_錯誤（一個帳戶最多一行）", () => {
    const lines = (count: number) => salary({ transfers: Array.from({ length: count }, (_, i) => ({ accountId: String(i + 2), amount: "0" })) });

    expect(parseSalaryFields(lines(5), TODAY, mine)).toMatchObject({ ok: true });
    expect(parseSalaryFields(lines(6), TODAY, mine)).toEqual({ ok: false, error: LINES_INVALID });
    expect(parseSalaryFields(lines(1), TODAY, new Map())).toEqual({ ok: false, error: LINES_INVALID });
  });

  it("分配金額不合法_錯誤寫出是分配給哪個帳戶", () => {
    expect(parseSalaryFields(salary({ transfers: [{ accountId: "2", amount: "-5" }] }), TODAY, mine)).toEqual({ ok: false, error: expect.stringMatching(/郵局.*整數/) });
    expect(parseSalaryFields(salary({ transfers: [{ accountId: " 3 ", amount: "100000001" }] }), TODAY, mine)).toEqual({ ok: false, error: expect.stringMatching(/證券.*1 億/) });
  });

  it("金額不合法而帳戶不在自己的清單裡（別人的或格式不對）_不寫名稱", () => {
    expect(parseSalaryFields(salary({ transfers: [{ accountId: "99", amount: "1.5" }] }), TODAY, mine)).toEqual({ ok: false, error: expect.stringMatching(/^分配金額.*整數/) });
    expect(parseSalaryFields(salary({ transfers: [{ accountId: "abc", amount: "1.5" }] }), TODAY, mine)).toEqual({ ok: false, error: expect.stringMatching(/^分配金額.*整數/) });
  });
});
