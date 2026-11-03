import "server-only";
import { eq } from "drizzle-orm";
import { cache } from "react";
import { db } from "../db";
import { coreModuleDenials } from "../db/schema";
import type { SessionUser } from "./users";

type Person = Pick<SessionUser, "id" | "role">;

const NOTHING_DENIED: ReadonlySet<string> = new Set();

/**
 * 導覽列 首頁與頁面在同一次請求都會問 用 React cache 只查一次資料庫
 * 不跨請求快取 站長關掉後下一次請求就生效
 */
const deniedIdsOf = cache(async (userId: string): Promise<ReadonlySet<string>> => {
  const rows = await db().select({ moduleId: coreModuleDenials.moduleId }).from(coreModuleDenials).where(eq(coreModuleDenials.userId, userId));
  return new Set(rows.map((row) => row.moduleId));
});

/** 這個人不能用的模組 站長一律全部能用 */
export async function deniedModules({ id, role }: Person): Promise<ReadonlySet<string>> {
  return role === "owner" ? NOTHING_DENIED : deniedIdsOf(id);
}

export async function canUseModule(person: Person, moduleId: string): Promise<boolean> {
  return !(await deniedModules(person)).has(moduleId);
}
