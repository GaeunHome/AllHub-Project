import { describe, expect, it } from "vitest";
import { cannotTransfer, entryChoiceReducer, entryStartDate, initialEntryChoice, type EntryChoice } from "./entry-choice";

const ACCOUNTS = [
  { id: 1, kind: "deposit" as const },
  { id: 2, kind: "deposit" as const },
  { id: 4, kind: "investment" as const },
  { id: 3, kind: "credit" as const, payFromAccountId: 2 },
  { id: 5, kind: "credit" as const, payFromAccountId: null },
];
const CATEGORIES = [
  { id: 11, kind: "expense" as const },
  { id: 21, kind: "income" as const },
];
const reduce = entryChoiceReducer(ACCOUNTS, CATEGORIES);
const choice = (fields: Partial<EntryChoice>): EntryChoice => ({ kind: "expense", accountId: 1, counterId: 2, categoryId: null, cardPayment: null, ...fields });

describe("換類型", () => {
  it("換到另一種收支_不符合的分類清掉（選到「未分類」）", () => {
    expect(reduce(choice({ categoryId: 11 }), { type: "kind", kind: "income" })).toMatchObject({ kind: "income", categoryId: null });
  });

  it("分類還是同一種收支（例如轉帳再換回支出前沒動）_留著", () => {
    expect(reduce(choice({ categoryId: 11 }), { type: "kind", kind: "expense" })).toMatchObject({ kind: "expense", categoryId: 11 });
  });

  it("存款帳戶換成轉帳_照原本的帳戶轉出", () => {
    expect(reduce(choice({}), { type: "kind", kind: "transfer" })).toMatchObject({ kind: "transfer", accountId: 1, counterId: 2 });
  });
});

describe("轉出和轉入撞到同一個帳戶：兩邊對調", () => {
  it("轉出選了轉入的帳戶_轉入換成原本的轉出", () => {
    expect(reduce(choice({ kind: "transfer" }), { type: "account", id: 2 })).toMatchObject({ accountId: 2, counterId: 1 });
  });

  it("轉入選了轉出的帳戶_轉出換成原本的轉入", () => {
    expect(reduce(choice({ kind: "transfer" }), { type: "counter", id: 1 })).toMatchObject({ accountId: 2, counterId: 1 });
  });

  it("選了別的帳戶_另一邊不動", () => {
    expect(reduce(choice({ kind: "transfer" }), { type: "account", id: 4 })).toMatchObject({ accountId: 4, counterId: 2 });
  });
});

describe("繳卡費：信用卡當轉入的帳戶（存款 → 卡）", () => {
  it("從信用卡打開（帳戶是卡）再換成轉帳_轉出是卡的扣款帳戶、轉入是卡", () => {
    expect(reduce(choice({ accountId: 3, counterId: 1 }), { type: "kind", kind: "transfer" })).toMatchObject({ kind: "transfer", accountId: 2, counterId: 3 });
  });

  it("卡沒設扣款帳戶_轉出是第一個存款帳戶", () => {
    expect(reduce(choice({ accountId: 5, counterId: 1 }), { type: "kind", kind: "transfer" })).toMatchObject({ accountId: 1, counterId: 5 });
  });

  it("扣款帳戶不在選項裡（停用了）_改用第一個存款帳戶", () => {
    const reducer = entryChoiceReducer(
      ACCOUNTS.filter((account) => account.id !== 2),
      CATEGORIES,
    );

    expect(reducer(choice({ accountId: 3, counterId: 1 }), { type: "kind", kind: "transfer" })).toMatchObject({ accountId: 1, counterId: 3 });
  });

  it("沒動過轉出與轉入就換回支出_帳戶回到那張卡", () => {
    const transfer = reduce(choice({ accountId: 3, counterId: 1 }), { type: "kind", kind: "transfer" });

    expect(reduce(transfer, { type: "kind", kind: "expense" })).toMatchObject({ kind: "expense", accountId: 3 });
  });

  it("自己改過轉出或轉入再換回支出_照改過的，不再動帳戶", () => {
    const transfer = reduce(choice({ accountId: 3, counterId: 1 }), { type: "kind", kind: "transfer" });
    const edited = reduce(transfer, { type: "account", id: 4 });

    expect(reduce(edited, { type: "kind", kind: "expense" })).toMatchObject({ kind: "expense", accountId: 4 });
  });

  it("只有信用卡（沒有可以扣款的帳戶）_不重排", () => {
    const reducer = entryChoiceReducer([ACCOUNTS[3]], CATEGORIES);

    expect(reducer(choice({ accountId: 3, counterId: undefined }), { type: "kind", kind: "transfer" })).toMatchObject({ accountId: 3, counterId: undefined });
  });
});

describe("打開時的預設", () => {
  it("新的紀錄預設就是轉帳、帳戶是卡_一開始就排成繳卡費", () => {
    expect(initialEntryChoice({ kind: "transfer", accountId: 3, counterAccountId: 1, categoryId: null }, ACCOUNTS, true)).toMatchObject({ accountId: 2, counterId: 3 });
  });

  it("修改舊的轉帳（卡 → 存款，例如退款）_照原本的，不重排", () => {
    expect(initialEntryChoice({ kind: "transfer", accountId: 3, counterAccountId: 1, categoryId: null }, ACCOUNTS, false)).toMatchObject({ accountId: 3, counterId: 1 });
  });
});

describe("cannotTransfer：轉帳要有另一個帳戶可以轉入", () => {
  it("轉帳但沒有轉入的帳戶（只有一個帳戶）_不能送出", () => {
    expect(cannotTransfer(choice({ kind: "transfer", counterId: undefined }))).toBe(true);
  });

  it("兩邊都有帳戶、或不是轉帳_可以", () => {
    expect(cannotTransfer(choice({ kind: "transfer" }))).toBe(false);
    expect(cannotTransfer(choice({ counterId: undefined }))).toBe(false);
  });
});

describe("entryStartDate：日期欄位的下限（帳戶開始記帳之前的日期伺服器不收）", () => {
  const DATED = [
    { id: 1, kind: "deposit" as const, startDate: "2026-09-01" },
    { id: 2, kind: "deposit" as const, startDate: "2026-10-14" },
    { id: 4, kind: "investment" as const },
  ];

  it("收支_看這筆的帳戶", () => {
    expect(entryStartDate(choice({ accountId: 1, counterId: 2 }), DATED)).toBe("2026-09-01");
  });

  it("轉帳_看兩個帳戶裡比較晚開始的", () => {
    expect(entryStartDate(choice({ kind: "transfer", accountId: 1, counterId: 2 }), DATED)).toBe("2026-10-14");
  });

  it("不知道開始的日期（選項沒帶）_沒有下限，交給伺服器檢查", () => {
    expect(entryStartDate(choice({ accountId: 4 }), DATED)).toBeUndefined();
    expect(entryStartDate(choice({ kind: "transfer", accountId: 4, counterId: 1 }), DATED)).toBe("2026-09-01");
  });
});
