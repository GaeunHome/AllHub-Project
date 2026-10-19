import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeFetch, hangUntilAborted } from "@/dev/fake-fetch";
import { stubTwitchEnv } from "@/dev/test-env";

stubTwitchEnv();

/** App Access Token 快取在模組裡 每個測試重新載入才會重新取得 */
async function loadApi() {
  vi.resetModules();
  return import("./api");
}

const twitchServer = (data: unknown[] = []) =>
  fakeFetch(({ url }) => (url.includes("/oauth2/token") ? Response.json({ access_token: "token", expires_in: 3600 }) : Response.json({ data })));

// AbortSignal.timeout 的 spy 要還原 全域的 fetch 由 vitest 設定自動換回
afterEach(() => {
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

describe("畫面用的 Helix 查詢：一次查多位主播", () => {
  it("getUsersById_多個 id 放在同一個請求", async () => {
    const twitch = twitchServer([{ id: "1" }, { id: "2" }]);
    vi.stubGlobal("fetch", twitch.impl);
    const { getUsersById } = await loadApi();

    expect(await getUsersById(["1", "2"])).toEqual([{ id: "1" }, { id: "2" }]);
    expect(twitch.urls.slice(1)).toEqual(["https://api.twitch.tv/helix/users?id=1&id=2"]);
  });

  it("getLiveStreams_帶 first=100（預設只回 20 筆）", async () => {
    const twitch = twitchServer();
    vi.stubGlobal("fetch", twitch.impl);
    const { getLiveStreams } = await loadApi();

    await getLiveStreams(["1", "2"]);

    expect(twitch.urls.slice(1)).toEqual(["https://api.twitch.tv/helix/streams?user_id=1&user_id=2&first=100"]);
  });

  it("getGames_多個遊戲 id", async () => {
    const twitch = twitchServer();
    vi.stubGlobal("fetch", twitch.impl);
    const { getGames } = await loadApi();

    await getGames(["10", "20"]);

    expect(twitch.urls.slice(1)).toEqual(["https://api.twitch.tv/helix/games?id=10&id=20"]);
  });

  it("超過 100 個 id_分批查詢再合併_重複的 id 只查一次", async () => {
    const twitch = twitchServer([{ id: "x" }]);
    vi.stubGlobal("fetch", twitch.impl);
    const { getUsersById } = await loadApi();
    const ids = Array.from({ length: 150 }, (_, i) => String(i));

    const users = await getUsersById([...ids, "0", "1"]);

    const helixCalls = twitch.urls.filter((url) => url.includes("/helix/"));
    expect(helixCalls).toHaveLength(2);
    expect(new URL(helixCalls[0]).searchParams.getAll("id")).toHaveLength(100);
    expect(new URL(helixCalls[1]).searchParams.getAll("id")).toHaveLength(50);
    expect(users).toHaveLength(2);
  });

  it("沒有 id_不發請求", async () => {
    const twitch = twitchServer();
    vi.stubGlobal("fetch", twitch.impl);
    const { getGames, getLiveStreams, getUsersById } = await loadApi();

    expect(await getUsersById([])).toEqual([]);
    expect(await getLiveStreams([])).toEqual([]);
    expect(await getGames([])).toEqual([]);
    expect(twitch.urls).toEqual([]);
  });
});
