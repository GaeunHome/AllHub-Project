import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { DrizzleQueryError, eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { verifyPassword } from "../core/auth/credentials";
import { coreUsers } from "../core/db/schema";
import { cli, describeDatabase, openFromEnvironment, resolveDatabaseUrl, type AccountDeps, type Connect, type Prompter } from "./account";
import { setupTestDb } from "./test-db";

const getDb = setupTestDb();
const PASSWORD = "plum-blossom-2026";
const NEW_PASSWORD = "cherry-blossom-2027";
const ROOT = fileURLToPath(new URL("../../", import.meta.url));

type Asked = { question: string; secret: boolean };

/** 依序回答提問的假終端機；記錄每個問題是否用不顯示的方式輸入；interactive 對應 stdin 是不是 TTY */
function fakeTerminal(answers: string[] = [], interactive = true) {
  const queue = [...answers];
  const asked: Asked[] = [];
  const answer = (question: string, secret: boolean) => {
    asked.push({ question, secret });
    return Promise.resolve(queue.shift() ?? "");
  };
  const prompter: Prompter = { interactive, ask: (q) => answer(q, false), askSecret: (q) => answer(q, true), close: () => {} };
  return { prompter, asked };
}

function harness(answers: string[] = [], options: { open?: AccountDeps["openDatabase"]; interactive?: boolean } = {}) {
  const { prompter, asked } = fakeTerminal(answers, options.interactive);
  const stdout: string[] = [];
  const stderr: string[] = [];
  const close = vi.fn(async () => {});
  const deps: AccountDeps = {
    openDatabase: options.open ?? (async () => ({ db: getDb(), target: "127.0.0.1:5541/postgres（來源：測試）", close })),
    prompter,
    stdout: (line) => stdout.push(line),
    stderr: (line) => stderr.push(line),
  };
  return { run: (...argv: string[]) => cli(argv, deps), asked, stdout, stderr, close, printed: () => [...stdout, ...stderr].join("\n") };
}

const users = () => getDb().select().from(coreUsers).orderBy(coreUsers.username);

/** 查詢時丟出指定錯誤的資料庫 */
const throwingDb = (error: unknown) =>
  ({
    select: () => {
      throw error;
    },
  }) as never;

/** 先佔一個 port 再放掉，連過去就是 ECONNREFUSED（只連本機，不碰外部服務） */
function closedPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function createAccount(username = "alice", password = PASSWORD) {
  const t = harness([username, password, password]);
  expect(await t.run("create")).toBe(0);
  return t;
}

describe("account create", () => {
  it("互動輸入帳號與密碼（密碼不顯示、要輸入兩次）_帳號存小寫、密碼存 scrypt 雜湊", async () => {
    const t = harness(["Alice", PASSWORD, PASSWORD]);

    expect(await t.run("create")).toBe(0);

    const [user] = await users();
    expect(user.username).toBe("alice");
    expect(user.passwordHash.startsWith("scrypt$")).toBe(true);
    expect(user.sessionVersion).toBe(1);
    expect(await verifyPassword(PASSWORD, user.passwordHash)).toBe(true);
    expect(t.asked.map((a) => a.secret)).toEqual([false, true, true]);
    expect(t.printed()).toContain("已建立帳號 alice");
    expect(t.printed()).not.toContain(PASSWORD);
    expect(t.close).toHaveBeenCalledOnce();
  });

  it("先印出要連到哪個資料庫（不含帳密）", async () => {
    const t = await createAccount();

    expect(t.printed()).toContain("127.0.0.1:5541/postgres");
  });

  it("兩次密碼不一樣_不建立", async () => {
    const t = harness(["alice", PASSWORD, `${PASSWORD}x`]);

    expect(await t.run("create")).toBe(1);
    expect(t.printed()).toContain("兩次輸入的密碼不一樣");
    expect(await users()).toHaveLength(0);
  });

  it("密碼太短_不建立", async () => {
    const t = harness(["alice", "short", "short"]);

    expect(await t.run("create")).toBe(1);
    expect(t.printed()).toContain("密碼至少 12 個字元");
    expect(await users()).toHaveLength(0);
  });

  it("帳號格式不對_不問密碼也不建立", async () => {
    const t = harness(["王小明"]);

    expect(await t.run("create")).toBe(1);
    expect(t.printed()).toContain("帳號只能用英文小寫、數字");
    expect(t.asked.filter((a) => a.secret)).toHaveLength(0);
    expect(await users()).toHaveLength(0);
  });

  it("帳號已存在_不覆蓋原本的密碼", async () => {
    await createAccount("alice", PASSWORD);
    const t = harness(["ALICE", NEW_PASSWORD, NEW_PASSWORD]);

    expect(await t.run("create")).toBe(1);
    expect(t.printed()).toContain("帳號 alice 已經存在");
    const [user] = await users();
    expect(await verifyPassword(PASSWORD, user.passwordHash)).toBe(true);
  });

  it("第一個建立的帳號是站長（owner）_之後建立的都是一般成員（member）", async () => {
    const first = await createAccount("alice");
    const second = await createAccount("bob");

    expect((await users()).map((u) => [u.username, u.role])).toEqual([
      ["alice", "owner"],
      ["bob", "member"],
    ]);
    expect(first.printed()).toContain("已建立帳號 alice（站長）");
    expect(second.printed()).toContain("已建立帳號 bob（成員）");
  });

  it("密碼太常見或包含帳號名稱_不建立（跟網站註冊同一套規則）", async () => {
    const common = harness(["alice", "password1234", "password1234"]);
    const withName = harness(["alice", "alice-wonderland-2026", "alice-wonderland-2026"]);

    expect(await common.run("create")).toBe(1);
    expect(await withName.run("create")).toBe(1);

    expect(common.printed()).toContain("這個密碼太常見，容易被猜到，請換一個");
    expect(withName.printed()).toContain("密碼不能包含帳號名稱");
    expect(await users()).toHaveLength(0);
  });

  it("create 不接受命令列參數（密碼不能出現在命令列）_也不回顯參數", async () => {
    const t = harness();

    expect(await t.run("create", "alice", PASSWORD)).toBe(2);
    expect(t.printed()).not.toContain(PASSWORD);
    expect(await users()).toHaveLength(0);
  });
});

describe("account passwd", () => {
  it("重設密碼並遞增 session 版本（所有裝置都要重新登入）", async () => {
    await createAccount();
    const t = harness([NEW_PASSWORD, NEW_PASSWORD]);

    expect(await t.run("passwd", "Alice")).toBe(0);

    const [user] = await users();
    expect(user.sessionVersion).toBe(2);
    expect(await verifyPassword(NEW_PASSWORD, user.passwordHash)).toBe(true);
    expect(await verifyPassword(PASSWORD, user.passwordHash)).toBe(false);
    expect(t.asked.every((a) => a.secret)).toBe(true);
    expect(t.printed()).toContain("已重設 alice 的密碼");
    expect(t.printed()).not.toContain(NEW_PASSWORD);
  });

  it("重設密碼也解除登入鎖定（失敗次數歸零），但不會恢復被站長停用的帳號", async () => {
    await createAccount();
    const disabledAt = new Date("2026-10-01T00:00:00Z");
    await getDb().update(coreUsers).set({ failedLogins: 7, lockedUntil: new Date(Date.now() + 3_600_000), disabledAt });

    expect(await harness([NEW_PASSWORD, NEW_PASSWORD]).run("passwd", "alice")).toBe(0);

    const [user] = await users();
    expect(user.failedLogins).toBe(0);
    expect(user.lockedUntil).toBeNull();
    expect(user.disabledAt).toEqual(disabledAt);
  });

  it("新密碼包含帳號名稱_不變更", async () => {
    await createAccount();
    const t = harness(["alice-in-2027-spring", "alice-in-2027-spring"]);

    expect(await t.run("passwd", "alice")).toBe(1);
    expect(t.printed()).toContain("密碼不能包含帳號名稱");
    expect((await users())[0].sessionVersion).toBe(1);
  });

  it("找不到帳號_不問密碼，也不回顯輸入的名稱（可能是誤貼的密碼）", async () => {
    const t = harness();

    expect(await t.run("passwd", "nobody-typo")).toBe(1);
    expect(t.printed()).toContain("找不到這個帳號");
    expect(t.printed()).not.toContain("nobody-typo");
    expect(t.asked).toHaveLength(0);
  });

  it("兩次密碼不一樣_不變更", async () => {
    await createAccount();
    const t = harness([NEW_PASSWORD, "something-else-1"]);

    expect(await t.run("passwd", "alice")).toBe(1);
    const [user] = await users();
    expect(user.sessionVersion).toBe(1);
    expect(await verifyPassword(PASSWORD, user.passwordHash)).toBe(true);
  });

  it("沒指定帳號_顯示用法", async () => {
    const t = harness();

    expect(await t.run("passwd")).toBe(2);
    expect(t.printed()).toContain("npm run account -- passwd <帳號>");
  });

  it("多帶參數（可能是密碼）_拒絕且不回顯", async () => {
    await createAccount();
    const t = harness();

    expect(await t.run("passwd", "alice", NEW_PASSWORD)).toBe(2);
    expect(t.printed()).not.toContain(NEW_PASSWORD);
    expect(t.printed()).toContain("密碼不能放在命令列");
    expect((await users())[0].sessionVersion).toBe(1);
  });
});

describe("account unlock", () => {
  it("只解除登入鎖定：失敗次數歸零、鎖定期限清掉；不問密碼，密碼雜湊、session 版本與停用狀態都不變", async () => {
    await createAccount();
    const disabledAt = new Date("2026-10-01T00:00:00Z");
    await getDb().update(coreUsers).set({ failedLogins: 5, lockedUntil: new Date(Date.now() + 3_600_000), disabledAt });
    const [before] = await users();
    const t = harness();

    expect(await t.run("unlock", "Alice")).toBe(0);

    const [after] = await users();
    expect(after.passwordHash).toBe(before.passwordHash);
    expect(after.sessionVersion).toBe(before.sessionVersion);
    expect(after.disabledAt).toEqual(disabledAt);
    expect(after.failedLogins).toBe(0);
    expect(after.lockedUntil).toBeNull();
    expect(t.asked).toHaveLength(0);
    expect(t.printed()).toContain("已解除 alice 的登入鎖定");
  });

  it("目前沒有被鎖定_說明沒有鎖定，失敗次數一樣歸零", async () => {
    await createAccount();
    await getDb().update(coreUsers).set({ failedLogins: 3 });
    const t = harness();

    expect(await t.run("unlock", "alice")).toBe(0);

    expect(t.printed()).toContain("alice 目前沒有被鎖定");
    expect((await users())[0].failedLogins).toBe(0);
  });

  it("找不到帳號_不回顯輸入的名稱", async () => {
    const t = harness();

    expect(await t.run("unlock", "nobody-typo")).toBe(1);
    expect(t.printed()).toContain("找不到這個帳號");
    expect(t.printed()).not.toContain("nobody-typo");
  });

  it("沒指定帳號_顯示用法；多帶參數_拒絕且不回顯", async () => {
    await createAccount();
    const missing = harness();
    const extra = harness();

    expect(await missing.run("unlock")).toBe(2);
    expect(await extra.run("unlock", "alice", "s3cr3t-extra")).toBe(2);

    expect(missing.printed()).toContain("npm run account -- unlock <帳號>");
    expect(extra.printed()).not.toContain("s3cr3t-extra");
  });
});

describe("account list", () => {
  it("列出帳號名稱與角色（用 tab 分隔，方便接管線）_不顯示雜湊", async () => {
    await createAccount("bob");
    await createAccount("alice");
    const t = harness();

    expect(await t.run("list")).toBe(0);

    expect(t.stdout).toEqual(["alice\t成員", "bob\t站長"]);
    expect(t.printed()).not.toContain("scrypt$");
  });

  it("被站長停用的帳號_標示已停用", async () => {
    await createAccount("alice");
    await createAccount("bob");
    await getDb().update(coreUsers).set({ disabledAt: new Date() }).where(eq(coreUsers.username, "bob"));
    const t = harness();

    expect(await t.run("list")).toBe(0);

    expect(t.stdout).toEqual(["alice\t站長", "bob\t成員\t已停用"]);
  });

  it("還沒有帳號_提示用 create 建立", async () => {
    const t = harness();

    expect(await t.run("list")).toBe(0);
    expect(t.printed()).toContain("還沒有任何帳號");
  });
});

describe("其他指令與錯誤處理", () => {
  it("help 顯示用法_不連資料庫", async () => {
    const open = vi.fn();
    const t = harness([], { open });

    expect(await t.run("help")).toBe(0);
    expect(t.printed()).toContain("npm run account -- create");
    expect(open).not.toHaveBeenCalled();
  });

  it("help 說明資料庫連線字串怎麼給：環境變數 DATABASE_URL 或依提示貼上，附 Mac／Linux 與 Windows PowerShell 的寫法", async () => {
    const t = harness();

    expect(await t.run("help")).toBe(0);

    const text = t.printed();
    expect(text).toContain("提示貼上");
    expect(text).toContain("Session pooler");
    expect(text).toContain("DATABASE_URL=… npm run account create");
    expect(text).toContain('$env:DATABASE_URL="…"; npm run account create');
  });

  it("help 列出 unlock：只解除登入鎖定、不改密碼", async () => {
    const t = harness();

    expect(await t.run("help")).toBe(0);
    expect(t.printed()).toContain("npm run account -- unlock <帳號>");
    expect(t.printed()).toContain("不改密碼");
  });

  it("不認得的指令_顯示用法、結束代碼 2", async () => {
    expect(await harness().run("register")).toBe(2);
  });

  it("連不上資料庫_只說錯誤代碼_不印連線字串", async () => {
    const error = Object.assign(new Error("connect ECONNREFUSED postgresql://postgres:db-secret@127.0.0.1:5432/postgres"), { code: "ECONNREFUSED" });
    const t = harness([], { open: async () => Promise.reject(error) });

    expect(await t.run("list")).toBe(1);
    expect(t.printed()).toContain("ECONNREFUSED");
    expect(t.printed()).not.toContain("db-secret");
  });

  it("執行中發生未預期的錯誤_只說錯誤種類_仍會關閉連線", async () => {
    const close = vi.fn(async () => {});
    const broken = {
      select: () => {
        throw Object.assign(new Error("query failed: password_hash=scrypt$secret"), { name: "DrizzleQueryError" });
      },
    };
    const t = harness([], { open: async () => ({ db: broken as never, target: "x", close }) });

    expect(await t.run("list")).toBe(1);
    expect(t.printed()).toContain("DrizzleQueryError");
    expect(t.printed()).not.toContain("scrypt$secret");
    expect(close).toHaveBeenCalledOnce();
  });

  it("連不上資料庫（實際用 postgres 連到沒有開的 port）_說明主機拒絕連線並提示檢查主機、port 和密碼，不回顯連線字串", async () => {
    const port = await closedPort();
    const url = `postgresql://postgres:s3cr3t-pass@127.0.0.1:${port}/postgres`;
    const t = harness([], { open: (prompter) => openFromEnvironment({ DATABASE_URL: url }, prompter) });

    expect(await t.run("list")).toBe(1);

    const text = t.printed();
    expect(text).toContain("連不上資料庫（ECONNREFUSED）");
    expect(text).toContain("請檢查連線字串的主機、port 和密碼");
    expect(text).not.toContain("未預期");
    expect(text).not.toContain("s3cr3t-pass");
    expect(text).not.toContain(url);
  });

  // drizzle 把資料庫的錯誤包成 DrizzleQueryError（name 是 Error、沒有 code），原始錯誤放在 cause 裡
  it.each([
    ["主機拒絕連線", { code: "ECONNREFUSED", message: "connect ECONNREFUSED 127.0.0.1:5432" }, "主機拒絕連線"],
    ["找不到主機", { code: "ENOTFOUND", message: "getaddrinfo ENOTFOUND db.s3cr3t.example" }, "找不到這個主機"],
    ["密碼錯誤", { code: "28P01", message: 'password authentication failed for user "postgres.s3cr3t"', name: "PostgresError" }, "密碼錯誤"],
    ["連線逾時", { code: "CONNECT_TIMEOUT", message: "write CONNECT_TIMEOUT db.s3cr3t.example:5432" }, "連線逾時"],
  ])("連不上資料庫（%s，drizzle 包過的錯誤）_用中文說明原因並提示檢查主機、port 和密碼，不回顯原文", async (_name, cause, reason) => {
    const error = new DrizzleQueryError('select "username" from "core_users"', ["s3cr3t-param"], Object.assign(new Error(cause.message), cause));
    const t = harness([], { open: async () => ({ db: throwingDb(error), target: "x", close: async () => {} }) });

    expect(await t.run("list")).toBe(1);

    const text = t.printed();
    expect(text).toContain(`連不上資料庫（${cause.code}）`);
    expect(text).toContain(reason);
    expect(text).toContain("請檢查連線字串的主機、port 和密碼");
    expect(text).not.toContain("未預期");
    expect(text).not.toContain("s3cr3t");
  });

  it("資料表不存在（drizzle 包過的錯誤）_一樣提示先 migrate", async () => {
    const error = new DrizzleQueryError('select "username" from "core_users"', [], Object.assign(new Error('relation "core_users" does not exist'), { code: "42P01" }));
    const t = harness([], { open: async () => ({ db: throwingDb(error), target: "x", close: async () => {} }) });

    expect(await t.run("list")).toBe(1);
    expect(t.printed()).toContain("migration");
  });

  it("問密碼的期間別人建立了同名帳號（drizzle 包過的錯誤）_說帳號已經存在", async () => {
    const duplicate = new DrizzleQueryError('insert into "core_users"', [], Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505" }));
    const db = {
      select: () => ({ from: () => ({ where: async () => [] }) }),
      insert: () => ({
        values: async () => {
          throw duplicate;
        },
      }),
    };
    const t = harness(["alice", PASSWORD, PASSWORD], { open: async () => ({ db: db as never, target: "x", close: async () => {} }) });

    expect(await t.run("create")).toBe(1);
    expect(t.printed()).toContain("帳號 alice 已經存在");
  });

  it("資料表不存在（還沒套用 migration）_提示先 migrate", async () => {
    const t = harness([], {
      open: async () => ({
        db: {
          select: () => {
            throw Object.assign(new Error('relation "core_users" does not exist'), { code: "42P01" });
          },
        } as never,
        target: "x",
        close: async () => {},
      }),
    });

    expect(await t.run("list")).toBe(1);
    expect(t.printed()).toContain("migration");
  });
});

describe("resolveDatabaseUrl", () => {
  const URL_A = "postgresql://u:pa55@127.0.0.1:5433/postgres";
  const URL_B = "postgresql://u:pa55@pooler.example.com:5432/postgres";

  it("優先用環境變數 DATABASE_URL_不提示輸入", async () => {
    const { prompter, asked } = fakeTerminal([URL_B]);

    expect(await resolveDatabaseUrl({ DATABASE_URL: URL_A }, prompter)).toEqual({ url: URL_A, source: "環境變數 DATABASE_URL" });
    expect(asked).toEqual([]);
  });

  it("環境變數只有 MIGRATION_DATABASE_URL_不拿來用，改成提示貼上（不顯示、說明要用 Session pooler 5432），去掉前後空白", async () => {
    const { prompter, asked } = fakeTerminal([`  ${URL_B}  `]);

    expect(await resolveDatabaseUrl({ MIGRATION_DATABASE_URL: URL_A }, prompter)).toEqual({ url: URL_B, source: "終端機輸入" });
    expect(asked).toHaveLength(1);
    expect(asked[0].secret).toBe(true);
    expect(asked[0].question).toContain("Session pooler");
    expect(asked[0].question).toContain("5432");
  });

  it("DATABASE_URL 是空字串_視同沒設定，提示貼上", async () => {
    const { prompter, asked } = fakeTerminal([URL_B]);

    expect(await resolveDatabaseUrl({ DATABASE_URL: "" }, prompter)).toEqual({ url: URL_B, source: "終端機輸入" });
    expect(asked).toHaveLength(1);
  });

  it("沒有環境變數、stdin 不是 TTY_不提示，報錯並列出 Mac／Linux 與 Windows PowerShell 的寫法", async () => {
    const { prompter, asked } = fakeTerminal([URL_B], false);

    const error = await resolveDatabaseUrl({}, prompter).then(
      () => undefined,
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message).toContain("DATABASE_URL=… npm run account create");
    expect(message).toContain('$env:DATABASE_URL="…"; npm run account create');
    expect(message).toContain("Session pooler");
    expect(asked).toEqual([]);
  });

  it.each(["", "   "])("輸入空字串（%j）_報錯", async (answer) => {
    const { prompter } = fakeTerminal([answer]);

    await expect(resolveDatabaseUrl({}, prompter)).rejects.toThrow("沒有輸入連線字串");
  });
});

describe("openFromEnvironment（npm run account 實際的連線方式）", () => {
  const SUPABASE = "postgresql://postgres.ref:s3cr3t-pass@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres";
  const SHOWN = "資料庫：aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres";

  function fakeConnect() {
    const close = vi.fn(async () => {});
    const connect = vi.fn<Connect>(() => ({ db: getDb(), close }));
    return { connect, close };
  }

  it("沒有環境變數、是 TTY_create 先提示貼上連線字串，用輸入的值連線並印出主機（不含帳密），再問帳號密碼", async () => {
    const { connect, close } = fakeConnect();
    const t = harness([SUPABASE, "alice", PASSWORD, PASSWORD], { open: (prompter) => openFromEnvironment({}, prompter, connect) });

    expect(await t.run("create")).toBe(0);

    expect(connect).toHaveBeenCalledOnce();
    expect(connect).toHaveBeenCalledWith(SUPABASE);
    expect(t.asked.map((a) => a.secret)).toEqual([true, false, true, true]);
    expect(t.asked[0].question).toContain("Session pooler");
    expect(t.printed()).toContain(SHOWN);
    expect(t.printed()).not.toContain("s3cr3t");
    expect((await users()).map((u) => u.username)).toEqual(["alice"]);
    expect(close).toHaveBeenCalledOnce();
  });

  it("沒有環境變數、是 TTY_passwd 與 list 也一樣先提示貼上連線字串", async () => {
    await createAccount();
    const { connect } = fakeConnect();
    const open: AccountDeps["openDatabase"] = (prompter) => openFromEnvironment({}, prompter, connect);
    const passwd = harness([SUPABASE, NEW_PASSWORD, NEW_PASSWORD], { open });
    const list = harness([SUPABASE], { open });

    expect(await passwd.run("passwd", "alice")).toBe(0);
    expect(await list.run("list")).toBe(0);

    expect(connect.mock.calls).toEqual([[SUPABASE], [SUPABASE]]);
    expect(passwd.asked.map((a) => a.secret)).toEqual([true, true, true]);
    expect(await verifyPassword(NEW_PASSWORD, (await users())[0].passwordHash)).toBe(true);
    expect(list.asked).toHaveLength(1);
    expect(list.stdout).toEqual(["alice\t站長"]);
    expect(list.printed()).toContain(SHOWN);
  });

  it("沒有環境變數、stdin 不是 TTY_create／passwd／list 都報錯（列出兩種寫法），不連線、不提問", async () => {
    const { connect } = fakeConnect();

    for (const argv of [["create"], ["passwd", "alice"], ["list"]]) {
      const t = harness([SUPABASE, "alice", PASSWORD, PASSWORD], { interactive: false, open: (prompter) => openFromEnvironment({}, prompter, connect) });

      expect(await t.run(...argv)).toBe(1);
      expect(t.printed()).toContain("DATABASE_URL=… npm run account create");
      expect(t.printed()).toContain('$env:DATABASE_URL="…"; npm run account create');
      expect(t.asked).toEqual([]);
    }
    expect(connect).not.toHaveBeenCalled();
    expect(await users()).toHaveLength(0);
  });

  it("輸入空字串_報錯，不連線也不問帳號密碼", async () => {
    const { connect } = fakeConnect();
    const t = harness(["", "alice", PASSWORD, PASSWORD], { open: (prompter) => openFromEnvironment({}, prompter, connect) });

    expect(await t.run("create")).toBe(1);

    expect(t.printed()).toContain("沒有輸入連線字串");
    expect(t.asked).toHaveLength(1);
    expect(connect).not.toHaveBeenCalled();
    expect(await users()).toHaveLength(0);
  });

  it("有環境變數 DATABASE_URL_照舊直接使用，不是 TTY 也不提示", async () => {
    const { connect } = fakeConnect();
    const t = harness([], { interactive: false, open: (prompter) => openFromEnvironment({ DATABASE_URL: SUPABASE }, prompter, connect) });

    expect(await t.run("list")).toBe(0);

    expect(connect).toHaveBeenCalledWith(SUPABASE);
    expect(t.asked).toEqual([]);
    expect(t.printed()).toContain(SHOWN);
    expect(t.printed()).not.toContain("s3cr3t");
  });

  it("連線字串格式不對（環境變數或貼上的）_不連線、不回顯原文", async () => {
    const { connect } = fakeConnect();
    const fromEnv = harness([], { open: (prompter) => openFromEnvironment({ DATABASE_URL: "mysql://u:s3cr3t@host/db" }, prompter, connect) });
    const typed = harness(["not a url s3cr3t"], { open: (prompter) => openFromEnvironment({}, prompter, connect) });

    expect(await fromEnv.run("list")).toBe(1);
    expect(await typed.run("list")).toBe(1);

    expect(connect).not.toHaveBeenCalled();
    expect(fromEnv.printed()).not.toContain("s3cr3t");
    expect(typed.printed()).not.toContain("s3cr3t");
  });
});

describe("連線字串不完整（複製時中間斷行）", () => {
  const FIRST_LINE = "postgresql://postgres.ref:s3cr3t-pass@aws-0-ap-northeast-1";
  const REST = ".pooler.supabase.com:5432/postgres";
  const INCOMPLETE = "連線字串不完整，可能複製時中間斷行了";

  function fakeConnect() {
    return vi.fn<Connect>(() => ({ db: getDb(), close: async () => {} }));
  }

  it("貼上時在主機名稱中間斷行（剩下的一段會被當成帳號）_直接報錯，不再問帳號，也不連線", async () => {
    const connect = fakeConnect();
    const t = harness([FIRST_LINE, REST, PASSWORD, PASSWORD], { open: (prompter) => openFromEnvironment({}, prompter, connect) });

    expect(await t.run("create")).toBe(1);

    expect(t.printed()).toContain(INCOMPLETE);
    expect(t.printed()).not.toContain("帳號要");
    expect(t.printed()).not.toContain("s3cr3t");
    expect(t.asked).toHaveLength(1);
    expect(connect).not.toHaveBeenCalled();
    expect(await users()).toHaveLength(0);
  });

  it.each([
    ["缺資料庫名稱（在 port 後面斷行）", "postgresql://postgres.ref:s3cr3t-pass@aws-0-ap-northeast-1.pooler.supabase.com:5432"],
    ["只有斜線沒有資料庫名稱", "postgresql://postgres.ref:s3cr3t-pass@aws-0-ap-northeast-1.pooler.supabase.com:5432/"],
    ["缺 port", "postgresql://postgres.ref:s3cr3t-pass@aws-0-ap-northeast-1.pooler.supabase.com/postgres"],
  ])("%s_一樣直接報錯，不回顯原文", async (_name, url) => {
    const connect = fakeConnect();
    const typed = harness([url, "alice"], { open: (prompter) => openFromEnvironment({}, prompter, connect) });
    const fromEnv = harness([], { open: (prompter) => openFromEnvironment({ DATABASE_URL: url }, prompter, connect) });

    expect(await typed.run("list")).toBe(1);
    expect(await fromEnv.run("list")).toBe(1);

    for (const t of [typed, fromEnv]) {
      expect(t.printed()).toContain(INCOMPLETE);
      expect(t.printed()).not.toContain("s3cr3t");
    }
    expect(typed.asked).toHaveLength(1);
    expect(connect).not.toHaveBeenCalled();
  });
});

describe("describeDatabase", () => {
  it("只顯示主機、port 與資料庫名稱_不含帳號密碼", () => {
    const shown = describeDatabase("postgresql://postgres.ref:s3cr3t-pass@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres");

    expect(shown).toBe("aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres");
    expect(shown).not.toContain("s3cr3t");
  });

  it("不是有效的連線字串_錯誤訊息不回顯原文", () => {
    expect(() => describeDatabase("mysql://user:s3cr3t@host/db")).toThrow();
    try {
      describeDatabase("not a url s3cr3t");
    } catch (error) {
      expect(String(error)).not.toContain("s3cr3t");
    }
  });
});

describe("用 Node 直接執行", () => {
  it("npm run account 指到這個檔案", () => {
    const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { scripts: Record<string, string> };

    expect(pkg.scripts.account).toContain("src/dev/account.ts");
  });

  it("不經過建置、不用 @/ 路徑別名，純 node 就能載入（與網站共用 core 的雜湊實作）", () => {
    const result = spawnSync(process.execPath, ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "src/dev/account.ts", "help"], {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, DATABASE_URL: "" },
      timeout: 30_000,
    });

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("npm run account -- create");
  });

  it("沒有 DATABASE_URL、stdin 不是終端機_list 直接報錯並列出兩種寫法，不讀別的地方的連線字串", () => {
    const result = spawnSync(process.execPath, ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "src/dev/account.ts", "list"], {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, DATABASE_URL: "" },
      timeout: 30_000,
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("DATABASE_URL=… npm run account create");
    expect(result.stderr).toContain('$env:DATABASE_URL="…"; npm run account create');
    expect(result.stderr).not.toContain("資料庫：");
  });

  it("CLI 用到的 core 檔案只 import node 內建模組與套件（純 node 不認得 @/ 與省略副檔名）", () => {
    for (const file of [
      "src/dev/account.ts",
      "src/core/auth/credentials.ts",
      "src/core/auth/password-rules.ts",
      "src/core/auth/common-passwords.ts",
      "src/core/db/schema.ts",
      "src/core/errors.ts",
    ]) {
      const source = readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
      const specs = [...source.matchAll(/\bfrom\s+["']([^"']+)["']/g)].map((m) => m[1]);
      const bad = specs.filter((spec) => spec.startsWith("@/") || (spec.startsWith(".") && !spec.endsWith(".ts")));
      expect(bad, file).toEqual([]);
    }
  });
});

describe("帳號資料", () => {
  it("passwd 的 session 版本遞增是在資料庫裡做（不會因同時執行而少加）", async () => {
    await createAccount();
    await Promise.all([harness([NEW_PASSWORD, NEW_PASSWORD]).run("passwd", "alice"), harness([PASSWORD, PASSWORD]).run("passwd", "alice")]);

    const [user] = await getDb().select().from(coreUsers).where(eq(coreUsers.username, "alice"));
    expect(user.sessionVersion).toBe(3);
  });
});
