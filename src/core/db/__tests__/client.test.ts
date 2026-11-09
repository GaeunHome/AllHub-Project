import { beforeEach, describe, expect, it, vi } from "vitest";
import { stubCoreEnv } from "@/dev/test-env";

// 只看建立連線時給 postgres 的設定 不真的連線
vi.mock("postgres", () => ({ default: vi.fn(() => ({})) }));
vi.mock("drizzle-orm/postgres-js", () => ({ drizzle: vi.fn(() => ({})) }));

stubCoreEnv();
const postgres = vi.mocked((await import("postgres")).default);
const { db } = await import("../index");

beforeEach(() => {
  (globalThis as unknown as { hubDb?: unknown }).hubDb = undefined;
  postgres.mockClear();
});

describe("資料庫連線", () => {
  it("Supabase 的 transaction pooler（Supavisor 2.10 以前）收到管線化的查詢會一直不回應（postgres.js 的說明）：一條連線一次只送一個查詢；v0.2.12 換成 postgres 4 後正式站時常卡住、按登出沒反應", () => {
    db();

    expect(postgres).toHaveBeenCalledOnce();
    expect(postgres.mock.calls[0]?.[1]).toMatchObject({ prepare: false, max_pipeline: 1 });
  });

  it("連線池不回應時查詢有時限：時間到就報錯並重新連線，頁面與登出不會一直轉圈", () => {
    db();

    const options = postgres.mock.calls[0]?.[1] as { query_timeout?: number } | undefined;
    expect(options?.query_timeout).toBeGreaterThan(0);
  });
});
