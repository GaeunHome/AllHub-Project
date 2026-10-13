import { useEffect, useId, useLayoutEffect, useRef, useState, type EffectCallback } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

// effect 只在瀏覽器跑：直接呼叫元件，選單給「開著」的 state、setter 換成替身，layout effect 收起來自己跑（跑完再跑清除函式，就是 Activity 把頁面藏起來）
vi.mock("react", { spy: true });

const { MoreMenu } = await import("./more-menu");

afterEach(() => {
  for (const hook of [useState, useRef, useId, useLayoutEffect, useEffect]) vi.mocked(hook).mockReset();
});

/** 選單開著時頁面被藏起來：回傳開關選單的 setter */
function hideWhileOpen() {
  const setOpen = vi.fn();
  const layoutEffects: EffectCallback[] = [];
  vi.mocked(useState).mockReturnValueOnce([true, setOpen]);
  vi.mocked(useRef).mockImplementation(((initial: unknown) => ({ current: initial })) as never);
  vi.mocked(useId).mockReturnValue("menu");
  vi.mocked(useLayoutEffect).mockImplementation((effect) => void layoutEffects.push(effect));
  // 點外面、Esc、捲動就收起的監聽要有 document，這裡只看藏起來的當下
  vi.mocked(useEffect).mockImplementation(() => {});

  MoreMenu({ label: "影片的選項", children: null });
  const cleanups = layoutEffects.map((effect) => effect());
  for (const cleanup of cleanups) cleanup?.();
  return setOpen;
}

describe("⋮ 選單開著時頁面被 Activity 藏起來（換頁、上一頁）", () => {
  it("收起選單：回到這一頁時不會還開著（跟鈴鐺面板、人像選單、i 提示、彈出視窗一樣）", () => {
    expect(hideWhileOpen()).toHaveBeenCalledWith(false);
  });
});
