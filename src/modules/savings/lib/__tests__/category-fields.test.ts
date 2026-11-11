import { describe, expect, it } from "vitest";
import { parseCategoryFields } from "../category-fields";

describe("parseCategoryFields", () => {
  it("支出分類_可以設每月預算_留空是不設", () => {
    expect(parseCategoryFields({ name: "餐飲", monthlyBudget: "6,000", icon: "utensils" }, "expense")).toEqual({
      ok: true,
      value: { name: "餐飲", monthlyBudget: 6000, icon: "utensils" },
    });
    expect(parseCategoryFields({ name: "餐飲", monthlyBudget: " ", icon: "" }, "expense")).toMatchObject({ ok: true, value: { monthlyBudget: null } });
  });

  it("收入分類_預算不適用而忽略", () => {
    expect(parseCategoryFields({ name: "薪水", monthlyBudget: "100", icon: "briefcase" }, "income")).toEqual({ ok: true, value: { name: "薪水", monthlyBudget: null, icon: "briefcase" } });
  });

  it("預算 0 元_至少 1 元", () => {
    expect(parseCategoryFields({ name: "餐飲", monthlyBudget: "0", icon: "" }, "expense")).toEqual({ ok: false, error: "金額至少 1 元" });
  });

  it("沒選圖示_是 null（畫面用預設的圖示）", () => {
    expect(parseCategoryFields({ name: "餐飲", monthlyBudget: "", icon: " " }, "expense")).toMatchObject({ ok: true, value: { icon: null } });
  });

  it.each(["rocket", "Utensils", "constructor", "toString", "__proto__", "landmark"])("圖示 %j 不在選擇器上（含物件內建的名稱、帳戶用的圖示）_錯誤", (icon) => {
    expect(parseCategoryFields({ name: "餐飲", monthlyBudget: "", icon }, "expense")).toEqual({ ok: false, error: "圖示不正確" });
  });
});
