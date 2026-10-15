import { describe, expect, it } from "vitest";
import { pickAccount, pickOtherAccount } from "./last-used";

const ACCOUNTS = [{ id: 3 }, { id: 5 }, { id: 8 }];

describe("pickAccount：記帳視窗預設帶入的帳戶", () => {
  it("依序用第一個還在清單裡的（從帳戶卡片帶入的優先，再來是上次用的）", () => {
    expect(pickAccount(ACCOUNTS, 8, 5)).toBe(8);
    expect(pickAccount(ACCOUNTS, undefined, 5)).toBe(5);
  });

  it("上次用的帳戶已經停用或刪除（不在清單裡）_改用清單的第一個", () => {
    expect(pickAccount(ACCOUNTS, 99)).toBe(3);
    expect(pickAccount(ACCOUNTS, null, 0)).toBe(3);
  });

  it("還沒有任何帳戶_回 undefined", () => {
    expect(pickAccount([], 5)).toBeUndefined();
  });
});

describe("pickOtherAccount：轉帳的另一邊不能跟轉出的同一個", () => {
  it("上次轉入的帳戶還在、也不是轉出的帳戶_用它", () => {
    expect(pickOtherAccount(ACCOUNTS, 3, 8)).toBe(8);
  });

  it("上次轉入的剛好是這次轉出的_改用清單裡第一個不同的", () => {
    expect(pickOtherAccount(ACCOUNTS, 3, 3)).toBe(5);
    expect(pickOtherAccount(ACCOUNTS, 5)).toBe(3);
  });

  it("只有一個帳戶_沒有可以轉入的", () => {
    expect(pickOtherAccount([{ id: 3 }], 3)).toBeUndefined();
  });
});
