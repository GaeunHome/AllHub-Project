import { describe, expect, it } from "vitest";
import { retentionCutoff } from "./retention";

describe("retentionCutoff", () => {
  it("截止時間是 14 天前的同一刻", () => {
    expect(retentionCutoff(new Date("2026-10-21T08:30:00Z"))).toEqual(new Date("2026-10-07T08:30:00Z"));
  });
});
