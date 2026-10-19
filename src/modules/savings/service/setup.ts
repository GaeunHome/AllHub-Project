import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/core/db";
import { lockUserRow } from "@/core/db/users";
import { savingsCategories } from "../data/schema";
import type { CategoryIcon, CategoryKind, PaletteColor } from "../lib/kinds";

const DEFAULT_CATEGORIES: Record<CategoryKind, { name: string; color: PaletteColor; icon: CategoryIcon }[]> = {
  income: [{ name: "薪水", color: "green", icon: "briefcase" }],
  expense: [
    { name: "餐飲", color: "orange", icon: "utensils" },
    { name: "交通", color: "blue", icon: "bus" },
    { name: "訂閱", color: "violet", icon: "repeat" },
    // 灰色留給未分類 青色是其他預設都沒用到的顏色
    { name: "提領現金", color: "teal", icon: "banknote" },
  ],
};

const COUNT = sql<number>`count(*)::int`;

/**
 * 開始使用 還沒有任何分類時才建預設的
 * 重按不會重複 回傳新建的數量
 */
export async function setupDefaults(userId: string): Promise<{ categories: number }> {
  return db().transaction(async (tx) => {
    // 鎖住使用者再數 連按兩次時第二次會等第一次建好
    // 還沒有分類時沒有別的列可以鎖
    await lockUserRow(tx, userId, "no key update");
    const [categories] = await tx.select({ count: COUNT }).from(savingsCategories).where(eq(savingsCategories.userId, userId));
    if (categories.count > 0) return { categories: 0 };

    // 新增分類不等這把鎖 數完後才寫入的同名分類留著 預設的略過
    // 唯一索引的衝突才不會變成失敗 數量只算真的建立的
    const rows = Object.entries(DEFAULT_CATEGORIES).flatMap(([kind, list]) => list.map((category, sortOrder) => ({ ...category, kind: kind as CategoryKind, userId, sortOrder })));
    const created = await tx.insert(savingsCategories).values(rows).onConflictDoNothing().returning({ id: savingsCategories.id });
    return { categories: created.length };
  });
}
