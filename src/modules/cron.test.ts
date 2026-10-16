import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cronTasks } from "./cron";

const { crons } = JSON.parse(readFileSync(new URL("../../vercel.json", import.meta.url), "utf8")) as { crons: { path: string; schedule: string }[] };

describe("排程清單", () => {
  it("理財的固定收支每天自動記帳已登記，vercel.json 在台北 00:30 呼叫（UTC 16:30，Hobby 只保證那個小時內，台北還是同一天）", () => {
    expect(Object.keys(cronTasks)).toContain("savings:recurring");
    expect(crons).toContainEqual({ path: "/api/cron/savings:recurring", schedule: "30 16 * * *" });
  });

  it("星穹鐵道的自動兌換每天一次：已登記，vercel.json 只有一條、每天固定的時間", () => {
    const redeem = crons.filter((c) => c.path === "/api/cron/starrail:redeem");

    expect(Object.keys(cronTasks)).toContain("starrail:redeem");
    expect(redeem).toHaveLength(1);
    expect(redeem[0].schedule).toMatch(/^\d+ \d+ \* \* \*$/);
  });

  it("開拓力提醒大約每小時跑一次：vercel.json 每個 UTC 小時各一條（Hobby 每條一天最多一次；GitHub Actions 的定時排程常漏跑，不再用）", () => {
    const stamina = crons.filter((c) => c.path === "/api/cron/starrail:stamina").map((c) => c.schedule);

    expect(Object.keys(cronTasks)).toContain("starrail:stamina");
    expect(stamina.sort()).toEqual(Array.from({ length: 24 }, (_, hour) => `0 ${hour} * * *`).sort());
  });
});
