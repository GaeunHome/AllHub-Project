import { beforeEach, describe, expect, it, vi } from "vitest";
import { currentSession, requireSession } from "@/dev/session-stub";
import { mocksOf } from "@/dev/test-helpers";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("../../service/translation", { spy: true });

const { getTranslation } = mocksOf(await import("../../service/translation"), "getTranslation");
const { GET } = await import("./subtitle-download");

const VIDEO = "dQw4w9WgXcQ";
const download = () => GET(new Request(`https://hub.example.com/api/youtube/subtitles/${VIDEO}?format=srt&lang=zh`), { params: Promise.resolve({ videoId: VIDEO }) });

beforeEach(() => {
  currentSession.mockReset();
  requireSession.mockReset();
  getTranslation.mockReset().mockResolvedValue({ videoId: VIDEO, sourceCues: [{ start: 0, end: 900, text: "안녕" }], translated: ["你好"] });
});

describe("下載翻譯後的字幕檔（Route Handler）", () => {
  it("沒登入（例如改過密碼後的舊 cookie）_回 401_不讀字幕", async () => {
    currentSession.mockResolvedValue(null);
    // 真的 requireSession 沒登入時會轉址（丟出 NEXT_REDIRECT），Route Handler 不該走這條
    requireSession.mockRejectedValue(new Error("NEXT_REDIRECT:/login"));

    const response = await download();

    expect(response.status).toBe(401);
    expect(getTranslation).not.toHaveBeenCalled();
  });

  it("有登入_回中文字幕檔", async () => {
    const response = await download();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain(`${VIDEO}.zh.srt`);
    expect(await response.text()).toContain("你好");
  });
});
