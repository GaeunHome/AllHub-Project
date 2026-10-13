import { describe, expect, it } from "vitest";
import { handle } from "./mock.mjs";

type Image = { label: string; width?: number; height?: number };

/** 向 Twitch 的假 CDN 要一張圖，記下 ctx.image 收到的字與大小 */
function requestImage(path: string): Image | null {
  let sent: Image | null = null;
  handle({
    req: { method: "GET", headers: {} },
    url: new URL(path, "http://127.0.0.1:4010"),
    body: "",
    json: () => true,
    image: (label: string, size: { width?: number; height?: number } = {}) => {
      sent = { label, ...size };
      return true;
    },
  });
  return sent;
}

describe("Twitch 假 CDN 的直播預覽圖", () => {
  it("照網址要的大小回應：直播卡片的 640x360 與主播詳情大面板的 1920x1080 各是那個大小", () => {
    expect(requestImage("/previews-ttv/live_user_alice-640x360.jpg")).toEqual({ label: "LIVE alice", width: 640, height: 360 });
    expect(requestImage("/previews-ttv/live_user_alice-1920x1080.jpg")).toEqual({ label: "LIVE alice", width: 1920, height: 1080 });
  });
});
