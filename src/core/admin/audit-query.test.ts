import { describe, expect, it } from "vitest";
import { auditHref, parseAuditQuery } from "./audit-query";

const BATCH = "6f1c2b9e-3a4d-4c5e-8f70-1a2b3c4d5e6f";

describe("操作紀錄的網址條件", () => {
  it("認得的條件照收", () => {
    expect(parseAuditQuery({ actor: "alice", module: "savings", outcome: "failure", ip: "203.0.113.7", batch: BATCH, page: "3" })).toEqual({ actor: "alice", module: "savings", outcome: "failure", ip: "203.0.113.7", batch: BATCH, page: 3 });
  });

  it("網址誰都能改：認不得的條件當成沒有篩選，頁數不對回第一頁", () => {
    expect(parseAuditQuery({ module: "../etc", outcome: "maybe", batch: "not-a-uuid", page: "-2" })).toEqual({ page: 1 });
    expect(parseAuditQuery({ page: "1.5" })).toEqual({ page: 1 });
    expect(parseAuditQuery({ actor: ["a", "b"] })).toEqual({ page: 1 });
  });

  it("換條件時回到第一頁，其他條件留著；值是 undefined 就拿掉", () => {
    const query = { actor: "alice", outcome: "failure" as const, page: 4 };

    expect(auditHref(query, { ip: "203.0.113.7" })).toBe("/admin/logs?actor=alice&outcome=failure&ip=203.0.113.7");
    expect(auditHref(query, { actor: undefined })).toBe("/admin/logs?outcome=failure");
  });

  it("換頁時保留條件，第一頁不寫 page", () => {
    expect(auditHref({ actor: "alice", page: 2 }, { page: 3 })).toBe("/admin/logs?actor=alice&page=3");
    expect(auditHref({ page: 2 }, { page: 1 })).toBe("/admin/logs");
  });
});
