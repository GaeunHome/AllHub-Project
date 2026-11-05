import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OTHER_SESSION, TEST_SESSION, requireSession } from "@/dev/session-stub";
import { mocksOf, textOf } from "@/dev/test-helpers";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("next/navigation", () => import("@/dev/navigation-stub"));
vi.mock("../../../service/cached", { spy: true });
vi.mock("../../../service/trips", { spy: true });

const cached = mocksOf(await import("../../../service/cached"), "cachedTrip", "cachedTrips");
const trips = mocksOf(await import("../../../service/trips"), "joinPreview");
const { TripBody } = await import("../trip-page");
const { JoinBody } = await import("../join-page");

const INFO = { id: "travel", name: "旅遊", href: "/travel", description: "", icon: "/icons/ui/plane.svg" } as const;
const params = (id: string) => Promise.resolve({ id });

beforeEach(() => {
  requireSession.mockReset().mockResolvedValue(TEST_SESSION);
  cached.cachedTrip.mockReset().mockResolvedValue(null);
  trips.joinPreview.mockReset().mockResolvedValue(null);
});

describe("旅程頁", () => {
  it("用登入者的 id 讀：別人的旅程讀不到", async () => {
    requireSession.mockResolvedValue(OTHER_SESSION);

    await TripBody({ info: INFO, params: params("7") }).catch(() => {});

    expect(cached.cachedTrip).toHaveBeenCalledWith(OTHER_SESSION.id, 7);
  });

  it.each(["0", "-1", "abc", "1.5", "9999999999"])("網址的 id 是 %s：找不到頁面，不查資料庫", async (id) => {
    await expect(TripBody({ info: INFO, params: params(id) })).rejects.toThrow();
    expect(cached.cachedTrip).not.toHaveBeenCalled();
  });

  it("不是成員：跟不存在一樣是找不到頁面，看不出那趟旅程在不在", async () => {
    await expect(TripBody({ info: INFO, params: params("7") })).rejects.toThrow();
  });
});

describe("加入旅程頁", () => {
  const body = async (preview: Awaited<ReturnType<typeof trips.joinPreview>>) => {
    trips.joinPreview.mockResolvedValue(preview);
    return textOf(renderToStaticMarkup((await JoinBody({ params: Promise.resolve({ id: "7", token: "t" }) })) as ReactElement));
  };
  const PREVIEW = { title: "京都五日遊", destination: "京都", startDate: "2026-12-01", endDate: "2026-12-03", alreadyMember: false };

  it("連結失效只說失效，不透露旅程的任何內容", async () => {
    expect(await body(null)).toBe("這個連結已經失效回到我的旅程");
  });

  it("打開連結不會自動加入：要按按鈕", async () => {
    expect(await body(PREVIEW)).toContain("加入這趟旅程");
  });

  it("已經是成員時直接給行程的入口", async () => {
    expect(await body({ ...PREVIEW, alreadyMember: true })).toContain("打開行程");
  });
});
