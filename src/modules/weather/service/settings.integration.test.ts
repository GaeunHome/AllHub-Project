import { describe, expect, it } from "vitest";
import { insertTestUser, setupTestDb } from "@/dev/test-db";
import { weatherSettings } from "../data/schema";
import { WeatherUserError } from "./errors";
import { getSettings, saveSettings } from "./settings";

const getDb = setupTestDb();

describe("每個人的天氣設定", () => {
  it("各自一列、互不影響；再存一次是改掉原本的，不會多一列", async () => {
    const alice = await insertTestUser(getDb(), "alice");
    const bob = await insertTestUser(getDb(), "bob");

    await saveSettings(alice, { county: "臺北市", rainAlert: true });
    await saveSettings(bob, { county: "高雄市", rainAlert: true });
    await saveSettings(alice, { county: "花蓮縣", rainAlert: false });

    expect(await getSettings(alice)).toEqual({ county: "花蓮縣", rainAlert: false });
    expect(await getSettings(bob)).toEqual({ county: "高雄市", rainAlert: true });
    expect(await getDb().select().from(weatherSettings)).toHaveLength(2);
  });

  it("下雨通知預設開：只寫了縣市的那一列（資料庫的預設值）也是開著", async () => {
    const alice = await insertTestUser(getDb(), "alice");
    await getDb().execute(`insert into weather_settings (user_id, county) values ('${alice}', '臺中市')`);

    expect(await getSettings(alice)).toEqual({ county: "臺中市", rainAlert: true });
  });

  it("「台」換成「臺」再存；不在 22 個縣市裡的拒絕，也不寫入（開關也不動）", async () => {
    const alice = await insertTestUser(getDb(), "alice");

    expect(await saveSettings(alice, { county: "台中市", rainAlert: true })).toBe("臺中市");
    await expect(saveSettings(alice, { county: "台灣", rainAlert: false })).rejects.toThrow(WeatherUserError);
    await expect(saveSettings(alice, { county: "", rainAlert: false })).rejects.toThrow("請從清單選一個縣市");
    expect(await getSettings(alice)).toEqual({ county: "臺中市", rainAlert: true });
  });

  it("還沒選過是 null；刪除帳號時一起刪除", async () => {
    const alice = await insertTestUser(getDb(), "alice");
    expect(await getSettings(alice)).toBeNull();

    await saveSettings(alice, { county: "臺北市", rainAlert: true });
    await getDb().execute(`delete from core_users where id = '${alice}'`);

    expect(await getDb().select().from(weatherSettings)).toEqual([]);
  });
});
