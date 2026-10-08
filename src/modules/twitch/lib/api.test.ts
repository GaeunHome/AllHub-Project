import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeFetch, hangUntilAborted } from "@/dev/fake-fetch";
import { stubTwitchEnv } from "@/dev/test-env";

stubTwitchEnv();

/** App Access Token 快取在模組裡，每個測試重新載入才會重新取得 */
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
