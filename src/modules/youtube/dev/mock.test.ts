import { describe, expect, it } from "vitest";
import { handle } from "./mock.mjs";

type Sent = { status?: number; body?: string; type?: string };

/** 送一個請求給 YouTube 的假服務，記下回應；ctx.image 換成只寫 label 的替身 */
function request(path: string): Sent {
  const sent: Sent = {};
  const respond = (status: number, body: string, type: string) => {
    Object.assign(sent, { status, body, type });
    return true;
  };
  handle({
    req: { method: "GET", headers: {} },
    url: new URL(path, "http://127.0.0.1:4010"),
    body: "",
    json: (status: number, data?: unknown) => respond(status, JSON.stringify(data ?? ""), "application/json"),
    text: (status: number, data: string, type = "text/plain") => respond(status, data, type),
    image: (label: string) => respond(200, `<svg xmlns="http://www.w3.org/2000/svg"><text>${label}</text></svg>`, "image/svg+xml"),
    redirect: (status: number, location: string) => respond(status, location, ""),
  });
  return sent;
}

describe("假服務的影片縮圖", () => {
  const PATH = "/vi/feedWT2jt11/mqdefault.jpg";

  it("跟真的 mqdefault.jpg 差不多大：Chrome 的 LCP 不算每像素不到 0.05 bit 的圖，幾百 bytes 的 SVG 放大成卡片縮圖會被當成佔位圖，E2E 量到的 LCP 就變成別張延遲載入的縮圖", () => {
    const { status, body = "", type } = request(PATH);

    expect(status).toBe(200);
    expect(type).toContain("image/svg+xml");
    // 畫面上最大的縮圖是手機橫拿時單欄撐滿約 640px 寬；留四倍的餘裕
    expect((Buffer.byteLength(body) * 8) / (640 * 360)).toBeGreaterThan(0.2);
  });

  it("每支影片的縮圖不同、同一支每次都一樣：圖上的字是影片 id，看得出有沒有對應正確", () => {
    const first = request(PATH).body;

    expect(first).toContain(">feedWT2jt11<");
    expect(request(PATH).body).toBe(first);
    expect(request("/vi/zhsubs5nymq/mqdefault.jpg").body).not.toBe(first);
  });

  it("影片 id 開頭 nothumb 的縮圖回 404（畫面退回圖示）", () => {
    expect(request("/vi/nothumb0001/mqdefault.jpg").status).toBe(404);
  });
});
