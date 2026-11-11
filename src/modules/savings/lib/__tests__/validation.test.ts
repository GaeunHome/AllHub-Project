import { describe, expect, it } from "vitest";
import { NAME_MAX_LENGTH, NOTE_MAX_LENGTH } from "../kinds";
import { amountFromText, checkAccountStart, isRowId, parseAccountKind, parseAmount, parseBalance, parseCategoryKind, parseEntryDate, parseName, parseNote, parseRowId, parseShares } from "../validation";

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
  const cathay = { name: "國泰", startDate: null, createdAt: new Date("2026-10-14T04:00:00Z") };
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
    const lateNight = { name: "郵局", startDate: null, createdAt: new Date("2026-10-13T16:30:00Z") };

    expect(checkAccountStart(lateNight, "2026-10-13")).toEqual({ ok: false, error: "「郵局」從 10 月 14 日開始記帳，日期不能更早" });
    expect(checkAccountStart(lateNight, "2026-10-14")).toEqual({ ok: true, value: "2026-10-14" });
  });

  it("輸入的日期在前一年_開始記帳的日期寫出年份", () => {
    const newYear = { name: "國泰", startDate: null, createdAt: new Date("2026-01-05T04:00:00Z") };

    expect(checkAccountStart(newYear, "2025-12-20")).toEqual({ ok: false, error: "「國泰」從 2026 年 1 月 5 日開始記帳，日期不能更早" });
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
