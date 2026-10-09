import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeFetch } from "@/dev/fake-fetch";

const { fetchCharacters, fetchDailyNote } = await import("./hoyolab");

const COOKIE = "ltoken_v2=v2_top_secret; ltuid_v2=42";
const ok = (data: unknown) => Response.json({ retcode: 0, message: "OK", data });

beforeEach(() => {
  vi.stubEnv("DEV_EXTERNAL_ORIGIN", "");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("fetchCharacters：戰績的角色詳情（avatar/info）", () => {
  it("帶 need_wiki、role_id、server 與 DS；語言用繁體中文", async () => {
    const hoyolab = fakeFetch(() => ok({ avatar_list: [{ id: 1102, name: "希兒" }], property_info: {} }));
    vi.stubGlobal("fetch", hoyolab.impl);

    const result = await fetchCharacters(COOKIE, "900000001", "prod_official_cht");

    const url = new URL(hoyolab.calls[0].url);
    expect(`${url.origin}${url.pathname}`).toBe("https://bbs-api-os.hoyolab.com/game_record/hkrpg/api/avatar/info");
    expect(Object.fromEntries(url.searchParams)).toEqual({ need_wiki: "true", role_id: "900000001", server: "prod_official_cht" });
    const headers = hoyolab.calls[0].init.headers as Record<string, string>;
    expect(headers.Cookie).toBe(COOKIE);
    expect(headers["x-rpc-language"]).toBe("zh-tw");
    expect(headers.ds).toMatch(/^\d+,[a-z0-9]{6},[0-9a-f]{32}$/);
    expect(result.ok && result.data.characters.map((c) => c.name)).toEqual(["希兒"]);
  });

  it("資料不公開_回中文提示", async () => {
    vi.stubGlobal("fetch", fakeFetch(() => Response.json({ retcode: 10102, message: "Data is not public", data: null })).impl);

    const result = await fetchCharacters(COOKIE, "900000001", "prod_official_cht");

    expect(result).toMatchObject({ ok: false, retcode: 10102 });
    expect(!result.ok && result.message).toContain("打開角色詳情");
  });

  it("連線失敗_回失敗結果_不丟例外_訊息不含 cookie", async () => {
    vi.stubGlobal("fetch", fakeFetch(() => Promise.reject(new TypeError(`Headers.append: "${COOKIE}" is an invalid header value.`))).impl);

    const result = await fetchCharacters(COOKIE, "900000001", "prod_official_cht");

    expect(result).toMatchObject({ ok: false, cookieInvalid: false });
    expect(JSON.stringify(result)).not.toContain("top_secret");
  });
});

describe("fetchDailyNote：便箋另外帶上委託", () => {
  it("回傳便箋數字與委託的角色圖", async () => {
    vi.stubGlobal(
      "fetch",
      fakeFetch(() =>
        ok({
          current_stamina: 100,
          max_stamina: 300,
          expeditions: [{ avatars: ["https://act-webstatic.hoyoverse.com/a/1.png"], status: "Ongoing", remaining_time: 600, name: "委託", item_url: "" }],
        }),
      ).impl,
    );

    const result = await fetchDailyNote(COOKIE, "900000001", "prod_official_cht");

    expect(result.ok && result.data).toMatchObject({
      stamina: 100,
      maxStamina: 300,
      expeditions: [{ name: "委託", status: "ongoing", remainingSeconds: 600, avatars: ["https://act-webstatic.hoyoverse.com/a/1.png"] }],
    });
  });
});
