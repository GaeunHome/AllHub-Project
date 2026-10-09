import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeFetch } from "@/dev/fake-fetch";
import { stubTwitchEnv } from "@/dev/test-env";

stubTwitchEnv();

/** App Access Token 快取在模組裡，每個測試重新載入才會重新取得 */
async function loadApi() {
  vi.resetModules();
  return import("./api");
}

const twitchServer = (data: unknown[] = []) =>
  fakeFetch(({ url }) => (url.includes("/oauth2/token") ? Response.json({ access_token: "token", expires_in: 3600 }) : Response.json({ data })));

beforeEach(() => {
  vi.stubEnv("DEV_EXTERNAL_ORIGIN", "");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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

  it("同時發出的查詢共用同一個 token 請求（頁面會同時查頭像與直播狀態）", async () => {
    const twitch = twitchServer();
    vi.stubGlobal("fetch", twitch.impl);
    const { getLiveStreams, getUsersById } = await loadApi();

    await Promise.all([getUsersById(["1"]), getLiveStreams(["1"])]);

    expect(twitch.urls.filter((url) => url.includes("/oauth2/token"))).toHaveLength(1);
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

  it("畫面用的查詢只是附加資訊_Helix 逾時 5 秒", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    vi.stubGlobal("fetch", twitchServer().impl);
    const { getLiveStreams } = await loadApi();

    await getLiveStreams(["1"]);

    // 第一個是取得 token（沿用 15 秒），第二個是 Helix
    expect(timeout.mock.calls).toEqual([[15_000], [5_000]]);
  });
});
