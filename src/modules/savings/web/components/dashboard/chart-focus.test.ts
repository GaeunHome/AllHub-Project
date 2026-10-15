import { describe, expect, it } from "vitest";
import { NO_FOCUS, activeKey, chartFocusReducer, toggleSelection, type ChartFocus } from "./chart-focus";

const run = (...events: Parameters<typeof chartFocusReducer>[1][]) => events.reduce<ChartFocus>(chartFocusReducer, NO_FOCUS);
const KEYS = ["category:1", "category:2", "uncategorized"];

describe("圓餅圖與圖例同步：滑過、鍵盤焦點、點選", () => {
  it("滑過的那一片優先，其次是鍵盤焦點，最後才是點選固定的", () => {
    expect(activeKey(run({ type: "hover", key: "category:1" }, { type: "focus", key: "category:2" }), "uncategorized", KEYS)).toBe("category:1");
    expect(activeKey(run({ type: "focus", key: "category:2" }), "uncategorized", KEYS)).toBe("category:2");
    expect(activeKey(NO_FOCUS, "uncategorized", KEYS)).toBe("uncategorized");
    expect(activeKey(NO_FOCUS, null, KEYS)).toBeNull();
  });

  it("移開或失去焦點時只清掉同一片：從圖例的一列移到下一列，先進後出也不會把新的清掉", () => {
    const state = run({ type: "hover", key: "category:1" }, { type: "hover", key: "category:2" }, { type: "unhover", key: "category:1" });

    expect(state.hover).toBe("category:2");
    expect(run({ type: "focus", key: "category:1" }, { type: "blur", key: "category:1" }).focus).toBeNull();
  });

  it("切換分組後舊的 key 不在這一組裡：當作沒有選，不會亮起不存在的一片", () => {
    expect(activeKey(run({ type: "hover", key: "purpose:3" }), "purpose:3", ["account:1", "account:2"])).toBeNull();
  });

  it("全部清掉（切換分組、換月份）", () => {
    expect(run({ type: "hover", key: "category:1" }, { type: "focus", key: "category:2" }, { type: "reset" })).toEqual(NO_FOCUS);
  });

  it("點同一片是取消，點別片是換過去", () => {
    expect(toggleSelection(null, "category:1")).toBe("category:1");
    expect(toggleSelection("category:1", "category:1")).toBeNull();
    expect(toggleSelection("category:1", "category:2")).toBe("category:2");
  });
});
