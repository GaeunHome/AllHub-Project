import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeFetch, hangUntilAborted } from "@/dev/fake-fetch";
import { stubTwitchEnv } from "@/dev/test-env";

stubTwitchEnv();

/** App Access Token 快取在模組裡 每個測試重新載入才會重新取得 */
async function loadApi() {
  vi.resetModules();
  return import("./api");
}

const twitchServer = () =>
  fakeFetch(({ url }) => (url.includes("/oauth2/token") ? Response.json({ access_token: "token", expires_in: 3600 }) : Response.json({ data: [] })));

beforeEach(() => {
  vi.stubEnv("DEV_EXTERNAL_ORIGIN", "");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Twitch API 的逾時", () => {
  it("取得 token 與呼叫 Helix 都帶 15 秒逾時", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const twitch = twitchServer();
    vi.stubGlobal("fetch", twitch.impl);
    const { getUsersByLogin } = await loadApi();

    await getUsersByLogin(["alice"]);

    expect(twitch.urls).toEqual(["https://id.twitch.tv/oauth2/token", "https://api.twitch.tv/helix/users?login=alice"]);
    expect(twitch.calls.every((call) => call.init.signal instanceof AbortSignal)).toBe(true);
    expect(timeout.mock.calls).toEqual([[15_000], [15_000]]);
  });

  it("Twitch 一直沒回應_時間到就丟出逾時錯誤，不會卡到平台的時限", async () => {
    const realTimeout = AbortSignal.timeout.bind(AbortSignal);
    vi.spyOn(AbortSignal, "timeout").mockImplementation(() => realTimeout(10));
    vi.stubGlobal("fetch", fakeFetch(hangUntilAborted).impl);
    const { getUsersByLogin } = await loadApi();

    await expect(getUsersByLogin(["alice"])).rejects.toMatchObject({ name: "TimeoutError" });
  });
});

describe("換 App Access Token 被拒：看得出是哪個值填錯時，直接說要改哪個環境變數", () => {
  // Twitch 實際的回應 Client ID 不存在是 400 Client ID 對但 Secret 錯是 403
  const tokenRejected = (status: number, body: string) =>
    fakeFetch(({ url }) => (url.includes("/oauth2/token") ? new Response(body, { status, headers: { "Content-Type": "application/json" } }) : Response.json({ data: [] })));

  it("400 invalid client_說 Client ID 不對，要改的是 TWITCH_CLIENT_ID", async () => {
    vi.stubGlobal("fetch", tokenRejected(400, '{"status":400,"message":"invalid client"}').impl);
    const { getUsersByLogin } = await loadApi();

    const error = (await getUsersByLogin(["alice"]).catch((e: unknown) => e)) as Error;

    expect(error).toMatchObject({ name: "TwitchApiError", status: 400 });
    expect(error.message).toContain("Client ID 不對");
    expect(error.message).toContain("TWITCH_CLIENT_ID");
    expect(error.message).not.toContain("TWITCH_CLIENT_SECRET");
  });

  it("403 invalid client secret_說 Client Secret 不對，要改的是 TWITCH_CLIENT_SECRET", async () => {
    vi.stubGlobal("fetch", tokenRejected(403, '{"status":403,"message":"invalid client secret"}').impl);
    const { listSubscriptions } = await loadApi();

    const error = (await listSubscriptions().catch((e: unknown) => e)) as Error;

    expect(error).toMatchObject({ name: "TwitchApiError", status: 403 });
    expect(error.message).toContain("Client Secret 不對");
    expect(error.message).toContain("TWITCH_CLIENT_SECRET");
    expect(error.message).not.toContain("TWITCH_CLIENT_ID");
  });
});
