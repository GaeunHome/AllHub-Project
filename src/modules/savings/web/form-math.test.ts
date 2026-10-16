import { describe, expect, it } from "vitest";
import { SELECTABLE_COLORS } from "../lib/kinds";
import { balanceHint, choosableAccounts, defaultIncomeCategory, latestDate, nextFreeColor, salaryFormReducer, salaryPreview, salaryStartDate, selectableColor, suggestLines } from "./form-math";

describe("更新餘額的說明", () => {
  it("輸入銀行 App 上的餘額：寫出要記的調整是實際減記錄的（12,000 → 11,650 是 -$350）", () => {
    expect(balanceHint(12000, "11650")).toContain("-$350");
    expect(balanceHint(12000, "12,500")).toContain("+$500");
  });

  it("跟記錄的一樣_不會多記一筆，沒有調整的金額；打錯或打負數（伺服器不收）_當成還沒填", () => {
    expect(balanceHint(12000, "12,000")).not.toContain("$");
    expect(balanceHint(12000, "1.5")).toBe(balanceHint(12000, ""));
    expect(balanceHint(12000, "-200")).toBe(balanceHint(12000, ""));
  });
});

describe("發薪分配", () => {
  const option = (id: number, fields: Partial<{ name: string; kind: "deposit" | "investment" | "credit"; balance: number; monthlyPlan: number | null; targetAmount: number | null; sortOrder: number }> = {}) => ({
    id,
    name: `帳戶${id}`,
    kind: "deposit" as const,
    balance: 0,
    monthlyPlan: null,
    targetAmount: null,
    sortOrder: id,
    ...fields,
  });
  const ACCOUNTS = [
    option(1, { name: "國泰", balance: 20000 }),
    option(2, { name: "郵局", balance: 95000, monthlyPlan: 10000, targetAmount: 100000 }),
    option(4, { name: "元大證券", kind: "investment", monthlyPlan: 3000 }),
    option(5, { name: "急用金", balance: 60000, monthlyPlan: 2000, targetAmount: 50000 }),
    option(3, { name: "國泰信用卡", kind: "credit", balance: -3500, monthlyPlan: 500 }),
  ];

  describe("suggestLines：建議的每一行（規則跟伺服器同一套 lib/ledger）", () => {
    it("有每月規劃的帳戶照順序一行（入帳帳戶與信用卡不算）；有目標的最多分到目標為止，到了是 0", () => {
      expect(suggestLines(ACCOUNTS, 1, 43000)).toEqual([
        { accountId: 2, suggested: 5000, reason: "target-capped" },
        { accountId: 4, suggested: 3000, reason: "plan" },
        { accountId: 5, suggested: 0, reason: "target-reached" },
      ]);
    });

    it("薪水還沒填（null）_用 0 試算，建議照樣列出來", () => {
      expect(suggestLines(ACCOUNTS, 1, null).map((line) => line.suggested)).toEqual([5000, 3000, 0]);
    });
  });

  describe("salaryPreview：視窗裡即時試算", () => {
    it("沒改過的行用建議的金額；留在入帳帳戶的是薪水減掉分出去的", () => {
      const preview = salaryPreview(ACCOUNTS, 1, "43,000", {});

      expect(preview.lines.map((line) => [line.accountId, line.text, line.amount, line.invalid])).toEqual([
        [2, "5000", 5000, false],
        [4, "3000", 3000, false],
        [5, "0", 0, false],
      ]);
      expect(preview.remainder).toBe(35000);
      expect(preview.blocked).toBe(false);
    });

    it("改過的行用改過的字；清空的行當成不轉（0），不算打錯", () => {
      const preview = salaryPreview(ACCOUNTS, 1, "43000", { 2: "", 4: "8,000" });

      expect(preview.lines.map((line) => [line.text, line.amount, line.invalid])).toEqual([
        ["", 0, false],
        ["8,000", 8000, false],
        ["0", 0, false],
      ]);
      expect(preview.remainder).toBe(35000);
    });

    it.each(["1.5", "-500", "abc", "5,00"])("某一行打了 %j（伺服器不收）_標出那一行、不能送出；那一行不算進剩下的錢", (text) => {
      const preview = salaryPreview(ACCOUNTS, 1, "43000", { 4: text });

      expect(preview.lines.find((line) => line.accountId === 4)).toMatchObject({ text, amount: null, invalid: true });
      expect(preview.remainder).toBe(38000);
      expect(preview.blocked).toBe(true);
    });

    it("分出去的比薪水多_剩下的是負的，不能送出", () => {
      const preview = salaryPreview(ACCOUNTS, 1, "6000", {});

      expect(preview.remainder).toBe(-2000);
      expect(preview.blocked).toBe(true);
    });

    it("薪水還沒填或打錯_剩下的錢等輸入後才試算（null），各行照樣檢查", () => {
      expect(salaryPreview(ACCOUNTS, 1, "", {})).toMatchObject({ remainder: null, blocked: false });
      expect(salaryPreview(ACCOUNTS, 1, "4.5", {}).remainder).toBeNull();
      expect(salaryPreview(ACCOUNTS, 1, "", { 2: "-1" }).blocked).toBe(true);
    });
  });

  describe("salaryStartDate：日期欄位的下限", () => {
    const DATED = ACCOUNTS.map((account) => ({ ...account, startDate: account.id === 4 ? "2026-10-10" : account.id === 5 ? "2026-10-12" : "2026-09-01" }));

    it("入帳帳戶與要轉出去（金額大於 0）的帳戶裡最晚開始記帳的；金額是 0 的不算", () => {
      const preview = salaryPreview(DATED, 1, "43000", {});

      expect(preview.lines.find((line) => line.accountId === 5)?.amount).toBe(0);
      expect(salaryStartDate(DATED, 1, preview.lines)).toBe("2026-10-10");
    });

    it("那一行清空或打錯_不算（不轉）", () => {
      expect(salaryStartDate(DATED, 1, salaryPreview(DATED, 1, "43000", { 4: "" }).lines)).toBe("2026-09-01");
      expect(salaryStartDate(DATED, 1, salaryPreview(DATED, 1, "43000", { 4: "1.5" }).lines)).toBe("2026-09-01");
    });
  });

  describe("salaryFormReducer：薪水、入帳帳戶與改過的金額", () => {
    const state = { receivingId: 1, salaryText: "43000", edits: { 2: "4000" } };

    it("改一行的金額_只記那一行", () => {
      expect(salaryFormReducer(state, { type: "edit", accountId: 4, text: "1000" })).toEqual({ ...state, edits: { 2: "4000", 4: "1000" } });
    });

    it("改薪水_改過的各行留著", () => {
      expect(salaryFormReducer(state, { type: "salary", text: "45,000" })).toEqual({ ...state, salaryText: "45,000" });
    });

    it("換入帳帳戶_建議會跟著變，改過的金額全部清掉（薪水留著）", () => {
      expect(salaryFormReducer({ ...state, edits: { 2: "4000", 4: "1000" } }, { type: "receiving", id: 4 })).toEqual({ receivingId: 4, salaryText: "43000", edits: {} });
    });
  });
});

describe("nextFreeColor：新增用途或分類時預設的顏色", () => {
  it("挑還沒用過的第一個顏色", () => {
    expect(nextFreeColor([])).toBe("blue");
    expect(nextFreeColor(["blue", "teal"])).toBe("green");
  });

  it("灰色留給未分類與未設定用途：其他顏色都用過了也不會挑灰色", () => {
    expect(nextFreeColor(["blue", "teal", "green", "amber", "orange", "rose", "violet"])).not.toBe("slate");
    expect(nextFreeColor(["slate"])).toBe("blue");
  });

  it("七個可以選的顏色都用過了_照數量輪替", () => {
    expect(nextFreeColor([...SELECTABLE_COLORS])).toBe("blue");
    expect(nextFreeColor([...SELECTABLE_COLORS, "blue"])).toBe("teal");
  });
});

describe("latestDate：幾個日期裡最晚的", () => {
  it("略過不知道的（undefined）；都不知道時回 undefined", () => {
    expect(latestDate(["2026-09-01", undefined, "2026-10-14", "2026-10-02"])).toBe("2026-10-14");
    expect(latestDate([undefined])).toBeUndefined();
  });
});

describe("selectableColor：修改時預先選好的顏色", () => {
  it("原本的顏色還能選_用它", () => {
    expect(selectableColor("teal", "blue")).toBe("teal");
  });

  it("以前存成灰色（現在留給未分類，伺服器不收）_改用還沒用過的顏色，不然一儲存就失敗", () => {
    expect(selectableColor("slate", "amber")).toBe("amber");
  });
});

describe("defaultIncomeCategory：發薪分配預設的收入分類", () => {
  const income = (id: number, name: string) => ({ id, name, kind: "income" as const });

  it("有「薪水」就用它，不然用第一個收入分類", () => {
    expect(defaultIncomeCategory([income(3, "獎金"), income(5, "薪水")])).toBe(5);
    expect(defaultIncomeCategory([income(3, "獎金"), { id: 4, name: "薪水", kind: "expense" }])).toBe(3);
  });

  it("沒有收入分類_未分類", () => {
    expect(defaultIncomeCategory([])).toBeUndefined();
  });
});

describe("choosableAccounts：表單裡選得到的帳戶", () => {
  const ACCOUNTS = [
    { id: 1, active: true },
    { id: 2, active: false },
    { id: 3, active: true },
    { id: 4, active: false },
  ];

  it("新的紀錄只列啟用中的", () => {
    expect(choosableAccounts(ACCOUNTS).map((account) => account.id)).toEqual([1, 3]);
  });

  it("修改舊紀錄或固定收支：它原本的帳戶（轉出或轉入）停用了也留著，儲存時才不會默默換掉；其他停用的不列", () => {
    expect(choosableAccounts(ACCOUNTS, 4, null).map((account) => account.id)).toEqual([1, 3, 4]);
    expect(choosableAccounts(ACCOUNTS, 1, 2).map((account) => account.id)).toEqual([1, 2, 3]);
  });
});
