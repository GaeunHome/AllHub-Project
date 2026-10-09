import { describe, expect, it, vi } from "vitest";

// 包一層計數器，確認「帳號不存在」時也真的跑了一次 scrypt
const scryptCalls = vi.hoisted(() => ({ count: 0 }));
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  const counted = (...args: unknown[]) => {
    scryptCalls.count++;
    return (actual.scrypt as (...a: unknown[]) => void)(...args);
  };
  return { ...actual, scrypt: counted };
});

const {
  DEFAULT_SCRYPT,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  hashPassword,
  needsRehash,
  newPasswordProblem,
  normalizeUsername,
  passwordProblem,
  usernameProblem,
  verifyPassword,
  weakPasswordProblem,
} = await import("./credentials");

// 測試用低成本參數，只有確認預設值的測試才用正式參數
const FAST = { N: 1024, r: 8, p: 1 };
const PASSWORD = "correct horse battery";

describe("hashPassword", () => {
  it("雜湊字串帶演算法與參數（scrypt$N$r$p$salt$hash）_每次的 salt 都不同", async () => {
    const a = await hashPassword(PASSWORD, FAST);
    const b = await hashPassword(PASSWORD, FAST);

    expect(a).toMatch(/^scrypt\$1024\$8\$1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$/);
    expect(a.split("$")[4]).not.toBe(b.split("$")[4]);
    expect(a).not.toBe(b);
    expect(a).not.toContain(PASSWORD);
  });

  it("預設參數寫進字串_記憶體需求超過 Node 預設 maxmem（32 MiB）也能雜湊與驗證", async () => {
    const stored = await hashPassword(PASSWORD);
    const [, N, r, p] = stored.split("$");

    expect({ N: Number(N), r: Number(r), p: Number(p) }).toEqual(DEFAULT_SCRYPT);
    expect(128 * DEFAULT_SCRYPT.N * DEFAULT_SCRYPT.r).toBeGreaterThanOrEqual(32 * 1024 * 1024);
    expect(await verifyPassword(PASSWORD, stored)).toBe(true);
  });
});

describe("verifyPassword", () => {
  it("密碼正確才通過", async () => {
    const stored = await hashPassword(PASSWORD, FAST);

    expect(await verifyPassword(PASSWORD, stored)).toBe(true);
    expect(await verifyPassword("correct horse batterY", stored)).toBe(false);
    expect(await verifyPassword("", stored)).toBe(false);
  });

  it("用雜湊字串裡記的參數驗證_之後調整預設參數，舊的雜湊照樣能登入", async () => {
    const stored = await hashPassword(PASSWORD, { N: 2048, r: 4, p: 2 });

    expect(stored.startsWith("scrypt$2048$4$2$")).toBe(true);
    expect(await verifyPassword(PASSWORD, stored)).toBe(true);
  });

  it("先做 Unicode NFKC 正規化_組合字元與預組字元視為同一個密碼", async () => {
    const stored = await hashPassword("café-au-lait-1", FAST);

    expect(await verifyPassword("café-au-lait-1", stored)).toBe(true);
  });

  it.each([
    ["空字串", ""],
    ["別的演算法", "bcrypt$2b$10$abcdefghijklmnopqrstuv"],
    ["欄位不夠", "scrypt$1024$8$1$c2FsdA"],
    ["參數不是數字", "scrypt$abc$8$1$c2FsdHNhbHRzYWx0c2FsdA$aGFzaA"],
    ["hash 是空的", "scrypt$1024$8$1$c2FsdHNhbHRzYWx0c2FsdA$"],
  ])("雜湊字串格式不對（%s）_回 false 不丟錯", async (_name, stored) => {
    await expect(verifyPassword(PASSWORD, stored)).resolves.toBe(false);
  });

  it.each([
    ["N 不是 2 的次方", "scrypt$1000$8$1$c2FsdHNhbHRzYWx0c2FsdA$aGFzaGhhc2hoYXNoaGFzaA"],
    ["N 大到會吃光記憶體", "scrypt$1073741824$8$1$c2FsdHNhbHRzYWx0c2FsdA$aGFzaGhhc2hoYXNoaGFzaA"],
    ["r 是 0", "scrypt$1024$0$1$c2FsdHNhbHRzYWx0c2FsdA$aGFzaGhhc2hoYXNoaGFzaA"],
    ["p 太大", "scrypt$1024$8$999$c2FsdHNhbHRzYWx0c2FsdA$aGFzaGhhc2hoYXNoaGFzaA"],
  ])("參數超出合理範圍（%s）_回 false，不會照著跑", async (_name, stored) => {
    await expect(verifyPassword(PASSWORD, stored)).resolves.toBe(false);
  });

  it("沒有雜湊（帳號不存在）_一樣跑一次 scrypt 再回 false，回應時間才不會透露帳號是否存在", async () => {
    scryptCalls.count = 0;

    expect(await verifyPassword(PASSWORD, null)).toBe(false);
    expect(scryptCalls.count).toBe(1);
  });

  it("雜湊格式壞掉_也跑一次 scrypt 再回 false", async () => {
    scryptCalls.count = 0;

    expect(await verifyPassword(PASSWORD, "scrypt$broken")).toBe(false);
    expect(scryptCalls.count).toBe(1);
  });
});

describe("needsRehash", () => {
  it("用目前預設參數雜湊的_不必重算", async () => {
    expect(needsRehash(await hashPassword(PASSWORD, FAST), FAST)).toBe(false);
  });

  it("參數跟目前預設不同或格式壞掉_要重算", async () => {
    expect(needsRehash(await hashPassword(PASSWORD, FAST))).toBe(true);
    expect(needsRehash("scrypt$broken")).toBe(true);
  });
});

describe("passwordProblem", () => {
  it("至少 12 個字元", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(12);
    expect(passwordProblem("a".repeat(11))).toBe("密碼至少 12 個字元");
    expect(passwordProblem("a".repeat(12))).toBeNull();
  });

  it("字數以字元計算_中文與 emoji 一個算一個", () => {
    expect(passwordProblem("密碼密碼密碼密碼密碼密碼")).toBeNull();
    expect(passwordProblem("🌸".repeat(11))).toBe("密碼至少 12 個字元");
  });

  it("太長的密碼擋下", () => {
    expect(passwordProblem("a".repeat(PASSWORD_MAX_LENGTH))).toBeNull();
    expect(passwordProblem("a".repeat(PASSWORD_MAX_LENGTH + 1))).toBe(`密碼最多 ${PASSWORD_MAX_LENGTH} 個字元`);
  });
});

describe("weakPasswordProblem：常見弱密碼與帳號名稱", () => {
  const COMMON = "這個密碼太常見，容易被猜到，請換一個";
  const REPEATED = "密碼不能只是同一段字重複，請換一個";
  const HAS_USERNAME = "密碼不能包含帳號名稱";

  it.each(["password1234", "Password1234", "123456789012", "qwerty123456", "1q2w3e4r5t6y", "iloveyou1234", "correct horse battery staple", "correcthorsebatterystaple"])(
    "內建清單裡的常見密碼（%s）_擋下",
    (password) => {
      expect(weakPasswordProblem(password)).toBe(COMMON);
    },
  );

  it("比對前先正規化：全形與大小寫不同也算同一個常見密碼", () => {
    expect(weakPasswordProblem("ＰＡＳＳＷＯＲＤ１２３４")).toBe(COMMON);
    expect(weakPasswordProblem("QWERTY123456")).toBe(COMMON);
  });

  it.each(["aaaaaaaaaaaa", "abcabcabcabc", "qwertyqwerty", "121212121212", "密碼密碼密碼密碼密碼密碼"])("同一小段重複（%s）_擋下", (password) => {
    expect(weakPasswordProblem(password)).toBe(REPEATED);
  });

  it("包含帳號名稱（不分大小寫、全形也算）_擋下", () => {
    expect(weakPasswordProblem("Alice-loves-green-tea", "alice")).toBe(HAS_USERNAME);
    expect(weakPasswordProblem("my ＡＬＩＣＥ 2026 key", "alice")).toBe(HAS_USERNAME);
  });

  it("不常見、沒有重複、也不含帳號名稱_可以", () => {
    expect(weakPasswordProblem("plum blossom 2026", "alice")).toBeNull();
    expect(weakPasswordProblem("correct horse battery")).toBeNull();
    expect(weakPasswordProblem("a long walk to tamsui")).toBeNull();
  });
});

describe("newPasswordProblem：設定新密碼時的完整規則（長度＋弱密碼＋帳號名稱）", () => {
  it("先檢查長度", () => {
    expect(newPasswordProblem("alice", "alice")).toBe("密碼至少 12 個字元");
    expect(newPasswordProblem("a".repeat(PASSWORD_MAX_LENGTH + 1), "bob")).toBe(`密碼最多 ${PASSWORD_MAX_LENGTH} 個字元`);
  });

  it("長度夠再檢查常見密碼與帳號名稱", () => {
    expect(newPasswordProblem("password1234", "bob")).toBe("這個密碼太常見，容易被猜到，請換一個");
    expect(newPasswordProblem("bob-the-builder-26", "bob")).toBe("密碼不能包含帳號名稱");
    expect(newPasswordProblem("plum blossom 2026", "bob")).toBeNull();
  });
});

describe("帳號規則", () => {
  it.each([
    ["  Alice ", "alice"],
    ["ALICE.Wu", "alice.wu"],
    ["ａｌｉｃｅ", "alice"],
  ])("normalizeUsername(%j) → %s：存小寫", (input, expected) => {
    expect(normalizeUsername(input)).toBe(expected);
  });

  it.each(["abc", "alice_01", "a.b-c", "x".repeat(32), "0123"])("%s：可以", (username) => {
    expect(usernameProblem(username)).toBeNull();
  });

  it.each([
    ["ab", "帳號要 3–32 個字元"],
    ["x".repeat(33), "帳號要 3–32 個字元"],
    ["has space", "帳號只能用英文小寫、數字、底線（_）、點（.）與連字號（-）"],
    ["王小明", "帳號只能用英文小寫、數字、底線（_）、點（.）與連字號（-）"],
    ["Alice", "帳號只能用英文小寫、數字、底線（_）、點（.）與連字號（-）"],
    ["alice@home", "帳號只能用英文小寫、數字、底線（_）、點（.）與連字號（-）"],
  ])("%s：%s", (username, problem) => {
    expect(usernameProblem(username)).toBe(problem);
  });
});
