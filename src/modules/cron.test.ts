import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cronTasks } from "./cron";

describe("排程清單", () => {
  it("理財的固定收支每天自動記帳已登記，vercel.json 在台北 00:30 呼叫（UTC 16:30，Hobby 只保證那個小時內，台北還是同一天）", () => {
    const { crons } = JSON.parse(readFileSync(new URL("../../vercel.json", import.meta.url), "utf8")) as { crons: { path: string; schedule: string }[] };

    expect(Object.keys(cronTasks)).toContain("savings:recurring");
    expect(crons).toContainEqual({ path: "/api/cron/savings:recurring", schedule: "30 16 * * *" });
  });
});
