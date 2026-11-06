import { describe, expect, it } from "vitest";
import type { ModuleInfo } from "../../module";
import { cronViews, serviceViews, statusSummary } from "../status-view";

const AT = new Date("2026-11-05T05:20:00Z");
const EARLIER = new Date("2026-11-04T05:20:00Z");

const MODULES = [
  { id: "starrail", name: "星穹鐵道", href: "/starrail", description: "", icon: "/icons/ui/train-front.svg", services: [{ id: "starrail:note", label: "HoYoLAB 即時便箋" }, { id: "starrail:warps", label: "HoYoLAB 躍遷紀錄" }] },
  { id: "weather", name: "天氣", href: "/", description: "", icon: "/icons/ui/cloud-sun.svg", services: [{ id: "weather:forecast", label: "氣象署 天氣預報" }] },
  { id: "travel", name: "旅遊", href: "/travel", description: "", icon: "/icons/ui/plane.svg" },
] satisfies ModuleInfo[];

const service = (id: string, lastOkAt: Date | null, lastErrorAt: Date | null, lastError: string | null = null) => ({ service: id, lastOkAt, lastErrorAt, lastError });

describe("serviceViews：外部服務的燈號", () => {
  it("最後一次是失敗_有問題 寫出原因與時間", () => {
    const [warps] = serviceViews(MODULES, [service("starrail:warps", EARLIER, AT, "-100：authkey error")]);

    expect(warps).toMatchObject({ label: "HoYoLAB 躍遷紀錄", state: "problem", at: AT, error: "-100：authkey error" });
  });

  it("從來沒成功過的失敗也算有問題", () => {
    expect(serviceViews(MODULES, [service("starrail:warps", null, AT, "讀不到")])[0].state).toBe("problem");
  });

  it("失敗之後成功了_正常 不再顯示舊的錯誤", () => {
    const row = serviceViews(MODULES, [service("starrail:warps", AT, EARLIER, "舊的錯誤")]).find((view) => view.id === "starrail:warps")!;

    expect(row).toMatchObject({ state: "ok", at: AT, error: null });
  });

  it("還沒有紀錄的服務也列出來 例如沒設授權碼 不算有問題", () => {
    expect(serviceViews(MODULES, []).map((view) => view.state)).toEqual(["none", "none", "none"]);
  });

  it("有問題的排最前面 其他照模組宣告的順序", () => {
    const rows = [service("starrail:note", AT, null), service("weather:forecast", null, AT, "讀不到天氣預報")];

    expect(serviceViews(MODULES, rows).map((view) => view.id)).toEqual(["weather:forecast", "starrail:note", "starrail:warps"]);
  });
});

const run = (task: string, ok: boolean, summary: string, lastRunAt = AT) => ({ task, lastRunAt, durationMs: 1500, ok, summary });

describe("cronViews：排程清單", () => {
  it("丟錯的是失敗", () => {
    expect(cronViews(["demo:a"], [run("demo:a", false, "失敗：TypeError")])[0].state).toBe("failed");
  });

  it.each([["同步 2 個帳號，新增 0 抽，1 個失敗"], ["寄出 3 則，1 則寄不出去"], ["讀不到天氣預報，今天略過"]])("跑完了但摘要說有部分失敗_標成要注意：%s", (summary) => {
    expect(cronViews(["demo:a"], [run("demo:a", true, summary)])[0].state).toBe("warning");
  });

  it("沒有失敗字眼的是正常 略過不算問題", () => {
    expect(cronViews(["demo:a"], [run("demo:a", true, "沒有設定氣象署的授權碼，略過")])[0].state).toBe("ok");
  });

  it("登記了但沒有紀錄的排程也列出來 才看得到它根本沒跑", () => {
    expect(cronViews(["demo:never"], [])).toEqual([{ task: "demo:never", label: "demo:never", state: "none", at: null, durationMs: null, summary: null }]);
  });

  it("已經拿掉的排程留下的紀錄不列", () => {
    expect(cronViews(["demo:a"], [run("demo:a", true, "完成"), run("demo:old", false, "失敗")]).map((view) => view.task)).toEqual(["demo:a"]);
  });

  it("失敗的在前 接著要注意 正常的照時間新到舊 沒紀錄的最後", () => {
    const rows = [run("demo:old", true, "完成", EARLIER), run("demo:new", true, "完成"), run("demo:warn", true, "1 個失敗"), run("demo:fail", false, "失敗")];

    expect(cronViews(["demo:never", "demo:old", "demo:new", "demo:warn", "demo:fail"], rows).map((view) => view.task)).toEqual(["demo:fail", "demo:warn", "demo:new", "demo:old", "demo:never"]);
  });
});

describe("cronViews：排程的中文名稱", () => {
  it("有登記中文名稱的用中文 沒有的退回代碼 不能整列空白", () => {
    const views = cronViews(["demo:a", "demo:b"], [], { "demo:a": "開拓力提醒" });

    expect(views.map((view) => view.label).toSorted()).toEqual(["demo:b", "開拓力提醒"].toSorted());
  });
});

describe("statusSummary：最上面的總結", () => {
  const ok = { state: "ok" } as const;
  const none = { state: "none" } as const;

  it("服務有問題 排程失敗或只成功一部分都算異常 還沒有紀錄的不算", () => {
    const summary = statusSummary([{ state: "problem" }, ok, none], [{ state: "failed" }, { state: "warning" }, ok, none]);

    expect(summary).toEqual({ problems: 3, services: 3, crons: 4 });
  });

  it("都正常時沒有異常", () => {
    expect(statusSummary([ok], [ok]).problems).toBe(0);
  });
});
