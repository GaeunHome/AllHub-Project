import { describe, expect, it } from "vitest";
import { mockRequest } from "@/dev/mock-request";
import { handle } from "./mock.mjs";

const request = (path: string) => mockRequest(handle, path);

describe("假服務的影片縮圖", () => {
  const PATH = "/vi/feedWT2jt11/mqdefault.jpg";

  it("跟真的 mqdefault.jpg 差不多大：Chrome 的 LCP 不算每像素不到 0.05 bit 的圖，幾百 bytes 的 SVG 放大成卡片縮圖會被當成佔位圖，E2E 量到的 LCP 就變成別張延遲載入的縮圖", async () => {
    const { status, body, headers } = await request(PATH);

    expect(status).toBe(200);
    expect(headers["Content-Type"]).toContain("image/svg+xml");
    // 畫面上最大的縮圖是手機橫拿時單欄撐滿約 640px 寬 留四倍的餘裕
    expect((Buffer.byteLength(body) * 8) / (640 * 360)).toBeGreaterThan(0.2);
  });

  it("每支影片的縮圖不同、同一支每次都一樣：圖上的字是影片 id，看得出有沒有對應正確", async () => {
    const first = (await request(PATH)).body;

    expect(first).toContain(">feedWT2jt11<");
    expect((await request(PATH)).body).toBe(first);
    expect((await request("/vi/zhsubs5nymq/mqdefault.jpg")).body).not.toBe(first);
  });

  it("影片 id 開頭 nothumb 的縮圖回 404（畫面退回圖示）", async () => {
    expect((await request("/vi/nothumb0001/mqdefault.jpg")).status).toBe(404);
  });
});

describe("假服務的 Shorts 確認（推送時與清理時請求 /shorts/<id>）", () => {
  it("影片 id 開頭 short 的是 Shorts：跟真的 YouTube 一樣回 200（包括 RSS 裡沒有的舊影片）", async () => {
    expect((await request("/shorts/shortold0001")).status).toBe(200);
  });

  it("其他影片跟真的 YouTube 一樣 303 轉到 /watch", async () => {
    expect(await request("/shorts/feedabc1234")).toMatchObject({ status: 303, headers: { Location: "/watch?v=feedabc1234" } });
  });
});
