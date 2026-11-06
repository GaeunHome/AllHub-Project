import { beforeEach, describe, expect, it, vi } from "vitest";
import { OTHER_SESSION, TEST_SESSION, currentSession } from "@/dev/session-stub";
import { insertTestUser, setupTestDb } from "@/dev/test-db";
import { corePushSubscriptions } from "../../db/schema";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));

const { DELETE, PATCH, POST } = await import("../api");

const getDb = setupTestDb();
const ORIGIN = "https://hub.example.com";
const ENDPOINT = "https://fcm.googleapis.com/fcm/send/abc";
const KEYS = { p256dh: Buffer.alloc(65, 1).toString("base64url"), auth: Buffer.alloc(16, 2).toString("base64url") };

const request = (method: string, body: unknown, headers: Record<string, string> = {}) => new Request(`${ORIGIN}/api/push`, { method, headers: { host: "hub.example.com", origin: ORIGIN, "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const devices = () => getDb().select().from(corePushSubscriptions);

beforeEach(async () => {
  currentSession.mockReset().mockResolvedValue(TEST_SESSION);
  await insertTestUser(getDb(), TEST_SESSION.username, { id: TEST_SESSION.id, role: "owner" });
  await insertTestUser(getDb(), OTHER_SESSION.username, { id: OTHER_SESSION.id });
});

describe("/api/push", () => {
  it("訂閱記在登入者身上 回傳這支手機關掉的模組", async () => {
    const response = await POST(request("POST", { endpoint: ENDPOINT, keys: KEYS }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ muted: [] });
    expect((await devices()).map(({ userId }) => userId)).toEqual([TEST_SESSION.id]);
  });

  it("沒登入回 401", async () => {
    currentSession.mockResolvedValue(null);

    expect((await POST(request("POST", { endpoint: ENDPOINT, keys: KEYS }))).status).toBe(401);
    expect(await devices()).toEqual([]);
  });

  it("別的網站送來的回 403", async () => {
    expect((await POST(request("POST", { endpoint: ENDPOINT, keys: KEYS }, { origin: "https://evil.example" }))).status).toBe(403);
    expect(await devices()).toEqual([]);
  });

  it("不是推送服務的網址回 400 伺服器不能被拿去打別的位址", async () => {
    expect((await POST(request("POST", { endpoint: "http://169.254.169.254/latest/meta-data", keys: KEYS }))).status).toBe(400);
    expect(await devices()).toEqual([]);
  });

  it("別人的手機改開關回 404 刪除沒有效果（IDOR）", async () => {
    await POST(request("POST", { endpoint: ENDPOINT, keys: KEYS }));
    currentSession.mockResolvedValue(OTHER_SESSION);

    expect((await PATCH(request("PATCH", { endpoint: ENDPOINT, moduleId: "savings", muted: true }))).status).toBe(404);
    await DELETE(request("DELETE", { endpoint: ENDPOINT }));

    expect(await devices()).toHaveLength(1);
  });
});
