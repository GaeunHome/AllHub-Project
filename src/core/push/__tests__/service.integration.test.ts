import { beforeEach, describe, expect, it } from "vitest";
import { insertTestUsers, setupTestDb } from "@/dev/test-db";
import { corePushMutes, corePushSubscriptions } from "../../db/schema";
import { PUSH_DEVICE_LIMIT } from "../rules";
import { removeOtherSubscriptions, removeSubscription, saveSubscription, setPushMute } from "../service";

const getDb = setupTestDb();
const phone = (n: number) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/${n}`, p256dh: "key", auth: "auth" });
const devices = () => getDb().select().from(corePushSubscriptions);

let me: string;
let other: string;
beforeEach(async () => {
  [me, other] = await insertTestUsers(getDb());
});

describe("訂閱", () => {
  it("同一支手機再送一次不會多一列 關掉的模組帶回去給畫面", async () => {
    await saveSubscription(me, phone(1));
    await setPushMute(me, phone(1).endpoint, "savings", true);

    expect(await saveSubscription(me, phone(1))).toEqual({ muted: ["savings"] });
    expect(await devices()).toHaveLength(1);
  });

  it("同一支手機換人登入：訂閱改成目前的人 前一個人關掉的模組不留著", async () => {
    await saveSubscription(me, phone(1));
    await setPushMute(me, phone(1).endpoint, "savings", true);

    expect(await saveSubscription(other, phone(1))).toEqual({ muted: [] });

    expect((await devices()).map(({ userId }) => userId)).toEqual([other]);
    expect(await getDb().select().from(corePushMutes)).toEqual([]);
  });

  it("超過上限：最舊的那支換掉 弄丟的手機才不會卡住新手機", async () => {
    for (let n = 0; n <= PUSH_DEVICE_LIMIT; n += 1) await saveSubscription(me, phone(n));

    const endpoints = (await devices()).map(({ endpoint }) => endpoint);

    expect(endpoints).toHaveLength(PUSH_DEVICE_LIMIT);
    expect(endpoints).not.toContain(phone(0).endpoint);
  });
});

describe("只碰得到自己的手機（IDOR）", () => {
  it("別人的手機：取消訂閱與改開關都沒有效果", async () => {
    await saveSubscription(other, phone(1));

    await removeSubscription(me, phone(1).endpoint);
    expect(await setPushMute(me, phone(1).endpoint, "savings", true)).toBe(false);

    expect(await devices()).toHaveLength(1);
    expect(await getDb().select().from(corePushMutes)).toEqual([]);
  });
});

describe("改密碼", () => {
  it("其他手機都刪掉 這一支留著 別人的不動", async () => {
    await saveSubscription(me, phone(1));
    await saveSubscription(me, phone(2));
    await saveSubscription(other, phone(3));

    await removeOtherSubscriptions(me, phone(1).endpoint);

    expect((await devices()).map(({ endpoint }) => endpoint).sort()).toEqual([phone(1).endpoint, phone(3).endpoint]);
  });

  it("在電腦上改的 沒有這支手機：全部刪掉", async () => {
    await saveSubscription(me, phone(1));

    await removeOtherSubscriptions(me, null);

    expect(await devices()).toEqual([]);
  });
});

describe("模組開關", () => {
  it("關掉再打開 就不算關掉了", async () => {
    await saveSubscription(me, phone(1));

    expect(await setPushMute(me, phone(1).endpoint, "savings", true)).toBe(true);
    await setPushMute(me, phone(1).endpoint, "savings", true);
    await setPushMute(me, phone(1).endpoint, "savings", false);

    expect(await saveSubscription(me, phone(1))).toEqual({ muted: [] });
  });
});
