import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateTag } from "next/cache";
import { TEST_SESSION, requireModule } from "@/dev/session-stub";
import { form, mocksOf } from "@/dev/test-helpers";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("../../service/routes", () => ({ addRoute: vi.fn(), deleteRoute: vi.fn(), moveRoute: vi.fn(), setTracked: vi.fn() }));

const routes = mocksOf(await import("../../service/routes"), "addRoute", "deleteRoute", "moveRoute", "setTracked");
const { addRouteAction, deleteRouteAction, moveRouteAction, setTrackedAction } = await import("../actions");

const ROUTE = { mode: "thsr", line: "", originName: "台北", destinationName: "左營" };

beforeEach(() => {
  requireModule.mockReset().mockResolvedValue(TEST_SESSION);
  routes.addRoute.mockReset().mockResolvedValue(ROUTE);
  routes.deleteRoute.mockReset().mockResolvedValue(ROUTE);
  routes.setTracked.mockReset().mockResolvedValue(ROUTE);
  routes.moveRoute.mockReset().mockResolvedValue(true);
});

describe("常用路線改了要讓快取失效", () => {
  it.each([
    ["新增", () => addRouteAction({}, form({ mode: "thsr", system: "", originId: "1000", destinationId: "1070" }))],
    ["刪除", () => deleteRouteAction({}, form({ id: "1" }))],
    ["追蹤", () => setTrackedAction({}, form({ id: "1", tracked: "true" }))],
    ["排順序", () => moveRouteAction(1, 2)],
  ])("%s", async (_name, run) => {
    await run();

    expect(vi.mocked(updateTag)).toHaveBeenCalledWith("transit:routes");
  });
});

describe("排順序", () => {
  it("放回原位_不讓快取失效", async () => {
    routes.moveRoute.mockResolvedValue(false);

    await moveRouteAction(1, null);

    expect(vi.mocked(updateTag)).not.toHaveBeenCalled();
  });

  it("使用者 id 來自 session id 不是整數時不碰資料庫", async () => {
    await moveRouteAction(3, null);
    expect(routes.moveRoute).toHaveBeenCalledWith(TEST_SESSION.id, 3, null);

    routes.moveRoute.mockClear();
    expect(await moveRouteAction(1.5, null)).toHaveProperty("error");
    expect(routes.moveRoute).not.toHaveBeenCalled();
  });
});

describe("一律用登入者操作", () => {
  it("使用者 id 來自 session 表單送來的只有路線 id", async () => {
    await deleteRouteAction({}, form({ id: "5", userId: "someone-else" }));

    expect(routes.deleteRoute).toHaveBeenCalledWith(TEST_SESSION.id, 5);
  });

  it("追蹤的值不是 true 或 false_當作表單不對 不會變成取消追蹤", async () => {
    expect((await setTrackedAction({}, form({ id: "1", tracked: "maybe" }))).error).toBeTruthy();
    expect(routes.setTracked).not.toHaveBeenCalled();
  });
});
