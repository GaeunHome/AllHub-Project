import { describe, expect, it } from "vitest";
import { markup } from "@/dev/test-helpers";
import { feedVideo } from "../../../dev/fixtures";
import { VideoLink, VideoThumbnail } from "../video-card";

describe("影片縮圖的狀態標籤", () => {
  it("還沒翻譯：縮圖上沒有標籤", () => {
    expect(markup(VideoThumbnail({ video: feedVideo("plainvideo1") }))).not.toContain("yt-badge");
  });

  it("翻譯過：標出來", () => {
    expect(markup(VideoThumbnail({ video: feedVideo("translated1", { translationStatus: "done" }) }))).toContain("已翻譯");
  });
});

describe("點影片", () => {
  it("一律進站內的觀看頁", () => {
    expect(markup(VideoLink({ video: feedVideo("plainvideo1"), children: "看" }))).toContain('href="/youtube/watch/plainvideo1"');
  });
});
