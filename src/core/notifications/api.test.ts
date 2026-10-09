import { beforeEach, describe, expect, it, vi } from "vitest";
import { OTHER_SESSION, TEST_SESSION, currentSession } from "@/dev/session-stub";
import { insertTestUser, setupTestDb } from "@/dev/test-db";
import { captureErrorLog } from "@/dev/test-helpers";
import { coreNotifications } from "../db/schema";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));

const { GET, POST } = await import("./api");

const getDb = setupTestDb();
const ORIGIN = "https://hub.example.com";

beforeEach(async () => {
  currentSession.mockReset();
  await insertTestUser(getDb(), TEST_SESSION.username, { id: TEST_SESSION.id, role: "owner" });
  await insertTestUser(getDb(), OTHER_SESSION.username, { id: OTHER_SESSION.id });
});

/** 預設寄給登入中的 alice（TEST_SESSION） */
async function seed(count: number, module = "twitch", userId = TEST_SESSION.id) {
  return getDb()
    .insert(coreNotifications)
    .values(Array.from({ length: count }, (_, i) => ({ userId, module, kind: "test", title: `通知 ${i + 1}` })))
    .returning();
}

const post = (body: unknown, headers: Record<string, string> = {}) =>
  POST(
    new Request(`${ORIGIN}/api/notifications`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN, ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

describe("GET /api/notifications（輪詢用）", () => {
  it("session 失效（例如改過密碼）_401_不查通知", async () => {
    currentSession.mockResolvedValue(null);
    await seed(1);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(JSON.stringify(await response.json())).not.toContain("通知 1");
  });

  it("回傳依模組的未讀數與最近 10 筆_不讓瀏覽器或 CDN 快取", async () => {
    await seed(11, "twitch");
    await seed(1, "youtube");

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(body.unread).toEqual({ total: 12, byModule: { twitch: 11, youtube: 1 } });
    expect(body.recent).toHaveLength(10);
    expect(body.recent[0]).toMatchObject({ module: "youtube", read: false });
  });

  it("資料庫出錯_500 只回摘要_log 只記錯誤種類", async () => {
    const log = captureErrorLog();
    currentSession.mockRejectedValue(Object.assign(new Error("db-secret in message"), { name: "PostgresError" }));

    const response = await GET();

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("db-secret");
    expect(JSON.stringify(log.mock.calls)).not.toContain("db-secret");
  });
});

describe("POST /api/notifications（標為已讀）", () => {
  it("指定 id 標成已讀_回傳更新後的未讀數與最近通知", async () => {
    const [a, b] = await seed(3);

    const response = await post({ action: "read", ids: [a.id, b.id] });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.unread).toEqual({ total: 1, byModule: { twitch: 1 } });
    expect(body.recent.filter((n: { read: boolean }) => n.read).map((n: { id: number }) => n.id).sort()).toEqual([a.id, b.id].sort());
  });

  it("全部標成已讀_可以只標某個模組", async () => {
    await seed(2, "twitch");
    await seed(1, "youtube");

    expect((await (await post({ action: "read-all", module: "twitch" })).json()).unread).toEqual({ total: 1, byModule: { youtube: 1 } });
    expect((await (await post({ action: "read-all" })).json()).unread).toEqual({ total: 0, byModule: {} });
  });

  it("沒登入_401_不變更", async () => {
    currentSession.mockResolvedValue(null);
    await seed(1);

    expect((await post({ action: "read-all" })).status).toBe(401);
    expect((await getDb().select().from(coreNotifications))[0].readAt).toBeNull();
  });

  it.each([
    ["Origin 是別的網站", { origin: "https://evil.example" }],
    ["沒有 Origin", { origin: "" }],
  ])("跨站請求（%s）_403_不變更", async (_name, headers) => {
    await seed(1);

    expect((await post({ action: "read-all" }, headers)).status).toBe(403);
    expect((await getDb().select().from(coreNotifications))[0].readAt).toBeNull();
  });

  it("不是 JSON_415", async () => {
    expect((await post({ action: "read-all" }, { "content-type": "text/plain" })).status).toBe(415);
  });

  it.each([
    ["壞掉的 JSON", "{"],
    ["不認得的動作", { action: "delete", ids: [1] }],
    ["id 不是正整數", { action: "read", ids: [0, -1] }],
    ["沒有 id", { action: "read", ids: [] }],
    ["一次太多 id", { action: "read", ids: Array.from({ length: 101 }, (_, i) => i + 1) }],
    ["模組 id 格式不對", { action: "read-all", module: "<script>" }],
  ])("內容格式不對（%s）_400", async (_name, body) => {
    expect((await post(body)).status).toBe(400);
  });
});

describe("/api/notifications 只碰登入者自己的通知", () => {
  it("GET_別人的通知不算進未讀數、不出現在最近通知", async () => {
    await seed(2, "twitch", OTHER_SESSION.id);
    await seed(1, "youtube");

    const body = await (await GET()).json();

    expect(body.unread).toEqual({ total: 1, byModule: { youtube: 1 } });
    expect(body.recent).toHaveLength(1);
  });

  it("POST read_用 A 的 session 標 B 的通知 id_沒有效果", async () => {
    const [theirs] = await seed(1, "twitch", OTHER_SESSION.id);

    const response = await post({ action: "read", ids: [theirs.id] });

    expect(response.status).toBe(200);
    expect((await getDb().select().from(coreNotifications))[0].readAt).toBeNull();
  });

  it("POST read-all_只標登入者自己的", async () => {
    await seed(1, "twitch", OTHER_SESSION.id);
    await seed(1, "twitch");

    await post({ action: "read-all" });

    const rows = await getDb().select().from(coreNotifications);
    expect(rows.find((n) => n.userId === OTHER_SESSION.id)!.readAt).toBeNull();
    expect(rows.find((n) => n.userId === TEST_SESSION.id)!.readAt).not.toBeNull();
  });
});
