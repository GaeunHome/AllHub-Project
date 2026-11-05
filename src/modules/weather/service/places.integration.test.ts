import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { stubCoreEnv } from "@/dev/test-env";
import { insertTestUsers, setupTestDb } from "@/dev/test-db";
import { weatherPlaces } from "../data/schema";

stubCoreEnv();
const { PLACE_LIMIT, addPlace, deletePlace, listPlaces } = await import("./places");

const getDb = setupTestDb();
const city = (name: string) => JSON.stringify({ kind: "world", name, country: "jp", latitude: 35, longitude: 135, timezone: "Asia/Tokyo" });

let me: string;
let other: string;
beforeEach(async () => {
  [me, other] = await insertTestUsers(getDb());
});

describe("天氣頁的城市", () => {
  it("國外城市存座標與時區 台灣縣市不用", async () => {
    expect(await addPlace(me, city("京都"))).toMatchObject({ kind: "world", name: "京都", country: "jp", latitude: 35, timezone: "Asia/Tokyo" });
    expect(await addPlace(me, JSON.stringify({ kind: "county", name: "臺南市" }))).toMatchObject({ kind: "county", latitude: null });
  });

  it("表單被改過_不寫入", async () => {
    await expect(addPlace(me, "oops")).rejects.toThrow("請選擇城市");
    expect(await listPlaces(me)).toEqual([]);
  });

  it("同一個城市不能加兩次 別人加過不影響自己", async () => {
    await addPlace(other, city("京都"));
    await addPlace(me, city("京都"));

    await expect(addPlace(me, city("京都"))).rejects.toThrow("已經加過了");
  });

  it(`每人最多 ${PLACE_LIMIT} 個`, async () => {
    for (let i = 0; i < PLACE_LIMIT; i++) await addPlace(me, city(`城市 ${i}`));

    await expect(addPlace(me, city("再一個"))).rejects.toThrow(`已滿 ${PLACE_LIMIT} 個`);
  });

  it("清單只有自己的", async () => {
    await addPlace(me, city("京都"));
    await addPlace(other, city("首爾"));

    expect((await listPlaces(me)).map((place) => place.name)).toEqual(["京都"]);
  });

  it("刪別人的城市_當作不存在 資料還在（IDOR）", async () => {
    const place = await addPlace(other, city("首爾"));

    await expect(deletePlace(me, place.id)).rejects.toThrow("找不到這個城市");
    expect(await getDb().select().from(weatherPlaces).where(eq(weatherPlaces.id, place.id))).toHaveLength(1);
  });
});
