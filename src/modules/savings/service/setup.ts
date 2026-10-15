import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/core/db";
import { coreUsers } from "@/core/db/schema";
import { savingsCategories, savingsPurposes } from "../data/schema";
import type { CategoryKind, PaletteColor } from "../lib/kinds";

const DEFAULT_PURPOSES: { name: string; color: PaletteColor }[] = [
  { name: "生活費", color: "blue" },
  { name: "緊急預備金", color: "amber" },
  { name: "投資", color: "violet" },
];

const DEFAULT_CATEGORIES: Record<CategoryKind, { name: string; color: PaletteColor }[]> = {
  income: [{ name: "薪水", color: "green" }],
  expense: [
    { name: "餐飲", color: "orange" },
    { name: "交通", color: "blue" },
    { name: "訂閱", color: "violet" },
    // 灰色留給未分類 青色是其他預設都沒用到的顏色
    { name: "提領現金", color: "teal" },
  ],
};

const COUNT = sql<number>`count(*)::int`;

/**
 * 開始使用 還沒有任何用途或分類時才建預設的
 * 重按不會重複 回傳新建的數量
 */
export async function setupDefaults(userId: string): Promise<{ purposes: number; categories: number }> {
  return db().transaction(async (tx) => {
    // 鎖住使用者再數 連按兩次時第二次會等第一次建好
    // 還沒有用途時沒有別的列可以鎖
    await tx.select({ id: coreUsers.id }).from(coreUsers).where(eq(coreUsers.id, userId)).for("no key update");
    const [[purposes], [categories]] = await Promise.all([
      tx.select({ count: COUNT }).from(savingsPurposes).where(eq(savingsPurposes.userId, userId)),
      tx.select({ count: COUNT }).from(savingsCategories).where(eq(savingsCategories.userId, userId)),
    ]);

    // 新增用途與分類不等這把鎖 數完後才寫入的同名資料留著 預設的略過
    // 唯一索引的衝突才不會變成失敗 數量只算真的建立的
    const created = { purposes: 0, categories: 0 };
    if (purposes.count === 0) {
      const rows = DEFAULT_PURPOSES.map((purpose, sortOrder) => ({ ...purpose, userId, sortOrder }));
      created.purposes = (await tx.insert(savingsPurposes).values(rows).onConflictDoNothing().returning({ id: savingsPurposes.id })).length;
    }
    if (categories.count === 0) {
      const rows = Object.entries(DEFAULT_CATEGORIES).flatMap(([kind, list]) => list.map((category, sortOrder) => ({ ...category, kind: kind as CategoryKind, userId, sortOrder })));
      created.categories = (await tx.insert(savingsCategories).values(rows).onConflictDoNothing().returning({ id: savingsCategories.id })).length;
    }
    return created;
  });
}
