import { describe, expect, it } from "vitest";
import { mockRequest } from "@/dev/mock-request";
import { handle } from "./mock.mjs";

describe("Twitch 假 CDN 的直播預覽圖", () => {
  it("照網址要的大小回應：直播卡片的 640x360 與主播詳情大面板的 1920x1080 各是那個大小", async () => {
    expect((await mockRequest(handle, "/previews-ttv/live_user_alice-640x360.jpg")).image).toEqual({ label: "LIVE alice", width: 640, height: 360 });
    expect((await mockRequest(handle, "/previews-ttv/live_user_alice-1920x1080.jpg")).image).toEqual({ label: "LIVE alice", width: 1920, height: 1080 });
  });
});
