import { describe, expect, it } from "vitest";
import { closeMenu, menuFocusIndex, toggleMenu } from "./menu-state";

describe("toggleMenu（導覽列的下拉面板同時只開一個）", () => {
  it("都收著時_按下的面板打開", () => {
    expect(toggleMenu(null, "account")).toBe("account");
  });

  it("鈴鐺面板開著時按人像_換成帳號選單，鈴鐺面板收起", () => {
    expect(toggleMenu("notifications", "account")).toBe("account");
  });

  it("帳號選單開著時按鈴鐺_換成鈴鐺面板，帳號選單收起", () => {
    expect(toggleMenu("account", "notifications")).toBe("notifications");
  });

  it("再按一次同一個_收起來", () => {
    expect(toggleMenu("account", "account")).toBeNull();
  });
});

describe("closeMenu（點外面、按 Esc、點了選單項目時收起自己）", () => {
  it("自己開著_收起來", () => {
    expect(closeMenu("account", "account")).toBeNull();
  });

  it("別的面板開著_不會把它關掉（例如帳號選單點外面時剛好打開了鈴鐺）", () => {
    expect(closeMenu("notifications", "account")).toBe("notifications");
  });

  it("都收著_維持都收著", () => {
    expect(closeMenu(null, "account")).toBeNull();
  });
});

describe("menuFocusIndex（選單裡用鍵盤移動焦點）", () => {
  it("ArrowDown_移到下一項", () => {
    expect(menuFocusIndex("ArrowDown", 0, 3)).toBe(1);
  });

  it("ArrowDown 在最後一項_繞回第一項", () => {
    expect(menuFocusIndex("ArrowDown", 2, 3)).toBe(0);
  });

  it("ArrowUp_移到上一項", () => {
    expect(menuFocusIndex("ArrowUp", 2, 3)).toBe(1);
  });

  it("ArrowUp 在第一項_繞回最後一項", () => {
    expect(menuFocusIndex("ArrowUp", 0, 3)).toBe(2);
  });

  it("焦點還不在任何項目上（-1）_ArrowDown 到第一項、ArrowUp 到最後一項", () => {
    expect(menuFocusIndex("ArrowDown", -1, 3)).toBe(0);
    expect(menuFocusIndex("ArrowUp", -1, 3)).toBe(2);
  });

  it("Home、End_跳到第一項與最後一項", () => {
    expect(menuFocusIndex("Home", 1, 3)).toBe(0);
    expect(menuFocusIndex("End", 1, 3)).toBe(2);
  });

  it("Tab、Enter、Escape 等其他按鍵_回傳 null，交給瀏覽器與其他處理", () => {
    for (const key of ["Tab", "Enter", " ", "Escape", "a"]) expect(menuFocusIndex(key, 0, 3)).toBeNull();
  });

  it("沒有任何項目_回傳 null", () => {
    expect(menuFocusIndex("ArrowDown", -1, 0)).toBeNull();
    expect(menuFocusIndex("End", -1, 0)).toBeNull();
  });
});
