import { fail, ok, type Parsed } from "@/core/parsed";
import { CATEGORY_ICONS, type CategoryIcon, type CategoryKind } from "./kinds";
import { optional, parseAmount, parseName, type Fields } from "./validation";

// 分類的表單 共用的金額與名稱檢查在 validation.ts

/** 只收選擇器上的圖示 沒選是 null */
function parseCategoryIcon(raw: string): Parsed<CategoryIcon | null> {
  const text = raw.trim();
  if (text === "") return ok(null);
  return Object.hasOwn(CATEGORY_ICONS, text) ? ok(text as CategoryIcon) : fail("圖示不正確");
}

export type CategoryInput = { name: string; monthlyBudget: number | null; icon: CategoryIcon | null };

/** 只有支出能設預算 收入的忽略 顏色由 service 給 */
export function parseCategoryFields(fields: Fields<"name" | "monthlyBudget" | "icon">, kind: CategoryKind): Parsed<CategoryInput> {
  const name = parseName(fields.name);
  if (!name.ok) return name;
  const monthlyBudget = kind === "expense" ? optional(fields.monthlyBudget, parseAmount) : ok(null);
  if (!monthlyBudget.ok) return monthlyBudget;
  const icon = parseCategoryIcon(fields.icon);
  if (!icon.ok) return icon;
  return ok({ name: name.value, monthlyBudget: monthlyBudget.value, icon: icon.value });
}
