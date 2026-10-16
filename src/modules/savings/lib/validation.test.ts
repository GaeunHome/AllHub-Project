import { describe, expect, it } from "vitest";
import { CARD_STYLES, CATEGORY_ICON_NAMES, LABEL_MAX_LENGTH, NAME_MAX_LENGTH, NOTE_MAX_LENGTH, PALETTE, SELECTABLE_COLORS } from "./kinds";
import {
  NOT_FOUND,
  amountFromText,
  checkAccountStart,
  checkBillDueDate,
  isRowId,
  parseAccountFields,
  parseAccountKind,
  parseAllocationFields,
  parseAmount,
  parseBalance,
  parseBalanceFields,
  parseCardBillFields,
  parseCategoryFields,
  parseCategoryKind,
  parseColor,
  parseEntryDate,
  parseEntryFields,
  parseName,
  parseNote,
  parseRecurringFields,
  parseRowId,
  parseSalaryFields,
  parseConfirmFields,
  parseHoldingFields,
  parseHoldingUpdateFields,
  parseOccurrenceFields,
  parsePayCardFields,
  parsePeriod,
  parseShares,
  parseTradeFields,
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

  it.each(CARD_STYLES)("信用卡的卡面顏色 %s_可以", (style) => {
    expect(parseAccountFields(account({ cardStyle: style }), "credit")).toMatchObject({ ok: true, value: { cardStyle: style } });
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

  it("舊的表單送來用途 id（就算格式不對）_不讀也不存：用途改成帳戶上的文字", () => {
    const parsed = parseAccountFields(account({ purposeId: "abc" }), "deposit");

    expect(parsed).toMatchObject({ ok: true, value: { label: null } });
    expect(parsed.ok && parsed.value).not.toHaveProperty("purposeId");
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

describe("parseCategoryFields", () => {
  it("分類不能選灰色_灰色留給「未分類」", () => {
    expect(parseCategoryFields({ name: "提領現金", color: "slate", monthlyBudget: "", icon: "" }, "expense")).toEqual({ ok: false, error: "顏色不正確" });
    expect(parseCategoryFields({ name: "獎金", color: "slate", monthlyBudget: "", icon: "" }, "income")).toEqual({ ok: false, error: "顏色不正確" });
  });

  it("支出分類_可以設每月預算_留空是不設", () => {
    expect(parseCategoryFields({ name: "餐飲", color: "orange", monthlyBudget: "6,000", icon: "utensils" }, "expense")).toEqual({
      ok: true,
      value: { name: "餐飲", color: "orange", monthlyBudget: 6000, icon: "utensils" },
    });
    expect(parseCategoryFields({ name: "餐飲", color: "orange", monthlyBudget: " ", icon: "" }, "expense")).toMatchObject({ ok: true, value: { monthlyBudget: null } });
  });

  it("收入分類_預算不適用而忽略", () => {
    expect(parseCategoryFields({ name: "薪水", color: "green", monthlyBudget: "100", icon: "briefcase" }, "income")).toEqual({ ok: true, value: { name: "薪水", color: "green", monthlyBudget: null, icon: "briefcase" } });
  });

  it("預算 0 元_至少 1 元", () => {
    expect(parseCategoryFields({ name: "餐飲", color: "orange", monthlyBudget: "0", icon: "" }, "expense")).toEqual({ ok: false, error: "金額至少 1 元" });
  });

  it.each(CATEGORY_ICON_NAMES)("分類的圖示 %s（選擇器上的每一個）_收入與支出都可以選", (icon) => {
    expect(parseCategoryFields({ name: "分類", color: "orange", monthlyBudget: "", icon }, "expense")).toMatchObject({ ok: true, value: { icon } });
    expect(parseCategoryFields({ name: "分類", color: "orange", monthlyBudget: "", icon }, "income")).toMatchObject({ ok: true, value: { icon } });
  });

  it("沒選圖示_是 null（畫面用預設的圖示）", () => {
    expect(parseCategoryFields({ name: "餐飲", color: "orange", monthlyBudget: "", icon: " " }, "expense")).toMatchObject({ ok: true, value: { icon: null } });
  });

  it.each(["rocket", "Utensils", "constructor", "toString", "__proto__", "landmark"])("圖示 %j 不在選擇器上（含物件內建的名稱、帳戶用的圖示）_錯誤", (icon) => {
    expect(parseCategoryFields({ name: "餐飲", color: "orange", monthlyBudget: "", icon }, "expense")).toEqual({ ok: false, error: "圖示不正確" });
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
  const rule = (fields: Partial<Record<string, string>> = {}) => ({
    kind: "expense",
    accountId: "1",
    counterAccountId: "",
    categoryId: "",
    amount: "120",
    dayOfMonth: "6",
    note: "",
    name: "",
    intervalMonths: "",
    startMonth: "",
    holidayRule: "",
    mode: "",
    holdingId: "",
    allocate: "",
    ...fields,
  });

  it("每月 6 日的支出_沒填的間隔、假日規則、記帳方式是每月、照原日、到期請我確認", () => {
    expect(parseRecurringFields(rule({ categoryId: "3", note: "Netflix" }))).toEqual({
      ok: true,
      value: {
        kind: "expense",
        accountId: 1,
        counterAccountId: null,
        categoryId: 3,
        amount: 120,
        dayOfMonth: 6,
        note: "Netflix",
        name: null,
        intervalMonths: 1,
        startMonth: null,
        holidayRule: "none",
        mode: "confirm",
        holdingId: null,
        allocate: false,
      },
    });
  });

  it("名稱、每 2 個月從 8 月開始（存 1 號）、遇假日延後、自動記帳", () => {
    expect(parseRecurringFields(rule({ name: " 電費 ", intervalMonths: "2", startMonth: "2026-08", holidayRule: "after", mode: "auto" }))).toMatchObject({
      ok: true,
      value: { name: "電費", intervalMonths: 2, startMonth: "2026-08-01", holidayRule: "after", mode: "auto" },
    });
  });

  it("每月一次時不看起始月份", () => {
    expect(parseRecurringFields(rule({ intervalMonths: "1", startMonth: "2026-12" }))).toMatchObject({ ok: true, value: { startMonth: null } });
  });

  it.each([
    [{ intervalMonths: "4" }, "多久一次"],
    [{ intervalMonths: "2", startMonth: "2026-13" }, "哪個月開始"],
    [{ holidayRule: "skip" }, "遇假日"],
    [{ mode: "manual" }, "記帳方式"],
    [{ name: "字".repeat(21) }, "20 個字"],
  ])("%j_錯誤提到「%s」", (fields, keyword) => {
    expect(parseRecurringFields(rule(fields))).toEqual({ ok: false, error: expect.stringContaining(keyword) });
  });

  it("定期定額（regular 或帶 holdingId 的轉帳）_要選哪一檔，轉入帳戶先是 null（service 照那一檔填），分類忽略", () => {
    const expected = { ok: true, value: { kind: "transfer", accountId: 1, counterAccountId: null, categoryId: null, holdingId: 21, mode: "confirm" } };

    expect(parseRecurringFields(rule({ kind: "regular", holdingId: "21", counterAccountId: "9", categoryId: "3", mode: "confirm" }))).toMatchObject(expected);
    expect(parseRecurringFields(rule({ kind: "transfer", holdingId: "21", counterAccountId: "9", mode: "confirm" }))).toMatchObject(expected);
    expect(parseRecurringFields(rule({ kind: "regular", holdingId: "" }))).toEqual({ ok: false, error: expect.stringContaining("哪一檔") });
    expect(parseRecurringFields(rule({ kind: "regular", holdingId: "abc" }))).toEqual({ ok: false, error: NOT_FOUND.holding });
  });

  it("定期定額要確認股數、薪水要確認實際金額_選自動記帳時擋下", () => {
    expect(parseRecurringFields(rule({ kind: "regular", holdingId: "21", mode: "auto" }))).toEqual({ ok: false, error: expect.stringMatching(/股數.*到期請我確認/) });
    expect(parseRecurringFields(rule({ kind: "income", allocate: "on", mode: "auto" }))).toEqual({ ok: false, error: expect.stringMatching(/實際金額.*到期請我確認/) });
  });

  it("「這是薪水」只有收入有效", () => {
    expect(parseRecurringFields(rule({ kind: "income", allocate: "on" }))).toMatchObject({ ok: true, value: { allocate: true } });
    expect(parseRecurringFields(rule({ kind: "expense", allocate: "on", mode: "auto" }))).toMatchObject({ ok: true, value: { allocate: false, mode: "auto" } });
  });

  it("每月轉帳（定期定額）", () => {
    expect(parseRecurringFields(rule({ kind: "transfer", counterAccountId: "2" }))).toMatchObject({ ok: true, value: { kind: "transfer", counterAccountId: 2, categoryId: null } });
  });

  it.each(["0", "32", "", "6.5"])("日期 %j_要在 1 到 31 日之間", (dayOfMonth) => {
    expect(parseRecurringFields(rule({ dayOfMonth }))).toEqual({ ok: false, error: expect.stringContaining("1 到 31 日") });
  });

  it("轉入與轉出同一個帳戶_錯誤", () => {
    expect(parseRecurringFields(rule({ kind: "transfer", counterAccountId: "1" }))).toEqual({ ok: false, error: expect.stringContaining("同一個帳戶") });
  });
});

describe("parseBalanceFields（更新餘額）", () => {
  it("帳戶與實際金額_0 也可以", () => {
    expect(parseBalanceFields({ accountId: "5", actual: "0" })).toEqual({ ok: true, value: { accountId: 5, actual: 0 } });
    expect(parseBalanceFields({ accountId: "5", actual: "52,300" })).toEqual({ ok: true, value: { accountId: 5, actual: 52_300 } });
  });

  it("沒填金額_要求輸入", () => {
    expect(parseBalanceFields({ accountId: "5", actual: "" })).toEqual({ ok: false, error: expect.stringContaining("金額") });
  });

  it("帳戶 id 不對_當作找不到帳戶", () => {
    expect(parseBalanceFields({ accountId: "", actual: "1" })).toEqual({ ok: false, error: NOT_FOUND.account });
  });

  it("存款餘額與投資市值不能是負數（信用卡沒有更新餘額）", () => {
    expect(parseBalanceFields({ accountId: "5", actual: "-300" })).toEqual({ ok: false, error: expect.stringContaining("負數") });
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

describe("parseShares（股數：台股最小單位 1 股）", () => {
  it.each([
    ["12", 12],
    ["1,000", 1000],
    [" 7 ", 7],
    ["1000000000", 1_000_000_000],
  ])("%j_是 %i 股", (raw, expected) => {
    expect(parseShares(raw)).toEqual({ ok: true, value: expected });
  });

  it.each([
    ["", "請輸入"],
    ["1.5", "整數"],
    ["-3", "整數"],
    ["0", "至少 1 股"],
    ["1000000001", "10 億股"],
  ])("%j_錯誤提到「%s」", (raw, keyword) => {
    expect(parseShares(raw)).toEqual({ ok: false, error: expect.stringContaining(keyword) });
  });

  it("目前股數可以是 0（例如還沒開始定期定額）", () => {
    expect(parseShares("0", { allowZero: true })).toEqual({ ok: true, value: 0 });
  });
});

describe("parseHoldingFields 與 parseHoldingUpdateFields（持股：照券商 App 的庫存頁）", () => {
  const holding = (fields: Partial<Record<"accountId" | "symbol" | "shares" | "cost", string>> = {}) => ({ accountId: "7", symbol: " 006208 ", shares: "120", cost: "27,600", ...fields });

  it("代號正規化、股數與總成本", () => {
    expect(parseHoldingFields(holding({ symbol: "00679b" }))).toEqual({ ok: true, value: { accountId: 7, symbol: "00679B", shares: 120, cost: 27_600 } });
  });

  it("股數與成本都可以是 0", () => {
    expect(parseHoldingFields(holding({ shares: "0", cost: "0" }))).toMatchObject({ ok: true, value: { shares: 0, cost: 0 } });
  });

  it.each([
    [{ accountId: "" }, "投資帳戶"],
    [{ accountId: "x" }, NOT_FOUND.account],
    [{ symbol: " " }, "代號"],
    [{ symbol: "2330.TW" }, "找不到這個代號"],
    [{ shares: "1.5" }, "目前股數"],
    [{ cost: "-1" }, "總成本"],
  ])("%j_錯誤提到「%s」", (fields, keyword) => {
    expect(parseHoldingFields(holding(fields))).toEqual({ ok: false, error: expect.stringContaining(keyword) });
  });

  it("修改只收股數與總成本", () => {
    expect(parseHoldingUpdateFields({ shares: "132", cost: "30,700" })).toEqual({ ok: true, value: { shares: 132, cost: 30_700 } });
  });
});

describe("parseTradeFields（買進與賣出）", () => {
  const trade = (fields: Partial<Record<"holdingId" | "accountId" | "shares" | "amount" | "date" | "note", string>> = {}) => ({
    holdingId: "21",
    accountId: "1",
    shares: "12",
    amount: "3,105",
    date: TODAY,
    note: "",
    ...fields,
  });

  it("持股、存款帳戶、股數、實際扣款或入帳（含手續費）、日期、備註", () => {
    expect(parseTradeFields(trade(), "buy", TODAY)).toEqual({ ok: true, value: { holdingId: 21, accountId: 1, shares: 12, amount: 3105, date: TODAY, note: null } });
  });

  it.each([
    [{ holdingId: "" }, "buy", NOT_FOUND.holding],
    [{ accountId: "" }, "buy", "扣款的帳戶"],
    [{ accountId: "" }, "sell", "入帳的帳戶"],
    [{ shares: "0" }, "buy", "至少 1 股"],
    [{ amount: "0" }, "sell", "至少 1 元"],
    [{ date: "2026-10-15" }, "buy", "未來"],
  ] as const)("%j（%s）_錯誤提到「%s」", (fields, side, keyword) => {
    expect(parseTradeFields(trade(fields), side, TODAY)).toEqual({ ok: false, error: expect.stringContaining(keyword) });
  });
});

describe("parseConfirmFields 與 parseOccurrenceFields（確認或略過待處理的一期）", () => {
  const confirm = (fields: Partial<Record<"ruleId" | "period" | "amount" | "date" | "note" | "shares", string>> = {}) => ({
    ruleId: "30",
    period: "2026-10",
    amount: "4,916",
    date: TODAY,
    note: "",
    shares: "",
    ...fields,
  });

  it("金額可以跟預計的不同；股數選填（只有定期定額要）", () => {
    expect(parseConfirmFields(confirm(), TODAY)).toEqual({ ok: true, value: { ruleId: 30, period: "2026-10", amount: 4916, date: TODAY, note: null, shares: null } });
    expect(parseConfirmFields(confirm({ shares: "19" }), TODAY)).toMatchObject({ ok: true, value: { shares: 19 } });
  });

  it.each([
    [{ ruleId: "0" }, NOT_FOUND.recurring],
    [{ period: "2026-13" }, "這一期"],
    [{ amount: "" }, "金額"],
    [{ date: "2026-10-20" }, "未來"],
    [{ shares: "0" }, "股數"],
  ])("%j_錯誤提到「%s」", (fields, keyword) => {
    expect(parseConfirmFields(confirm(fields), TODAY)).toEqual({ ok: false, error: expect.stringContaining(keyword) });
  });

  it("期別收 YYYY-MM，資料庫格式的 1 號也收", () => {
    expect(parseOccurrenceFields({ ruleId: "30", period: "2026-10-01" })).toEqual({ ok: true, value: { ruleId: 30, period: "2026-10" } });
    expect(parsePeriod("2026-10-15")).toBeNull();
  });
});

describe("parsePayCardFields（繳卡費）", () => {
  it("信用卡、扣款帳戶、金額、日期；帳單金額選填（一起填這一期的帳單，要一起填截止日）", () => {
    const bill = { billAmount: "12,480", dueDate: "2026-10-20" };

    expect(parsePayCardFields({ cardId: "3", fromAccountId: "2", amount: "6,340", date: TODAY }, TODAY)).toEqual({ ok: true, value: { cardId: 3, fromAccountId: 2, amount: 6340, date: TODAY, billAmount: null, dueDate: null, categoryId: null } });
    expect(parsePayCardFields({ cardId: "3", fromAccountId: "2", amount: "6,340", date: TODAY, ...bill, categoryId: "11" }, TODAY)).toMatchObject({ ok: true, value: { billAmount: 12_480, dueDate: "2026-10-20", categoryId: 11 } });
    expect(parsePayCardFields({ cardId: "3", fromAccountId: "2", amount: "6,340", date: TODAY, ...bill, categoryId: "abc" }, TODAY)).toEqual({ ok: false, error: NOT_FOUND.category });
    expect(parsePayCardFields({ cardId: "3", fromAccountId: "2", amount: "6,340", date: TODAY, ...bill }, TODAY)).toMatchObject({ ok: true, value: { billAmount: 12_480 } });
    expect(parsePayCardFields({ cardId: "3", fromAccountId: "2", amount: "6,340", date: TODAY, ...bill, billAmount: "0" }, TODAY)).toMatchObject({ ok: true, value: { billAmount: 0 } });
    expect(parsePayCardFields({ cardId: "3", fromAccountId: "2", amount: "6,340", date: TODAY, ...bill, billAmount: "-1" }, TODAY)).toEqual({ ok: false, error: expect.stringContaining("帳單金額") });
  });

  it("填了帳單金額卻沒填截止日或截止日不對_擋下；沒填帳單金額時不看截止日", () => {
    expect(parsePayCardFields({ cardId: "3", fromAccountId: "2", amount: "6,340", date: TODAY, billAmount: "12,480" }, TODAY)).toEqual({ ok: false, error: expect.stringContaining("截止日") });
    expect(parsePayCardFields({ cardId: "3", fromAccountId: "2", amount: "6,340", date: TODAY, billAmount: "12,480", dueDate: "2026-02-30" }, TODAY)).toEqual({ ok: false, error: expect.stringContaining("截止日") });
    expect(parsePayCardFields({ cardId: "3", fromAccountId: "2", amount: "6,340", date: TODAY, dueDate: "abc" }, TODAY)).toMatchObject({ ok: true, value: { billAmount: null, dueDate: null } });
  });

  it.each([
    [{ cardId: "" }, NOT_FOUND.account],
    [{ fromAccountId: "" }, "扣款的帳戶"],
    [{ fromAccountId: "3" }, "同一個帳戶"],
    [{ amount: "0" }, "至少 1 元"],
  ])("%j_錯誤提到「%s」", (fields, keyword) => {
    expect(parsePayCardFields({ cardId: "3", fromAccountId: "2", amount: "6340", date: TODAY, ...fields }, TODAY)).toEqual({ ok: false, error: expect.stringContaining(keyword) });
  });
});

describe("parseCardBillFields（填帳單：金額與截止日照銀行的帳單）", () => {
  const fields = (values: Partial<Record<"cardId" | "amount" | "statementDate" | "dueDate" | "categoryId", string>> = {}) => ({ cardId: "3", amount: "12,480", statementDate: "", dueDate: "2026-10-25", categoryId: "", ...values });

  it("信用卡、帳單金額與截止日（照填的存，假日也一樣）；0 元也可以；結帳日與分類選填", () => {
    expect(parseCardBillFields(fields(), TODAY)).toEqual({ ok: true, value: { cardId: 3, amount: 12_480, statementDate: null, dueDate: "2026-10-25", categoryId: null } });
    expect(parseCardBillFields(fields({ amount: "0", statementDate: "2026-10-05", dueDate: "2026-11-02", categoryId: "11" }), TODAY)).toEqual({
      ok: true,
      value: { cardId: 3, amount: 0, statementDate: "2026-10-05", dueDate: "2026-11-02", categoryId: 11 },
    });
  });

  it.each([
    [{ cardId: "" }, NOT_FOUND.account],
    [{ amount: "" }, "帳單金額"],
    [{ amount: "-1" }, "帳單金額"],
    [{ statementDate: "2026-10-15" }, "未來"],
    [{ statementDate: "10/5" }, "結帳日"],
    [{ dueDate: "" }, "請輸入繳款截止日"],
    [{ dueDate: "2026-02-30" }, "繳款截止日"],
    [{ dueDate: "10/25" }, "繳款截止日"],
    [{ categoryId: "abc" }, NOT_FOUND.category],
  ])("%j_錯誤提到「%s」", (values, keyword) => {
    expect(parseCardBillFields(fields(values), TODAY)).toEqual({ ok: false, error: expect.stringContaining(keyword) });
  });
});

describe("checkBillDueDate（截止日要在結帳日到結帳後 60 天之間）", () => {
  it.each([
    ["2026-10-05", "2026-10-05", "跟結帳日同一天"],
    ["2026-10-05", "2026-12-04", "結帳後第 60 天"],
    ["2026-12-31", "2027-03-01", "跨年 結帳後第 60 天"],
  ])("%s 結帳、截止 %s_可以（%s）", (statementDate, dueDate) => {
    expect(checkBillDueDate(statementDate, dueDate)).toEqual({ ok: true, value: dueDate });
  });

  it.each([
    ["2026-10-05", "2026-10-04", "早於結帳日"],
    ["2026-10-05", "2026-12-05", "結帳後第 61 天"],
    ["2026-12-31", "2027-03-02", "跨年 結帳後第 61 天"],
  ])("%s 結帳、截止 %s_擋下（%s）", (statementDate, dueDate) => {
    expect(checkBillDueDate(statementDate, dueDate)).toEqual({ ok: false, error: expect.stringContaining("繳款截止日") });
  });
});
