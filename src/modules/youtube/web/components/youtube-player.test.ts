import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

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

  it("className 加在外框上（劇院模式時讓播放器在格線裡撐滿兩欄）", () => {
    expect(render({ className: "lg:col-span-2" })).toMatch(/<div[^>]*class="player-slot lg:col-span-2"/);
  });
});
