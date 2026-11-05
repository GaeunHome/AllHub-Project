import { cacheLife } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeFetch, byUrl } from "@/dev/fake-fetch";
import { stubCoreEnv, stubTransitEnv } from "@/dev/test-env";
import { captureErrorLog, tagged } from "@/dev/test-helpers";

stubCoreEnv();
stubTransitEnv();

const { cachedMetroLines } = await import("../cached");
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
