import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mocksOf } from "@/dev/test-helpers";

vi.mock("../actions", () => ({
  continueTranslationAction: vi.fn(),
  restartTranslationAction: vi.fn(),
  retryTranslationAction: vi.fn(),
  startTranslationAction: vi.fn(),
  uploadSubtitlesAction: vi.fn(),
}));
vi.mock("../player-size", { spy: true });

const { usePlayerSize } = mocksOf(await import("../player-size"), "usePlayerSize");
const { WatchClient } = await import("./watch-client");

type Props = Parameters<typeof WatchClient>[0];
const PROPS: Props = {
  videoId: "dQw4w9WgXcQ",
  title: createElement("h1", null, "影片標題"),
  channel: createElement("p", null, "頻道"),
  translationKey: "1-0",
  translation: { status: "done", done: 1, total: 1, translated: ["你好"], error: null, cues: [{ start: 0, end: 900, text: "안녕" }], sourceKind: "manual" },
  apiKeyMissing: null,
  canManage: true,
  startedByViewer: true,
  settingsHref: "/youtube/settings",
};
const render = (props: Partial<Props> = {}) => renderToStaticMarkup(createElement(WatchClient, { ...PROPS, ...props }));

beforeEach(() => {
  usePlayerSize.mockReset().mockReturnValue(["default", vi.fn()]);
});

describe("觀看頁：播放器大小", () => {
  it("全螢幕按鈕在播放器上，頻道列的膠囊不再重複一顆（有翻譯、還沒翻譯都一樣）", () => {
    for (const markup of [render(), render({ translation: null })]) {
      const pills = [...markup.matchAll(/<button[^>]*class="yt-pill[^"]*"[^>]*>(.*?)<\/button>/g)].map((m) => m[1]);
      expect(pills.some((pill) => pill.includes("全螢幕"))).toBe(false);
      expect(markup).toContain('aria-label="全螢幕"');
    }
  });

  it("劇院模式：寬螢幕上播放器撐滿兩欄，標題、翻譯面板與接下來播放排到下面一列", () => {
    usePlayerSize.mockReturnValue(["theater", vi.fn()]);

    const markup = render();

    expect(markup).toMatch(/^<div class="stack min-w-0 lg:contents">/);
    expect(markup).toMatch(/<div class="player-slot lg:col-span-2"[^>]*data-size="theater"/);
  });
});
