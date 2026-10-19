import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ModuleInfo } from "@/core/module";
import { OTHER_SESSION, TEST_SESSION, requireSession } from "@/dev/session-stub";
import { mocksOf } from "@/dev/test-helpers";
import type { WatchClient } from "../components/watch-client";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("../../service/cached", { spy: true });

const cached = mocksOf(await import("../../service/cached"), "cachedTranslation", "cachedMissingApiKeyMessage", "cachedFollowedVideo");
const { WatchLoader, WatchPage } = await import("./watch-page");
const { PlayerSizeSync } = await import("../components/player-size-sync");

const VIDEO = "dQw4w9WgXcQ";
const INFO: ModuleInfo = { id: "youtube", name: "YouTube", href: "/youtube", description: "", icon: "/icons/brands/youtube.svg", accent: "red" };
type ClientProps = Parameters<typeof WatchClient>[0];

/** 觀看頁交給 WatchClient 的資料 只看元素的 props 不實際算繪播放器 */
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
  cached.cachedFollowedVideo.mockReset().mockResolvedValue(null);
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

    expect(cached.cachedFollowedVideo).toHaveBeenCalledWith(OTHER_SESSION.id, VIDEO);
  });
});

describe("觀看頁的版面：播放器大小優先", () => {
  // E2E 量到的 px 上方 149 = 導覽列 57 + 留白 40 + 返回連結 36 + 間距 16
  // 下方是間距 16 標題一行 28 間距 16 頻道列 48 膠囊換行時再加 16 + 44
  const ABOVE_PLAYER = 149;
  const BELOW_TO_CHANNEL = 16 + 28 + 16;
  const CHANNEL_ONE_ROW = 48;
  const CHANNEL_WRAPPED = 48 + 16 + 44;
  // 頻道列左邊至少 12rem 加間距 24 右邊最寬一排膠囊約 808
  // 是站長看別人翻到一半的影片 播放器比這窄時膠囊換到第二列
  const CHANNEL_ROW_FITS = 192 + 24 + 808;
  const SIDE_PADDING = 64;
  const COLUMN_GAP = 32;
  const SIDE_MIN = 352;

  const gridClass = () => {
    const page = WatchPage({ params: Promise.resolve({ videoId: VIDEO }), info: INFO }) as ReactElement<{ children: ReactElement<{ className: string }>[] }>;
    return page.props.children[1].props.className;
  };

  /**
   * 依 className 裡 xl 的欄寬公式算出播放器與接下來播放的寬度
   * 視窗夠高時用另一組預留高度
   */
  function columns(width: number, height: number) {
    const className = gridClass();
    const formula = (prefix: string) => {
      const escaped = prefix.replace(/[[\]()]/g, "\\$&");
      const m = new RegExp(`(?:^|\\s)${escaped}grid-cols-\\[minmax\\(0,max\\((\\d+)%,calc\\(\\(100dvh-([\\d.]+)rem\\)\\*16/9\\)\\)\\)_minmax\\(22rem,1fr\\)\\]`).exec(className);
      return m ? { percent: Number(m[1]), reserve: Number(m[2]) * 16 } : null;
    };
    const tall = /xl:\[@media\(min-height:([\d.]+)rem\)\]:/.exec(className);
    const short = formula("xl:");
    const chosen = tall && height >= Number(tall[1]) * 16 ? formula(tall[0].trim()) : short;
    expect(chosen).not.toBeNull();
    const content = width - SIDE_PADDING;
    const player = Math.min(Math.max((content * chosen!.percent) / 100, ((height - chosen!.reserve) * 16) / 9), content - SIDE_MIN - COLUMN_GAP);
    return { player, side: content - player - COLUMN_GAP };
  }

  const channelBottom = (width: number, height: number) => {
    const { player } = columns(width, height);
    return ABOVE_PLAYER + (player * 9) / 16 + BELOW_TO_CHANNEL + (player >= CHANNEL_ROW_FITS ? CHANNEL_ONE_ROW : CHANNEL_WRAPPED);
  };

  it("1920×950、1440×760：標題一行時，標題、頻道列與翻譯按鈕都在畫面內（膠囊換到第二列也一樣）", () => {
    expect(channelBottom(1920, 950)).toBeLessThanOrEqual(950);
    expect(channelBottom(1440, 760)).toBeLessThanOrEqual(760);
  });

  it("1920×950：播放器盡量大，頻道列下面只剩不到 32px（之前封頂在 1049px 寬）", () => {
    expect(950 - channelBottom(1920, 950)).toBeLessThan(32);
    expect(columns(1920, 950).player).toBeGreaterThan(1150);
  });

  it("1280×680：播放器不比右邊的「接下來播放」窄", () => {
    const { player, side } = columns(1280, 680);

    expect(player).toBeGreaterThanOrEqual(side);
  });

  it("很矮的視窗：播放器仍至少佔一半，不會縮到比接下來播放還小", () => {
    const { player, side } = columns(1280, 560);

    expect(player).toBeGreaterThanOrEqual(side);
  });
});

describe("觀看頁的版面：劇院模式整頁載入時第一次繪製就排好", () => {
  /** 版面格子裡依序的子元素 格子是返回連結的下一個 */
  const gridChildren = () => {
    const page = WatchPage({ params: Promise.resolve({ videoId: VIDEO }), info: INFO }) as ReactElement<{ children: ReactElement<{ children: ReactElement<{ fallback?: ReactNode }>[] }>[] }>;
    return page.props.children[1].props.children;
  };

  it("格子裡最前面是劇院模式的同步：在播放器與骨架之前，整頁載入時先在 html 標好", () => {
    const [first, player, upNext] = gridChildren();

    expect(first.type).toBe(PlayerSizeSync);
    expect(player.props.fallback).toBeDefined();
    expect(upNext.props.fallback).toBeDefined();
  });

  it("骨架的播放器跟播放器佔同一個位置（.player-slot），外層的排法跟 WatchClient 一樣：劇院模式、手機撐滿寬度時位置與大小也不變", () => {
    const markup = renderToStaticMarkup(gridChildren()[1].props.fallback);

    expect(markup).toMatch(/^<div class="stack min-w-0"><div aria-hidden="true" class="skeleton player-slot[^"]*"><\/div><div role="status"/);
  });
});
