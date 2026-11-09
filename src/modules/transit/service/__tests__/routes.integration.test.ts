import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { stubCoreEnv } from "@/dev/test-env";
import { insertTestUsers, logStatements, setupTestDb } from "@/dev/test-db";
import { mocksOf } from "@/dev/test-helpers";
import { transitRoutes } from "../../data/schema";
import { ROUTE_LIMIT, TRACKED_LIMIT } from "../../lib/rules";

stubCoreEnv();
vi.mock("../timetable", () => ({ readStations: vi.fn(), readDirections: vi.fn(), readBusRoute: vi.fn() }));

const timetable = mocksOf(await import("../timetable"), "readStations", "readDirections", "readBusRoute");
const { addRoute, deleteRoute, listRoutes, moveRoute, setTracked } = await import("../routes");
const { RouteNotFoundError } = await import("../errors");

const getDb = setupTestDb();
const THSR = { mode: "thsr", system: "", line: "0123", originId: "1000", destinationId: "1070" };

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
    expect(await addRoute(me, { ...THSR, mode: "metro", system: "TRTC", line: "", originId: "R10", destinationId: "R28" })).toMatchObject({ system: "TRTC", destinationName: "淡水" });
    await expect(addRoute(me, { ...THSR, mode: "metro", system: "TRTC", line: "", originId: "R10", destinationId: "R02" })).rejects.toThrow("沒有這個方向");
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

  it("同一段路的不同車次各算一條", async () => {
    await addRoute(me, THSR);

    await expect(addRoute(me, { ...THSR, line: "0125" })).resolves.toMatchObject({ line: "0125" });
  });

  it("別人有同一條路線_不影響自己", async () => {
    await addRoute(other, THSR);

    await expect(addRoute(me, THSR)).resolves.toBeTruthy();
  });

  it(`每人最多 ${ROUTE_LIMIT} 條`, async () => {
    await seed(me, ROUTE_LIMIT);

    await expect(addRoute(me, THSR)).rejects.toThrow(`已滿 ${ROUTE_LIMIT} 條`);
  });

  // PGlite 只有一條連線 交易本來就一個一個跑 所以看送出的 SQL
  it("先鎖住自己那一列使用者再數 同一個人同時新增時一個一個來 才不會超過上限", async () => {
    const statements = logStatements(getDb());

    await addRoute(me, THSR);

    const lock = statements.findIndex(({ sql, params }) => sql.includes('from "core_users"') && sql.includes("for no key update") && params.includes(me));
    const counting = statements.findIndex(({ sql }) => sql.includes("count(") && sql.includes('from "transit_routes"'));
    expect(lock).toBeGreaterThan(-1);
    expect(counting).toBeGreaterThan(lock);
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

describe("排順序（使用者要的：側邊欄的常用路線可以上下拖曳）", () => {
  const add = (line: string) => addRoute(me, { ...THSR, line });
  const order = async (userId = me) => (await listRoutes(userId)).map((route) => route.line);

  it("新增的排在最後", async () => {
    await add("0101");
    await add("0102");
    await add("0103");

    expect(await order()).toEqual(["0101", "0102", "0103"]);
  });

  it("傳放到哪一條前面 null 是放最後", async () => {
    const [a, , c] = [await add("0101"), await add("0102"), await add("0103")];

    expect(await moveRoute(me, c.id, a.id)).toBe(true);
    expect(await order()).toEqual(["0103", "0101", "0102"]);
    expect(await moveRoute(me, c.id, null)).toBe(true);
    expect(await order()).toEqual(["0101", "0102", "0103"]);
  });

  it("放回原位_回 false 不用重讀", async () => {
    const [a, b] = [await add("0101"), await add("0102")];

    expect(await moveRoute(me, a.id, b.id)).toBe(false);
  });

  it("排之後再新增_還是排在最後", async () => {
    const [a] = [await add("0101"), await add("0102")];
    await moveRoute(me, a.id, null);
    await add("0103");

    expect(await order()).toEqual(["0102", "0101", "0103"]);
  });

  it("排別人的路線_當作不存在 順序沒變（IDOR）", async () => {
    const mine = await add("0101");
    const theirs = await addRoute(other, { ...THSR, line: "0201" });
    await addRoute(other, { ...THSR, line: "0202" });

    await expect(moveRoute(me, theirs.id, null)).rejects.toThrow(RouteNotFoundError);
    await expect(moveRoute(other, mine.id, null)).rejects.toThrow(RouteNotFoundError);
    expect(await order(other)).toEqual(["0201", "0202"]);
  });
});
