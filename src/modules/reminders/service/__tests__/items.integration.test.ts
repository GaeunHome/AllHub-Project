import { beforeEach, describe, expect, it } from "vitest";
import { insertTestUsers, logQueries, setupTestDb } from "@/dev/test-db";
import { remindersItems } from "../../data/schema";
import { insertItem, insertItems, itemsOf } from "../../dev/fixtures";
import { ReminderUserError } from "../errors";
import { createItem, deleteItem, listItems, updateItem } from "../items";

const getDb = setupTestDb();

// 台北 11/2 中午
const NOW = new Date("2026-11-02T04:00:00Z");
const TODAY = "2026-11-02";
const YESTERDAY = "2026-11-01";
const NOT_FOUND = "找不到這個提醒，請重新整理頁面";
const FIELDS = { title: "繳房屋稅", date: "2026-11-30", notify: "0" };

let alice: string;
let bob: string;

beforeEach(async () => {
  [alice, bob] = await insertTestUsers(getDb());
});

describe("新增提醒", () => {
  it("存的是正規化後的標題、日期與通知天數，寫給呼叫時傳進來的使用者", async () => {
    const created = await createItem(alice, { title: "  媽媽　　生日 ", date: "2026-11-30", notify: "7" }, NOW);

    expect(await itemsOf(getDb(), alice)).toMatchObject([{ id: created.id, title: "媽媽 生日", date: "2026-11-30", notifyDaysBefore: 7 }]);
    expect(await itemsOf(getDb(), bob)).toEqual([]);
  });

  it("不通知存成 null", async () => {
    await createItem(alice, { ...FIELDS, notify: "none" }, NOW);

    expect((await itemsOf(getDb(), alice))[0].notifyDaysBefore).toBeNull();
  });

  it("標題、日期或通知不對：回中文的原因（UserError），什麼都不寫", async () => {
    const bad = [
      { ...FIELDS, title: "   " },
      { ...FIELDS, title: "字".repeat(31) },
      { ...FIELDS, date: "2026-02-30" },
      { ...FIELDS, date: YESTERDAY },
      { ...FIELDS, date: "2036-11-03" },
      { ...FIELDS, notify: "2" },
    ];
    for (const input of bad) await expect(createItem(alice, input, NOW), JSON.stringify(input)).rejects.toThrow(ReminderUserError);

    expect(await itemsOf(getDb(), alice)).toEqual([]);
  });

  it("今天與剛好 10 年後都可以", async () => {
    await createItem(alice, { ...FIELDS, date: TODAY }, NOW);
    await createItem(alice, { ...FIELDS, date: "2036-11-02" }, NOW);

    expect((await itemsOf(getDb(), alice)).map((item) => item.date)).toEqual([TODAY, "2036-11-02"]);
  });

  it("今天照台北的日期算：台北已經過午夜、UTC 還是前一天時，前一天不能選", async () => {
    // 台北 11/2 00:10
    const justAfterMidnight = new Date("2026-11-01T16:10:00Z");

    await expect(createItem(alice, { ...FIELDS, date: YESTERDAY }, justAfterMidnight)).rejects.toThrow("日期不能早於今天");
    await expect(createItem(alice, { ...FIELDS, date: TODAY }, justAfterMidnight)).resolves.toMatchObject({ date: TODAY });
  });
});

describe("每人最多 50 個還沒過期的提醒", () => {
  it("第 50 個可以，第 51 個回中文的原因、不寫入", async () => {
    await insertItems(getDb(), alice, 49, "2026-12-01");

    await createItem(alice, FIELDS, NOW);
    await expect(createItem(alice, FIELDS, NOW)).rejects.toThrow(ReminderUserError);
    await expect(createItem(alice, FIELDS, NOW)).rejects.toThrow("提醒已滿 50 個，請先刪除一個");

    expect(await itemsOf(getDb(), alice)).toHaveLength(50);
  });

  it("今天到期的還沒過期，算進去；過期還沒刪的不算", async () => {
    await insertItems(getDb(), alice, 49, TODAY);
    await insertItems(getDb(), alice, 5, YESTERDAY);

    await expect(createItem(alice, FIELDS, NOW)).resolves.toMatchObject({ title: "繳房屋稅" });
    await expect(createItem(alice, FIELDS, NOW)).rejects.toThrow("提醒已滿 50 個");
  });

  it("別人的提醒不算：bob 滿了不影響 alice", async () => {
    await insertItems(getDb(), bob, 50, "2026-12-01");

    await expect(createItem(alice, FIELDS, NOW)).resolves.toMatchObject({ title: "繳房屋稅" });
    await expect(createItem(bob, FIELDS, NOW)).rejects.toThrow("提醒已滿 50 個");
  });

  it("滿了也改得動：修改不會多一個", async () => {
    await insertItems(getDb(), alice, 50, "2026-12-01");
    const [first] = await itemsOf(getDb(), alice);

    await expect(updateItem(alice, first.id, { ...FIELDS, title: "改過的" }, NOW)).resolves.toMatchObject({ title: "改過的" });
  });

  it("數之前先在同一個交易裡鎖住這個使用者（core_users 那一列）：同一個人同時新增時才不會超過；清單是空的時也沒有列可以鎖", async () => {
    const queries = logQueries(getDb());

    await createItem(alice, FIELDS, NOW);

    const at = (pattern: RegExp) => queries.findIndex((query) => pattern.test(query));
    const begin = at(/^begin$/);
    const lock = at(/from "core_users" where .* for no key update$/i);
    const count = at(/^select .*from "reminders_items"/i);
    const insert = at(/^insert into "reminders_items"/i);
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(lock).toBeGreaterThan(begin);
    expect(count).toBeGreaterThan(lock);
    expect(insert).toBeGreaterThan(count);
  });
});

describe("修改提醒", () => {
  it("改掉自己的標題、日期與通知，同樣正規化；updated_at 跟著更新，其他列不動", async () => {
    const mine = await insertItem(getDb(), alice, { date: "2026-11-30", updatedAt: new Date("2026-01-01T00:00:00Z") });
    const other = await insertItem(getDb(), alice, { title: "別的提醒", date: "2026-12-01" });

    await updateItem(alice, mine.id, { title: " 繳　 牌照稅 ", date: "2027-01-05", notify: "none" }, NOW);

    const [changed, untouched] = await itemsOf(getDb(), alice);
    expect(changed).toMatchObject({ id: mine.id, title: "繳 牌照稅", date: "2027-01-05", notifyDaysBefore: null });
    expect(changed.updatedAt.getTime()).toBeGreaterThan(mine.updatedAt.getTime());
    expect(untouched).toEqual(other);
  });

  it("修改時一樣檢查日期與標題：不對就不寫入", async () => {
    const mine = await insertItem(getDb(), alice, { date: "2026-11-30" });

    await expect(updateItem(alice, mine.id, { ...FIELDS, date: YESTERDAY }, NOW)).rejects.toThrow("日期不能早於今天");
    await expect(updateItem(alice, mine.id, { ...FIELDS, date: "2036-11-03" }, NOW)).rejects.toThrow("日期最多到 10 年後");
    await expect(updateItem(alice, mine.id, { ...FIELDS, title: "" }, NOW)).rejects.toThrow("請輸入標題");

    expect(await itemsOf(getDb(), alice)).toEqual([mine]);
  });

  it("別人的 id 當作不存在：回同一句話，那一列不動（IDOR）", async () => {
    const hers = await insertItem(getDb(), alice, { date: "2026-11-30" });

    await expect(updateItem(bob, hers.id, { ...FIELDS, title: "被改了" }, NOW)).rejects.toThrow(NOT_FOUND);

    expect(await itemsOf(getDb(), alice)).toEqual([hers]);
  });

  it("不存在的 id：同一句話", async () => {
    await expect(updateItem(alice, 999, FIELDS, NOW)).rejects.toThrow(NOT_FOUND);
  });

  it("過期還沒刪的不能改回未來：畫面已經看不到，改回來的話 50 個的上限就擋不住了", async () => {
    await insertItems(getDb(), alice, 50, "2026-12-01");
    const expired = await insertItem(getDb(), alice, { date: YESTERDAY });

    await expect(updateItem(alice, expired.id, FIELDS, NOW)).rejects.toThrow(NOT_FOUND);

    expect((await itemsOf(getDb(), alice)).at(-1)).toEqual(expired);
  });
});

describe("刪除提醒", () => {
  it("刪掉自己的那一列，回傳標題給畫面寫訊息，其他列不動", async () => {
    const mine = await insertItem(getDb(), alice, { title: "媽媽生日", date: "2026-11-30" });
    const other = await insertItem(getDb(), alice, { title: "別的提醒", date: "2026-12-01" });

    await expect(deleteItem(alice, mine.id)).resolves.toEqual({ title: "媽媽生日" });

    expect(await itemsOf(getDb(), alice)).toEqual([other]);
  });

  it("別人的 id 當作不存在：回同一句話，那一列不動（IDOR）", async () => {
    const hers = await insertItem(getDb(), alice, { date: "2026-11-30" });

    await expect(deleteItem(bob, hers.id)).rejects.toThrow(ReminderUserError);
    await expect(deleteItem(bob, hers.id)).rejects.toThrow(NOT_FOUND);

    expect(await itemsOf(getDb(), alice)).toEqual([hers]);
  });

  it("已經刪掉的（例如別的分頁刪了、排程清掉了）：同一句話", async () => {
    const mine = await insertItem(getDb(), alice, { date: "2026-11-30" });
    await deleteItem(alice, mine.id);

    await expect(deleteItem(alice, mine.id)).rejects.toThrow(NOT_FOUND);
  });
});

describe("讀取", () => {
  it("只有自己的，照日期排，同一天先建立的在前；過期還沒刪的也回傳（過濾在快取外面做）", async () => {
    await insertItem(getDb(), alice, { title: "十二月", date: "2026-12-01" });
    await insertItem(getDb(), bob, { title: "bob 的", date: "2026-11-05" });
    await insertItem(getDb(), alice, { title: "同一天先建立的", date: "2026-11-05", notifyDaysBefore: null });
    await insertItem(getDb(), alice, { title: "同一天後建立的", date: "2026-11-05", notifyDaysBefore: 3 });
    await insertItem(getDb(), alice, { title: "過期的", date: YESTERDAY });

    const items = await listItems(alice);

    expect(items.map((item) => item.title)).toEqual(["過期的", "同一天先建立的", "同一天後建立的", "十二月"]);
    expect(items[1]).toEqual({ id: expect.any(Number), title: "同一天先建立的", date: "2026-11-05", notifyDaysBefore: null });
  });

  it("刪除帳號時一起刪除", async () => {
    await insertItem(getDb(), alice, { date: "2026-11-30" });
    await getDb().execute(`delete from core_users where id = '${alice}'`);

    expect(await getDb().select().from(remindersItems)).toEqual([]);
  });
});
