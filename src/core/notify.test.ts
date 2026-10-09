import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setupTestDb, insertTestUser } from "@/dev/test-db";
import { expiredTags } from "@/dev/test-helpers";
import { coreNotifications, coreUsers } from "./db/schema";
import { notify } from "./notify";

const getDb = setupTestDb();
const rows = () => getDb().select().from(coreNotifications);
let alice: string;
let bob: string;

beforeEach(async () => {
  alice = await insertTestUser(getDb(), "alice", { role: "owner" });
  bob = await insertTestUser(getDb(), "bob");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("notify（PGlite 整合）", () => {
  it("寫進網站通知：模組 id、種類、標題、內容、連結_一開始是未讀", async () => {
    await notify({
      recipients: [alice],
      module: "twitch",
      kind: "stream_online",
      title: "Alice 開台了",
      body: "今天玩鐵道\n分類：Honkai: Star Rail",
      url: "https://twitch.tv/alice",
    });

    const [row] = await rows();
    expect(row).toMatchObject({
      userId: alice,
      module: "twitch",
      kind: "stream_online",
      title: "Alice 開台了",
      body: "今天玩鐵道\n分類：Honkai: Star Rail",
      url: "https://twitch.tv/alice",
      readAt: null,
    });
    expect(row.createdAt).toBeInstanceOf(Date);
  });

  it("內容與連結可以省略", async () => {
    await notify({ recipients: [alice], module: "starrail", kind: "checkin", title: "星穹鐵道簽到完成" });

    expect(await rows()).toMatchObject([{ body: "", url: null }]);
  });

  it("站內路徑也可以當連結", async () => {
    await notify({ recipients: [alice], module: "youtube", kind: "new_video", title: "新影片", url: "/youtube/watch/abcdefghijk" });

    expect((await rows())[0].url).toBe("/youtube/watch/abcdefghijk");
  });

  it.each(["javascript:alert(1)", "//evil.example/x", "data:text/html,hi", "ftp://example.com/x", "/\\evil.example"])(
    "不安全的連結（%s）不存，畫面上才不會變成可點的危險連結",
    async (url) => {
      await notify({ recipients: [alice], module: "youtube", kind: "new_video", title: "新影片", url });

      expect((await rows())[0].url).toBeNull();
    },
  );

  it.each([
    ["沒有模組 id", { module: "", kind: "x", title: "t" }],
    ["模組 id 格式不對", { module: "Twitch Module", kind: "x", title: "t" }],
    ["沒有標題", { module: "twitch", kind: "x", title: " " }],
    ["沒有種類", { module: "twitch", kind: "", title: "t" }],
  ])("%s_丟錯（呼叫端的程式錯誤），不寫入", async (_name, input) => {
    await expect(notify({ recipients: [alice], ...input })).rejects.toThrow();
    expect(await rows()).toHaveLength(0);
  });

  it("停用的帳號（凍結）不寫通知，其他收件人照常；恢復後照常收到", async () => {
    await getDb().update(coreUsers).set({ disabledAt: new Date() }).where(eq(coreUsers.id, bob));

    await notify({ recipients: [alice, bob], module: "twitch", kind: "stream_online", title: "Alice 開台了" });
    expect((await rows()).map((row) => row.userId)).toEqual([alice]);

    await getDb().update(coreUsers).set({ disabledAt: null }).where(eq(coreUsers.id, bob));
    await notify({ recipients: [bob], module: "twitch", kind: "stream_online", title: "Alice 又開台了" });
    expect((await rows()).map((row) => row.userId).sort()).toEqual([alice, bob].sort());
  });

  it("收件人全都停用_不寫也不讓通知的快取失效", async () => {
    await getDb().update(coreUsers).set({ disabledAt: new Date() }).where(eq(coreUsers.id, bob));

    await notify({ recipients: [bob], module: "twitch", kind: "stream_online", title: "Alice 開台了" });

    expect(await rows()).toEqual([]);
    expect(expiredTags()).toEqual([]);
  });

  it("寄給每個收件人各一則：user_id 是收件人，重複的 id 只寄一次", async () => {
    await notify({ recipients: [alice, bob, alice], module: "twitch", kind: "stream_online", title: "Alice 開台了" });

    expect((await rows()).map((row) => row.userId).sort()).toEqual([alice, bob].sort());
  });

  it("沒有收件人_什麼都不寫（例如追蹤者都關掉通知）", async () => {
    await notify({ recipients: [], module: "twitch", kind: "stream_online", title: "Alice 開台了" });

    expect(await rows()).toHaveLength(0);
  });

  it("收件人在寄出前刪除了帳號_略過他，其他人照常收到", async () => {
    const gone = await insertTestUser(getDb(), "carol");
    await getDb().execute(sql`delete from core_users where id = ${gone}`);

    await notify({ recipients: [gone, bob], module: "youtube", kind: "new_video", title: "新影片" });

    expect((await rows()).map((row) => row.userId)).toEqual([bob]);
  });

  it("收件人不是使用者 id 的格式_丟錯（呼叫端的程式錯誤），不寫入", async () => {
    await expect(notify({ recipients: [alice, "alice"], module: "twitch", kind: "x", title: "t" })).rejects.toThrow();
    expect(await rows()).toHaveLength(0);
  });

  it("程式、設定與文件都不再有 Discord（測試裡檢查「沒有」的除外）", () => {
    const root = fileURLToPath(new URL("../../", import.meta.url));
    const sources = readdirSync(join(root, "src"), { recursive: true, encoding: "utf8" })
      .filter((file) => /\.(ts|tsx|mjs)$/.test(file) && !/\.test\.tsx?$/.test(file))
      .map((file) => join("src", file));
    const mentions = [...sources, "README.md", "CLAUDE.md", ".env.example", "vercel.json"].filter((file) => /discord/i.test(readFileSync(join(root, file), "utf8")));

    expect(mentions).toEqual([]);
  });

  it("不再呼叫外部服務（Discord Webhook 已移除）", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await notify({ recipients: [alice], module: "twitch", kind: "stream_online", title: "Alice 開台了" });

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
