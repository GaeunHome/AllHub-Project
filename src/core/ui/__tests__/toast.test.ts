import { createElement, isValidElement, useState, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { readStylesheet } from "@/dev/stylesheet";
import { textOf } from "@/dev/test-helpers";
import type { Toast } from "../toast-queue";

// 直接呼叫每一則的元件看它把滑鼠 焦點與關閉交給佇列 只換掉那一次的 useState
vi.mock("react", { spy: true });

const { ToastProvider, ToastRegions, useToast } = await import("../toast");
const { attachToastLayer, placeToastLayer } = await import("../toast-layer");

const queue = { dismiss: vi.fn(), hold: vi.fn(), release: vi.fn() };
const regions = (toasts: Toast[]) => renderToStaticMarkup(createElement(ToastRegions, { toasts, queue }));

const LIVE = /\srole="(alert|status)"/;
const VOID_TAGS = new Set(["area", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
/** 每個 live region 的角色 裡面的字與包著它的 live region 巢狀時裡面一變外層會再念一次 */
function liveRegions(markup: string) {
  type Open = { tag: string; role: string | null; start: number; region?: { role: string; text: string; enclosedBy: string[] } };
  const stack: Open[] = [];
  const found: NonNullable<Open["region"]>[] = [];
  for (const match of markup.matchAll(/<(\/?)([a-zA-Z][\w-]*)([^>]*)>/g)) {
    const [, closing, tag, attributes] = match;
    if (closing) {
      let open: Open | undefined;
      do open = stack.pop();
      while (open && open.tag !== tag);
      if (open?.region) open.region.text = textOf(markup.slice(open.start, match.index));
      continue;
    }
    const role = LIVE.exec(attributes)?.[1] ?? null;
    const region = role ? { role, text: "", enclosedBy: stack.flatMap((s) => (s.role ? [s.role] : [])) } : undefined;
    if (region) found.push(region);
    if (!VOID_TAGS.has(tag) && !attributes.endsWith("/")) stack.push({ tag, role, start: match.index + match[0].length, region });
  }
  return found;
}

describe("提示視窗的 live region（ToastRegions）", () => {
  it("一直存在：沒有提示時也有錯誤用的 alert 與成功用的 status 兩個，彼此不巢狀", () => {
    expect(liveRegions(regions([]))).toEqual([
      { role: "alert", text: "", enclosedBy: [] },
      { role: "status", text: "", enclosedBy: [] },
    ]);
  });

  it("錯誤放在 alert（立刻念出來），成功與提醒放在 status（念完手上的才念）；提醒與錯誤寫出原因", () => {
    const markup = regions([
      { id: 1, tone: "success", title: "已新增「餐飲」" },
      { id: 2, tone: "error", title: "兌換失敗：GIFT2026", body: "兌換碼已過期" },
      { id: 3, tone: "warning", title: "建議一併貼上 ltmid_v2" },
    ]);

    expect(liveRegions(markup).map(({ role, text }) => [role, text])).toEqual([
      ["alert", "兌換失敗：GIFT2026兌換碼已過期"],
      ["status", "已新增「餐飲」建議一併貼上 ltmid_v2"],
    ]);
  });

  it("每一則都有關閉鈕（不會送出表單），按了就收起那一則", () => {
    const markup = regions([{ id: 7, tone: "success", title: "已儲存" }]);

    const close = markup.match(/<button[^>]*aria-label="關閉這則提示"[^>]*>/)![0];
    expect(close).toContain('type="button"');
  });
});

type Handlers = {
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onFocus?: () => void;
  onBlur?: (event: { currentTarget: { contains: (node: unknown) => boolean }; relatedTarget: unknown }) => void;
  children?: ReactNode;
};
/** 元素樹裡第一個符合的元素 */
function find(node: ReactNode, match: (element: ReactElement<Handlers>) => boolean): ReactElement<Handlers> | undefined {
  if (Array.isArray(node)) return node.map((child) => find(child, match)).find(Boolean);
  if (!isValidElement<Handlers>(node)) return undefined;
  return match(node) ? node : find(node.props.children, match);
}

describe("每一則提示的操作（ToastRegions 裡的卡片）", () => {
  /** 直接呼叫那一則的元件 回傳卡片外框與關閉鈕 */
  function card(toast: Toast) {
    const controls = { dismiss: vi.fn(), hold: vi.fn(), release: vi.fn() };
    const element = find(ToastRegions({ toasts: [toast], queue: controls }), (el) => typeof el.type === "function")!;
    vi.mocked(useState).mockReturnValueOnce([false, vi.fn()]);
    const tree = (element.type as (props: object) => ReactElement<Handlers>)(element.props);
    return { controls, frame: tree, close: find(tree, (el) => el.type === "button")! };
  }
  const TOAST: Toast = { id: 7, tone: "success", title: "已儲存" };

  it("按關閉：收起那一則", () => {
    const { controls, close } = card(TOAST);

    close.props.onClick!();

    expect(controls.dismiss).toHaveBeenCalledExactlyOnceWith(7);
  });

  it("滑鼠移上去或鍵盤移進來時先不收起，離開才繼續；焦點只是在卡片裡移動（移到關閉鈕）不算離開", () => {
    const { controls, frame } = card(TOAST);
    const inside = { tag: "button" };
    const currentTarget = { contains: (node: unknown) => node === inside };

    frame.props.onMouseEnter!();
    frame.props.onFocus!();
    frame.props.onBlur!({ currentTarget, relatedTarget: inside });
    expect(controls.hold.mock.calls).toEqual([
      [7, "hover"],
      [7, "focus"],
    ]);
    expect(controls.release).not.toHaveBeenCalled();

    frame.props.onMouseLeave!();
    frame.props.onBlur!({ currentTarget, relatedTarget: null });
    expect(controls.release.mock.calls).toEqual([
      [7, "hover"],
      [7, "focus"],
    ]);
  });
});

describe("提示視窗的外框（ToastProvider、useToast）", () => {
  it("伺服器算繪時只有頁面內容：放提示的外層要等瀏覽器建好再放進 top layer", () => {
    const markup = renderToStaticMarkup(createElement(ToastProvider, null, createElement("p", null, "頁面")));

    expect(markup).toBe("<p>頁面</p>");
  });

  it("外面沒有 ToastProvider 時什麼都不做：登入頁這類沒有 AppShell 的地方不會出錯", () => {
    let toast: ReturnType<typeof useToast> | undefined;
    const Probe = () => {
      toast = useToast();
      return null;
    };

    renderToStaticMarkup(createElement(Probe));

    expect(() => {
      toast!.success("已儲存");
      toast!.result({ error: "儲存失敗（詳見伺服器 log）" });
    }).not.toThrow();
  });
});

/** 瀏覽器的 popover 搬家時會先收起 */
function fakeLayer() {
  const layer = {
    parentNode: null as unknown,
    shown: false,
    showPopover: vi.fn(() => {
      layer.shown = true;
    }),
    hidePopover: vi.fn(() => {
      layer.shown = false;
    }),
    matches: (selector: string) => selector === ":popover-open" && layer.shown,
    remove: vi.fn(() => {
      layer.parentNode = null;
      layer.shown = false;
    }),
  };
  return layer;
}
type FakeLayer = ReturnType<typeof fakeLayer>;
const fakeParent = (name: string) => {
  const parent = {
    name,
    append: (node: FakeLayer) => {
      node.parentNode = parent;
      node.shown = false;
    },
  };
  return parent;
};
const body = fakeParent("body");
const docWith = (...dialogs: ReturnType<typeof fakeParent>[]) => ({ body, querySelectorAll: (selector: string) => (selector === "dialog[open]" ? dialogs : []) }) as unknown as Document;

describe("提示視窗要蓋在彈出視窗上面（toast-layer）", () => {
  it("掛上時放在 body 並用 popover 放進 top layer", () => {
    const layer = fakeLayer();

    const detach = attachToastLayer(layer as unknown as HTMLElement, docWith());

    expect(layer.parentNode).toBe(body);
    expect(layer.shown).toBe(true);
    detach();
  });

  it("打開視窗後搬進最上面那個開著的視窗再重新顯示：modal 以外的地方都點不到，蓋在上面也要點得到關閉鈕；關掉後搬回 body", () => {
    const layer = fakeLayer();
    const first = fakeParent("記一筆");
    const second = fakeParent("選擇帳戶");
    const detach = attachToastLayer(layer as unknown as HTMLElement, docWith());

    placeToastLayer(docWith(first, second));
    expect(layer.parentNode).toBe(second);
    expect(layer.shown).toBe(true);

    placeToastLayer(docWith());
    expect(layer.parentNode).toBe(body);
    expect(layer.shown).toBe(true);
    detach();
  });

  it("位置沒變時不重新顯示：焦點在提示的關閉鈕上時不會被打斷", () => {
    const layer = fakeLayer();
    const detach = attachToastLayer(layer as unknown as HTMLElement, docWith());
    layer.showPopover.mockClear();

    placeToastLayer(docWith());

    expect(layer.showPopover).not.toHaveBeenCalled();
    expect(layer.hidePopover).not.toHaveBeenCalled();
    detach();
  });

  it("拿掉之後（登出、AppShell 卸載）外層從文件裡移除，之後開關視窗也不再搬它", () => {
    const layer = fakeLayer();
    attachToastLayer(layer as unknown as HTMLElement, docWith())();

    expect(layer.remove).toHaveBeenCalledOnce();
    placeToastLayer(docWith(fakeParent("記一筆")));
    expect(layer.parentNode).toBeNull();
  });
});

describe("提示視窗的樣子（globals.css）", () => {
  // 先拿掉註解 規則前面的註解不能算進選擇器
  const css = readStylesheet().replace(/\/\*[\s\S]*?\*\//g, "");
  /** 選擇器清單裡有這個選擇器的每條規則 與它所在的 @media */
  const rulesOf = (selector: string) => {
    const found: { media: string[]; body: string }[] = [];
    const stack: string[] = [];
    for (const token of css.matchAll(/([^{};]+)\{|\}/g)) {
      if (token[0] === "}") {
        stack.pop();
        continue;
      }
      const head = token[1].trim();
      stack.push(head);
      if (head.split(",").some((part) => part.trim() === selector)) {
        found.push({ media: stack.filter((h) => h.startsWith("@media")), body: css.slice(token.index + token[0].length, css.indexOf("}", token.index)) });
      }
    }
    return found;
  };
  const declarations = (selector: string) => rulesOf(selector).map((rule) => rule.body).join("\n");

  it("固定在導覽列下方、左右留 16px：不擋住頁首的按鈕，也不跟右下角的通知卡片疊在一起", () => {
    const layer = declarations(".toast-layer");
    const notificationCards = declarations(".toast-region");

    expect(layer).toMatch(/position:\s*fixed/);
    expect(layer).toMatch(/top:/);
    expect(layer).toMatch(/bottom:\s*auto/);
    expect(layer).toMatch(/left:\s*1rem/);
    expect(layer).toMatch(/right:\s*1rem/);
    expect(notificationCards).toMatch(/bottom-/);
  });

  it("減少動態時不做位移動畫：滑進來的動畫只寫在 prefers-reduced-motion: no-preference 裡", () => {
    const animated = [".toast-card", ".toast-card-entering"].flatMap(rulesOf).filter((rule) => /animation/.test(rule.body));

    expect(animated.length).toBeGreaterThan(0);
    expect(animated.every((rule) => rule.media.some((media) => media.includes("prefers-reduced-motion: no-preference")))).toBe(true);
  });
});
