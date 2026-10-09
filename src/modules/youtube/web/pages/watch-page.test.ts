import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ModuleInfo } from "@/core/module";
import { OTHER_SESSION, TEST_SESSION, requireSession } from "@/dev/session-stub";
import { mocksOf } from "@/dev/test-helpers";
import type { WatchClient } from "../components/watch-client";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("../../service/cached", { spy: true });

const cached = mocksOf(await import("../../service/cached"), "cachedTranslation", "cachedMissingApiKeyMessage", "cachedVideoTitle");
const { WatchLoader } = await import("./watch-page");

const VIDEO = "dQw4w9WgXcQ";
const INFO: ModuleInfo = { id: "youtube", name: "YouTube", href: "/youtube", description: "", accent: "red" };
type ClientProps = Parameters<typeof WatchClient>[0];

/** 觀看頁交給 WatchClient 的資料；只看元素的 props，不實際算繪播放器 */
const clientProps = async () => ((await WatchLoader({ params: Promise.resolve({ videoId: VIDEO }), info: INFO })) as ReactElement<ClientProps>).props;

const translationBy = (requestedBy: string | null, status: "queued" | "done" = "done") => ({
  id: 1,
  title: "새 영상",
  status,
  sourceKind: "manual",
  sourceCues: [{ start: 0, end: 900, text: "안녕" }],
  translated: status === "done" ? ["你好"] : [null],
  error: null,
  updatedAt: new Date("2026-10-08T00:00:00Z"),
  requestedBy,
});

beforeEach(() => {
  requireSession.mockReset();
  cached.cachedTranslation.mockReset().mockResolvedValue(null);
  cached.cachedMissingApiKeyMessage.mockReset().mockResolvedValue(null);
  cached.cachedVideoTitle.mockReset().mockResolvedValue(null);
});

describe("觀看頁：翻譯共用，但只有發起人或站長能重新翻譯或換字幕", () => {
  it("成員打開站長翻好的影片_直接看得到翻譯，但不能重新翻譯或上傳", async () => {
    requireSession.mockResolvedValue(OTHER_SESSION);
    cached.cachedTranslation.mockResolvedValue(translationBy(TEST_SESSION.id));

    const props = await clientProps();

    expect(props.translation).toMatchObject({ status: "done", translated: ["你好"] });
    expect(props.canManage).toBe(false);
  });

  it("發起人自己_可以重新翻譯或上傳", async () => {
    requireSession.mockResolvedValue(OTHER_SESSION);
    cached.cachedTranslation.mockResolvedValue(translationBy(OTHER_SESSION.id));

    expect((await clientProps()).canManage).toBe(true);
  });

  it("站長_成員發起的翻譯也可以重新翻譯或上傳", async () => {
    cached.cachedTranslation.mockResolvedValue(translationBy(OTHER_SESSION.id));

    expect((await clientProps()).canManage).toBe(true);
  });

  it("還沒有翻譯的影片_誰都可以開始或上傳", async () => {
    requireSession.mockResolvedValue(OTHER_SESSION);

    expect((await clientProps()).canManage).toBe(true);
  });

  it("翻譯還沒完成、自己沒有 API Key_帶著提示（只能看已翻好的部分）；金鑰與標題都用登入者的 id 讀", async () => {
    requireSession.mockResolvedValue(OTHER_SESSION);
    cached.cachedTranslation.mockResolvedValue(translationBy(TEST_SESSION.id, "queued"));
    cached.cachedMissingApiKeyMessage.mockResolvedValue("還沒設定 Claude 的 API Key，請先到「翻譯設定」填入");

    const props = await clientProps();

    expect(props.apiKeyMissing).toContain("還沒設定");
    expect(cached.cachedMissingApiKeyMessage).toHaveBeenCalledWith(OTHER_SESSION.id);
  });

  it("別人發起、還沒翻完的翻譯_標成不是自己發起的（觀看頁不會自動用自己的 API Key 接著翻）", async () => {
    requireSession.mockResolvedValue(OTHER_SESSION);
    cached.cachedTranslation.mockResolvedValue(translationBy(TEST_SESSION.id, "queued"));

    expect((await clientProps()).startedByViewer).toBe(false);
  });

  it("自己發起的翻譯_標成自己發起的（照原本的行為自動接著翻）", async () => {
    requireSession.mockResolvedValue(OTHER_SESSION);
    cached.cachedTranslation.mockResolvedValue(translationBy(OTHER_SESSION.id, "queued"));

    expect((await clientProps()).startedByViewer).toBe(true);
  });

  it("發起人已刪除帳號（null）_站長打開也不算自己發起的", async () => {
    cached.cachedTranslation.mockResolvedValue(translationBy(null, "queued"));

    expect((await clientProps()).startedByViewer).toBe(false);
  });

  it("沒有翻譯紀錄時標題用自己追蹤頻道的影片標題（用登入者的 id 查）", async () => {
    requireSession.mockResolvedValue(OTHER_SESSION);

    await clientProps();

    expect(cached.cachedVideoTitle).toHaveBeenCalledWith(OTHER_SESSION.id, VIDEO);
  });
});
