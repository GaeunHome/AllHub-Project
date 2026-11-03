import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { readStylesheet } from "@/dev/stylesheet";

const { YoutubePlayer, YOUTUBE_PLAYER_VARS } = await import("./youtube-player");

type Props = Parameters<typeof YoutubePlayer>[0];
const BASE: Props = {
  videoId: "dQw4w9WgXcQ",
  cues: [{ start: 0, end: 900, text: "안녕" }],
  translated: ["你好"],
  mode: "both",
  subtitleSize: "medium",
  translating: false,
  size: "default",
  onSizeChange: () => {},
};
const render = (props: Partial<Props> = {}) => renderToStaticMarkup(createElement(YoutubePlayer, { ...BASE, ...props }));
const buttons = (markup: string) => [...markup.matchAll(/<button\b[^>]*>/g)].map((m) => m[0]);

describe("觀看頁的播放器", () => {
  it("YouTube 自己的全螢幕一律關掉（fs: 0，iPhone 也一樣）：它會讓疊上去的字幕消失；手機上維持在頁面裡播放", () => {
    expect(YOUTUBE_PLAYER_VARS).toMatchObject({ fs: 0, playsinline: 1 });
  });

  it("播放器上疊著全螢幕按鈕：是真的按鈕（鍵盤可以操作），提示快捷鍵 f", () => {
    const fullscreen = buttons(render()).find((tag) => tag.includes('aria-label="全螢幕"'));

    expect(fullscreen).toBeDefined();
    expect(fullscreen).toContain('type="button"');
    expect(fullscreen).toContain('aria-keyshortcuts="f"');
    expect(fullscreen).toContain("（f）");
  });

  it("劇院模式的按鈕只在寬螢幕出現（手機本來就滿寬），提示快捷鍵 t；切到劇院模式後改成回到預設檢視", () => {
    const theater = buttons(render()).find((tag) => tag.includes('aria-label="劇院模式"'));
    expect(theater).toMatch(/class="[^"]*\bhidden\b[^"]*\blg:inline-grid\b/);
    expect(theater).toContain('aria-keyshortcuts="t"');

    const markup = render({ size: "theater" });
    expect(buttons(markup).some((tag) => tag.includes('aria-label="預設檢視"'))).toBe(true);
    expect(markup).toMatch(/<div[^>]*class="player-slot[^"]*"[^>]*data-size="theater"/);
  });

  it("外框先佔好位置，播放器疊在裡面：進出全螢幕時頁面不會跳；字幕疊在影片範圍裡", () => {
    const markup = render();

    expect(markup).toMatch(/<div[^>]*class="player-slot[^"]*"[^>]*><div[^>]*class="player-frame"/);
    expect(markup).toContain('data-fullscreen="off"');
    expect(markup).toContain('class="subtitle-area"');
  });
});

describe("播放器上的劇院模式與全螢幕按鈕（web/player.css）", () => {
  const css = readStylesheet();
  /** 宣告在這個選擇器上的規則內容 含 @media 與 @container 裡的 */
  const declarations = (selector: string) => [...css.matchAll(new RegExp(`^\\s*${selector.replace(/[.()[\]=":]/g, "\\$&")} \\{([^}]*)\\}`, "gm"))].map((match) => match[1]);
  const remOf = (block: string, property: string) => Number(new RegExp(`(?:^|\\s)${property}:\\s*([\\d.]+)rem`).exec(block)?.[1]);
  /** 字幕最長時左右各留的空位 max-width 是 min(80%, 100cqw - Nrem) */
  const subtitleMargin = (block: string) => Number(/100cqw - ([\d.]+)rem/.exec(block)?.[1]) / 2;

  // 一般 48px 全螢幕的大按鈕版約 60px 新版的膠囊控制列約 72px
  const YOUTUBE_BAR_REM = 4.5;
  const BUTTON_REM = 2.75;
  // 圖示 1.25 間距 0.375 左右內距 2 五個 0.875 的字
  const EXIT_BUTTON_REM = 1.25 + 0.375 + 2 + 5 * 0.875;

  it("放在右下角、YouTube 控制列的正上方：下緣不壓到控制列，也不會離控制列太遠", () => {
    const [controls] = declarations(".player-controls");

    expect(controls).not.toMatch(/(?:^|\s)top:/);
    expect(controls).not.toMatch(/translate:/);
    expect(remOf(controls, "right")).toBeLessThanOrEqual(1);
    expect(remOf(controls, "bottom")).toBeGreaterThanOrEqual(YOUTUBE_BAR_REM);
    expect(remOf(controls, "bottom")).toBeLessThanOrEqual(YOUTUBE_BAR_REM + 1);
  });

  it("全螢幕與直拿手機時位置一樣：只有一條規則決定位置", () => {
    const positioned = declarations(".player-controls").filter((block) => /(?:^|\s)(?:top|bottom):/.test(block));

    expect(positioned).toHaveLength(1);
    expect(css).not.toMatch(/\.player-frame[^{]*\.player-controls \{[^}]*(?:top|bottom):/);
  });

  it("滑過或暫停時才出現，鍵盤移到按鈕上也出現；觸控裝置沒有滑過，一直顯示", () => {
    const hoverOnly = /@media \(hover: hover\) \{(?:[^{}]|\{[^}]*\})*?\.player-controls \{\s*opacity: 0;/;

    expect(css).toMatch(hoverOnly);
    expect(css.match(/\.player-controls \{\s*opacity: 0;/g)).toHaveLength(1);
    expect(css).toMatch(/\.player-frame:hover \.player-controls,\s*\.player-frame:not\(\[data-playing\]\) \.player-controls,\s*\.player-controls:has\(:focus-visible\) \{\s*opacity: 1;/);
  });

  it("字幕讓開按鈕：一般大小時字幕最長也碰不到右邊那一欄按鈕", () => {
    const [line] = declarations(".subtitle-line");
    const [controls] = declarations(".player-controls");

    expect(subtitleMargin(line)).toBeGreaterThan(remOf(controls, "right") + BUTTON_REM);
  });

  it("字幕讓開按鈕：全螢幕時按鈕寫出「離開全螢幕」比較寬，字幕再讓開一點（手機橫拿時才碰得到）", () => {
    const [line] = declarations('.player-frame:not([data-fullscreen="off"]) .subtitle-line');
    const [controls] = declarations(".player-controls");

    expect(line).toBeDefined();
    expect(subtitleMargin(line)).toBeGreaterThan(remOf(controls, "right") + EXIT_BUTTON_REM);
  });
});
