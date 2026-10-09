import { describe, expect, it } from "vitest";
import { accountHref, pickAccount } from "./account-tabs";

const accounts = [{ id: 3 }, { id: 7 }];

describe("pickAccount：網址參數 ?account=<id> 選要看的帳號", () => {
  it("有這個帳號_選它", () => {
    expect(pickAccount(accounts, "7")).toEqual({ id: 7 });
  });

  it("沒給、不是數字、不是自己的帳號（網址被改過）_用第一個", () => {
    expect(pickAccount(accounts, undefined)).toEqual({ id: 3 });
    expect(pickAccount(accounts, "abc")).toEqual({ id: 3 });
    expect(pickAccount(accounts, "99")).toEqual({ id: 3 });
    expect(pickAccount(accounts, ["7", "3"])).toEqual({ id: 3 });
  });

  it("沒有帳號_null", () => {
    expect(pickAccount([], "7")).toBeNull();
  });
});

describe("accountHref", () => {
  it("帶上帳號 id", () => {
    expect(accountHref(7)).toBe("/starrail?account=7");
  });
});
