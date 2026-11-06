import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TEST_SESSION, requireOwner } from "@/dev/session-stub";
import { mocksOf, textOf } from "@/dev/test-helpers";
import type { ModuleInfo } from "../../module";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("../../status", () => ({ listStatus: vi.fn() }));

const status = mocksOf(await import("../../status"), "listStatus");
const { StatusSections } = await import("../status-page");

const MODULES: ModuleInfo[] = [{ id: "starrail", name: "星穹鐵道", href: "/starrail", description: "", icon: "/icons/ui/train-front.svg", services: [{ id: "starrail:warps", label: "HoYoLAB 躍遷紀錄" }] }];
const AT = new Date("2026-11-05T05:20:00Z");
const render = async () => renderToStaticMarkup((await StatusSections({ modules: MODULES, tasks: ["starrail:warps"] })) as ReactElement);

beforeEach(() => {
  requireOwner.mockReset().mockResolvedValue(TEST_SESSION);
  status.listStatus.mockReset().mockResolvedValue({
    services: [{ service: "starrail:warps", lastOkAt: null, lastErrorAt: AT, lastError: "-100：authkey error" }],
    cron: [{ task: "starrail:warps", lastRunAt: AT, durationMs: 2500, ok: true, summary: "同步 0 個帳號，1 個失敗" }],
  });
});

describe("系統狀態頁", () => {
  it("不是站長_讀資料前就被擋下", async () => {
    requireOwner.mockRejectedValue(new Error("NEXT_REDIRECT:/"));

    await expect(render()).rejects.toThrow("NEXT_REDIRECT");

    expect(status.listStatus).not.toHaveBeenCalled();
  });

  it("每個外部服務寫出狀態與原因 時間用台北時間", async () => {
    const text = textOf(await render());

    expect(text).toContain("HoYoLAB 躍遷紀錄");
    expect(text).toContain("異常");
    expect(text).toContain("-100：authkey error");
    expect(text).toContain("2026/11/5 13:20");
  });

  it("有異常時 最上面寫出幾個異常 服務與排程都算", async () => {
    expect(textOf(await render())).toContain("2 個異常");
  });

  it("都正常時 最上面寫全部正常", async () => {
    status.listStatus.mockResolvedValue({
      services: [{ service: "starrail:warps", lastOkAt: AT, lastErrorAt: null, lastError: null }],
      cron: [{ task: "starrail:warps", lastRunAt: AT, durationMs: 2500, ok: true, summary: "完成" }],
    });

    const html = await render();

    expect(textOf(html)).toContain("全部正常");
    expect(html).not.toContain("status-dot-danger");
  });

  it("使用者要的 正常是綠色圓圈 異常是紅色圓圈 排程只成功一部分也是紅色", async () => {
    const html = await render();

    expect(html).toContain("status-dot-danger");
    expect(html).not.toContain("status-dot-warning");

    status.listStatus.mockResolvedValue({
      services: [{ service: "starrail:warps", lastOkAt: AT, lastErrorAt: null, lastError: null }],
      cron: [],
    });

    expect(await render()).toContain("status-dot-success");
  });

  it("排程寫中文名稱 代碼放在旁邊", async () => {
    const text = textOf(renderToStaticMarkup((await StatusSections({ modules: MODULES, tasks: ["starrail:warps"], cronLabels: { "starrail:warps": "讀躍遷紀錄" } })) as ReactElement));

    expect(text).toContain("讀躍遷紀錄");
    expect(text).toContain("starrail:warps");
  });

  it("排程寫出最後一次的結果與花了多久", async () => {
    const text = textOf(await render());

    expect(text).toContain("starrail:warps");
    expect(text).toContain("同步 0 個帳號，1 個失敗");
    expect(text).toContain("2.5 秒");
  });
});
