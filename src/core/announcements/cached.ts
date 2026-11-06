import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { CoreAnnouncement } from "../db/schema";
import { announcementTags } from "./cache-tags";
import { listAnnouncements } from "./service";

// 首頁每個人都會讀 全站一份 過期的在快取外面用這次請求的時間濾掉 管理頁也用這份
export async function cachedAnnouncements(): Promise<CoreAnnouncement[]> {
  "use cache: remote";
  cacheLife("db");
  cacheTag(announcementTags.announcements);
  return listAnnouncements();
}
