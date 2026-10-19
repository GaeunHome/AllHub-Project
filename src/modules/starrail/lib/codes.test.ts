import { describe, expect, it, onTestFinished, vi } from "vitest";
import { fakeFetch, hangUntilAborted } from "@/dev/fake-fetch";
import { captureErrorLog } from "@/dev/test-helpers";

const { fetchActiveCodes, parseActiveCodes } = await import("./codes");

// 2026-10-15 實際讀到的 https://hoyo-codes.seria.moe/codes?game=hkrpg 節錄
const SAMPLE = {
  codes: [
    { id: 158, code: "5S6ZHRWTDNJB", status: "OK", game: "hkrpg", rewards: "60 stellar jade" },
    { id: 13, code: "STARRAILGIFT", status: "OK", game: "hkrpg", rewards: "50 stellar jade, 10k credits, two traveler’s guides, and five bottled soda" },
    { id: 581, code: "OMEGA", status: "OK", game: "hkrpg", rewards: "60 stellar jade and one fuel" },
    { id: 433, code: "CTK5DRQVT48F", status: "OK", game: "hkrpg", rewards: "" },
  ],
  game: "hkrpg",
};

describe("parseActiveCodes：hoyo-codes 的兌換碼清單", () => {
  it("讀 code 與 rewards；新加入的（id 大的）排前面，直播碼這類快過期的先兌換；沒寫獎勵的是 null", () => {
    expect(parseActiveCodes(SAMPLE)).toEqual([
      { code: "OMEGA", rewards: "60 stellar jade and one fuel" },
      { code: "CTK5DRQVT48F", rewards: null },
      { code: "5S6ZHRWTDNJB", rewards: "60 stellar jade" },
      { code: "STARRAILGIFT", rewards: "50 stellar jade, 10k credits, two traveler’s guides, and five bottled soda" },
    ]);
  });

  it("狀態不是 OK 的、看起來不像兌換碼的、重複的都略過；兌換碼整理成大寫", () => {
    const codes = parseActiveCodes({
      codes: [
        { id: 3, code: "giftcode99", status: "OK" },
        { id: 2, code: "EXPIREDONE", status: "NOT_OK" },
        { id: 1, code: "<script>", status: "OK" },
        { id: 0, code: "GIFTCODE99", status: "OK" },
      ],
    });

    expect(codes).toEqual([{ code: "GIFTCODE99", rewards: null }]);
  });

  it("獎勵太長_截短；去掉換行與控制字元", () => {
    const [entry] = parseActiveCodes({ codes: [{ id: 1, code: "LONGREWARD", status: "OK", rewards: `a\n${"b".repeat(200)}\u0000` }] })!;

    expect([...entry.rewards!].length).toBe(120);
    expect(entry.rewards).toMatch(/^a b+…$/);
  });

  it("格式不對_回 null", () => {
    expect(parseActiveCodes({ error: "x" })).toBeNull();
    expect(parseActiveCodes(null)).toBeNull();
  });

  it("最多取 50 個：整理掉不像兌換碼的之後，留 id 最大（最新）的 50 個", () => {
    const valid = Array.from({ length: 60 }, (_, i) => ({ id: i + 1, code: `CODE${String(i + 1).padStart(2, "0")}`, status: "OK" }));
    const broken = Array.from({ length: 5 }, (_, i) => ({ id: 100 + i, code: `BAD-${i}`, status: "OK" }));

    const codes = parseActiveCodes({ codes: [...broken, ...valid] })!;

    // 60 個有效的留 id 60 到 11 這 50 個
    expect(codes).toHaveLength(50);
    expect(codes[0].code).toBe("CODE60");
    expect(codes[49].code).toBe("CODE11");
  });
});

describe("fetchActiveCodes：讀取清單", () => {
  it("GET hoyo-codes 的 Star Rail（game=hkrpg）清單", async () => {
    const source = fakeFetch(() => Response.json(SAMPLE));
    vi.stubGlobal("fetch", source.impl);

    expect(await fetchActiveCodes()).toHaveLength(4);
    expect(source.urls).toEqual(["https://hoyo-codes.seria.moe/codes?game=hkrpg"]);
  });

  it("hoyo-codes 沒回應_最多等 5 秒就放棄、回 null（讀清單 5 秒＋兌換 30 秒＋最後一個請求 10 秒，排程才在 60 秒內跑完）", async () => {
    captureErrorLog();
    const waited: number[] = [];
    // 逾時直接發生 不用真的等
    const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
      waited.push(ms);
      return AbortSignal.abort(new DOMException("timeout", "TimeoutError"));
    });
    onTestFinished(() => timeout.mockRestore());
    vi.stubGlobal("fetch", fakeFetch(hangUntilAborted).impl);

    expect(await fetchActiveCodes()).toBeNull();
    expect(waited.length).toBeGreaterThan(0);
    expect(Math.max(...waited)).toBeLessThanOrEqual(5_000);
  });

  it("讀不到（HTTP 錯誤、連線失敗、格式不對）_回 null，明天再試", async () => {
    captureErrorLog();
    vi.stubGlobal("fetch", fakeFetch(() => new Response("bad gateway", { status: 502 })).impl);
    expect(await fetchActiveCodes()).toBeNull();

    vi.stubGlobal("fetch", fakeFetch(() => Promise.reject(new TypeError("offline"))).impl);
    expect(await fetchActiveCodes()).toBeNull();

    vi.stubGlobal("fetch", fakeFetch(() => Response.json({ message: "changed" })).impl);
    expect(await fetchActiveCodes()).toBeNull();
  });
});
