import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { stubCoreEnv } from "@/dev/test-env";
import { insertTestUsers, setupTestDb } from "@/dev/test-db";
import { weatherPlaces } from "../../data/schema";
import { WORLD_CITIES } from "../../lib/cities";

stubCoreEnv();
const { PLACE_LIMIT, addPlace, deletePlace, listPlaces, movePlace } = await import("../places");

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

describe("拖曳調整城市的順序", () => {
  const names = async (userId = me) => (await listPlaces(userId)).map((place) => place.name);
  const three = async () => [await addPlace(me, "東京"), await addPlace(me, "首爾"), await addPlace(me, "京都")];

  it("還沒排過_照加入的順序", async () => {
    await three();

    expect(await names()).toEqual(["東京", "首爾", "京都"]);
  });

  it("放到某一個前面", async () => {
    const [tokyo, , kyoto] = await three();

    expect(await movePlace(me, kyoto.id, tokyo.id)).toBe(true);
    expect(await names()).toEqual(["京都", "東京", "首爾"]);
  });

  it("beforeId 是 null_放到最後", async () => {
    const [tokyo] = await three();

    await movePlace(me, tokyo.id, null);

    expect(await names()).toEqual(["首爾", "京都", "東京"]);
  });

  it("放回原位_不算有改", async () => {
    const [tokyo, seoul] = await three();

    expect(await movePlace(me, tokyo.id, seoul.id)).toBe(false);
  });

  it("排過之後新增的城市排在最後，就算前面刪過幾個", async () => {
    const [tokyo, seoul, kyoto] = await three();
    await movePlace(me, kyoto.id, tokyo.id);
    await deletePlace(me, tokyo.id);
    await deletePlace(me, seoul.id);

    await addPlace(me, "大阪");

    expect(await names()).toEqual(["京都", "大阪"]);
  });

  it("別人的城市 id 當作不存在：回同一句話，自己與他的順序都不動（IDOR）", async () => {
    const [tokyo] = await three();
    const theirs = await addPlace(other, "大阪");
    await addPlace(other, "福岡");

    await expect(movePlace(me, theirs.id, null)).rejects.toThrow("找不到這個城市，請重新整理頁面");
    await expect(movePlace(me, tokyo.id, theirs.id)).rejects.toThrow("找不到這個城市，請重新整理頁面");
    await expect(movePlace(other, tokyo.id, null)).rejects.toThrow("找不到這個城市，請重新整理頁面");
    expect(await names(other)).toEqual(["大阪", "福岡"]);
    expect(await names()).toEqual(["東京", "首爾", "京都"]);
  });
});
