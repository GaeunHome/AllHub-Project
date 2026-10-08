import { afterEach, describe, expect, it, vi } from "vitest";
import { RETENTION_DAYS, retentionCutoff } from "./retention";

afterEach(() => {
  vi.useRealTimers();
});

describe("retentionCutoff", () => {
  it("通知紀錄保留 14 天", () => {
    expect(RETENTION_DAYS).toBe(14);
  });

  it("截止時間是 14 天前的同一刻", () => {
    expect(retentionCutoff(new Date("2026-10-21T08:30:00Z"))).toEqual(new Date("2026-10-07T08:30:00Z"));
  });

  it("沒給時間就用現在", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-03-15T00:00:00Z"));

    expect(retentionCutoff()).toEqual(new Date("2026-03-01T00:00:00Z"));
  });
});
