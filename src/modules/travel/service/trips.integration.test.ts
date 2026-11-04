import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { stubCoreEnv } from "@/dev/test-env";
import { insertTestUser, insertTestUsers, setupTestDb } from "@/dev/test-db";
import { captureErrorLog, loggedText, tagged } from "@/dev/test-helpers";
import { coreUsers } from "@/core/db/schema";
import { travelItems, travelMembers, travelTrips } from "../data/schema";
import { MEMBER_LIMIT, TRIP_LIMIT } from "../lib/rules";

stubCoreEnv();
const { addCheck, addComment, deleteCheck, deleteComment, setCheckDone } = await import("./extras");
const { addItem, deleteItem, moveItem, updateItem } = await import("./items");
const { TripNotFoundError, TravelUserError } = await import("./errors");
const { joinToken } = await import("./join-link");
const trips = await import("./trips");
const { cleanupTrips, createTrip, deleteTrip, joinPreview, joinTrip, leaveTrip, listTrips, removeMember, setJoinLink, tripDetail, updateTrip } = trips;

const getDb = setupTestDb();
const TRIP = { title: "京都五日遊", destination: "京都", startDate: "2026-12-01", endDate: "2026-12-03" };
const ITEM = { kind: "place", title: "清水寺", mapsUrl: "", note: "", stayMinutes: "60", travelMinutes: "0", fixedTime: "" };

let me: string;
let other: string;
beforeEach(async () => {
  [me, other] = await insertTestUsers(getDb());
});

const tripOf = async (userId = me) => (await createTrip(userId, TRIP)).id;
/** 用連結加進來 跟真的成員一樣 */
async function join(tripId: number, userId: string) {
  await setJoinLink(me, tripId, true);
  await joinTrip(userId, tripId, joinToken(tripId, 0));
}
const dayTitles = async (tripId: number, day: string | null) => (await tripDetail(me, tripId))!.items.filter((item) => item.day === day).map((item) => item.title);
const add = (tripId: number, day: string | null, title: string) => addItem(me, tripId, day, { ...ITEM, title });

describe("同行的人的頭像", () => {
  it("帶著各自選的範例頭像；沒選的是 null", async () => {
    const id = await tripOf();
    await join(id, other);
    await getDb().update(coreUsers).set({ avatar: "cat" }).where(eq(coreUsers.id, other));

    const members = new Map((await tripDetail(me, id))!.members.map((member) => [member.id, member.avatar]));

    expect(members.get(other)).toBe("cat");
    expect(members.get(me)).toBeNull();
  });

  it("行程的快取標了使用者的 tag：有人換頭像或暱稱，同行的人下次打開就看到新的", async () => {
    const { cachedTrip } = await import("./cached");
    const id = await tripOf();

    await cachedTrip(me, id);

    expect(tagged()).toContain("core:users");
  });
});

describe("成員才碰得到旅程（IDOR）", () => {
  it("不是成員：清單看不到、詳情是 null", async () => {
    const id = await tripOf();

    expect(await listTrips(other)).toEqual([]);
    expect(await tripDetail(other, id)).toBeNull();
    expect((await listTrips(me)).map((trip) => trip.id)).toEqual([id]);
  });

  it("不是成員：每一種寫入都當作不存在，資料沒有被動到", async () => {
    const id = await tripOf();
    await add(id, "2026-12-01", "清水寺");
    await addCheck(me, id, "護照");
    const detail = (await tripDetail(me, id))!;
    const [item] = detail.items;
    const [check] = detail.checks;
    await addComment(me, id, item.id, "好");
    const [comment] = (await tripDetail(me, id))!.comments;

    const attempts = [
      () => updateTrip(other, id, { ...TRIP, title: "被改了" }),
      () => deleteTrip(other, id),
      () => leaveTrip(other, id),
      () => setJoinLink(other, id, true),
      () => removeMember(other, id, me),
      () => addItem(other, id, null, ITEM),
      () => updateItem(other, id, item.id, item.version, { ...ITEM, title: "被改了" }),
      () => deleteItem(other, id, item.id),
      () => moveItem(other, id, item.id, null, null),
      () => addComment(other, id, item.id, "留言"),
      () => deleteComment(other, id, comment.id),
      () => addCheck(other, id, "項目"),
      () => setCheckDone(other, id, check.id, true),
      () => deleteCheck(other, id, check.id),
    ];
    for (const attempt of attempts) await expect(attempt()).rejects.toBeInstanceOf(TripNotFoundError);

    const after = (await tripDetail(me, id))!;
    expect(after).toMatchObject({ title: TRIP.title, memberCount: 1 });
    expect(after.items.map((row) => row.title)).toEqual(["清水寺"]);
    expect(after.checks).toEqual([check]);
    expect(after.comments).toHaveLength(1);
  });

  it("別的旅程的項目 id：自己是成員也動不到，id 要屬於這趟", async () => {
    const mine = await tripOf();
    const theirs = await tripOf(other);
    await addItem(other, theirs, null, ITEM);
    const [item] = (await tripDetail(other, theirs))!.items;

    await expect(deleteItem(me, mine, item.id)).rejects.toBeInstanceOf(TravelUserError);
    await expect(moveItem(me, mine, item.id, null, null)).rejects.toBeInstanceOf(TravelUserError);
    await expect(updateItem(me, mine, item.id, item.version, ITEM)).rejects.toBeInstanceOf(TravelUserError);
    await expect(addComment(me, mine, item.id, "留言")).rejects.toBeInstanceOf(TravelUserError);
    expect((await tripDetail(other, theirs))!.items).toHaveLength(1);
  });
});

describe("誰能做什麼（使用者決定：成員都能改行程，只有建立的人能管成員、連結與刪除）", () => {
  it("加入的成員可以改行程內容", async () => {
    const id = await tripOf();
    await join(id, other);

    await addItem(other, id, "2026-12-01", ITEM);
    await updateTrip(other, id, { ...TRIP, title: "改過的名稱" });

    expect((await tripDetail(me, id))!).toMatchObject({ title: "改過的名稱", memberCount: 2 });
  });

  it("加入的成員不能移除人、動連結、刪旅程", async () => {
    const id = await tripOf();
    await join(id, other);

    await expect(deleteTrip(other, id)).rejects.toThrow("只有建立旅程的人可以這樣做");
    await expect(removeMember(other, id, me)).rejects.toThrow("只有建立旅程的人可以這樣做");
    await expect(setJoinLink(other, id, false)).rejects.toThrow("只有建立旅程的人可以這樣做");
    expect((await tripDetail(me, id))!.memberCount).toBe(2);
  });

  it("連結只給建立的人看：其他成員的詳情裡沒有", async () => {
    const id = await tripOf();
    await join(id, other);

    expect((await tripDetail(me, id))!.joinPath).toContain(`/travel/join/${id}/`);
    expect((await tripDetail(other, id))!.joinPath).toBeNull();
  });

  it("建立的人可以移除成員：被移除的人就看不到了", async () => {
    const id = await tripOf();
    await join(id, other);

    await removeMember(me, id, other);

    expect(await tripDetail(other, id)).toBeNull();
  });

  it("建立的人離開：下一個最早加入的人接手；最後一個人離開時旅程刪掉", async () => {
    const id = await tripOf();
    await join(id, other);

    await leaveTrip(me, id);
    expect((await tripDetail(other, id))!.managerId).toBe(other);

    await leaveTrip(other, id);
    expect(await getDb().select().from(travelTrips)).toEqual([]);
  });

  it("建立的人刪除帳號：旅程留給同行的人，由下一位接手", async () => {
    const id = await tripOf();
    await join(id, other);

    await getDb().delete(coreUsers).where(eq(coreUsers.id, me));

    expect((await tripDetail(other, id))!).toMatchObject({ managerId: other, memberCount: 1 });
  });

  it("旅程數量有上限", async () => {
    for (let i = 0; i < TRIP_LIMIT; i++) await tripOf();

    await expect(tripOf()).rejects.toThrow(`旅程已滿 ${TRIP_LIMIT} 趟`);
  });
});

describe("群組連結", () => {
  it("建立的人打開之後，連結才有效", async () => {
    const id = await tripOf();
    const token = joinToken(id, 0);

    expect(await joinPreview(other, id, token)).toBeNull();
    await expect(joinTrip(other, id, token)).rejects.toBeInstanceOf(TripNotFoundError);

    await setJoinLink(me, id, true);

    expect(await joinPreview(other, id, token)).toMatchObject({ title: TRIP.title, alreadyMember: false });
  });

  it("亂猜的連結、別趟旅程的連結都不能用", async () => {
    const id = await tripOf();
    const second = await tripOf();
    await setJoinLink(me, id, true);

    await expect(joinTrip(other, id, "x".repeat(43))).rejects.toBeInstanceOf(TripNotFoundError);
    await expect(joinTrip(other, id, joinToken(second, 0))).rejects.toBeInstanceOf(TripNotFoundError);
    expect(await tripDetail(other, id)).toBeNull();
  });

  it("撤銷：舊的連結再也不能用，重新打開是新的連結，已經加入的人不受影響", async () => {
    const id = await tripOf();
    await join(id, other);
    const third = await insertTestUser(getDb(), "carol");

    await setJoinLink(me, id, false);
    await setJoinLink(me, id, true);

    await expect(joinTrip(third, id, joinToken(id, 0))).rejects.toBeInstanceOf(TripNotFoundError);
    await joinTrip(third, id, joinToken(id, 1));
    expect((await tripDetail(me, id))!.memberCount).toBe(3);
  });

  it("已經是成員再點一次：不會出錯也不會多一列", async () => {
    const id = await tripOf();
    await join(id, other);

    await joinTrip(other, id, joinToken(id, 0));

    expect(await joinPreview(other, id, joinToken(id, 0))).toMatchObject({ alreadyMember: true });
    expect(await getDb().select().from(travelMembers)).toHaveLength(2);
  });

  it("人數有上限", async () => {
    const id = await tripOf();
    await setJoinLink(me, id, true);
    for (let i = 1; i < MEMBER_LIMIT; i++) await joinTrip(await insertTestUser(getDb(), `user${i}`), id, joinToken(id, 0));

    await expect(joinTrip(other, id, joinToken(id, 0))).rejects.toThrow(`已滿 ${MEMBER_LIMIT} 人`);
  });
});

describe("排行程", () => {
  it("新增時排在那一天最後；不在旅程日期裡的當成想去的點", async () => {
    const id = await tripOf();
    await add(id, "2026-12-01", "A");
    await add(id, "2026-12-01", "B");
    await add(id, "2027-05-05", "C");

    expect(await dayTitles(id, "2026-12-01")).toEqual(["A", "B"]);
    expect(await dayTitles(id, null)).toEqual(["C"]);
  });

  it("拖到同一天的別的位置", async () => {
    const id = await tripOf();
    for (const title of ["A", "B", "C"]) await add(id, "2026-12-01", title);
    const { items } = (await tripDetail(me, id))!;

    await moveItem(me, id, items[2].id, "2026-12-01", items[0].id);

    expect(await dayTitles(id, "2026-12-01")).toEqual(["C", "A", "B"]);
  });

  it("從想去的點拖進某一天，也可以拖回去；放到最後傳 null", async () => {
    const id = await tripOf();
    await add(id, null, "想去");
    await add(id, "2026-12-02", "已排");
    const place = (await tripDetail(me, id))!.items.find((item) => item.title === "想去")!;

    await moveItem(me, id, place.id, "2026-12-02", null);
    expect(await dayTitles(id, "2026-12-02")).toEqual(["已排", "想去"]);

    await moveItem(me, id, place.id, null, null);
    expect(await dayTitles(id, null)).toEqual(["想去"]);
  });

  it("要放在它前面的那一項剛被別人移走：放到最後，不會出錯", async () => {
    const id = await tripOf();
    await add(id, "2026-12-01", "A");
    await add(id, "2026-12-02", "B");
    const [a, b] = (await tripDetail(me, id))!.items;

    await moveItem(me, id, a.id, "2026-12-02", 999_999);

    expect(await dayTitles(id, "2026-12-02")).toEqual(["B", "A"]);
    expect(b.day).toBe("2026-12-02");
  });

  it("兩個人同時改同一項：後存的人被提醒，不會默默蓋掉", async () => {
    const id = await tripOf();
    await join(id, other);
    await add(id, null, "清水寺");
    const [item] = (await tripDetail(me, id))!.items;

    await updateItem(me, id, item.id, item.version, { ...ITEM, title: "我改的" });

    await expect(updateItem(other, id, item.id, item.version, { ...ITEM, title: "他改的" })).rejects.toThrow("剛被別人改過");
    expect(await dayTitles(id, null)).toEqual(["我改的"]);
  });

  it("別人拖曳不算改內容：正在修改同一項的人照樣存得了，順序也不會被蓋回去", async () => {
    const id = await tripOf();
    await join(id, other);
    await add(id, null, "清水寺");
    await add(id, "2026-12-02", "早餐");
    const [item] = (await tripDetail(me, id))!.items;

    await moveItem(other, id, item.id, "2026-12-02", null);
    await updateItem(me, id, item.id, item.version, { ...ITEM, title: "清水寺（已訂票）" });

    expect(await dayTitles(id, "2026-12-02")).toEqual(["早餐", "清水寺（已訂票）"]);
  });

  it("日期改短也不算改內容：項目回到想去的點後，正在修改的人照樣存得了", async () => {
    const id = await tripOf();
    await add(id, "2026-12-03", "第三天");
    const [item] = (await tripDetail(me, id))!.items;

    await updateTrip(me, id, { ...TRIP, endDate: "2026-12-02" });
    await updateItem(me, id, item.id, item.version, { ...ITEM, title: "改過了" });

    expect(await dayTitles(id, null)).toEqual(["改過了"]);
  });

  it("放回原位：回傳沒有變動，不用讓快取失效也不用通知別人", async () => {
    const id = await tripOf();
    await add(id, "2026-12-01", "A");
    await add(id, "2026-12-01", "B");
    const [a, b] = (await tripDetail(me, id))!.items;

    expect(await moveItem(me, id, a.id, "2026-12-01", b.id)).toBe(false);
    expect(await moveItem(me, id, b.id, "2026-12-01", null)).toBe(false);
    expect(await moveItem(me, id, b.id, "2026-12-01", a.id)).toBe(true);
    expect(await dayTitles(id, "2026-12-01")).toEqual(["B", "A"]);
  });

  it("日期改短：被拿掉那幾天的項目回到想去的點，不會不見", async () => {
    const id = await tripOf();
    await add(id, "2026-12-01", "第一天");
    await add(id, "2026-12-03", "第三天");

    await updateTrip(me, id, { ...TRIP, endDate: "2026-12-02" });

    expect(await dayTitles(id, "2026-12-01")).toEqual(["第一天"]);
    expect(await dayTitles(id, null)).toEqual(["第三天"]);
  });

  it("貼連結不填名稱：名稱從連結讀；讀不出來要自己填", async () => {
    const id = await tripOf();
    const url = "https://www.google.com/maps/place/Taipei+101/@25.03,121.56,17z";

    await addItem(me, id, null, { ...ITEM, title: "", mapsUrl: url });
    expect((await tripDetail(me, id))!.items[0]).toMatchObject({ title: "Taipei 101", mapsUrl: url, lat: 25.03, lng: 121.56 });

    await expect(addItem(me, id, null, { ...ITEM, title: "", mapsUrl: "https://www.google.com/maps/@25.03,121.56,17z" })).rejects.toThrow("請自己填名稱");
  });
});

describe("留言與出發前清單", () => {
  it("留言帶作者的暱稱；自己的自己刪，建立的人也能刪，別人的不能刪", async () => {
    const id = await tripOf();
    await join(id, other);
    await add(id, null, "清水寺");
    const [item] = (await tripDetail(me, id))!.items;
    await addComment(me, id, item.id, "我的");
    await addComment(other, id, item.id, "他的");
    const [mine, theirs] = (await tripDetail(me, id))!.comments;

    await expect(deleteComment(other, id, mine.id)).rejects.toThrow("只能刪除自己的留言");
    await deleteComment(me, id, theirs.id);
    await deleteComment(me, id, mine.id);

    expect((await tripDetail(me, id))!.comments).toEqual([]);
  });

  it("清單大家共用：一個人打勾，另一個人看得到", async () => {
    const id = await tripOf();
    await join(id, other);
    await addCheck(me, id, "護照");
    const [check] = (await tripDetail(me, id))!.checks;

    await setCheckDone(other, id, check.id, true);

    expect((await tripDetail(me, id))!.checks).toEqual([{ id: check.id, title: "護照", done: true }]);
  });
});

describe("結束後自動刪除（使用者要的：行程結束 7 天後）", () => {
  // 台北 12/10 回程 12/3 剛好第 7 天還在 12/2 回程的已經第 8 天
  const NOW = new Date("2026-12-10T04:00:00Z");

  it("回程第 7 天還在，第 8 天刪掉；項目、成員跟著刪", async () => {
    const stays = await tripOf();
    const gone = (await createTrip(me, { ...TRIP, title: "舊的", endDate: "2026-12-02" })).id;
    await add(gone, null, "項目");

    expect(await cleanupTrips(NOW)).toBe("刪除 1 趟結束超過 7 天的旅程、0 趟沒有成員的旅程");

    expect((await listTrips(me)).map((trip) => trip.id)).toEqual([stays]);
    expect(await getDb().select().from(travelItems)).toEqual([]);
  });

  it("日期照台北算：UTC 還是前一天，台北已經過午夜", async () => {
    await createTrip(me, { ...TRIP, endDate: "2026-12-02" });

    expect(await cleanupTrips(new Date("2026-12-09T15:59:00Z"))).toContain("刪除 0 趟結束");
    expect(await cleanupTrips(new Date("2026-12-09T16:01:00Z"))).toContain("刪除 1 趟結束");
  });

  it("所有成員都刪除帳號的旅程：沒有人看得到，一起清掉", async () => {
    await tripOf();
    await getDb().delete(coreUsers).where(eq(coreUsers.id, me));

    expect(await cleanupTrips(new Date("2026-11-01T00:00:00Z"))).toContain("1 趟沒有成員");
    expect(await getDb().select().from(travelTrips)).toEqual([]);
  });
});

describe("地圖短網址", () => {
  it("向 Google 問一次轉到哪裡，讀出名稱與座標", async () => {
    const id = await tripOf();
    vi.stubGlobal("fetch", async () => new Response(null, { status: 302, headers: { location: "https://www.google.com/maps/place/Kiyomizu/@34.99,135.78,17z" } }));

    await addItem(me, id, null, { ...ITEM, title: "", mapsUrl: "https://maps.app.goo.gl/AbC" });

    expect((await tripDetail(me, id))!.items[0]).toMatchObject({ title: "Kiyomizu", lat: 34.99 });
  });

  it("轉去不是地圖的網址：不採用，只留原本的連結，名稱手動填", async () => {
    const id = await tripOf();
    vi.stubGlobal("fetch", async () => new Response(null, { status: 302, headers: { location: "https://evil.example.com/" } }));

    await addItem(me, id, null, { ...ITEM, title: "清水寺", mapsUrl: "https://maps.app.goo.gl/AbC" });

    expect((await tripDetail(me, id))!.items[0]).toMatchObject({ title: "清水寺", mapsUrl: "https://maps.app.goo.gl/AbC", lat: null });
  });

  it("問不到（逾時、連線失敗）：行程照樣加得進去，log 不記網址", async () => {
    const id = await tripOf();
    const log = captureErrorLog();
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("fetch failed");
    });

    await addItem(me, id, null, { ...ITEM, title: "清水寺", mapsUrl: "https://maps.app.goo.gl/AbC" });

    expect((await tripDetail(me, id))!.items).toHaveLength(1);
    expect(loggedText(log)).not.toContain("AbC");
  });
});
