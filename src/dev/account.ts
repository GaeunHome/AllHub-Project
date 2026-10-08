// 帳號只能從這裡建立（網站公開，網頁註冊可能被搶）；用純 node 執行，所以不能用 @/、相對路徑要寫 .ts、型別一律 import type
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { asc, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { PASSWORD_MIN_LENGTH, USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH, hashPassword, normalizeUsername, passwordProblem, usernameProblem } from "../core/auth/credentials.ts";
import { coreUsers } from "../core/db/schema.ts";
import { errorKind } from "../core/errors.ts";

export type AccountDb = PgDatabase<PgQueryResultHKT>;
export type OpenedDatabase = { db: AccountDb; target: string; close: () => Promise<void> };
export type Connect = (url: string) => Omit<OpenedDatabase, "target">;
export type Prompter = { interactive: boolean; ask(question: string): Promise<string>; askSecret(question: string): Promise<string>; close(): void };
export type AccountDeps = {
  openDatabase: (prompter: Prompter) => Promise<OpenedDatabase>;
  prompter: Prompter;
  stdout: (line: string) => void;
  stderr: (line: string) => void;
};

class CliError extends Error {
  exitCode: number;

  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}

const POSTGRES_PROTOCOLS = ["postgres:", "postgresql:"];
const UNDEFINED_TABLE = "42P01";
const UNIQUE_VIOLATION = "23505";
const CONNECTION_HINT = "請檢查連線字串的主機、port 和密碼（正式資料庫用 Supabase 的 Session pooler，5432 port）。";
const CONNECTION_TIMEOUT = "連線逾時，可能是主機或 port 不對，或網路擋住了";
const NETWORK_UNREACHABLE = "網路連不到這個主機（只有 IPv4 的網路連不到 Supabase 的 Direct connection）";
/** 連線失敗的代碼：Node 的連線錯誤、postgres 套件自己的代碼，以及登入階段的 PostgreSQL 錯誤 */
const CONNECTION_PROBLEMS: Record<string, string> = {
  ECONNREFUSED: "主機拒絕連線，可能是 port 不對或資料庫沒有啟動",
  ENOTFOUND: "找不到這個主機，可能是主機名稱打錯或網路沒有連上",
  EAI_AGAIN: "暫時查不到這個主機，可能是網路沒有連上",
  CONNECT_TIMEOUT: CONNECTION_TIMEOUT,
  ETIMEDOUT: CONNECTION_TIMEOUT,
  ENETUNREACH: NETWORK_UNREACHABLE,
  EHOSTUNREACH: NETWORK_UNREACHABLE,
  ECONNRESET: "連線被中斷",
  "28P01": "帳號或密碼錯誤",
  "28000": "這個帳號不能登入資料庫",
  "3D000": "資料庫不存在",
};
const LIST_HINT = "npm run account -- list 可以列出所有帳號";
const SESSION_POOLER_HINT = "正式資料庫用 Supabase 的 Session pooler（5432 port）連線字串。";
const ENV_EXAMPLES = `  Mac／Linux：DATABASE_URL=… npm run account create
  Windows PowerShell：$env:DATABASE_URL="…"; npm run account create`;
const URL_PROMPT = "資料庫連線字串（正式資料庫用 Supabase 的 Session pooler，5432 port；貼上後按 Enter，不會顯示）：";

const USAGE = `用法：
  npm run account -- create          建立帳號：依提示輸入帳號與密碼（密碼不顯示、要輸入兩次）
  npm run account -- passwd <帳號>   重設密碼，這個帳號在所有裝置上的登入都會失效
  npm run account -- list            列出所有帳號

資料庫連線：有環境變數 DATABASE_URL 就用它（不讀 .env.local）；沒有的話會提示貼上連線字串，輸入時不顯示，也不會留在 shell 的歷史紀錄。
${SESSION_POOLER_HINT}不是互動終端機時，要先設定環境變數：
${ENV_EXAMPLES}
密碼只能在提示出現後輸入，不能寫在命令列。`;

const usageError = (message: string) => new CliError(message, 2);

export async function cli(argv: readonly string[], deps: AccountDeps): Promise<number> {
  const [command, ...args] = argv;
  try {
    switch (command) {
      case "create":
        noArgs(args, command);
        return await withDatabase(deps, (db) => create(db, deps));
      case "passwd": {
        const username = usernameArg(args);
        return await withDatabase(deps, (db) => passwd(db, username, deps));
      }
      case "list":
        noArgs(args, command);
        return await withDatabase(deps, (db) => list(db, deps));
      case "help":
      case "--help":
      case "-h":
        deps.stdout(USAGE);
        return 0;
      default:
        deps.stderr(USAGE);
        return 2;
    }
  } catch (error) {
    const { message, exitCode } = describeError(error);
    deps.stderr(message);
    return exitCode;
  } finally {
    deps.prompter.close();
  }
}

function noArgs(args: readonly string[], command: string) {
  // 多出來的參數可能就是密碼，不回顯
  if (args.length > 0) throw usageError(`${command} 不接受參數；帳號與密碼請在提示出現後輸入，剛才打的內容記得從 shell history 刪掉`);
}

function usernameArg(args: readonly string[]): string {
  if (args.length === 0) throw usageError("請指定帳號，例如 npm run account -- passwd <帳號>");
  if (args.length > 1) throw usageError("密碼不能放在命令列（會留在 shell history），請在提示出現後輸入；剛才打的內容記得從 history 刪掉");
  return normalizeUsername(args[0]);
}

async function withDatabase(deps: AccountDeps, work: (db: AccountDb) => Promise<number>): Promise<number> {
  const opened = await deps.openDatabase(deps.prompter);
  deps.stderr(`資料庫：${opened.target}`);
  try {
    return await work(opened.db);
  } finally {
    await opened.close();
  }
}

async function findUser(db: AccountDb, username: string) {
  const [user] = await db.select({ id: coreUsers.id, username: coreUsers.username }).from(coreUsers).where(eq(coreUsers.username, username));
  return user;
}

async function askNewPassword(prompter: Prompter, label: string): Promise<string> {
  const password = await prompter.askSecret(`${label}（至少 ${PASSWORD_MIN_LENGTH} 個字元，輸入時不會顯示）：`);
  const problem = passwordProblem(password);
  if (problem) throw new CliError(problem);
  if ((await prompter.askSecret(`再輸入一次${label}：`)) !== password) throw new CliError("兩次輸入的密碼不一樣，沒有變更");
  return password;
}

async function create(db: AccountDb, deps: AccountDeps): Promise<number> {
  const username = normalizeUsername(await deps.prompter.ask(`帳號（${USERNAME_MIN_LENGTH}–${USERNAME_MAX_LENGTH} 個字元，英文小寫、數字、_ . -）：`));
  const problem = usernameProblem(username);
  if (problem) throw new CliError(problem);
  const exists = `帳號 ${username} 已經存在；要改密碼請用 npm run account -- passwd ${username}`;
  if (await findUser(db, username)) throw new CliError(exists);

  const password = await askNewPassword(deps.prompter, "密碼");
  try {
    await db.insert(coreUsers).values({ username, passwordHash: await hashPassword(password) });
  } catch (error) {
    // 問密碼的期間別人建立了同名帳號
    if (errorCode(error) === UNIQUE_VIOLATION) throw new CliError(exists);
    throw error;
  }
  deps.stdout(`已建立帳號 ${username}，可以到網站登入了。`);
  return 0;
}

async function passwd(db: AccountDb, username: string, deps: AccountDeps): Promise<number> {
  const user = await findUser(db, username);
  // 名稱可能是誤貼的密碼，找不到時不回顯
  if (!user) throw new CliError(`找不到這個帳號（${LIST_HINT}）`);

  const password = await askNewPassword(deps.prompter, "新密碼");
  await db
    .update(coreUsers)
    // 版本在資料庫裡加一：同時執行也不會少加，舊 cookie 一定失效
    .set({ passwordHash: await hashPassword(password), sessionVersion: sql`${coreUsers.sessionVersion} + 1`, updatedAt: new Date() })
    .where(eq(coreUsers.id, user.id));
  deps.stdout(`已重設 ${user.username} 的密碼；這個帳號在所有裝置上的登入都已失效，請用新密碼重新登入。`);
  return 0;
}

async function list(db: AccountDb, deps: AccountDeps): Promise<number> {
  const rows = await db.select({ username: coreUsers.username }).from(coreUsers).orderBy(asc(coreUsers.username));
  if (rows.length === 0) {
    deps.stderr("還沒有任何帳號，用 npm run account create 建立");
    return 0;
  }
  // stdout 只有帳號名稱，方便接管線；其他說明走 stderr
  for (const row of rows) deps.stdout(row.username);
  deps.stderr(`（共 ${rows.length} 個帳號）`);
  return 0;
}

/** drizzle 把資料庫的錯誤包成 DrizzleQueryError（name 是 Error、沒有 code），原始錯誤在 cause 裡，要往下找 */
function causes(error: unknown): unknown[] {
  const chain: unknown[] = [];
  for (let current = error; current instanceof Object && chain.length < 5; current = (current as { cause?: unknown }).cause) chain.push(current);
  return chain.length > 0 ? chain : [error];
}

function errorCode(error: unknown): string | undefined {
  for (const current of causes(error)) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return undefined;
}

/** 資料庫錯誤的 message 可能夾帶連線字串或 SQL 參數，只說錯誤代碼或種類 */
function describeError(error: unknown): { message: string; exitCode: number } {
  if (error instanceof CliError) return { message: error.message, exitCode: error.exitCode };
  const code = errorCode(error);
  if (code === UNDEFINED_TABLE) return { message: "資料表 core_users 不存在：請先套用 migration（npm run db:migrate，或執行 GitHub Actions 的 db-migrate）", exitCode: 1 };
  if (code && /^(E[A-Z_]+|CONNECT_TIMEOUT|28P01|28000|3D000)$/.test(code)) {
    const problem = CONNECTION_PROBLEMS[code];
    return { message: `連不上資料庫（${code}）${problem ? `：${problem}` : ""}。${CONNECTION_HINT}`, exitCode: 1 };
  }
  return { message: `發生未預期的錯誤（${code ?? errorKind(causes(error).at(-1))}）`, exitCode: 1 };
}

/** 正式資料庫的連線字串用提示輸入：寫在指令前面會連同密碼留在 shell 的歷史紀錄 */
export async function resolveDatabaseUrl(env: Readonly<Record<string, string | undefined>>, prompter: Prompter): Promise<{ url: string; source: string }> {
  if (env.DATABASE_URL) return { url: env.DATABASE_URL, source: "環境變數 DATABASE_URL" };
  // 沒有終端機就沒辦法不顯示地輸入，接管線時 stdin 也不是給連線字串用的
  if (!prompter.interactive) throw new CliError(`沒有設定環境變數 DATABASE_URL，也沒有終端機可以貼上連線字串。請先設定環境變數再執行：\n${ENV_EXAMPLES}\n${SESSION_POOLER_HINT}`);
  const url = (await prompter.askSecret(URL_PROMPT)).trim();
  if (!url) throw new CliError("沒有輸入連線字串，沒有連線資料庫");
  return { url, source: "終端機輸入" };
}

/** 畫面上只顯示主機、port 與資料庫名稱，確認連對地方又不露出帳密 */
export function describeDatabase(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // URL 的錯誤物件帶著原始輸入，不能往外丟
    throw new CliError("資料庫連線字串格式不對（內容不顯示）");
  }
  if (!POSTGRES_PROTOCOLS.includes(parsed.protocol)) throw new CliError("資料庫連線字串要用 postgresql:// 開頭");
  return `${parsed.host}${parsed.pathname}`;
}

export async function openFromEnvironment(env: Readonly<Record<string, string | undefined>>, prompter: Prompter, connect: Connect = connectPostgres): Promise<OpenedDatabase> {
  const { url, source } = await resolveDatabaseUrl(env, prompter);
  const target = `${describeDatabase(url)}（來源：${source}）`;
  return { ...connect(url), target };
}

function connectPostgres(url: string): Omit<OpenedDatabase, "target"> {
  // prepare: false 才能接 Supabase 的 transaction pooler；CLI 只需要一條連線
  const client = postgres(url, { prepare: false, max: 1, connect_timeout: 15, onnotice: () => {} });
  return { db: drizzle(client), close: () => client.end({ timeout: 5 }) };
}

/** 第一次發問才接上 stdin：help 與有 DATABASE_URL 時的 list 不必等鍵盤輸入；密碼與連線字串輸入時把回顯丟掉 */
function terminalPrompter(): Prompter {
  let session: { ask(question: string, secret: boolean): Promise<string>; close(): void } | undefined;
  const interactive = Boolean(process.stdin.isTTY);

  const open = () => {
    let muted = false;
    const output = new Writable({
      write(chunk, encoding, done) {
        if (!muted) process.stderr.write(chunk, encoding);
        done();
      },
    });
    const rl = createInterface({ input: process.stdin, output, terminal: interactive });
    const lines = rl[Symbol.asyncIterator]();
    rl.on("SIGINT", () => rl.close());
    return {
      async ask(question: string, secret: boolean) {
        process.stderr.write(question);
        muted = secret;
        try {
          const { value, done } = await lines.next();
          if (done) throw new CliError("已取消");
          return String(value);
        } finally {
          muted = false;
          // 輸入被丟掉時不會換行；接管線時也沒有回顯
          if (secret || !interactive) process.stderr.write("\n");
        }
      },
      close: () => rl.close(),
    };
  };

  return {
    interactive,
    ask: (question) => (session ??= open()).ask(question, false),
    askSecret: (question) => (session ??= open()).ask(question, true),
    close: () => session?.close(),
  };
}

if (import.meta.main) {
  process.exitCode = await cli(process.argv.slice(2), {
    openDatabase: (prompter) => openFromEnvironment(process.env, prompter),
    prompter: terminalPrompter(),
    stdout: (line) => process.stdout.write(`${line}\n`),
    stderr: (line) => process.stderr.write(`${line}\n`),
  });
}
