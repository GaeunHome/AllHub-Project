import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { markup, textOf } from "@/dev/test-helpers";
import { SegmentedControl } from "./segmented-control";

const OPTIONS = [
  { id: "expense", label: "支出" },
  { id: "income", label: "收入" },
] as const;
type Kind = (typeof OPTIONS)[number]["id"];
type Props = Parameters<typeof SegmentedControl<Kind>>[0];
const props: Props = { label: "類型", options: OPTIONS, value: "income", onChange: vi.fn() };

/** 元件回傳的樹裡所有的 button */
function buttonsOf(node: ReactNode): ReactElement<{ onClick: () => void; children: ReactNode }>[] {
  if (Array.isArray(node)) return node.flatMap(buttonsOf);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return node.type === "button" ? [node as ReactElement<{ onClick: () => void; children: ReactNode }>] : buttonsOf(node.props.children);
}

describe("分段選擇（SegmentedControl）", () => {
  it("toolbar（預設）：前面看得到「標籤：」，報讀器聽到的群組名稱是標籤；選到的那個是按下的狀態", () => {
    const html = markup(createElement(SegmentedControl<Kind>, props));

    expect(textOf(html)).toBe("類型：支出收入");
    expect(html).toMatch(/role="group" aria-label="類型"/);
    expect(html).toMatch(/aria-pressed="true"[^>]*>收入</);
    expect(html).toMatch(/aria-pressed="false"[^>]*>支出</);
  });

  it("field：表單裡旁邊已經有欄位標籤，不再顯示「標籤：」，名稱只給報讀器；給了 name 就把選到的值一起送出", () => {
    const html = markup(createElement(SegmentedControl<Kind>, { ...props, variant: "field", name: "kind" }));

    expect(textOf(html)).toBe("支出收入");
    expect(html).toMatch(/role="group" aria-label="類型"/);
    expect(html).toMatch(/<input type="hidden" name="kind" value="income"\/>/);
  });

  it("沒給 name 時不送出隱藏欄位；點選項就把那個選項的 id 交給 onChange", () => {
    const onChange = vi.fn();

    expect(markup(createElement(SegmentedControl<Kind>, { ...props, variant: "field" }))).not.toContain("<input");
    buttonsOf(SegmentedControl<Kind>({ ...props, onChange }))[0].props.onClick();

    expect(onChange).toHaveBeenCalledWith("expense");
  });
});
