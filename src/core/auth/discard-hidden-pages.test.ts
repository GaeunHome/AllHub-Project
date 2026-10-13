import { createElement, isValidElement, useLayoutEffect, type EffectCallback, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

// layout effect 只在瀏覽器跑：收起來自己執行，document 與 window 換成替身
vi.mock("react", { spy: true });
vi.mock("../notifications/center", () => ({ NotificationCenter: ({ children }: { children: ReactNode }) => children }));
vi.mock("../ui/app-header", () => ({ AppHeader: () => null, SHELL_FRAME: "mx-auto" }));

const { APP_SHELL_SELECTOR, DiscardHiddenPages } = await import("./discard-hidden-pages");
const { AuthCard } = await import("./auth-card");
const { AppShell } = await import("../ui/app-shell");

afterEach(() => {
  vi.mocked(useLayoutEffect).mockReset();
  vi.unstubAllGlobals();
});

/** 在登入頁掛上元件、跑它的 layout effect；shell 是找到的 AppShell（null 是沒有），回傳 reload 的替身 */
function mountWith(shell: { getClientRects: () => unknown[] } | null) {
  const reload = vi.fn();
  const querySelector = vi.fn((selector: string) => (selector === APP_SHELL_SELECTOR ? shell : null));
  vi.stubGlobal("document", { querySelector });
  vi.stubGlobal("window", { location: { reload } });
  const effects: EffectCallback[] = [];
  vi.mocked(useLayoutEffect).mockImplementation((effect) => {
    effects.push(effect);
  });

  DiscardHiddenPages();
  for (const effect of effects) effect();
  return reload;
}

describe("換人登入前丟掉前一個人藏起來的頁面（DiscardHiddenPages）", () => {
  it("登出後換到登入頁，前一個人的頁面還藏在 Activity 裡（打到一半的密碼、表單）：整頁重新載入", () => {
    expect(mountWith({ getClientRects: () => [] })).toHaveBeenCalledOnce();
  });

  it("直接打開登入頁（文件裡沒有 AppShell）：不重新載入", () => {
    expect(mountWith(null)).not.toHaveBeenCalled();
  });

  it("AppShell 看得到（沒有藏起來）時不重新載入：不會一直重整", () => {
    expect(mountWith({ getClientRects: () => [{ width: 1, height: 1 }] })).not.toHaveBeenCalled();
  });

  it("登入頁與註冊頁共用的 AuthCard 都放了它", () => {
    const card = AuthCard({ title: "AllHub", children: createElement("p", null, "表單") });
    const found = (node: ReactNode): boolean =>
      Array.isArray(node) ? node.some(found) : isValidElement<{ children?: ReactNode }>(node) && (node.type === DiscardHiddenPages || found(node.props.children));

    expect(found(card)).toBe(true);
  });

  it("AppShell 的 <main> 帶著它要找的標記", () => {
    const markup = renderToStaticMarkup(createElement(AppShell, { modules: [] } as unknown as Parameters<typeof AppShell>[0], createElement("p", null, "頁面")));
    const attribute = APP_SHELL_SELECTOR.slice(1, -1);

    expect(markup).toMatch(new RegExp(`<main[^>]*\\s${attribute}=""`));
  });
});
