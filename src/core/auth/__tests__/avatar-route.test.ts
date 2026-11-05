import { beforeEach, describe, expect, it, vi } from "vitest";
import { TEST_SESSION, currentSession } from "@/dev/session-stub";
import { mocksOf } from "@/dev/test-helpers";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("../index", () => import("@/dev/session-stub"));
vi.mock("../users", () => ({ readAvatarImage: vi.fn() }));

const { readAvatarImage } = mocksOf(await import("../users"), "readAvatarImage");
const { GET } = await import("../avatar-route");

const ID = "6f1c2b9e-3a4d-4c5e-8f70-1a2b3c4d5e6f";
const get = (id = ID) => GET(new Request(`https://hub.test/api/avatars/${id}`), { params: Promise.resolve({ id }) });

beforeEach(() => {
  currentSession.mockReset().mockResolvedValue(TEST_SESSION);
  readAvatarImage.mockReset().mockResolvedValue(Buffer.from([0xff, 0xd8, 0xff, 1]));
});

describe("GET /api/avatars/<id>", () => {
  it("沒登入_401 不讀資料", async () => {
    currentSession.mockResolvedValue(null);

    expect((await get()).status).toBe(401);
    expect(readAvatarImage).not.toHaveBeenCalled();
  });

  it("id 格式不對或查不到_404", async () => {
    expect((await get("../etc/passwd")).status).toBe(404);
    readAvatarImage.mockResolvedValue(null);
    expect((await get()).status).toBe(404);
  });

  it("回圖片 瀏覽器不能猜成別的類型 換照片時網址會變 所以可以長期快取", async () => {
    const response = await get();

    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("immutable");
  });
});
