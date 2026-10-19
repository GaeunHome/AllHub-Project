import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { notificationsCron } from "@/core/notifications/cron";
import { cronTasks } from "./cron";

const { crons } = JSON.parse(readFileSync(new URL("../../vercel.json", import.meta.url), "utf8")) as { crons: { path: string; schedule: string }[] };

// 登記了卻沒排進 vercel.json 的排程永遠不會自動跑 反過來 Vercel 會呼叫到不存在的排程
// 只能手動跑的排程列在這裡
const MANUAL_ONLY: string[] = [];

describe("排程清單", () => {
  it("登記的排程（模組的與 core 的 notifications:cleanup）跟 vercel.json 的路徑一一對應；只能手動跑的另外列", () => {
    const registered = [...Object.keys(cronTasks), ...Object.keys(notificationsCron)];
    const scheduled = [...new Set(crons.map((c) => c.path))].sort();

    expect(MANUAL_ONLY.filter((task) => !registered.includes(task))).toEqual([]);
    expect(scheduled).toEqual(
      registered
        .filter((task) => !MANUAL_ONLY.includes(task))
        .map((task) => `/api/cron/${task}`)
        .sort(),
    );
  });

  it("理財的固定收支每天自動記帳：vercel.json 在台北 00:30 呼叫（UTC 16:30，Hobby 只保證那個小時內，台北還是同一天）", () => {
    expect(crons).toContainEqual({ path: "/api/cron/savings:recurring", schedule: "30 16 * * *" });
  });

  it("星穹鐵道的自動兌換每天一次：vercel.json 只有一條、每天固定的時間", () => {
    const redeem = crons.filter((c) => c.path === "/api/cron/starrail:redeem");

    expect(redeem).toHaveLength(1);
    expect(redeem[0].schedule).toMatch(/^\d+ \d+ \* \* \*$/);
  });

  it("天氣的下雨提醒每天早上一次：vercel.json 只有一條、在台北 06:00 那個小時（UTC 22 點，Hobby 只保證那個小時內）", () => {
    const rain = crons.filter((c) => c.path === "/api/cron/weather:rain").map((c) => c.schedule);

    expect(rain).toHaveLength(1);
    expect(rain[0]).toMatch(/^\d{1,2} 22 \* \* \*$/);
  });

  it("開拓力提醒大約每小時跑一次：vercel.json 每個 UTC 小時各一條（Hobby 每條一天最多一次；GitHub Actions 的定時排程常漏跑，不再用）", () => {
    const stamina = crons.filter((c) => c.path === "/api/cron/starrail:stamina").map((c) => c.schedule);

    expect(stamina.sort()).toEqual(Array.from({ length: 24 }, (_, hour) => `0 ${hour} * * *`).sort());
  });
});
