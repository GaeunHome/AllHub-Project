import { useEffect, useRef, useState, type EffectCallback } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// effect 只在瀏覽器跑 直接呼叫元件 ref 換成假元素 effect 收起來自己跑
// 跑完再跑清除函式 就等於卸載或 Activity 把頁面藏起來
vi.mock("react", { spy: true });

const { AnimatedNumber } = await import("./animated-number");

type FakeText = { nodeType: number; nodeValue: string };

function mount(props: Parameters<typeof AnimatedNumber>[0], shown: number | null = null) {
  // 伺服器算繪的文字節點已經是最後的數字
  const initial = `$${props.value.toLocaleString("en-US")}`;
  const text: FakeText = { nodeType: 3, nodeValue: initial };
  const element = { firstChild: text, textContent: initial, setAttribute: () => {} };
  const effects: EffectCallback[] = [];
  // 照 useRef 的順序 先是畫面上的數字 再來是目前顯示到多少
  const refs = [{ current: element }, { current: shown }];
  let index = 0;
  vi.mocked(useRef).mockImplementation((() => refs[index++]) as never);
  vi.mocked(useState).mockImplementation(((init: () => unknown) => [init(), () => {}]) as never);
  vi.mocked(useEffect).mockImplementation((effect) => void effects.push(effect));
  AnimatedNumber(props);
  return { text, element, shownRef: refs[1], runEffects: () => effects.map((effect) => effect()) };
}

let frames: ((time: number) => void)[] = [];
const tick = (time: number) => {
  const due = frames;
  frames = [];
  for (const frame of due) frame(time);
};
let reducedMotion = false;

beforeEach(() => {
  frames = [];
  reducedMotion = false;
  vi.stubGlobal("requestAnimationFrame", (callback: (time: number) => void) => frames.push(callback));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    frames[id - 1] = () => {};
  });
  // 開始數之前 CSS 把數字藏著
  vi.stubGlobal("window", { matchMedia: (query: string) => ({ matches: reducedMotion && query === "(prefers-reduced-motion: reduce)" }), getComputedStyle: () => ({ visibility: "hidden" }) });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(useRef).mockReset();
  vi.mocked(useState).mockReset();
  vi.mocked(useEffect).mockReset();
});

describe("金額往上數（瀏覽器）", () => {
  it("掛上之後每一幀改寫原本的文字節點（不換掉 React 管的節點），約 800ms 後停在最後的數字", () => {
    const { text, element, shownRef, runEffects } = mount({ value: 43000 });

    runEffects();
    tick(0);
    tick(400);
    const middle = text.nodeValue;
    for (let time = 416; frames.length > 0 && time < 2000; time += 16) tick(time);

    expect(middle).not.toBe("$0");
    expect(middle).not.toBe("$43,000");
    expect(text.nodeValue).toBe("$43,000");
    expect(element.textContent).toBe("$43,000");
    expect(shownRef.current).toBe(43000);
  });

  it("系統設定減少動態效果_直接寫上最後的數字，不排任何一幀", () => {
    reducedMotion = true;
    const { text, runEffects } = mount({ value: 52000 });

    runEffects();

    expect(text.nodeValue).toBe("$52,000");
    expect(frames).toHaveLength(0);
  });

  it("數值改變_從畫面上的數字接著數到新的數字", () => {
    const { text, runEffects } = mount({ value: 61000 }, 52000);

    runEffects();
    tick(0);

    expect(text.nodeValue).toBe("$52,000");
    for (let time = 16; frames.length > 0 && time < 2000; time += 16) tick(time);
    expect(text.nodeValue).toBe("$61,000");
  });

  it("卸載或 Activity 藏起來（清除函式）_停止改寫", () => {
    const { text, runEffects } = mount({ value: 43000 });

    const [cleanup] = runEffects();
    tick(0);
    tick(100);
    const before = text.nodeValue;
    (cleanup as () => void)();
    tick(200);
    tick(900);

    expect(text.nodeValue).toBe(before);
  });
});
