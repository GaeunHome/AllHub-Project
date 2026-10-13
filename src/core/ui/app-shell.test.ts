import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../auth", () => ({ requireSession: vi.fn(() => new Promise(() => {})) }));
vi.mock("../auth/actions", () => ({ logout: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const { AppShell } = await import("./app-shell");

type ShellProps = Parameters<typeof AppShell>[0];
const props: Omit<ShellProps, "children"> = { modules: [] };
// children 照 lint 規定用第三個參數傳；型別上 children 是必填，props 斷言成完整的型別
const renderShell = () => renderToStaticMarkup(createElement(AppShell, props as ShellProps, createElement("p", null, "頁面內容")));

const classesOf = (markup: string, pattern: RegExp) => markup.match(pattern)?.[1].split(/\s+/) ?? [];
/** 決定左右邊線的 class：置中、寬度、最大寬度、左右內距（含斷點） */
const frameOf = (classes: string[]) => classes.filter((c) => /^(?:mx-auto|w-full|max-w-|(?:\w+:)?px-)/.test(c)).sort();

describe("版面外框（AppShell）", () => {
  it("導覽列與內容用同一個外框，左右邊線對齊", () => {
    const markup = renderShell();
    const header = classesOf(markup, /<header class="app-header"><div class="([^"]*)"/);
    const main = classesOf(markup, /<main class="([^"]*)"/);

    expect(frameOf(header)).not.toEqual([]);
    expect(frameOf(header)).toEqual(frameOf(main));
  });

  it("幾乎滿版：最大寬度至少 100rem（1600px），超寬螢幕才置中；不再是置中的 max-w-5xl", () => {
    const markup = renderShell();
    const main = classesOf(markup, /<main class="([^"]*)"/);
    const maxWidth = main.find((c) => c.startsWith("max-w-")) ?? "";

    expect(markup).not.toContain("max-w-5xl");
    expect(main).toContain("mx-auto");
    expect(Number(maxWidth.match(/^max-w-\[(\d+(?:\.\d+)?)rem\]$/)?.[1] ?? 0)).toBeGreaterThanOrEqual(100);
  });
});
