import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeFetch, byUrl } from "@/dev/fake-fetch";
import { stubCoreEnv, stubTransitEnv } from "@/dev/test-env";

stubCoreEnv();
stubTransitEnv();

const { resetTdx, tdxGet, tdxGetNow } = await import("../tdx");

const TOKEN = () => Response.json({ access_token: "the-token", expires_in: 86400 });
const BUSY = (retryAfter?: string) => new Response(JSON.stringify({ message: "API rate limit exceeded" }), { status: 429, headers: retryAfter ? { "Retry-After": retryAfter } : {} });

/** 照順序回答 最後一個一直重複 */
function answers(...responses: (() => Response)[]) {
  let used = 0;
  const fake = fakeFetch(byUrl([[/openid-connect\/token/, TOKEN], [/THSR\/Station/, () => responses[Math.min(used++, responses.length - 1)]()]]));
  vi.stubGlobal("fetch", fake.impl);
  return { asked: () => fake.urls.filter((url) => url.includes("THSR/Station")).length };
}

const OK = () => Response.json([{ StationID: "1000" }]);

beforeEach(() => {
  resetTdx();
  vi.useFakeTimers({ now: new Date("2026-11-06T00:00:10Z"), toFake: ["Date", "setTimeout", "clearTimeout"] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("每分鐘的上限：免費會員每把金鑰每分鐘 5 次", () => {
  it("超過時等 TDX 說的秒數再問一次 使用者不該看到讀不到", async () => {
    const tdx = answers(() => BUSY("20"), OK);

    const read = tdxGet("/v2/Rail/THSR/Station");
    await vi.advanceTimersByTimeAsync(19_000);
    expect(tdx.asked()).toBe(1);
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(read).resolves.toEqual([{ StationID: "1000" }]);
    expect(tdx.asked()).toBe(2);
  });

  it("沒說要等多久_等到下一分鐘 現在是第 10 秒所以等 50 秒", async () => {
    const tdx = answers(() => BUSY(), OK);

    const read = tdxGet("/v2/Rail/THSR/Station");
    await vi.advanceTimersByTimeAsync(49_000);
    expect(tdx.asked()).toBe(1);
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(read).resolves.toEqual([{ StationID: "1000" }]);
  });

  it("等待中的其他讀取一起等 不再多問 TDX", async () => {
    const tdx = answers(() => BUSY("20"), OK);

    const first = tdxGet("/v2/Rail/THSR/Station");
    await vi.advanceTimersByTimeAsync(5_000);
    const second = tdxGet("/v2/Rail/THSR/Station");
    await vi.advanceTimersByTimeAsync(14_000);
    expect(tdx.asked()).toBe(1);
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
  });

  it("票價這類多的資料不等 馬上回 429 讓畫面先出來", async () => {
    answers(() => BUSY("20"));

    await expect(tdxGetNow("/v2/Rail/THSR/Station")).rejects.toMatchObject({ status: 429 });
  });

  it("剛被擋下時多的資料不問 TDX 問了也是被擋", async () => {
    const tdx = answers(() => BUSY("20"), OK);
    const waiting = tdxGet("/v2/Rail/THSR/Station");
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(tdxGetNow("/v2/Rail/THSR/Station")).rejects.toMatchObject({ status: 429 });
    expect(tdx.asked()).toBe(1);

    await vi.advanceTimersByTimeAsync(19_000);
    await waiting;
  });

  it("要等好幾個小時是這個月的額度用完 馬上放棄 不讓頁面一直轉", async () => {
    const tdx = answers(() => BUSY("3600"));

    await expect(tdxGet("/v2/Rail/THSR/Station")).rejects.toMatchObject({ status: 429 });
    expect(tdx.asked()).toBe(1);
  });

  it("下一分鐘還是滿的_最多等一分鐘多就放棄", async () => {
    const tdx = answers(() => BUSY("30"));

    const read = tdxGet("/v2/Rail/THSR/Station").catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(70_000);

    expect(await read).toMatchObject({ status: 429 });
    expect(tdx.asked()).toBe(3);
  });

  it("其他錯誤不等 500 不是次數的問題", async () => {
    const tdx = answers(() => new Response("", { status: 500 }));

    await expect(tdxGet("/v2/Rail/THSR/Station")).rejects.toMatchObject({ status: 500 });
    expect(tdx.asked()).toBe(1);
  });
});
