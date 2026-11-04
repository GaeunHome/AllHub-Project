import { beforeEach, describe, expect, it, vi } from "vitest";
import { STUB_ACTOR, audit, auditActor } from "@/dev/audit-stub";
import { captureErrorLog } from "@/dev/test-helpers";
import { runAction } from "./action";
import { UserError } from "./form";

const SCOPE = { module: "savings", action: "新增帳戶" };

beforeEach(() => {
  auditActor.mockReset().mockResolvedValue(STUB_ACTOR);
});

describe("runAction 把使用者的操作寫進操作紀錄", () => {
  it("成功：記誰、哪個功能、做了什麼", async () => {
    await runAction(SCOPE, async () => "已新增");

    expect(audit).toHaveBeenCalledWith(STUB_ACTOR, expect.objectContaining({ module: "savings", action: "新增帳戶", outcome: "success" }));
  });

  it("輸入錯誤、回傳 error、預期外的錯誤都算失敗", async () => {
    captureErrorLog();

    await runAction(SCOPE, async () => Promise.reject(new UserError("名稱重複")));
    await runAction(SCOPE, async () => ({ error: "找不到" }));
    await runAction(SCOPE, async () => Promise.reject(new TypeError("boom")));

    expect(audit.mock.calls.map(([, entry]) => entry.outcome)).toEqual(["failure", "failure", "failure"]);
  });

  it("對象與細節照傳：站長停用了誰要看得出來", async () => {
    await runAction({ module: "admin", action: "停用帳號", target: "bob" }, async () => {});

    expect(audit.mock.calls[0][1]).toMatchObject({ target: "bob" });
  });

  it("動作開始前就讀好是誰：刪除帳號之後 session 已經不在，紀錄還是要寫得出是誰刪的", async () => {
    const order: string[] = [];
    auditActor.mockImplementation(async () => {
      order.push("讀登入者");
      return STUB_ACTOR;
    });

    await runAction(SCOPE, async () => {
      order.push("動作");
    });

    expect(order).toEqual(["讀登入者", "動作"]);
  });

  it("讀不到登入者時操作照常完成，只是不記", async () => {
    auditActor.mockRejectedValue(new Error("資料庫忙碌"));
    const work = vi.fn(async () => "已新增");

    expect(await runAction(SCOPE, work)).toEqual({ message: "已新增" });
    expect(work).toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });
});
