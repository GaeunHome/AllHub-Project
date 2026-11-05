import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { stubCoreEnv } from "@/dev/test-env";
import { insertTestUsers, setupTestDb } from "@/dev/test-db";
import { weatherPlaces } from "../../data/schema";
import { WORLD_CITIES } from "../../lib/cities";

stubCoreEnv();
const { PLACE_LIMIT, addPlace, deletePlace, listPlaces } = await import("../places");

const getDb = setupTestDb();

let me: string;
let other: string;
beforeEach(async () => {
  [me, other] = await insertTestUsers(getDb());
});

describe("天氣頁的城市", () => {
  it("國外城市存清單上的座標與時區 台灣縣市不用", async () => {
    expect(await addPlace(me, "京都")).toMatchObject({ kind: "world", name: "京都", country: "jp", latitude: 35.0116, longitude: 135.7681, timezone: "Asia/Tokyo" });
    expect(await addPlace(me, "臺南市")).toMatchObject({ kind: "county", latitude: null });
  });

  it("表單被改過_不寫入", async () => {
    await expect(addPlace(me, "oops")).rejects.toThrow("請選擇城市");
    await expect(addPlace(me, "Seattle, United States")).rejects.toThrow("請選擇城市");
    await expect(addPlace(me, JSON.stringify({ kind: "world", name: "京都", country: "us", latitude: 0, longitude: 0, timezone: "UTC" }))).rejects.toThrow("請選擇城市");
    expect(await listPlaces(me)).toEqual([]);
  });

  it("舊的英文搜尋加進來的城市還在清單裡 照常能用也能刪", async () => {
    const [{ id }] = await getDb().insert(weatherPlaces).values({ userId: me, kind: "world", name: "Seattle, United States", country: "us", latitude: 47.6, longitude: -122.3, timezone: "America/Los_Angeles" }).returning();

    expect((await listPlaces(me)).map((place) => place.name)).toEqual(["Seattle, United States"]);
    expect(await deletePlace(me, id)).toMatchObject({ name: "Seattle, United States" });
  });

  it("同一個城市不能加兩次 別人加過不影響自己", async () => {
    await addPlace(other, "京都");
    await addPlace(me, "京都");

    await expect(addPlace(me, "京都")).rejects.toThrow("已經加過了");
  });

  it(`每人最多 ${PLACE_LIMIT} 個`, async () => {
    for (const { name } of WORLD_CITIES.slice(0, PLACE_LIMIT)) await addPlace(me, name);

    await expect(addPlace(me, WORLD_CITIES[PLACE_LIMIT].name)).rejects.toThrow(`已滿 ${PLACE_LIMIT} 個`);
  });

  it("清單只有自己的", async () => {
    await addPlace(me, "京都");
    await addPlace(other, "首爾");

    expect((await listPlaces(me)).map((place) => place.name)).toEqual(["京都"]);
  });

  it("刪別人的城市_當作不存在 資料還在（IDOR）", async () => {
    const place = await addPlace(other, "首爾");

    await expect(deletePlace(me, place.id)).rejects.toThrow("找不到這個城市");
    expect(await getDb().select().from(weatherPlaces).where(eq(weatherPlaces.id, place.id))).toHaveLength(1);
  });
});
