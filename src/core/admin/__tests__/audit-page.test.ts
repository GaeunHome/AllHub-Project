import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TEST_SESSION, requireOwner } from "@/dev/session-stub";
import { mocksOf, textOf } from "@/dev/test-helpers";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("../service", () => ({ listAuditLogs: vi.fn(), listAuditActors: vi.fn() }));

const service = mocksOf(await import("../service"), "listAuditLogs", "listAuditActors");
const { AuditLogSection } = await import("../audit-page");

const MODULES = [{ id: "savings", name: "理財", href: "/savings", description: "", icon: "/icons/ui/wallet.svg" }] as const;
const ROW = {
  id: 1,
  createdAt: new Date("2026-11-04T02:30:00Z"),
  batchId: "6f1c2b9e-3a4d-4c5e-8f70-1a2b3c4d5e6f",
  actorId: null,
  actorName: "bob",
  ip: "203.0.113.7",
  module: "savings",
  action: "新增帳戶",
  outcome: "success" as const,
  target: null,
  detail: null,
  attempts: 1,
  mergeKey: null,
};
const render = async (params: Record<string, string> = {}) => renderToStaticMarkup((await AuditLogSection({ modules: [...MODULES], searchParams: Promise.resolve(params) })) as ReactElement);

beforeEach(() => {
  requireOwner.mockReset().mockResolvedValue(TEST_SESSION);
  service.listAuditLogs.mockReset().mockResolvedValue({ rows: [ROW], total: 1 });
  service.listAuditActors.mockReset().mockResolvedValue(["alice", "bob"]);
});

describe("操作紀錄頁（只有站長）", () => {
  it("成員打開這一頁：導回首頁，紀錄一筆都不讀", async () => {
    requireOwner.mockRejectedValue(new Error("NEXT_REDIRECT:/"));

    await expect(render()).rejects.toThrow("NEXT_REDIRECT:/");
    expect(service.listAuditLogs).not.toHaveBeenCalled();
    expect(service.listAuditActors).not.toHaveBeenCalled();
  });

  it("每一列看得到時間（台北）、使用者、IP、功能名稱、操作、結果與批次", async () => {
    const text = textOf(await render());

    for (const shown of ["2026/11/4 10:30", "bob", "203.0.113.7", "理財", "新增帳戶", "成功", "6f1c2b9e"]) expect(text).toContain(shown);
  });

  it("合併的失敗寫出次數；對象與細節寫在操作下面", async () => {
    service.listAuditLogs.mockResolvedValue({ rows: [{ ...ROW, module: "auth", action: "登入失敗", outcome: "failure", attempts: 12, target: "alice" }], total: 1 });

    const text = textOf(await render());

    for (const shown of ["帳號", "登入失敗 ×12", "alice", "失敗"]) expect(text).toContain(shown);
  });

  it("細節裡的模組 id 換成中文名稱，認不得的照原樣", async () => {
    service.listAuditLogs.mockResolvedValue({ rows: [{ ...ROW, module: "admin", action: "建立邀請連結", detail: "7 天 1 次，不開放：savings、garden" }], total: 1 });

    expect(textOf(await render())).toContain("7 天 1 次，不開放：理財、garden");
  });

  it("網址的條件傳給查詢：點批次就看同一次操作的所有列", async () => {
    await render({ batch: ROW.batchId, actor: "bob" });

    expect(service.listAuditLogs).toHaveBeenCalledWith({ batch: ROW.batchId, actor: "bob", page: 1 });
  });

  it("超過一頁時有下一頁，連結保留篩選條件", async () => {
    service.listAuditLogs.mockResolvedValue({ rows: [ROW], total: 120 });

    const markup = await render({ actor: "bob", page: "2" });

    expect(textOf(markup)).toContain("共 120 筆，第 2 / 3 頁");
    expect(markup).toContain('href="/admin/logs?actor=bob&amp;page=3"');
    expect(markup).toContain('href="/admin/logs?actor=bob"');
  });

  it("沒有符合的紀錄時寫出來，不是一片空白", async () => {
    service.listAuditLogs.mockResolvedValue({ rows: [], total: 0 });

    expect(textOf(await render())).toContain("沒有符合的紀錄");
  });
});
