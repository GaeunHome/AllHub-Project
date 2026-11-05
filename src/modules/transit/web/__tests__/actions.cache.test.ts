import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateTag } from "next/cache";
import { TEST_SESSION, requireModule } from "@/dev/session-stub";
import { form, mocksOf } from "@/dev/test-helpers";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("../../service/routes", () => ({ addRoute: vi.fn(), deleteRoute: vi.fn(), setTracked: vi.fn() }));

const routes = mocksOf(await import("../../service/routes"), "addRoute", "deleteRoute", "setTracked");
const { addRouteAction, deleteRouteAction, setTrackedAction } = await import("../actions");

const ROUTE = { mode: "thsr", line: "", originName: "台北", destinationName: "左營" };

beforeEach(() => {
  requireModule.mockReset().mockResolvedValue(TEST_SESSION);
  routes.addRoute.mockReset().mockResolvedValue(ROUTE);
  routes.deleteRoute.mockReset().mockResolvedValue(ROUTE);
  routes.setTracked.mockReset().mockResolvedValue(ROUTE);
});

describe("常用路線改了要讓快取失效", () => {
  it.each([
    ["新增", () => addRouteAction({}, form({ mode: "thsr", system: "", originId: "1000", destinationId: "1070" }))],
    ["刪除", () => deleteRouteAction({}, form({ id: "1" }))],
    ["追蹤", () => setTrackedAction({}, form({ id: "1", tracked: "true" }))],
  ])("%s", async (_name, run) => {
    await run();

    expect(vi.mocked(updateTag)).toHaveBeenCalledWith("transit:routes");
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
