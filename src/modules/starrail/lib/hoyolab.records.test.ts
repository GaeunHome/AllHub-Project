import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeFetch } from "@/dev/fake-fetch";

const { fetchEndgame, fetchLedger } = await import("./hoyolab");

const COOKIE = "ltoken_v2=v2_top_secret; ltuid_v2=42";
const ok = (data: unknown) => Response.json({ retcode: 0, message: "OK", data });
const query = (url: string) => Object.fromEntries(new URL(url).searchParams);
const endpoint = (url: string) => `${new URL(url).origin}${new URL(url).pathname}`;

beforeEach(() => {
  vi.stubEnv("DEV_EXTERNAL_ORIGIN", "");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("fetchLedger：開拓月曆（srledger/month_info）", () => {
  it("帶 uid、region、month（YYYYMM）與語言", async () => {
    const hoyolab = fakeFetch(() => ok({ data_month: 202610, month_data: { current_hcoin: 100 } }));
    vi.stubGlobal("fetch", hoyolab.impl);

    const result = await fetchLedger(COOKIE, "900000001", "prod_official_cht", "202610");

    expect(endpoint(hoyolab.urls[0])).toBe("https://sg-public-api.hoyolab.com/event/srledger/month_info");
    expect(query(hoyolab.urls[0])).toEqual({ uid: "900000001", region: "prod_official_cht", month: "202610", lang: "zh-tw" });
    expect((hoyolab.calls[0].init.headers as Record<string, string>).Cookie).toBe(COOKIE);
    expect(result.ok && result.data.ledger.current.jade).toBe(100);
  });

  it("連線失敗_回失敗結果_訊息不含 cookie", async () => {
    vi.stubGlobal("fetch", fakeFetch(() => Promise.reject(new TypeError(`bad header ${COOKIE}`))).impl);

    const result = await fetchLedger(COOKIE, "900000001", "prod_official_cht", "202610");

    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("top_secret");
  });
});

describe("fetchEndgame：終局戰績", () => {
  it.each([
    ["chaos", "current", "challenge", "1"],
    ["chaos", "previous", "challenge", "2"],
    ["fiction", "current", "challenge_story", "1"],
    ["shadow", "previous", "challenge_boss", "2"],
  ] as const)("%s／%s_打 %s、schedule_type=%s、need_all、role_id、server，帶 DS", async (mode, schedule, path, type) => {
    const hoyolab = fakeFetch(() => ok({ has_data: false, all_floor_detail: [] }));
    vi.stubGlobal("fetch", hoyolab.impl);

    const result = await fetchEndgame(COOKIE, "900000001", "prod_official_cht", mode, schedule);

    expect(endpoint(hoyolab.urls[0])).toBe(`https://bbs-api-os.hoyolab.com/game_record/hkrpg/api/${path}`);
    expect(query(hoyolab.urls[0])).toEqual({ schedule_type: type, need_all: "true", role_id: "900000001", server: "prod_official_cht" });
    expect((hoyolab.calls[0].init.headers as Record<string, string>).ds).toMatch(/^\d+,[a-z0-9]{6},[0-9a-f]{32}$/);
    expect(result.ok && result.data.endgame).toMatchObject({ mode, hasData: false });
  });
});
