import { createElement, useLayoutEffect, useSyncExternalStore, type EffectCallback } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeStorage } from "@/dev/fake-storage";
import { readStylesheet } from "@/dev/stylesheet";
import { PLAYER_SIZE_INIT_SCRIPT, THEATER_ATTRIBUTE, savePlayerSize } from "../player-size";

// layout effect 只在瀏覽器跑 直接呼叫元件時收起來自己執行
vi.mock("react", { spy: true });

const { PlayerSizeSync } = await import("./player-size-sync");

let html: Set<string>;

beforeEach(() => {
  html = new Set();
  vi.stubGlobal("document", { documentElement: { setAttribute: (name: string) => void html.add(name), removeAttribute: (name: string) => void html.delete(name) } });
  vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn() });
});

afterEach(() => {
  vi.mocked(useLayoutEffect).mockReset();
  vi.mocked(useSyncExternalStore).mockReset();
});

/**
 * 在瀏覽器裡算繪一次 不是 hydration
 * useSyncExternalStore 用瀏覽器端的值 layout effect 收起來回傳
 */
function renderOnClient() {
  const effects: EffectCallback[] = [];
  vi.mocked(useSyncExternalStore).mockImplementation((_subscribe, getSnapshot) => getSnapshot());
  vi.mocked(useLayoutEffect).mockImplementation((effect) => void effects.push(effect));
  const element = (PlayerSizeSync as () => unknown)();
  return { element, effects };
}

describe("觀看頁的劇院模式同步（PlayerSizeSync）", () => {
  it("伺服器算繪（與 hydration）時放同步腳本：整頁載入時第一次繪製前就在 html 標好劇院模式", () => {
    const markup = renderToStaticMarkup(createElement(PlayerSizeSync));

    expect(markup).toBe(`<script>${PLAYER_SIZE_INIT_SCRIPT}</script>`);
  });

  it("站內換頁在瀏覽器裡算繪：不放腳本（React 不執行瀏覽器端產生的 script，還會警告），改由 layout effect 標", () => {
    expect(renderOnClient().element).toBeNull();
  });

  it("layout effect 依存著的偏好標上或拿掉，之後跟著切換（含其他分頁）；藏起來或卸載時拿掉，別頁不受影響", () => {
    vi.stubGlobal("localStorage", fakeStorage({ "allhub:youtube:player-size": "theater" }));
    const { effects } = renderOnClient();

    const cleanups = effects.map((effect) => effect());
    expect(html.has(THEATER_ATTRIBUTE)).toBe(true);

    savePlayerSize("default");
    expect(html.has(THEATER_ATTRIBUTE)).toBe(false);
    savePlayerSize("theater");
    expect(html.has(THEATER_ATTRIBUTE)).toBe(true);

    for (const cleanup of cleanups) cleanup?.();
    expect(html.has(THEATER_ATTRIBUTE)).toBe(false);

    savePlayerSize("theater");
    expect(html.has(THEATER_ATTRIBUTE)).toBe(false);
  });
});

describe("html 標上劇院模式時的版面（web/player.css）", () => {
  const css = readStylesheet().replace(/\/\*[\s\S]*?\*\//g, "");
  /** lg 寬螢幕區塊裡 選擇器清單含有 selector 的規則內容 每一條合併起來 */
  const wideRule = (selector: string) => {
    const wide = css.split("@media (min-width: 64rem)").slice(1).map((block) => block.slice(block.indexOf("{") + 1, block.indexOf("\n  }")));
    const rules = wide.flatMap((block) => [...block.matchAll(/([^{}]+)\{([^}]*)\}/g)]);
    return rules.filter((m) => m[1].split(",").some((s) => s.trim() === selector)).map((m) => m[2]).join("\n");
  };

  it("播放器（骨架也用同一個 .player-slot）撐滿兩欄、高度封頂，跟 React 接手後的劇院模式一樣", () => {
    expect(wideRule(`html[${THEATER_ATTRIBUTE}] .player-slot`)).toMatch(/grid-column:\s*span 2 \/ span 2/);
    expect(wideRule(`html[${THEATER_ATTRIBUTE}] .player-slot`)).toMatch(/max-height:\s*calc\(100dvh - 11rem\)/);
    expect(wideRule(`.player-slot[data-size="theater"]`)).toMatch(/max-height:\s*calc\(100dvh - 11rem\)/);
  });

  it("播放器的外層拆開（display: contents），標題與翻譯面板、接下來播放排到下一列", () => {
    expect(wideRule(`html[${THEATER_ATTRIBUTE}] :has(> .player-slot)`)).toMatch(/display:\s*contents/);
  });
});
