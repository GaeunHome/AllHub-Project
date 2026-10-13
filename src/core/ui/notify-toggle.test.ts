import { createElement, useActionState, useOptimistic, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// 送出中只有點了之後才有：直接給 useActionState 一個送出中的狀態，其他照 React 原本的實作
vi.mock("react", { spy: true });

const { NotifyToggle } = await import("./notify-toggle");

type ToggleProps = Parameters<typeof NotifyToggle>[0];
const props: ToggleProps = { action: vi.fn(), id: 7, enabled: true, subject: "Hanabi" };

/** 送出中（pending）或閒著；回傳表單送出的替身 */
function sending(pending: boolean) {
  const formAction = vi.fn();
  vi.mocked(useActionState).mockReturnValue([{}, formAction, pending]);
  return formAction;
}

/** 元件回傳的樹裡第一個 button（開關本身） */
function switchButton(node: ReactNode): ReactElement<{ onClick: () => void }> | null {
  if (Array.isArray(node)) return node.map(switchButton).find(Boolean) ?? null;
  if (!node || typeof node !== "object" || !("props" in node)) return null;
  const element = node as ReactElement<{ children?: ReactNode; onClick: () => void }>;
  return element.type === "button" ? element : switchButton(element.props.children);
}

describe("通知開關（NotifyToggle）送出中", () => {
  it.each(["button", "menu"] as const)("%s：用 aria-disabled 標示、不設 disabled（停用的按鈕會丟掉焦點，在彈出視窗裡焦點會跑到視窗外）", (variant) => {
    sending(true);

    const button = renderToStaticMarkup(createElement(NotifyToggle, { ...props, variant })).match(/<button[^>]*>/)![0];

    expect(button).toContain('aria-disabled="true"');
    expect(button).not.toMatch(/\sdisabled(?:=|\s|>)/);
  });

  it("閒著時：沒有 aria-disabled", () => {
    sending(false);

    const button = renderToStaticMarkup(createElement(NotifyToggle, props)).match(/<button[^>]*>/)![0];

    expect(button).not.toMatch(/\saria-disabled=/);
  });

  it("送出中再點：不重複送出、圖示也不再切換", () => {
    const formAction = sending(true);
    const setShown = vi.fn();
    vi.mocked(useOptimistic).mockReturnValue([true, setShown]);

    switchButton(NotifyToggle(props))!.props.onClick();

    expect(formAction).not.toHaveBeenCalled();
    expect(setShown).not.toHaveBeenCalled();
  });

  it("閒著時點：先切換圖示，再送出新的狀態", () => {
    const formAction = sending(false);
    const setShown = vi.fn();
    vi.mocked(useOptimistic).mockReturnValue([true, setShown]);

    switchButton(NotifyToggle(props))!.props.onClick();

    expect(setShown).toHaveBeenCalledWith(false);
    const formData = formAction.mock.calls[0][0] as FormData;
    expect(Object.fromEntries(formData)).toEqual({ id: "7", enabled: "false" });
  });
});
