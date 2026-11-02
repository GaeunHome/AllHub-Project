import { createElement, useLayoutEffect, useRef, useState, type EffectCallback, type ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { markup, textOf } from "@/dev/test-helpers";

// layout effect 只在瀏覽器跑 直接呼叫元件 state 換成替身 effect 收起來自己跑
vi.mock("react", { spy: true });

const { ResultSlot, useResultReport } = await import("./result-slot");

type Result = { message?: string; focus?: boolean };

afterEach(() => {
  for (const hook of [useState, useRef, useLayoutEffect]) vi.mocked(hook).mockReset();
});

/** 目前的結果是 result 時畫一次 回傳訊息的元素與改 state 的替身 */
function renderWith(result: Result) {
  const message = { focus: vi.fn() };
  const setResult = vi.fn();
  const effects: EffectCallback[] = [];
  vi.mocked(useState).mockReturnValueOnce([result, setResult]);
  vi.mocked(useRef).mockReturnValueOnce({ current: message });
  vi.mocked(useLayoutEffect).mockImplementation((effect) => void effects.push(effect));
  const root = ResultSlot({ children: null }) as ReactElement<{ value: (message: string | undefined, focus?: boolean) => void }>;
  return { message, setResult, effects, report: root.props.value };
}

describe("留訊息的外框（ResultSlot）", () => {
  it("沒有訊息時只有內容，不多包一層：卡片的清單要是卡片的直接子元素，card-list 的邊距才對", () => {
    expect(markup(createElement(ResultSlot, null, createElement("ul", null, createElement("li", null, "一列"))))).toBe("<ul><li>一列</li></ul>");
  });

  it("有訊息時排在內容後面：內容換掉或那一列刪掉，訊息還在", () => {
    vi.mocked(useState).mockReturnValueOnce([{ message: "已刪除「繳房屋稅」" }, vi.fn()]);

    const text = textOf(markup(createElement(ResultSlot, null, createElement("p", null, "內容"))));

    expect(text.indexOf("內容")).toBeLessThan(text.indexOf("已刪除「繳房屋稅」"));
  });

  it("report 帶著 focus：打開視窗的按鈕或那一列會不見，焦點移到訊息，不掉到 body", () => {
    const { message, effects } = renderWith({ message: "已刪除「繳房屋稅」", focus: true });

    effects[0]();

    expect(message.focus).toHaveBeenCalledOnce();
  });

  it("按鈕還在時焦點不動：Dialog 自己會把焦點還給按鈕", () => {
    const { message, effects } = renderWith({ message: "已儲存「繳房屋稅」", focus: false });

    effects[0]();

    expect(message.focus).not.toHaveBeenCalled();
  });

  it("沒有訊息時焦點不動：打開下一個視窗前先把舊訊息收起來的那次更新", () => {
    const { message, effects } = renderWith({ focus: true });

    effects[0]();

    expect(message.focus).not.toHaveBeenCalled();
  });

  it("Activity 藏起頁面時清掉訊息：回到首頁不會留著上次的訊息", () => {
    const { setResult, effects } = renderWith({ message: "已儲存「繳房屋稅」" });

    const cleanups = effects.map((effect) => effect());
    expect(setResult).not.toHaveBeenCalled();
    for (const cleanup of cleanups) cleanup?.();

    expect(setResult).toHaveBeenCalledWith({});
  });

  it("report 把訊息與要不要移焦點交給外框：不帶訊息時收起上一則", () => {
    const { setResult, report } = renderWith({});

    report("已新增「繳房屋稅」", true);
    report(undefined);

    expect(setResult.mock.calls).toEqual([[{ message: "已新增「繳房屋稅」", focus: true }], [{ message: undefined, focus: undefined }]]);
  });

  it("外面沒有 ResultSlot 時 useResultReport 什麼都不做：不會讓按鈕出錯", () => {
    const reports: ReturnType<typeof useResultReport>[] = [];
    const Button = () => {
      reports.push(useResultReport());
      return null;
    };

    markup(createElement(Button));

    expect(reports).toHaveLength(1);
    expect(() => reports[0]("已儲存")).not.toThrow();
  });
});
