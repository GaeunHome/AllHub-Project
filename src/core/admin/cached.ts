import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { authTags } from "../auth/cache-tags";
import { listInvites, type InviteSummary } from "../auth/invites";
import { listUsers, type ManagedUser } from "./service";

// 只給管理頁用：註冊、刪除帳號與管理頁的動作都會讓 tag 失效；用 npm run account 直接寫資料庫時最多一天後才更新（重新部署立即生效）

export async function cachedUsers(): Promise<ManagedUser[]> {
  "use cache: remote";
  cacheLife("db");
  cacheTag(authTags.users);
  return listUsers();
}

export async function cachedInvites(): Promise<InviteSummary[]> {
  "use cache: remote";
  cacheLife("db");
  // 建立者的帳號名稱來自 core_users
  cacheTag(authTags.invites, authTags.users);
  return listInvites();
}
