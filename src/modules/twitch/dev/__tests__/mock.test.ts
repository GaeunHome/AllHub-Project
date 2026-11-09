import { describe, expect, it } from "vitest";
import { mockRequest } from "@/dev/mock-request";
import { handle } from "../mock.mjs";

describe("Twitch 假 CDN 的直播預覽圖", () => {
  it("照網址要的大小回應：直播卡片的 640x360 與主播詳情大面板的 1920x1080 各是那個大小", async () => {
    expect((await mockRequest(handle, "/previews-ttv/live_user_alice-640x360.jpg")).image).toEqual({ label: "LIVE alice", width: 640, height: 360 });
    expect((await mockRequest(handle, "/previews-ttv/live_user_alice-1920x1080.jpg")).image).toEqual({ label: "LIVE alice", width: 1920, height: 1080 });
  });
});

describe("Twitch 假 Helix 的開台時間表：格式跟解析的程式對得上", () => {
  it("沒有設定的主播回 404，有設定的讀得出接下來的幾次（取消的與休假期間的不算）", async () => {
    const { parseSchedule, upcomingSegments } = await import("../../lib/schedule");
    expect((await mockRequest(handle, "/helix/schedule?broadcaster_id=1002")).status).toBe(404);

    const plain = parseSchedule((await mockRequest(handle, "/helix/schedule?broadcaster_id=1003")).data);
    const away = parseSchedule((await mockRequest(handle, "/helix/schedule?broadcaster_id=1004")).data);

    expect(plain?.missing).toEqual([]);
    expect(plain?.schedule.segments.map(({ title }) => title)).toEqual(["晚上一起玩", "聊天", "休假期間的那次", "長時間直播"]);
    expect(away?.schedule.segments.map(({ title }) => title)).toEqual(["晚上一起玩", "聊天", "長時間直播"]);
    expect(upcomingSegments(away!.schedule, new Date(Date.now() - 86_400_000)).length).toBe(3);
  });
});
