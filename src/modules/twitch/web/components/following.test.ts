import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OTHER_SESSION, requireSession } from "@/dev/session-stub";
import { mocksOf } from "@/dev/test-helpers";
import { followedStreamer, liveStream } from "../../dev/fixtures";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("../../service/cached", { spy: true });
vi.mock("../actions", () => ({ removeStreamerAction: vi.fn(), setStreamerNotifyAction: vi.fn() }));

const cached = mocksOf(await import("../../service/cached"), "cachedStreamers", "cachedStreamerProfiles", "cachedLiveStreams", "cachedGameArt");
const { Following } = await import("./following");

const html = async () => renderToStaticMarkup((await Following()) as ReactElement);

const LOGINS = ["aa", "bb", "cc", "dd", "ee"];

beforeEach(() => {
  requireSession.mockReset();
  cached.cachedStreamers.mockReset().mockResolvedValue(LOGINS.map((login, i) => followedStreamer(i + 1, login)));
  cached.cachedStreamerProfiles.mockReset().mockResolvedValue([]);
  cached.cachedLiveStreams.mockReset().mockResolvedValue(LOGINS.map((login, i) => liveStream(i + 1, login)));
  cached.cachedGameArt.mockReset().mockResolvedValue([]);
});

describe("Twitch 頁「追蹤中」的直播卡片", () => {
  it("用登入者的 id 讀追蹤的主播", async () => {
    requireSession.mockResolvedValue(OTHER_SESSION);

    await html();

    expect(cached.cachedStreamers).toHaveBeenCalledWith(OTHER_SESSION.id);
  });

  it("欄數照直播的人數撐滿這一欄（auto-fit）：只有兩位時不會空下三分之一；一張卡片也不會被拉到整欄寬", async () => {
    const markup = await html();
    const section = markup.slice(markup.indexOf('aria-labelledby="tw-live"'));
    const grid = section.match(/<div class="([^"]*\bgrid\b[^"]*)"/)![1];

    expect(grid).toContain("auto-fit");
    expect(grid).not.toMatch(/@(?:md|3xl):grid-cols-\d/);
    expect(section.match(/<article class="([^"]*)"/)![1]).toMatch(/\bmax-w-/);
  });

  it("第一排（最多四張）的預覽圖立刻載入，其餘延遲載入", async () => {
    const previews = (await html()).match(/<img[^>]*live_user_[^>]*>/g)!;

    expect(previews).toHaveLength(5);
    expect(previews.map((img) => img.match(/loading="(\w+)"/)![1])).toEqual(["eager", "eager", "eager", "eager", "lazy"]);
  });

  it("直播卡片維持 640x360 的預覽圖：大張的（1920x1080）只給主播詳情的大面板", async () => {
    const previews = (await html()).match(/<img[^>]*live_user_[^>]*>/g)!;

    expect(previews.map((img) => img.match(/live_user_\w+-(\d+x\d+)\.jpg/)![1])).toEqual(Array(5).fill("640x360"));
  });
});
