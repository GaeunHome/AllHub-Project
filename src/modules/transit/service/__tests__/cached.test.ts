import { cacheLife } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeFetch, byUrl } from "@/dev/fake-fetch";
import { stubCoreEnv, stubTransitEnv } from "@/dev/test-env";
import { captureErrorLog, tagged } from "@/dev/test-helpers";

stubCoreEnv();
stubTransitEnv();

const { cachedMetroLines, cachedMetroNetwork } = await import("../cached");
const { resetTdxToken } = await import("../../lib/tdx");

const TOKEN = () => Response.json({ access_token: "the-token", expires_in: 86400 });
const stub = (line: () => Response) => vi.stubGlobal("fetch", fakeFetch(byUrl([[/openid-connect\/token/, TOKEN], [/StationOfLine/, line]])).impl);

beforeEach(() => resetTdxToken());

describe("捷運路線的快取", () => {
  it("讀到時留一天 路線幾乎不會變 免費額度很緊", async () => {
    stub(() => Response.json([{ LineNo: "R", Stations: [{ Sequence: 1, StationID: "R02" }] }]));

    expect(await cachedMetroLines("TRTC")).toEqual({ ok: true, data: [{ id: "R", stationIds: ["R02"] }] });
    expect(vi.mocked(cacheLife)).toHaveBeenLastCalledWith("avatar");
    expect(tagged()).toEqual(["transit:external"]);
  });

  it("讀不到或欄位不同時幾分鐘後再試 不能把沒有分組留一天", async () => {
    captureErrorLog();
    stub(() => new Response("", { status: 500 }));
    await cachedMetroLines("TRTC");
    expect(vi.mocked(cacheLife)).toHaveBeenLastCalledWith("external");

    vi.mocked(cacheLife).mockClear();
    stub(() => Response.json([]));
    await cachedMetroLines("TRTC");
    expect(vi.mocked(cacheLife)).toHaveBeenLastCalledWith("external");
  });
});

describe("捷運的路網：三個系統併在一起", () => {
  const stationRow = (StationID: string, name: string) => ({ StationID, StationName: { Zh_tw: name } });
  const DATA: Record<string, { stations: unknown[]; lines: unknown[] }> = {
    TRTC: { stations: [stationRow("R10", "台北車站")], lines: [{ LineNo: "R", Stations: [{ Sequence: 1, StationID: "R10" }] }] },
    NTMC: { stations: [stationRow("Y07", "大坪林")], lines: [{ LineNo: "Y", Stations: [{ Sequence: 1, StationID: "Y07" }] }] },
    TYMC: { stations: [stationRow("A1", "臺北車站")], lines: [{ LineNo: "A", Stations: [{ Sequence: 1, StationID: "A1" }] }] },
  };
  const FAILED = () => new Response("", { status: 500 });
  const answers = (broken: (system: string, kind: "Station" | "StationOfLine") => (() => Response) | null) =>
    Object.entries(DATA).flatMap(([system, { stations, lines }]): [RegExp, () => Response][] => [
      [new RegExp(`/Metro/Station/${system}`), broken(system, "Station") ?? (() => Response.json(stations))],
      [new RegExp(`/Metro/StationOfLine/${system}`), broken(system, "StationOfLine") ?? (() => Response.json(lines))],
    ]);
  const stubNetwork = (broken: Parameters<typeof answers>[0] = () => null) => {
    const fake = fakeFetch(byUrl([[/openid-connect\/token/, TOKEN], ...answers(broken)]));
    vi.stubGlobal("fetch", fake.impl);
    return fake;
  };

  it("全部讀到時留一天 每個系統的車站與路線各讀一次 免費額度很緊", async () => {
    const fake = stubNetwork();

    const result = await cachedMetroNetwork();

    expect(result).toMatchObject({ ok: true, data: { missing: [], problem: null } });
    expect(result.ok && result.data.network.lines.map((line) => line.id)).toEqual(["R", "Y", "A"]);
    expect(fake.urls.filter((url) => url.includes("/Metro/"))).toHaveLength(6);
    expect(vi.mocked(cacheLife)).toHaveBeenLastCalledWith("avatar");
    expect(tagged()).toContain("transit:external");
  });

  it("一個系統讀不到_留其他的並說出是哪個 幾分鐘後再試", async () => {
    captureErrorLog();
    stubNetwork((system) => (system === "NTMC" ? FAILED : null));

    const result = await cachedMetroNetwork();

    expect(result).toMatchObject({ ok: true, data: { missing: ["NTMC"], problem: "TDX 回 500" } });
    expect(result.ok && result.data.network.stations.map((station) => station.id)).toEqual(["R10", "A1"]);
    expect(vi.mocked(cacheLife)).toHaveBeenLastCalledWith("external");
  });

  it("一個系統回空的也算讀不到 不能把沒有車站留一天", async () => {
    stubNetwork((system, kind) => (system === "TYMC" && kind === "Station" ? () => Response.json([]) : null));

    expect(await cachedMetroNetwork()).toMatchObject({ ok: true, data: { missing: ["TYMC"] } });
    expect(vi.mocked(cacheLife)).toHaveBeenLastCalledWith("external");
  });

  it("路線讀不到但車站讀得到_車站留著 不能讓人選不了站", async () => {
    captureErrorLog();
    stubNetwork((_system, kind) => (kind === "StationOfLine" ? FAILED : null));

    const result = await cachedMetroNetwork();

    expect(result).toMatchObject({ ok: true, data: { missing: ["TRTC", "NTMC", "TYMC"], problem: "TDX 回 500" } });
    expect(result.ok && result.data.network.stations).toHaveLength(3);
    expect(vi.mocked(cacheLife)).toHaveBeenLastCalledWith("external");
  });

  it("全部讀不到才算失敗", async () => {
    captureErrorLog();
    stubNetwork(() => FAILED);

    expect(await cachedMetroNetwork()).toEqual({ ok: false, problem: "TDX 回 500" });
    expect(vi.mocked(cacheLife)).toHaveBeenLastCalledWith("external");
  });
});
