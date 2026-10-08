import { existsSync, readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { stubCoreEnv } from "@/dev/test-env";
import { captureErrorLog, loggedText, mocksOf } from "@/dev/test-helpers";

stubCoreEnv();

vi.mock("./notifications/service", { spy: true });

const { runCron } = await import("./cron");
const { cleanupNotifications } = mocksOf(await import("./notifications/service"), "cleanupNotifications");

const tasks = {
  "demo:ok": vi.fn(),
  "demo:boom": vi.fn(),
};

const authed = (url = "https://hub.test/api/cron") => new Request(url, { headers: { authorization: `Bearer ${"c".repeat(16)}` } });

beforeEach(() => {
  tasks["demo:ok"].mockReset().mockResolvedValue("完成");
  tasks["demo:boom"].mockReset().mockRejectedValue(new Error("Cookie: ltoken_v2=v2_top_secret 無效"));
  cleanupNotifications.mockReset().mockResolvedValue("刪除 2 筆超過 14 天的網站通知");
});

describe("runCron", () => {
  it("沒帶或帶錯密鑰_401", async () => {
    const response = await runCron(new Request("https://hub.test/api/cron/demo:ok"), "demo:ok", tasks);
    expect(response.status).toBe(401);
  });

  it("用路徑參數指定排程_只跑那一個", async () => {
    const response = await runCron(authed(), "demo:ok", tasks);

    expect(await response.json()).toEqual({ results: { "demo:ok": "完成" } });
    expect(tasks["demo:boom"]).not.toHaveBeenCalled();
  });

  it("未知排程_404", async () => {
    const response = await runCron(authed(), "nope", tasks);
    expect(response.status).toBe(404);
  });

  it.each(["constructor", "toString", "hasOwnProperty", "valueOf", "__proto__"])("Object 原型上的名稱（%s）_當成未知排程回 404，什麼都不執行", async (name) => {
    const log = captureErrorLog();

    const response = await runCron(authed(), name, tasks);

    expect(response.status).toBe(404);
    expect((await response.json()).tasks).not.toContain(name);
    expect(tasks["demo:ok"]).not.toHaveBeenCalled();
    expect(tasks["demo:boom"]).not.toHaveBeenCalled();
    expect(cleanupNotifications).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it("排程丟錯_回應只寫摘要_不帶錯誤原文（指定單一排程）", async () => {
    captureErrorLog();
    const response = await runCron(authed(), "demo:boom", tasks);
    const body = JSON.stringify(await response.json());

    expect(body).toContain("失敗（詳見伺服器 log）");
    expect(body).not.toContain("top_secret");
  });

  it("排程丟錯_log 也只記錯誤種類_不帶錯誤原文", async () => {
    const log = captureErrorLog();

    await runCron(authed(), "demo:boom", tasks);

    expect(log).toHaveBeenCalled();
    const logged = loggedText(log);
    expect(logged).not.toContain("top_secret");
  });
});

describe("排程網址", () => {
  it("只有 /api/cron/<排程> 一種寫法：舊的 /api/cron?task= 與不帶名稱全部執行都已移除", () => {
    expect(existsSync(new URL("../app/api/cron/route.ts", import.meta.url))).toBe(false);
    expect(existsSync(new URL("../app/api/cron/[task]/route.ts", import.meta.url))).toBe(true);
  });
});

describe("core 自己的排程", () => {
  it("notifications:cleanup 由 core 合併進排程清單_src/app 只要傳模組的排程", async () => {
    const response = await runCron(authed(), "notifications:cleanup", tasks);

    expect(await response.json()).toEqual({ results: { "notifications:cleanup": "刪除 2 筆超過 14 天的網站通知" } });
    expect(cleanupNotifications).toHaveBeenCalledOnce();
  });

  it("模組的排程不能蓋掉 core 的同名排程", async () => {
    const impostor = vi.fn().mockResolvedValue("模組的版本");

    const response = await runCron(authed(), "notifications:cleanup", { ...tasks, "notifications:cleanup": impostor });

    expect(await response.json()).toEqual({ results: { "notifications:cleanup": "刪除 2 筆超過 14 天的網站通知" } });
    expect(impostor).not.toHaveBeenCalled();
  });

  it("vercel.json 每天呼叫一次 notifications:cleanup_時段跟其他排程錯開", () => {
    const { crons } = JSON.parse(readFileSync(new URL("../../vercel.json", import.meta.url), "utf8")) as { crons: { path: string; schedule: string }[] };
    const cleanup = crons.find((c) => c.path === "/api/cron/notifications:cleanup");

    expect(cleanup).toBeDefined();
    const [minute, hour, ...rest] = cleanup!.schedule.split(" ");
    expect([minute, hour].every((v) => /^\d+$/.test(v))).toBe(true);
    expect(rest).toEqual(["*", "*", "*"]);
    // Hobby 方案只保證在設定的那個小時內觸發，所以要排在沒有其他排程的小時
    const otherHours = crons.filter((c) => c !== cleanup).map((c) => c.schedule.split(" ")[1]);
    expect(otherHours).not.toContain(hour);
  });
});
