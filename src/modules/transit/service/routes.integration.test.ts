import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { stubCoreEnv } from "@/dev/test-env";
import { insertTestUsers, setupTestDb } from "@/dev/test-db";
import { mocksOf } from "@/dev/test-helpers";
import { transitRoutes } from "../data/schema";
import { ROUTE_LIMIT, TRACKED_LIMIT } from "../lib/rules";

stubCoreEnv();
vi.mock("./timetable", () => ({ readStations: vi.fn(), readDirections: vi.fn(), readBusRoute: vi.fn() }));

const timetable = mocksOf(await import("./timetable"), "readStations", "readDirections", "readBusRoute");
const { addRoute, deleteRoute, listRoutes, setTracked } = await import("./routes");
const { RouteNotFoundError } = await import("./errors");

const getDb = setupTestDb();
const THSR = { mode: "thsr", system: "", line: "", originId: "1000", destinationId: "1070" };

let me: string;
let other: string;
beforeEach(async () => {
  [me, other] = await insertTestUsers(getDb());
  timetable.readStations.mockReset().mockResolvedValue({ ok: true, data: [{ id: "1000", name: "台北" }, { id: "1070", name: "左營" }, { id: "1040", name: "台中" }, { id: "R10", name: "台北車站" }] });
  timetable.readDirections.mockReset().mockResolvedValue({ ok: true, data: [{ id: "R28", name: "淡水" }] });
  timetable.readBusRoute.mockReset().mockResolvedValue({ ok: true, data: [{ direction: 0, name: "臺北車站", stops: [{ id: "TPE1", name: "板橋" }] }] });
});

const seed = async (userId: string, count: number) => {
  for (let i = 0; i < count; i++) await getDb().insert(transitRoutes).values({ userId, mode: "tra", originId: String(i), originName: "a", destinationId: "x", destinationName: "b" });
};

describe("新增常用路線", () => {
  it("車站名稱用 TDX 查到的 不信表單", async () => {
    expect(await addRoute(me, THSR)).toMatchObject({ originName: "台北", destinationName: "左營", tracked: false, system: "" });
  });

  it("車站查不到_不寫入", async () => {
    await expect(addRoute(me, { ...THSR, originId: "9999" })).rejects.toThrow("找不到這個車站");
    expect(await listRoutes(me)).toEqual([]);
  });

  it("捷運的方向要是這一站有的", async () => {
    expect(await addRoute(me, { ...THSR, mode: "metro", system: "TRTC", originId: "R10", destinationId: "R28" })).toMatchObject({ system: "TRTC", destinationName: "淡水" });
    await expect(addRoute(me, { ...THSR, mode: "metro", system: "TRTC", originId: "R10", destinationId: "R02" })).rejects.toThrow("沒有這個方向");
  });

  it("公車的站牌名稱與方向用 TDX 查到的", async () => {
    const bus = { mode: "bus", system: "Taipei", line: "307", originId: "TPE1", destinationId: "0" };

    expect(await addRoute(me, bus)).toMatchObject({ line: "307", originName: "板橋", destinationName: "臺北車站" });
    await expect(addRoute(me, { ...bus, originId: "TPE9" })).rejects.toThrow("沒有這個站牌");
    await expect(addRoute(me, { ...bus, destinationId: "1" })).rejects.toThrow("沒有這個站牌");
  });

  it("TDX 讀不到_說明稍後再試 不寫入", async () => {
    timetable.readStations.mockResolvedValue({ ok: false, problem: "TDX 回 500" });

    await expect(addRoute(me, THSR)).rejects.toThrow("稍後再試");
  });

  it("同一條路線不能加兩次", async () => {
    await addRoute(me, THSR);

    await expect(addRoute(me, THSR)).rejects.toThrow("已經在常用路線裡");
  });

  it("別人有同一條路線_不影響自己", async () => {
    await addRoute(other, THSR);

    await expect(addRoute(me, THSR)).resolves.toBeTruthy();
  });

  it(`每人最多 ${ROUTE_LIMIT} 條`, async () => {
    await seed(me, ROUTE_LIMIT);

    await expect(addRoute(me, THSR)).rejects.toThrow(`已滿 ${ROUTE_LIMIT} 條`);
  });
});

describe("只看得到自己的路線（IDOR）", () => {
  it("清單只有自己的", async () => {
    await addRoute(me, THSR);
    await addRoute(other, { ...THSR, destinationId: "1040" });

    expect((await listRoutes(me)).map((route) => route.destinationName)).toEqual(["左營"]);
  });

  it("刪別人的路線_當作不存在 資料還在", async () => {
    const route = await addRoute(other, THSR);

    await expect(deleteRoute(me, route.id)).rejects.toBeInstanceOf(RouteNotFoundError);
    expect(await getDb().select().from(transitRoutes).where(eq(transitRoutes.id, route.id))).toHaveLength(1);
  });

  it("追蹤別人的路線_當作不存在 沒有改到", async () => {
    const route = await addRoute(other, THSR);

    await expect(setTracked(me, route.id, true)).rejects.toBeInstanceOf(RouteNotFoundError);
    expect((await listRoutes(other))[0].tracked).toBe(false);
  });
});

describe("追蹤", () => {
  it("打開與取消", async () => {
    const route = await addRoute(me, THSR);

    expect((await setTracked(me, route.id, true)).tracked).toBe(true);
    expect((await setTracked(me, route.id, false)).tracked).toBe(false);
  });

  it(`最多追蹤 ${TRACKED_LIMIT} 條 取消已經追蹤的不受限`, async () => {
    await seed(me, TRACKED_LIMIT + 1);
    const routes = await listRoutes(me);
    for (const route of routes.slice(0, TRACKED_LIMIT)) await setTracked(me, route.id, true);

    await expect(setTracked(me, routes[TRACKED_LIMIT].id, true)).rejects.toThrow(`最多追蹤 ${TRACKED_LIMIT} 條`);
    await expect(setTracked(me, routes[0].id, false)).resolves.toBeTruthy();
  });
});
