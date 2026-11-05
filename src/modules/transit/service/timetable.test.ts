import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeFetch, byUrl } from "@/dev/fake-fetch";
import { captureErrorLog, loggedText } from "@/dev/test-helpers";
import { stubCoreEnv, stubTransitEnv } from "@/dev/test-env";

stubCoreEnv();
stubTransitEnv({ TDX_CLIENT_SECRET: "tdx-top-secret" });

const { readDepartures, readLive, readStations } = await import("./timetable");
const { resetTdxToken } = await import("../lib/tdx");

const TOKEN = () => Response.json({ access_token: "the-token", expires_in: 86400 });

function stub(routes: Array<[RegExp, () => Response]>) {
  const fake = fakeFetch(byUrl([[/openid-connect\/token/, TOKEN], ...routes]));
  vi.stubGlobal("fetch", fake.impl);
  return fake;
}

beforeEach(() => resetTdxToken());

describe("向 TDX 讀資料", () => {
  it("先換 token 再帶著它讀", async () => {
    const fake = stub([[/THSR\/Station/, () => Response.json([{ StationID: "1000", StationName: { Zh_tw: "台北" } }])]]);

    expect(await readStations("thsr", "")).toEqual({ ok: true, data: [{ id: "1000", name: "台北" }] });

    const read = fake.calls.find((call) => call.url.includes("/THSR/Station"))!;
    expect((read.init.headers as Record<string, string>).Authorization).toBe("Bearer the-token");
  });

  it("token 沿用 不是每次都換 換 token 每分鐘有次數限制", async () => {
    const fake = stub([[/THSR\/Station/, () => Response.json([])]]);

    await readStations("thsr", "");
    await readStations("thsr", "");

    expect(fake.urls.filter((url) => url.includes("openid-connect"))).toHaveLength(1);
  });

  it("高鐵用起訖站與日期的時刻表", async () => {
    const fake = stub([[/DailyTimetable/, () => Response.json([])]]);

    await readDepartures("thsr", "", "1000", "1070", "2026-11-05");

    expect(fake.urls.at(-1)).toContain("/v2/Rail/THSR/DailyTimetable/OD/1000/to/1070/2026-11-05");
  });

  it("捷運用站別時刻表 只查這一站 才不會一次下載全部的站", async () => {
    const fake = stub([[/StationTimeTable/, () => Response.json([])]]);

    await readDepartures("metro", "TRTC", "R10", "R28", "2026-11-05");

    expect(new URL(fake.urls.at(-1)!).searchParams.get("$filter")).toBe("StationID eq 'R10'");
  });

  it("讀不到_回摘要不丟錯 摘要與 log 都不帶金鑰與網址", async () => {
    const log = captureErrorLog();
    stub([[/THSR\/Station/, () => new Response("oops", { status: 500 })]]);

    const result = await readStations("thsr", "");

    expect(result).toEqual({ ok: false, problem: "TDX 回 500" });
    expect(loggedText(log)).not.toContain("tdx-top-secret");
  });

  it("429 寫出是額度用完 站長才知道為什麼", async () => {
    captureErrorLog();
    stub([[/THSR\/Station/, () => new Response("", { status: 429 })]]);

    expect(await readStations("thsr", "")).toMatchObject({ problem: expect.stringContaining("額度") });
  });

  it("token 換不到_一樣回摘要", async () => {
    captureErrorLog();
    vi.stubGlobal("fetch", fakeFetch(() => new Response("", { status: 401 })).impl);

    expect(await readStations("thsr", "")).toEqual({ ok: false, problem: "TDX 回 401" });
  });
});

describe("即時資料", () => {
  const NOW = new Date("2026-11-05T00:00:00Z");
  const target = (mode: "thsr" | "tra" | "metro", system: string, originId: string, destinationId: string) => ({ mode, system, line: "", originId, destinationId });

  it("公車用秒數 只算追蹤的站牌與方向", async () => {
    stub([[/EstimatedTimeOfArrival/, () => Response.json([{ StopUID: "A", Direction: 0, EstimateTime: 95, StopStatus: 0 }, { StopUID: "A", Direction: 1, EstimateTime: 5, StopStatus: 0 }])]]);

    expect(await readLive({ mode: "bus", system: "Taipei", line: "307", originId: "A", destinationId: "0" }, NOW)).toEqual({ ok: true, data: { kind: "estimate", seconds: 95, status: null, readAt: NOW.getTime() } });
  });

  it("公車的路線名稱有中文 網址要編碼 只要完全一樣的路線", async () => {
    const fake = stub([[/EstimatedTimeOfArrival/, () => Response.json([])]]);

    await readLive({ mode: "bus", system: "Taipei", line: "紅30", originId: "A", destinationId: "0" }, NOW);

    const url = new URL(fake.urls.at(-1)!);
    expect(url.pathname).toContain(encodeURIComponent("紅30"));
    expect(url.searchParams.get("$filter")).toBe("RouteName/Zh_tw eq '紅30'");
  });

  it("高鐵沒有即時資料 不用問 TDX", async () => {
    const fake = stub([]);

    expect(await readLive(target("thsr", "", "1000", "1070"), NOW)).toEqual({ ok: true, data: { kind: "none" } });
    expect(fake.urls).toEqual([]);
  });

  it("沒有看板的捷運系統 不用問 TDX", async () => {
    const fake = stub([]);

    expect(await readLive(target("metro", "NTMC", "Y01", "Y20"), NOW)).toEqual({ ok: true, data: { kind: "none" } });
    expect(fake.urls).toEqual([]);
  });

  it("台鐵回誤點分鐘", async () => {
    stub([[/TRA\/LiveBoard/, () => Response.json([{ TrainNo: "123", DelayTime: 5 }])]]);

    expect(await readLive(target("tra", "", "1000", "4400"), NOW)).toEqual({ ok: true, data: { kind: "delays", delays: { "123": 5 } } });
  });

  it("捷運回這個方向的分鐘數 與讀到的時間", async () => {
    stub([[/Metro\/LiveBoard/, () => Response.json([{ DestinationStationID: "R28", EstimateTime: 3, ServiceStatus: 0 }])]]);

    expect(await readLive(target("metro", "TRTC", "R10", "R28"), NOW)).toEqual({ ok: true, data: { kind: "estimate", seconds: 180, readAt: NOW.getTime() } });
  });
});
