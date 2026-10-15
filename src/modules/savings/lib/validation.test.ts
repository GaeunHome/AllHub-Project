import { describe, expect, it } from "vitest";
import { NAME_MAX_LENGTH, NOTE_MAX_LENGTH, PALETTE, SELECTABLE_COLORS } from "./kinds";
import {
  NOT_FOUND,
  amountFromText,
  checkAccountStart,
  isRowId,
  parseAccountFields,
  parseAccountKind,
  parseAmount,
  parseBalance,
  parseBalanceFields,
  parseCategoryFields,
  parseCategoryKind,
  parseColor,
  parseEntryDate,
  parseEntryFields,
  parseName,
  parseNote,
  parsePurposeFields,
  parseRecurringFields,
  parseRowId,
  parseSalaryFields,
} from "./validation";

const TODAY = "2026-10-14";

describe("parseAmount（金額：1 元到 1 億）", () => {
  it.each([
    ["5000", 5000],
    ["1", 1],
    ["100000000", 100_000_000],
    [" 3000 ", 3000],
    ["5,000", 5000],
    ["1,234,567", 1_234_567],
  ])("%j_是 %i 元", (raw, expected) => {
    expect(parseAmount(raw)).toEqual({ ok: true, value: expected });
  });

  it.each(["", "   "])("%j_要求輸入金額", (raw) => {
    expect(parseAmount(raw)).toEqual({ ok: false, error: "請輸入金額" });
  });

  it.each([["-100", "負數"], ["1.5", "小數"], ["1e3", "科學記號"], ["abc", "文字"], ["5,00", "千分位位置不對"], ["NaN", "NaN"], ["Infinity", "無限大"]])(
    "%j（%s）_只接受正整數",
    (raw) => {
      expect(parseAmount(raw)).toEqual({ ok: false, error: "金額只能是正整數（單位：元，不能有小數或負數）" });
    },
  );

  it("0 元_至少要 1 元", () => {
    expect(parseAmount("0")).toEqual({ ok: false, error: "金額至少 1 元" });
  });

  it.each(["100000001", "99999999999999999999"])("%j_超過 1 億", (raw) => {
    expect(parseAmount(raw)).toEqual({ ok: false, error: "金額不能超過 1 億元" });
  });
});

describe("parseBalance（餘額、市值、未繳：0 到 1 億）", () => {
  it.each([
    ["0", 0],
    ["1", 1],
    ["12,345", 12_345],
    ["100000000", 100_000_000],
  ])("%j_是 %i 元", (raw, expected) => {
    expect(parseBalance(raw)).toEqual({ ok: true, value: expected });
  });

  it("空白_要求輸入金額", () => {
    expect(parseBalance(" ")).toEqual({ ok: false, error: "請輸入金額" });
  });

  it.each(["-1", "1.5", "abc", "5,00"])("%j_只接受整數", (raw) => {
    expect(parseBalance(raw)).toEqual({ ok: false, error: "金額只能是整數（單位：元，不能有小數或負數）" });
  });

  it("超過 1 億_錯誤", () => {
    expect(parseBalance("100000001")).toEqual({ ok: false, error: "金額不能超過 1 億元" });
  });

  it("沒有允許負數時_明確關掉也一樣不收負數", () => {
    expect(parseBalance("-1", { allowNegative: false })).toEqual({ ok: false, error: "金額只能是整數（單位：元，不能有小數或負數）" });
  });
});

describe("parseBalance 允許負數（信用卡的未繳：負的是溢繳）", () => {
  it.each([
    ["-3,500", -3500],
    ["-1", -1],
    ["0", 0],
    ["1,800", 1800],
    ["-100000000", -100_000_000],
    [" -42 ", -42],
  ])("%j_是 %i 元", (raw, expected) => {
    expect(parseBalance(raw, { allowNegative: true })).toEqual({ ok: true, value: expected });
  });

  it("-0_是 0（不是 -0）", () => {
    const parsed = parseBalance("-0", { allowNegative: true });
    expect(parsed.ok && Object.is(parsed.value, 0)).toBe(true);
  });

  it.each(["1.5", "-1.5", "--5", "+5", "- 5", "abc", "-5,00", "-"])("%j_錯誤訊息說明溢繳要輸入負數", (raw) => {
    expect(parseBalance(raw, { allowNegative: true })).toEqual({ ok: false, error: "金額只能是整數（單位：元，不能有小數；溢繳請輸入負數）" });
  });

  it("溢繳超過 1 億_錯誤", () => {
    expect(parseBalance("-100000001", { allowNegative: true })).toEqual({ ok: false, error: "溢繳不能超過 1 億元" });
  });

  it("未繳超過 1 億、空白_跟不收負數時一樣", () => {
    expect(parseBalance("100000001", { allowNegative: true })).toEqual({ ok: false, error: "金額不能超過 1 億元" });
    expect(parseBalance(" ", { allowNegative: true })).toEqual({ ok: false, error: "請輸入金額" });
  });
});

describe("amountFromText（瀏覽器試算用：跟伺服器同一套數字與千分位規則）", () => {
  it.each([
    ["5000", 5000],
    [" 1,234 ", 1234],
    ["0", 0],
    ["100000000", 100_000_000],
  ])("%j_是 %i", (raw, expected) => {
    expect(amountFromText(raw)).toBe(expected);
  });

  it.each(["", "  ", "abc", "1.5", "5,00", "1e3", "-100", "+5", "100000001", "99999999999999999999"])("%j_看不懂或超過範圍是 null", (raw) => {
    expect(amountFromText(raw)).toBeNull();
  });

  it("允許負數時_負數與千分位都可以，-0 是 0", () => {
    expect(amountFromText("-1,234", { allowNegative: true })).toBe(-1234);
    expect(amountFromText("-100000000", { allowNegative: true })).toBe(-100_000_000);
    expect(Object.is(amountFromText("-0", { allowNegative: true }), 0)).toBe(true);
  });

  it.each(["--5", "- 5", "-1.5", "-", "-100000001"])("允許負數時_%j 仍是 null", (raw) => {
    expect(amountFromText(raw, { allowNegative: true })).toBeNull();
  });

  it("跟 parseAmount、parseBalance 的判斷一致", () => {
    for (const raw of ["0", "1", "5,000", "5,00", "1.5", "-3", "100000000", "100000001", ""]) {
      const amount = parseAmount(raw);
      const balance = parseBalance(raw);
      const value = amountFromText(raw);
      expect(balance.ok ? balance.value : null).toBe(value);
      expect(amount.ok).toBe(value !== null && value >= 1);
    }
  });
});

describe("parseRowId 與 isRowId（表單送來的資料 id）", () => {
  it.each([
    ["1", 1],
    ["42", 42],
    [" 7 ", 7],
    ["2147483647", 2_147_483_647],
  ])("%j_是 %i", (raw, expected) => {
    expect(parseRowId(raw)).toBe(expected);
  });

  it.each(["", "0", "-1", "1.5", "1e3", "0x10", "007", "abc", "2147483648", "99999999999999999999"])("%j_不是資料 id", (raw) => {
    expect(parseRowId(raw)).toBeNull();
  });

  it("非字串_不是資料 id", () => {
    expect(parseRowId(12)).toBeNull();
    expect(parseRowId(null)).toBeNull();
  });

  it("超過資料庫 integer 範圍的數字_不是資料 id（查詢時資料庫會丟錯，不能變成「失敗（詳見伺服器 log）」）", () => {
    expect(isRowId(1)).toBe(true);
    expect(isRowId(2_147_483_647)).toBe(true);
    expect(isRowId(2_147_483_648)).toBe(false);
    expect(isRowId(0)).toBe(false);
    expect(isRowId(1.5)).toBe(false);
    expect(isRowId(Number.NaN)).toBe(false);
  });
});

describe("名稱、備註、顏色與類型", () => {
  it("名稱去掉前後空白", () => {
    expect(parseName("  國泰 ")).toEqual({ ok: true, value: "國泰" });
  });

  it("名稱空白_要求輸入名稱", () => {
    expect(parseName("   ")).toEqual({ ok: false, error: "請輸入名稱" });
  });

  it("名稱剛好 20 個字_可以（emoji 算一個字）", () => {
    const name = "🐷" + "存".repeat(NAME_MAX_LENGTH - 1);
    expect(parseName(name)).toEqual({ ok: true, value: name });
  });

  it("名稱超過 20 個字_錯誤", () => {
    expect(parseName("存".repeat(NAME_MAX_LENGTH + 1))).toEqual({ ok: false, error: "名稱最多 20 個字" });
  });

  it("名稱先正規化成 NFC：組合字元、相容漢字跟一般的寫法是同一個名稱", () => {
    expect(parseName("Cafe\u0301")).toEqual({ ok: true, value: "Caf\u00e9" });
    expect(parseName("緊急預\u{2F809}\uF90A")).toEqual({ ok: true, value: "緊急預備金" });
    expect(parseName("生活費".normalize("NFD"))).toEqual({ ok: true, value: "生活費" });
  });

  it("看不見的格式字元（零寬空白、BOM、方向控制字元）拿掉", () => {
    expect(parseName("生活\u200B費")).toEqual({ ok: true, value: "生活費" });
    expect(parseName("\uFEFF國泰")).toEqual({ ok: true, value: "國泰" });
    expect(parseName("國\u202E泰\u2066")).toEqual({ ok: true, value: "國泰" });
  });

  it("中間連續的空白（含全形空白、不換行空白、換行）縮成一個半形空白", () => {
    expect(parseName("旅遊  基金")).toEqual({ ok: true, value: "旅遊 基金" });
    expect(parseName("旅遊\u3000\u3000基金")).toEqual({ ok: true, value: "旅遊 基金" });
    expect(parseName("旅遊\u00A0\n\t基金")).toEqual({ ok: true, value: "旅遊 基金" });
    expect(parseName("旅遊 \u200B 基金")).toEqual({ ok: true, value: "旅遊 基金" });
  });

  it("emoji 序列裡的零寬接合字留著_👩‍💻 不會被拆成兩個圖", () => {
    expect(parseName("工作 \u{1F469}\u200D\u{1F4BB}")).toEqual({ ok: true, value: "工作 \u{1F469}\u200D\u{1F4BB}" });
  });

  it("頭尾或貼著空白的零寬接合字_拿掉", () => {
    expect(parseName("\u200D旅遊\u200C")).toEqual({ ok: true, value: "旅遊" });
    expect(parseName("旅遊 \u200D基金")).toEqual({ ok: true, value: "旅遊 基金" });
  });

  it.each(["\u200B", "\u200B\u200D\uFEFF", " \u200B ", "\u3000"])("只有看不見的字元 %j_要求輸入名稱", (raw) => {
    expect(parseName(raw)).toEqual({ ok: false, error: "請輸入名稱" });
  });

  it("字數照正規化後的算：組合字元與零寬空白不會多算", () => {
    expect(parseName("e\u0301".repeat(NAME_MAX_LENGTH))).toEqual({ ok: true, value: "\u00e9".repeat(NAME_MAX_LENGTH) });
    expect(parseName("存".repeat(NAME_MAX_LENGTH) + "\u200B")).toEqual({ ok: true, value: "存".repeat(NAME_MAX_LENGTH) });
  });

  it("備註_空白存成 null、有字去掉前後空白", () => {
    expect(parseNote("   ")).toEqual({ ok: true, value: null });
    expect(parseNote(" 午餐 ")).toEqual({ ok: true, value: "午餐" });
  });

  it("備註剛好 200 個字可以_超過就錯誤", () => {
    expect(parseNote("字".repeat(NOTE_MAX_LENGTH))).toMatchObject({ ok: true });
    expect(parseNote("字".repeat(NOTE_MAX_LENGTH + 1))).toEqual({ ok: false, error: "備註最多 200 個字" });
  });

  it.each(SELECTABLE_COLORS)("顏色 %s_可以", (raw) => {
    expect(parseColor(raw)).toEqual({ ok: true, value: raw });
  });

  it("可以選的顏色_是色盤拿掉灰色的其他 7 種", () => {
    expect(SELECTABLE_COLORS).toEqual(["blue", "teal", "green", "amber", "orange", "rose", "violet"]);
  });

  it.each(["", "red", "BLUE", "#ff0000"])("顏色 %j_不在色盤裡", (raw) => {
    expect(parseColor(raw)).toEqual({ ok: false, error: "顏色不正確" });
  });

  it("灰色（slate）在色盤裡但留給未分類、未設定用途_不能選", () => {
    expect(PALETTE).toContain("slate");
    expect(parseColor("slate")).toEqual({ ok: false, error: "顏色不正確" });
  });

  it("帳戶類型_只收存款、投資、信用卡", () => {
    expect(parseAccountKind("credit")).toEqual({ ok: true, value: "credit" });
    expect(parseAccountKind("loan")).toEqual({ ok: false, error: "帳戶類型不正確" });
  });

  it("分類類型_只收支出、收入", () => {
    expect(parseCategoryKind("income")).toEqual({ ok: true, value: "income" });
    expect(parseCategoryKind("transfer")).toEqual({ ok: false, error: "分類類型不正確" });
  });
});

describe("parseEntryDate（紀錄的日期，台北時間）", () => {
  it.each(["2026-10-14", "2026-02-28", "2000-01-01"])("%s_可以", (raw) => {
    expect(parseEntryDate(raw, TODAY)).toEqual({ ok: true, value: raw });
  });

  it.each(["", "2026-02-30", "2026-13-01", "1999-12-31", "2026/10/14", "abc"])("%j_日期不正確", (raw) => {
    expect(parseEntryDate(raw, TODAY)).toEqual({ ok: false, error: "日期不正確" });
  });

  it("明天_不能記錄未來的日期", () => {
    expect(parseEntryDate("2026-10-15", TODAY)).toEqual({ ok: false, error: "不能記錄未來的日期" });
  });
});

describe("checkAccountStart（紀錄的日期不能早於帳戶開始記帳的那天）", () => {
  // 台北時間 10/14 中午建立
  const cathay = { name: "國泰", createdAt: new Date("2026-10-14T04:00:00Z") };
  const BEFORE_CATHAY = "「國泰」從 10 月 14 日開始記帳，日期不能更早";

  it("開始記帳的那天與之後_可以", () => {
    expect(checkAccountStart(cathay, "2026-10-14")).toEqual({ ok: true, value: "2026-10-14" });
    expect(checkAccountStart(cathay, "2026-10-15")).toEqual({ ok: true, value: "2026-10-15" });
  });

  it("更早的日期（9/20、前一天）_錯誤寫出帳戶名稱與開始記帳的日期", () => {
    expect(checkAccountStart(cathay, "2026-09-20")).toEqual({ ok: false, error: BEFORE_CATHAY });
    expect(checkAccountStart(cathay, "2026-10-13")).toEqual({ ok: false, error: BEFORE_CATHAY });
  });

  it("開始記帳的那天以台北時間為準（UTC 10/13 16:30 建立是台北 10/14）", () => {
    const lateNight = { name: "郵局", createdAt: new Date("2026-10-13T16:30:00Z") };

    expect(checkAccountStart(lateNight, "2026-10-13")).toEqual({ ok: false, error: "「郵局」從 10 月 14 日開始記帳，日期不能更早" });
    expect(checkAccountStart(lateNight, "2026-10-14")).toEqual({ ok: true, value: "2026-10-14" });
  });

  it("輸入的日期在前一年_開始記帳的日期寫出年份", () => {
    const newYear = { name: "國泰", createdAt: new Date("2026-01-05T04:00:00Z") };

    expect(checkAccountStart(newYear, "2025-12-20")).toEqual({ ok: false, error: "「國泰」從 2026 年 1 月 5 日開始記帳，日期不能更早" });
  });
});

const account = (fields: Partial<Record<string, string>> = {}) => ({
  name: "國泰",
  purposeId: "",
  openingBalance: "",
  openingCost: "",
  monthlyPlan: "",
  targetAmount: "",
  dueDay: "",
  payFromAccountId: "",
  ...fields,
});

describe("parseAccountFields（帳戶設定，依類型）", () => {
  it("存款_全部留空_起始餘額是 0、其他都是 null", () => {
    expect(parseAccountFields(account(), "deposit")).toEqual({
      ok: true,
      value: { name: "國泰", purposeId: null, openingBalance: 0, openingCost: null, monthlyPlan: null, targetAmount: null, dueDay: null, payFromAccountId: null },
    });
  });

  it("存款_起始餘額、每月規劃、目標金額與用途", () => {
    expect(parseAccountFields(account({ purposeId: "3", openingBalance: "12,000", monthlyPlan: "5000", targetAmount: "300000" }), "deposit")).toEqual({
      ok: true,
      value: { name: "國泰", purposeId: 3, openingBalance: 12_000, openingCost: null, monthlyPlan: 5000, targetAmount: 300_000, dueDay: null, payFromAccountId: null },
    });
  });

  it("信用卡_目前未繳存成負的起始餘額_繳款日與扣款帳戶_每月規劃與目標不適用而忽略", () => {
    expect(parseAccountFields(account({ openingBalance: "3500", dueDay: "6", payFromAccountId: "9", monthlyPlan: "100", targetAmount: "200", openingCost: "50" }), "credit")).toEqual({
      ok: true,
      value: { name: "國泰", purposeId: null, openingBalance: -3500, openingCost: null, monthlyPlan: null, targetAmount: null, dueDay: 6, payFromAccountId: 9 },
    });
  });

  it("信用卡沒有未繳_起始餘額是 0（不是 -0）", () => {
    const parsed = parseAccountFields(account({ openingBalance: "0" }), "credit");
    expect(parsed.ok && Object.is(parsed.value.openingBalance, 0)).toBe(true);
  });

  it("投資_目前市值與成本_繳款日與扣款帳戶不適用而忽略", () => {
    expect(parseAccountFields(account({ openingBalance: "80000", openingCost: "75,000", dueDay: "6", payFromAccountId: "9" }), "investment")).toEqual({
      ok: true,
      value: { name: "國泰", purposeId: null, openingBalance: 80_000, openingCost: 75_000, monthlyPlan: null, targetAmount: null, dueDay: null, payFromAccountId: null },
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

  it.each(["0", "32", "1.5", "abc"])("信用卡繳款日 %j_要在 1 到 31 日之間", (dueDay) => {
    expect(parseAccountFields(account({ dueDay }), "credit")).toEqual({ ok: false, error: "繳款日要在 1 到 31 日之間" });
  });

  it("繳款日 31_可以（沒有 31 日的月份算月底）", () => {
    expect(parseAccountFields(account({ dueDay: "31" }), "credit")).toMatchObject({ ok: true, value: { dueDay: 31 } });
  });

  it("用途 id 格式不對_當作找不到用途", () => {
    expect(parseAccountFields(account({ purposeId: "abc" }), "deposit")).toEqual({ ok: false, error: NOT_FOUND.purpose });
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

describe("parsePurposeFields 與 parseCategoryFields", () => {
  it("用途_名稱與顏色", () => {
    expect(parsePurposeFields({ name: " 生活費 ", color: "blue" })).toEqual({ ok: true, value: { name: "生活費", color: "blue" } });
    expect(parsePurposeFields({ name: "生活費", color: "pink" })).toEqual({ ok: false, error: "顏色不正確" });
  });

  it("用途與分類都不能選灰色_灰色留給「未設定用途」「未分類」，圖上才分得出來", () => {
    expect(parsePurposeFields({ name: "生活費", color: "slate" })).toEqual({ ok: false, error: "顏色不正確" });
    expect(parseCategoryFields({ name: "提領現金", color: "slate", monthlyBudget: "" }, "expense")).toEqual({ ok: false, error: "顏色不正確" });
    expect(parseCategoryFields({ name: "獎金", color: "slate", monthlyBudget: "" }, "income")).toEqual({ ok: false, error: "顏色不正確" });
  });

  it("支出分類_可以設每月預算_留空是不設", () => {
    expect(parseCategoryFields({ name: "餐飲", color: "orange", monthlyBudget: "6,000" }, "expense")).toEqual({
      ok: true,
      value: { name: "餐飲", color: "orange", monthlyBudget: 6000 },
    });
    expect(parseCategoryFields({ name: "餐飲", color: "orange", monthlyBudget: " " }, "expense")).toMatchObject({ ok: true, value: { monthlyBudget: null } });
  });

  it("收入分類_預算不適用而忽略", () => {
    expect(parseCategoryFields({ name: "薪水", color: "green", monthlyBudget: "100" }, "income")).toEqual({ ok: true, value: { name: "薪水", color: "green", monthlyBudget: null } });
  });

  it("預算 0 元_至少 1 元", () => {
    expect(parseCategoryFields({ name: "餐飲", color: "orange", monthlyBudget: "0" }, "expense")).toEqual({ ok: false, error: "金額至少 1 元" });
  });
});

const entry = (fields: Partial<Record<string, string>> = {}) => ({
  kind: "expense",
  accountId: "1",
  counterAccountId: "",
  categoryId: "",
  amount: "120",
  date: TODAY,
  note: "",
  ...fields,
});

describe("parseEntryFields（收入、支出、轉帳）", () => {
  it("支出_分類留空是未分類_備註留空是 null", () => {
    expect(parseEntryFields(entry(), TODAY)).toEqual({
      ok: true,
      value: { kind: "expense", accountId: 1, counterAccountId: null, categoryId: null, amount: 120, date: TODAY, note: null },
    });
  });

  it("收入_帶分類與備註_轉入帳戶不適用而忽略", () => {
    expect(parseEntryFields(entry({ kind: "income", categoryId: "4", counterAccountId: "2", note: " 十月 " }), TODAY)).toEqual({
      ok: true,
      value: { kind: "income", accountId: 1, counterAccountId: null, categoryId: 4, amount: 120, date: TODAY, note: "十月" },
    });
  });

  it("轉帳_要有轉入帳戶_分類不適用而忽略", () => {
    expect(parseEntryFields(entry({ kind: "transfer", counterAccountId: "2", categoryId: "4" }), TODAY)).toEqual({
      ok: true,
      value: { kind: "transfer", accountId: 1, counterAccountId: 2, categoryId: null, amount: 120, date: TODAY, note: null },
    });
  });

  it.each(["adjust", "", "refund"])("類型 %j_不能自己選", (kind) => {
    expect(parseEntryFields(entry({ kind }), TODAY)).toEqual({ ok: false, error: "類型不正確" });
  });

  it("沒選帳戶_要求選帳戶", () => {
    expect(parseEntryFields(entry({ accountId: "" }), TODAY)).toEqual({ ok: false, error: "請選擇帳戶" });
  });

  it("帳戶 id 格式不對_當作找不到帳戶", () => {
    expect(parseEntryFields(entry({ accountId: "x" }), TODAY)).toEqual({ ok: false, error: NOT_FOUND.account });
  });

  it("轉帳沒選轉入帳戶_要求選轉入的帳戶", () => {
    expect(parseEntryFields(entry({ kind: "transfer" }), TODAY)).toEqual({ ok: false, error: "請選擇轉入的帳戶" });
  });

  it("轉帳的轉出與轉入是同一個帳戶_錯誤", () => {
    expect(parseEntryFields(entry({ kind: "transfer", counterAccountId: "1" }), TODAY)).toEqual({ ok: false, error: "轉出和轉入不能是同一個帳戶" });
  });

  it("分類 id 格式不對_當作找不到分類", () => {
    expect(parseEntryFields(entry({ categoryId: "1.5" }), TODAY)).toEqual({ ok: false, error: NOT_FOUND.category });
  });

  it("金額、日期、備註不合法_回各自的錯誤", () => {
    expect(parseEntryFields(entry({ amount: "0" }), TODAY)).toEqual({ ok: false, error: "金額至少 1 元" });
    expect(parseEntryFields(entry({ date: "2026-10-15" }), TODAY)).toEqual({ ok: false, error: "不能記錄未來的日期" });
    expect(parseEntryFields(entry({ note: "字".repeat(NOTE_MAX_LENGTH + 1) }), TODAY)).toEqual({ ok: false, error: "備註最多 200 個字" });
  });
});

describe("parseRecurringFields（固定收支）", () => {
  const rule = (fields: Partial<Record<string, string>> = {}) => ({ kind: "expense", accountId: "1", counterAccountId: "", categoryId: "", amount: "120", dayOfMonth: "6", note: "", ...fields });

  it("每月 6 日的支出", () => {
    expect(parseRecurringFields(rule({ categoryId: "3", note: "Netflix" }))).toEqual({
      ok: true,
      value: { kind: "expense", accountId: 1, counterAccountId: null, categoryId: 3, amount: 120, dayOfMonth: 6, note: "Netflix" },
    });
  });

  it("每月轉帳（定期定額）", () => {
    expect(parseRecurringFields(rule({ kind: "transfer", counterAccountId: "2" }))).toMatchObject({ ok: true, value: { kind: "transfer", counterAccountId: 2, categoryId: null } });
  });

  it.each(["0", "32", "", "6.5"])("日期 %j_要在 1 到 31 日之間", (dayOfMonth) => {
    expect(parseRecurringFields(rule({ dayOfMonth }))).toEqual({ ok: false, error: "每月的日期要在 1 到 31 日之間" });
  });

  it("轉入與轉出同一個帳戶_錯誤", () => {
    expect(parseRecurringFields(rule({ kind: "transfer", counterAccountId: "1" }))).toEqual({ ok: false, error: "轉出和轉入不能是同一個帳戶" });
  });
});

describe("parseBalanceFields（更新餘額）", () => {
  it("帳戶與實際金額_0 也可以", () => {
    expect(parseBalanceFields({ accountId: "5", actual: "0" })).toEqual({ ok: true, value: { accountId: 5, actual: 0 } });
    expect(parseBalanceFields({ accountId: "5", actual: "52,300" })).toEqual({ ok: true, value: { accountId: 5, actual: 52_300 } });
  });

  it("沒填金額_要求輸入", () => {
    expect(parseBalanceFields({ accountId: "5", actual: "" })).toEqual({ ok: false, error: "請輸入金額" });
  });

  it("帳戶 id 不對_當作找不到帳戶", () => {
    expect(parseBalanceFields({ accountId: "", actual: "1" })).toEqual({ ok: false, error: NOT_FOUND.account });
  });

  it("信用卡_目前未繳可以是負數（溢繳）", () => {
    expect(parseBalanceFields({ accountId: "5", actual: "-300" }, "credit")).toEqual({ ok: true, value: { accountId: 5, actual: -300 } });
    expect(parseBalanceFields({ accountId: "5", actual: "1.5" }, "credit")).toEqual({ ok: false, error: "金額只能是整數（單位：元，不能有小數；溢繳請輸入負數）" });
  });

  it.each(["deposit", "investment", undefined] as const)("%s_不能是負數", (kind) => {
    expect(parseBalanceFields({ accountId: "5", actual: "-300" }, kind)).toEqual({ ok: false, error: "金額只能是整數（單位：元，不能有小數或負數）" });
  });
});

describe("parseSalaryFields（發薪分配）", () => {
  const salary = (fields: Partial<{ accountId: string; categoryId: string; amount: string; date: string; note: string; transfers: { accountId: string; amount: string }[] }> = {}) => ({
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
      },
    });
  });

  it("分類可以留空", () => {
    expect(parseSalaryFields(salary({ categoryId: "", transfers: [] }), TODAY)).toMatchObject({ ok: true, value: { categoryId: null, transfers: [] } });
  });

  it("分出去的剛好等於薪水_可以", () => {
    expect(parseSalaryFields(salary({ amount: "11000" }), TODAY)).toMatchObject({ ok: true });
  });

  it("分出去的超過薪水_錯誤", () => {
    expect(parseSalaryFields(salary({ amount: "10999" }), TODAY)).toEqual({ ok: false, error: "分出去的金額超過薪水了" });
  });

  it("沒選入帳帳戶_錯誤", () => {
    expect(parseSalaryFields(salary({ accountId: "" }), TODAY)).toEqual({ ok: false, error: "請選擇入帳的帳戶" });
  });

  it("分配金額不合法_寫出是分配金額", () => {
    expect(parseSalaryFields(salary({ transfers: [{ accountId: "2", amount: "-5" }] }), TODAY)).toEqual({
      ok: false,
      error: "分配金額：金額只能是整數（單位：元，不能有小數或負數）",
    });
  });

  it("分配到入帳帳戶自己_轉出和轉入不能是同一個帳戶", () => {
    expect(parseSalaryFields(salary({ transfers: [{ accountId: "1", amount: "100" }] }), TODAY)).toEqual({ ok: false, error: "轉出和轉入不能是同一個帳戶" });
  });

  it("有金額卻沒選帳戶_錯誤", () => {
    expect(parseSalaryFields(salary({ transfers: [{ accountId: "", amount: "100" }] }), TODAY)).toEqual({ ok: false, error: "請選擇要轉入的帳戶" });
  });

  it("分配的帳戶 id 格式不對_當作找不到帳戶", () => {
    expect(parseSalaryFields(salary({ transfers: [{ accountId: "abc", amount: "100" }] }), TODAY)).toEqual({ ok: false, error: NOT_FOUND.account });
  });

  it("薪水與日期不合法_回各自的錯誤", () => {
    expect(parseSalaryFields(salary({ amount: "" }), TODAY)).toEqual({ ok: false, error: "請輸入金額" });
    expect(parseSalaryFields(salary({ date: "2026-11-01" }), TODAY)).toEqual({ ok: false, error: "不能記錄未來的日期" });
  });

  const LINES_INVALID = "分配的帳戶不正確，請重新整理頁面再試一次";
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
    expect(parseSalaryFields(salary({ transfers: [{ accountId: "2", amount: "-5" }] }), TODAY, mine)).toEqual({
      ok: false,
      error: "分配給「郵局」的金額：金額只能是整數（單位：元，不能有小數或負數）",
    });
    expect(parseSalaryFields(salary({ transfers: [{ accountId: " 3 ", amount: "100000001" }] }), TODAY, mine)).toEqual({
      ok: false,
      error: "分配給「證券」的金額：金額不能超過 1 億元",
    });
  });

  it("金額不合法而帳戶不在自己的清單裡（別人的或格式不對）_不寫名稱", () => {
    expect(parseSalaryFields(salary({ transfers: [{ accountId: "99", amount: "1.5" }] }), TODAY, mine)).toEqual({
      ok: false,
      error: "分配金額：金額只能是整數（單位：元，不能有小數或負數）",
    });
    expect(parseSalaryFields(salary({ transfers: [{ accountId: "abc", amount: "1.5" }] }), TODAY, mine)).toEqual({
      ok: false,
      error: "分配金額：金額只能是整數（單位：元，不能有小數或負數）",
    });
  });
});
