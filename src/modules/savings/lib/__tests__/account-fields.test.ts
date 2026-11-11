import { describe, expect, it } from "vitest";
import { LABEL_MAX_LENGTH } from "../kinds";
import { parseAccountFields, parseAllocationFields, parseStartDate } from "../account-fields";
import { NOT_FOUND } from "../validation";

const account = (fields: Partial<Record<string, string>> = {}) => ({
  name: "國泰",
  label: "",
  cardStyle: "",
  openingBalance: "",
  openingCost: "",
  monthlyPlan: "",
  targetAmount: "",
  payFromAccountId: "",
  statementDay: "",
  autopay: "",
  ...fields,
});

describe("parseAccountFields（帳戶設定，依類型）", () => {
  it("存款_全部留空_起始餘額是 0、其他都是 null", () => {
    expect(parseAccountFields(account(), "deposit")).toEqual({
      ok: true,
      value: { name: "國泰", label: null, cardStyle: null, openingBalance: 0, openingCost: null, monthlyPlan: null, targetAmount: null, payFromAccountId: null, statementDay: null, autopay: false },
    });
  });

  it("存款_起始餘額、每月規劃、目標金額與用途", () => {
    expect(parseAccountFields(account({ label: "生活費", openingBalance: "12,000", monthlyPlan: "5000", targetAmount: "300000" }), "deposit")).toEqual({
      ok: true,
      value: { name: "國泰", label: "生活費", cardStyle: null, openingBalance: 12_000, openingCost: null, monthlyPlan: 5000, targetAmount: 300_000, payFromAccountId: null, statementDay: null, autopay: false },
    });
  });

  it("用途跟名稱一樣整理（去掉看不見的字元、空白縮成一個）_存款與投資帳戶可以寫，信用卡的表單沒有用途、送來也存 null；只有空白是沒填（null）", () => {
    expect(parseAccountFields(account({ label: " 緊急\u200B預備金 " }), "deposit")).toMatchObject({ ok: true, value: { label: "緊急預備金" } });
    expect(parseAccountFields(account({ label: "長期  投資" }), "investment")).toMatchObject({ ok: true, value: { label: "長期 投資" } });
    expect(parseAccountFields(account({ label: "生活費" }), "credit")).toMatchObject({ ok: true, value: { label: null } });
    expect(parseAccountFields(account({ label: " \u3000 " }), "deposit")).toMatchObject({ ok: true, value: { label: null } });
  });

  it("用途剛好 20 個字可以_超過就錯誤", () => {
    expect(parseAccountFields(account({ label: "存".repeat(LABEL_MAX_LENGTH) }), "deposit")).toMatchObject({ ok: true, value: { label: "存".repeat(LABEL_MAX_LENGTH) } });
    expect(parseAccountFields(account({ label: "存".repeat(LABEL_MAX_LENGTH + 1) }), "deposit")).toEqual({ ok: false, error: "用途最多 20 個字" });
  });

  it("信用卡沒選卡面顏色_是 null（畫面照建立的順序輪流）；不在清單裡的顏色_錯誤", () => {
    expect(parseAccountFields(account({ cardStyle: " " }), "credit")).toMatchObject({ ok: true, value: { cardStyle: null } });
    expect(parseAccountFields(account({ cardStyle: "pink" }), "credit")).toEqual({ ok: false, error: "卡面顏色不正確" });
    expect(parseAccountFields(account({ cardStyle: "BLUE" }), "credit")).toEqual({ ok: false, error: "卡面顏色不正確" });
  });

  it.each(["deposit", "investment"] as const)("%s 送來卡面顏色（就算不在清單裡）_不適用而忽略", (kind) => {
    expect(parseAccountFields(account({ cardStyle: "blue" }), kind)).toMatchObject({ ok: true, value: { cardStyle: null } });
    expect(parseAccountFields(account({ cardStyle: "pink" }), kind)).toMatchObject({ ok: true, value: { cardStyle: null } });
  });

  it("信用卡_目前未繳存成負的起始餘額_扣款帳戶_每月規劃與目標不適用而忽略", () => {
    expect(parseAccountFields(account({ openingBalance: "3500", payFromAccountId: "9", monthlyPlan: "100", targetAmount: "200", openingCost: "50" }), "credit")).toEqual({
      ok: true,
      value: { name: "國泰", label: null, cardStyle: null, openingBalance: -3500, openingCost: null, monthlyPlan: null, targetAmount: null, payFromAccountId: 9, statementDay: null, autopay: false },
    });
  });

  it("信用卡送來繳款截止日（舊的表單）_不收：截止日改成每次填帳單時照帳單填", () => {
    const parsed = parseAccountFields(account({ dueDay: "20", statementDay: "5" }), "credit");

    expect(parsed).toMatchObject({ ok: true, value: { statementDay: 5 } });
    expect(parsed.ok && parsed.value).not.toHaveProperty("dueDay");
  });

  it("信用卡沒有未繳_起始餘額是 0（不是 -0）", () => {
    const parsed = parseAccountFields(account({ openingBalance: "0" }), "credit");
    expect(parsed.ok && Object.is(parsed.value.openingBalance, 0)).toBe(true);
  });

  it("投資_目前市值與成本_扣款帳戶不適用而忽略", () => {
    expect(parseAccountFields(account({ openingBalance: "80000", openingCost: "75,000", payFromAccountId: "9" }), "investment")).toEqual({
      ok: true,
      value: { name: "國泰", label: null, cardStyle: null, openingBalance: 80_000, openingCost: 75_000, monthlyPlan: null, targetAmount: null, payFromAccountId: null, statementDay: null, autopay: false },
    });
  });

  it("投資_成本留空是 null（跟市值一樣）、成本可以是 0", () => {
    expect(parseAccountFields(account({ openingBalance: "100" }), "investment")).toMatchObject({ ok: true, value: { openingCost: null } });
    expect(parseAccountFields(account({ openingBalance: "100", openingCost: "0" }), "investment")).toMatchObject({ ok: true, value: { openingCost: 0 } });
  });

  it("存款的成本不適用而忽略", () => {
    expect(parseAccountFields(account({ openingCost: "100" }), "deposit")).toMatchObject({ ok: true, value: { openingCost: null } });
  });

  it("名稱不合法_回名稱的錯誤", () => {
    expect(parseAccountFields(account({ name: " " }), "deposit")).toEqual({ ok: false, error: "請輸入名稱" });
  });

  it.each([
    ["deposit", { openingBalance: "-5" }, "起始餘額：金額只能是整數（單位：元，不能有小數或負數）"],
    ["investment", { openingBalance: "1.5" }, "目前市值：金額只能是整數（單位：元，不能有小數或負數）"],
    ["credit", { openingBalance: "100000001" }, "目前未繳：金額不能超過 1 億元"],
    ["investment", { openingBalance: "100", openingCost: "-1" }, "成本：金額只能是整數（單位：元，不能有小數或負數）"],
    ["deposit", { monthlyPlan: "0" }, "每月規劃：金額至少 1 元"],
    ["deposit", { targetAmount: "abc" }, "目標金額：金額只能是正整數（單位：元，不能有小數或負數）"],
  ] as const)("%s 的 %j_錯誤訊息寫出是哪一欄：%s", (kind, fields, error) => {
    expect(parseAccountFields(account(fields), kind)).toEqual({ ok: false, error });
  });

  it("信用卡的結帳日與自動扣繳（勾選框送 on）", () => {
    expect(parseAccountFields(account({ statementDay: "5", autopay: "on" }), "credit")).toMatchObject({ ok: true, value: { statementDay: 5, autopay: true } });
    expect(parseAccountFields(account(), "credit")).toMatchObject({ ok: true, value: { statementDay: null, autopay: false } });
    expect(parseAccountFields(account({ statementDay: "0" }), "credit")).toEqual({ ok: false, error: expect.stringContaining("結帳日") });
  });

  it.each(["deposit", "investment"] as const)("%s 的結帳日與自動扣繳不適用而忽略", (kind) => {
    expect(parseAccountFields(account({ statementDay: "5", autopay: "on" }), kind)).toMatchObject({ ok: true, value: { statementDay: null, autopay: false } });
  });

  it("結帳日 31_可以（沒有 31 日的月份算月底）", () => {
    expect(parseAccountFields(account({ statementDay: "31" }), "credit")).toMatchObject({ ok: true, value: { statementDay: 31 } });
  });

  it("扣款帳戶 id 格式不對_當作找不到帳戶", () => {
    expect(parseAccountFields(account({ payFromAccountId: "-1" }), "credit")).toEqual({ ok: false, error: NOT_FOUND.account });
  });

  it("信用卡溢繳_未繳填負數，存成正的起始餘額", () => {
    expect(parseAccountFields(account({ openingBalance: "-300" }), "credit")).toMatchObject({ ok: true, value: { openingBalance: 300 } });
    expect(parseAccountFields(account({ openingBalance: "-1,500" }), "credit", "update")).toMatchObject({ ok: true, value: { openingBalance: 1500 } });
  });

  it.each([
    [{ openingBalance: "1.5" }, "目前未繳：金額只能是整數（單位：元，不能有小數；溢繳請輸入負數）"],
    [{ openingBalance: "-100000001" }, "目前未繳：溢繳不能超過 1 億元"],
  ])("信用卡的未繳 %j_錯誤訊息說明溢繳要填負數：%s", (fields, error) => {
    expect(parseAccountFields(account(fields), "credit")).toEqual({ ok: false, error });
  });

  it.each(["deposit", "investment"] as const)("%s 的起始金額不能是負數", (kind) => {
    expect(parseAccountFields(account({ openingBalance: "-300" }), kind)).toMatchObject({ ok: false });
  });
});

describe("parseStartDate（開始記帳日：可以選過去，補記之前的收支）", () => {
  const TODAY = "2026-11-11";

  it("過去的日期與今天都可以", () => {
    expect(parseStartDate("2026-10-01", TODAY)).toEqual({ ok: true, value: "2026-10-01" });
    expect(parseStartDate(" 2026-11-11 ", TODAY)).toEqual({ ok: true, value: TODAY });
  });

  it("空的是沒送（部署時還開著的舊畫面沒有這一欄）_null", () => {
    expect(parseStartDate("", TODAY)).toEqual({ ok: true, value: null });
  });

  it("未來的日期不行（不能記未來）", () => {
    expect(parseStartDate("2026-11-12", TODAY)).toEqual({ ok: false, error: "開始記帳日不能是未來的日期" });
  });

  it.each(["2026-02-30", "2026/10/01", "1999-12-31", "昨天"])("%s 不是可以用的日期_丟錯", (raw) => {
    expect(parseStartDate(raw, TODAY)).toEqual({ ok: false, error: "開始記帳日不正確" });
  });
});

describe("parseAllocationFields（修改分配：一次改各帳戶的每月規劃與目標）", () => {
  const NAMES = new Map([
    [1, "台銀"],
    [2, "緊急預備金 A"],
    [3, "國泰卡"],
  ]);
  const line = (accountId: string, monthlyPlan = "", targetAmount = "") => ({ accountId, monthlyPlan, targetAmount });

  it("每個帳戶一組_金額照千分位解析，空白是不設（null）", () => {
    expect(parseAllocationFields([line("1", "5,000"), line("2", "2000", "10,000")], NAMES)).toEqual({
      ok: true,
      value: [
        { accountId: 1, monthlyPlan: 5000, targetAmount: null },
        { accountId: 2, monthlyPlan: 2000, targetAmount: 10_000 },
      ],
    });
    expect(parseAllocationFields([line("2", " ", " ")], NAMES)).toEqual({ ok: true, value: [{ accountId: 2, monthlyPlan: null, targetAmount: null }] });
  });

  it("金額不對_錯誤寫出是哪個帳戶的哪一欄", () => {
    expect(parseAllocationFields([line("1", "5000"), line("2", "0")], NAMES)).toEqual({ ok: false, error: "「緊急預備金 A」的每月規劃：金額至少 1 元" });
    expect(parseAllocationFields([line("2", "2000", "1.5")], NAMES)).toEqual({ ok: false, error: "「緊急預備金 A」的目標金額：金額只能是正整數（單位：元，不能有小數或負數）" });
  });

  it("不在自己帳戶清單裡的 id_錯誤只寫欄位名稱，不寫別人的帳戶名稱", () => {
    expect(parseAllocationFields([line("99", "0")], NAMES)).toEqual({ ok: false, error: "每月規劃：金額至少 1 元" });
  });

  it.each([
    ["沒有任何帳戶", []],
    ["id 格式不對", [line("abc", "100")]],
    ["同一個帳戶出現兩次", [line("1", "100"), line("1", "200")]],
    ["行數比自己的帳戶多", [line("1"), line("2"), line("3"), line("4")]],
  ])("%s（表單被改過或畫面太舊）_整批不收：找不到帳戶，請重新整理頁面", (_name, lines) => {
    expect(parseAllocationFields(lines, NAMES)).toEqual({ ok: false, error: "找不到帳戶，請重新整理頁面" });
  });
});
