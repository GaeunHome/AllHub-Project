import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setupTestDb, insertTestUser } from "@/dev/test-db";
import { expiredTags } from "@/dev/test-helpers";
import { coreNotifications, coreUsers } from "./db/schema";
import { notifiedSince, notify } from "./notify";

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

  it("不再呼叫外部服務（Discord Webhook 已移除）", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await notify({ recipients: [alice], module: "twitch", kind: "stream_online", title: "Alice 開台了" });

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("notifiedSince：模組決定要不要再寄之前，查這個人某個時間之後有沒有收過同一種通知（PGlite 整合）", () => {
  const AT = new Date("2026-10-08T04:00:00Z");
  const query = { module: "starrail", kind: "redeem_cookie", since: new Date("2026-10-01T04:00:00Z") };
  async function sentTo(userId: string, overrides: { module?: string; kind?: string; url?: string } = {}) {
    await notify({ recipients: [userId], module: overrides.module ?? "starrail", kind: overrides.kind ?? "redeem_cookie", title: "自動兌換失敗", url: overrides.url ?? "/starrail?account=1" });
    await getDb().update(coreNotifications).set({ createdAt: AT });
  }

  it("只算這個人自己的通知：別人收過的不算", async () => {
    await sentTo(bob);

    expect(await notifiedSince({ userId: alice, ...query })).toBe(false);
    expect(await notifiedSince({ userId: bob, ...query })).toBe(true);
  });

  it("模組與種類都要一樣才算", async () => {
    await sentTo(alice, { kind: "redeem" });
    await sentTo(alice, { module: "twitch" });

    expect(await notifiedSince({ userId: alice, ...query })).toBe(false);
  });

  it("since 之後收到的才算（剛好在 since 那一刻的不算）", async () => {
    await sentTo(alice);

    expect(await notifiedSince({ userId: alice, ...query, since: new Date(AT.getTime() - 1) })).toBe(true);
    expect(await notifiedSince({ userId: alice, ...query, since: AT })).toBe(false);
  });

  it("給了 url 時只算連到同一個地方的（例如同一個遊戲帳號）", async () => {
    await sentTo(alice, { url: "/starrail?account=1" });

    expect(await notifiedSince({ userId: alice, ...query, url: "/starrail?account=2" })).toBe(false);
    expect(await notifiedSince({ userId: alice, ...query, url: "/starrail?account=1" })).toBe(true);
  });
});
