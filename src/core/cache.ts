import "server-only";
import { revalidateTag, updateTag } from "next/cache";
import type { CronTask } from "./module";

// 規則見 CLAUDE.md「快取」：讀取標上讀到的資料表 tag，寫入點讓改到的 tag 失效

/** 「擁有者:資源[:id]」，擁有者是模組 id 或 core；定義集中在各自的 cache-tags.ts，呼叫處不手寫字串 */
export type CacheTag<Owner extends string = string> = `${Owner}:${string}`;

/** Server Action 寫入後呼叫：下一次讀取一定等新資料，使用者馬上看到自己的修改 */
export function updateTags(...tags: CacheTag[]): void {
  for (const tag of tags) updateTag(tag);
}

/** Route Handler、排程、after() 寫入後呼叫：這些地方不能用 updateTag，expire: 0 讓下一個請求直接讀新資料、不先拿到舊的 */
export function expireTags(...tags: CacheTag[]): void {
  for (const tag of tags) revalidateTag(tag, { expire: 0 });
}

/** 登記排程時包一層：失敗前可能已經寫入一部分，所以成功或失敗都讓 tag 失效 */
export function expiringTask(task: CronTask, ...tags: CacheTag[]): CronTask {
  return async () => {
    try {
      return await task();
    } finally {
      expireTags(...tags);
    }
  };
}
