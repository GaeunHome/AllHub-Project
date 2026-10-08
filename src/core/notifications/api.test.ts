import { beforeEach, describe, expect, it, vi } from "vitest";
import { currentSession } from "@/dev/session-stub";
import { setupTestDb } from "@/dev/test-db";
import { captureErrorLog } from "@/dev/test-helpers";
import { coreNotifications } from "../db/schema";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));

const { GET, POST } = await import("./api");

const getDb = setupTestDb();
const ORIGIN = "https://hub.example.com";

beforeEach(() => {
  currentSession.mockReset();
});

async function seed(count: number, module = "twitch") {
  return getDb()
    .insert(coreNotifications)
    .values(Array.from({ length: count }, (_, i) => ({ module, kind: "test", title: `通知 ${i + 1}` })))
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
