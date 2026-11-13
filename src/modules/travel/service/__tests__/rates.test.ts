import { describe, expect, it } from "vitest";
import { byUrl, fakeFetch, hangUntilAborted } from "@/dev/fake-fetch";
import { captureErrorLog, loggedText } from "@/dev/test-helpers";
import { fetchRates } from "../rates";

const JSDELIVR = /^https:\/\/cdn\.jsdelivr\.net\/npm\/@fawazahmed0\/currency-api@([^/]+)\/v1\/currencies\/twd\.json$/;
const CLOUDFLARE = /^https:\/\/([^.]+)\.currency-api\.pages\.dev\/v1\/currencies\/twd\.json$/;
const body = (date: string) => () => Response.json({ date, twd: { usd: 0.030315355 } });

describe("fetchRates", () => {
  it("讀那一天的匯率", async () => {
    const fetch = fakeFetch(byUrl([[JSDELIVR, body("2026-10-01")]]));

    expect(await fetchRates("2026-10-01", { fetchImpl: fetch.impl })).toEqual({ date: "2026-10-01", rates: { USD: "32.986584" } });
    expect(fetch.urls).toEqual(["https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@2026-10-01/v1/currencies/twd.json"]);
  });

  it("jsDelivr 出錯或沒回應_改問 Cloudflare 的備援", async () => {
    captureErrorLog();
    const broken = fakeFetch(byUrl([[JSDELIVR, () => new Response("oops", { status: 503 })], [CLOUDFLARE, body("2026-11-12")]]));
    const hanging = fakeFetch((call) => (JSDELIVR.test(call.url) ? hangUntilAborted(call) : body("2026-11-12")()));

    expect((await fetchRates("latest", { fetchImpl: broken.impl }))?.rates).toEqual({ USD: "32.986584" });
    expect((await fetchRates("latest", { fetchImpl: hanging.impl, timeoutMs: 10 }))?.rates).toEqual({ USD: "32.986584" });
    expect(broken.urls[1]).toBe("https://latest.currency-api.pages.dev/v1/currencies/twd.json");
  });

  it("那一天還沒有（兩邊都 404）_改用最新的", async () => {
    captureErrorLog();
    const fetch = fakeFetch(({ url }) => (url.includes("latest") ? body("2026-11-12")() : new Response("not found", { status: 404 })));

    expect(await fetchRates("2026-11-13", { fetchImpl: fetch.impl })).toEqual({ date: "2026-11-12", rates: { USD: "32.986584" } });
  });

  it("全部都讀不到_回 null，log 不記網址", async () => {
    const errors = captureErrorLog();
    const fetch = fakeFetch(() => new Response("oops", { status: 500 }));

    expect(await fetchRates("latest", { fetchImpl: fetch.impl })).toBeNull();
    expect(loggedText(errors)).not.toMatch(/jsdelivr|pages\.dev/);
  });
});
