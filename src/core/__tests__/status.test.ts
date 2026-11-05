import { describe, expect, it, vi } from "vitest";
import { stubCoreEnv } from "@/dev/test-env";
import { captureErrorLog, loggedText } from "@/dev/test-helpers";

stubCoreEnv();
vi.mock("../db", () => ({
  db: () => {
    throw new Error("postgres://user:top_secret@host/db");
  },
}));

const { recordCronRun, reportService } = await import("../status");

describe("狀態寫不進去時不影響排程與使用者的操作", () => {
  it("排程紀錄_不丟錯 log 只記種類", async () => {
    const log = captureErrorLog();

    await expect(recordCronRun({ task: "demo:ok", startedAt: new Date(), durationMs: 1, ok: true, summary: "完成" })).resolves.toBeUndefined();

    expect(loggedText(log)).not.toContain("top_secret");
  });

  it("服務狀態_不丟錯 log 只記種類", async () => {
    const log = captureErrorLog();

    await expect(reportService("starrail:warps", "讀不到")).resolves.toBeUndefined();

    expect(loggedText(log)).not.toContain("top_secret");
  });
});
