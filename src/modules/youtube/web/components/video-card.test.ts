import { describe, expect, it, vi } from "vitest";
import { markup } from "@/dev/test-helpers";
import { feedVideo } from "../../dev/fixtures";

vi.mock("../actions", () => ({ recheckCaptionsAction: vi.fn() }));

const { VideoLink, VideoThumbnail } = await import("./video-card");

const CHECKED_AT = new Date("2026-10-07T12:00:00Z");
const unknown = feedVideo("unknown0001", { zhCaptions: "unknown", zhCaptionsCheckedAt: CHECKED_AT });

describe("影片縮圖的狀態標籤", () => {
  it("檢查過但讀不到字幕：縮圖上沒有標籤", () => {
    expect(markup(VideoThumbnail({ video: unknown }))).not.toContain("yt-badge");
  });

  it("從沒檢查過：標「檢查字幕中」", () => {
    const html = markup(VideoThumbnail({ video: feedVideo("backfill001", { zhCaptions: "unknown", zhCaptionsCheckedAt: null }) }));

    expect(html).toContain("yt-badge");
    expect(html).toContain("檢查字幕中");
  });
});

describe("點影片", () => {
  it("檢查過但讀不到字幕：照一般影片進觀看頁，不是直接到 YouTube", () => {
    expect(markup(VideoLink({ video: unknown, children: "看" }))).toContain('href="/youtube/watch/unknown0001"');
  });
});
