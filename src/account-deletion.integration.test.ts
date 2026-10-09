import { eq } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it } from "vitest";
import { hashPassword } from "@/core/auth/credentials";
import { deleteOwnAccount } from "@/core/auth/users";
import { coreInvites, coreNotifications, coreUsers } from "@/core/db/schema";
import { insertTestUser, setupTestDb } from "@/dev/test-db";
import { savingsEntries, savingsGoals } from "@/modules/savings/data/schema";
import { starrailAccounts, starrailCheckinLogs } from "@/modules/starrail/data/schema";
import { twitchFollows, twitchStreamers } from "@/modules/twitch/data/schema";
import { youtubeChannels, youtubeFollows, youtubeSettings, youtubeTranslations } from "@/modules/youtube/data/schema";

// 刪除帳號（core）跟各模組的資料表只靠外鍵連在一起：core 不能 import 模組，所以這個跨模組的檢查放在 src 底下

const getDb = setupTestDb();
const PASSWORD = "correct horse battery staple";
const CH = "UC" + "a".repeat(22);

let member: string;
let owner: string;

/** 一個人在每個模組都留下資料 */
async function seedEverything(userId: string, suffix: string) {
  const db = getDb();
  const [streamer] = await db.insert(twitchStreamers).values({ broadcasterId: `b${suffix}`, login: `streamer${suffix}`, displayName: "主播" }).returning();
  await db.insert(twitchFollows).values({ userId, streamerId: streamer.id });
  await db.insert(youtubeChannels).values({ channelId: CH.slice(0, -1) + suffix, title: "頻道" });
  await db.insert(youtubeFollows).values({ userId, channelId: CH.slice(0, -1) + suffix });
  await db.insert(youtubeSettings).values({ userId, anthropicKey: "v1:cipher", anthropicKeyHint: "1234" });
  await db.insert(youtubeTranslations).values({ videoId: `video000000${suffix}`.slice(-11), requestedBy: userId, sourceKind: "upload", sourceCues: [], translated: [], batches: [] });
  const [account] = await db.insert(starrailAccounts).values({ userId, ltuid: suffix, uid: `80000000${suffix}`, region: "prod_official_asia", cookieEncrypted: "v1:cipher" }).returning();
  await db.insert(starrailCheckinLogs).values({ accountId: account.id, result: "success" });
  const [goal] = await db.insert(savingsGoals).values({ userId, name: "旅行", monthlyAmount: 1000 }).returning();
  await db.insert(savingsEntries).values({ userId, month: "2026-10-01", goalId: goal.id, goalName: goal.name, amount: 1000 });
  await db.insert(coreNotifications).values({ userId, module: "twitch", kind: "stream_online", title: "開台了" });
  await db.insert(coreInvites).values({ tokenHash: `hash${suffix}`, createdBy: userId, expiresAt: new Date(Date.now() + 86_400_000), maxUses: 1 });
}

const countOf = async (table: PgTable, column: PgColumn, userId: string) => (await getDb().select().from(table).where(eq(column, userId))).length;

beforeEach(async () => {
  owner = await insertTestUser(getDb(), "boss", { role: "owner" });
  member = await insertTestUser(getDb(), "member");
  await getDb().update(coreUsers).set({ passwordHash: await hashPassword(PASSWORD) }).where(eq(coreUsers.id, member));
  await seedEverything(member, "1");
  await seedEverything(owner, "2");
});

describe("刪除自己的帳號：各功能的資料一起刪除，共用的翻譯留下但不再連到他", () => {
  it("追蹤名單、加密的 API Key、HoYoLAB 帳號與簽到紀錄、記帳、通知、邀請都刪掉；別人的資料不受影響", async () => {
    expect(await deleteOwnAccount(member, PASSWORD)).toEqual({ ok: true });

    for (const [name, table, column] of [
      ["twitch_follows", twitchFollows, twitchFollows.userId],
      ["youtube_follows", youtubeFollows, youtubeFollows.userId],
      ["youtube_settings", youtubeSettings, youtubeSettings.userId],
      ["starrail_accounts", starrailAccounts, starrailAccounts.userId],
      ["savings_goals", savingsGoals, savingsGoals.userId],
      ["savings_entries", savingsEntries, savingsEntries.userId],
      ["core_notifications", coreNotifications, coreNotifications.userId],
      ["core_invites", coreInvites, coreInvites.createdBy],
    ] as const) {
      expect(await countOf(table, column, member), name).toBe(0);
      expect(await countOf(table, column, owner), `${name}（站長的）`).toBe(1);
    }
    expect(await getDb().select().from(starrailCheckinLogs)).toHaveLength(1);
  });

  it("他發起的翻譯留給其他人，發起人改成 null；共用的主播與頻道留著（沒人追蹤的由排程清掉）", async () => {
    await deleteOwnAccount(member, PASSWORD);

    const translations = await getDb().select({ videoId: youtubeTranslations.videoId, requestedBy: youtubeTranslations.requestedBy }).from(youtubeTranslations);
    expect(translations.map((t) => t.requestedBy).sort()).toEqual([null, owner].sort());
    expect(await getDb().select().from(twitchStreamers)).toHaveLength(2);
    expect(await getDb().select().from(youtubeChannels)).toHaveLength(2);
  });
});
