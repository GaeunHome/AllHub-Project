import { mockContext } from "./mock-context.mjs";

// 假外部服務的測試直接呼叫模組的 handle 不必啟動伺服器
// ctx 跟 npm run mock:external 的是同一份

type MockContext = ReturnType<typeof mockContext>;

export type MockReply = {
  /** handle 回 true 才算處理了 沒處理的路徑假伺服器交給下一個模組 */
  handled: boolean;
  status?: number;
  headers: Record<string, string>;
  body: string;
  /** JSON 回應解析好的內容 */
  data?: unknown;
  /** ctx.image 收到的字與大小 圖本身照樣畫在 body */
  image?: { label: string; width?: number; height?: number; round?: boolean };
};

type MockRequestInit = { method?: string; body?: string; headers?: Record<string, string> };

/** 像瀏覽器或網站一樣向假服務送一個請求 記下 handle 回了什麼 */
export async function mockRequest(handle: (ctx: MockContext) => unknown, path: string, { method = "GET", body = "", headers = {} }: MockRequestInit = {}): Promise<MockReply> {
  const reply: MockReply = { handled: false, headers: {}, body: "" };
  const res = {
    writeHead(status: number, sent: Record<string, string>) {
      reply.status = status;
      reply.headers = sent;
    },
    end(sent = "") {
      reply.body = sent;
    },
  };
  // node 的 IncomingMessage 標頭名稱一律小寫
  const req = { method, headers: Object.fromEntries(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value])) };
  const ctx = mockContext({ req, url: new URL(path, "http://127.0.0.1:4010"), body, res });
  const image: MockContext["image"] = (label, size) => {
    reply.image = { label, ...size };
    return ctx.image(label, size);
  };

  reply.handled = Boolean(await handle({ ...ctx, image }));
  if (reply.headers["Content-Type"] === "application/json" && reply.body) reply.data = JSON.parse(reply.body);
  return reply;
}
