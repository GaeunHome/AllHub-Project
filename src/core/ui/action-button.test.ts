import { createElement, isValidElement, useActionState, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toasts } from "@/dev/toast-stub";
import { markup } from "@/dev/test-helpers";
import type { FormState } from "./form-message";

// 結果要送出之後才有 直接給 useActionState 一個結果 其他照 React 原本的實作
vi.mock("react", { spy: true });
vi.mock("./toast", () => import("@/dev/toast-stub"));

const { ActionButton } = await import("./action-button");
const { ConfirmSubmitButton } = await import("./confirm-submit-button");
const { keepFocusInFrame } = await import("./focus-frame");

type ButtonProps = Parameters<typeof ActionButton>[0];
type Submit = (previous: FormState, formData: FormData) => Promise<FormState>;
const props = (extra: Partial<ButtonProps> = {}) => ({ action: vi.fn(), fields: { id: 5 }, ...extra }) as ButtonProps;
// lint 規定 children 用第三個參數傳 型別上 children 卻是必填 所以 props 斷言成完整的型別
const html = (extra: Partial<ButtonProps> = {}) => markup(createElement(ActionButton, props(extra), "刪除")).replace(/<script[\s\S]*?<\/script>/g, "");

/** 取出交給 useActionState 的 action 送出時跑的就是它 */
function submitOf(extra: Partial<ButtonProps>): Submit {
  let submit: Submit | undefined;
  vi.mocked(useActionState).mockImplementationOnce(((action: Submit) => {
    submit = action;
    return [{}, vi.fn(), false];
  }) as never);
  html(extra);
  return submit!;
}

type Element = ReactElement<{ ref?: unknown; onClick?: (event: { preventDefault: () => void; defaultPrevented: boolean }) => void; children?: ReactNode }>;
/** 直接呼叫元件拿到的樹裡 第一個符合的元素 */
function find(node: ReactNode, match: (element: Element) => boolean): Element | undefined {
  if (Array.isArray(node)) return node.map((child) => find(child, match)).find(Boolean);
  if (!isValidElement(node)) return undefined;
  const element = node as Element;
  return match(element) ? element : find(element.props.children, match);
}
/** 送出中或閒著時 ActionButton 回傳的樹 */
function tree(pending: boolean, extra: Partial<ButtonProps> = {}) {
  vi.mocked(useActionState).mockReturnValueOnce([{}, vi.fn(), pending]);
  return ActionButton({ ...props(extra), children: "刪除" });
}
const clickEvent = () => {
  const event = {
    defaultPrevented: false,
    preventDefault: vi.fn(() => {
      event.defaultPrevented = true;
    }),
  };
  return event;
};

beforeEach(() => {
  vi.mocked(useActionState).mockReset();
});

describe("只有一個按鈕的表單（ActionButton）的結果", () => {
  it("成功：伺服器的訊息用提示視窗，不留在按鈕旁邊", async () => {
    const action = vi.fn(async () => ({ message: "已續訂 3 個頻道" }));

    expect(await submitOf({ action })({}, new FormData())).toEqual({ message: "已續訂 3 個頻道" });
    expect(toasts).toEqual([{ tone: "success", title: "已續訂 3 個頻道" }]);
    expect(html()).not.toMatch(/role="(?:status|alert)"/);
  });

  it("伺服器沒給訊息時用 successMessage（例如刪除後這一列跟著不見，別的裝置已經刪掉了也一樣）；兩個都沒有就不跳", async () => {
    await submitOf({ action: vi.fn(async () => ({})), successMessage: "已刪除「餐飲」" })({}, new FormData());
    await submitOf({ action: vi.fn(async () => ({})) })({}, new FormData());

    expect(toasts).toEqual([{ tone: "success", title: "已刪除「餐飲」" }]);
  });

  it("失敗：錯誤也用提示視窗（視窗外面的按鈕失敗），不顯示 successMessage", async () => {
    await submitOf({ action: vi.fn(async () => ({ error: "找不到這支影片，請重新整理頁面" })), successMessage: "已刪除「餐飲」" })({}, new FormData());

    expect(toasts).toEqual([{ tone: "error", title: "找不到這支影片，請重新整理頁面" }]);
  });
});

describe("送出中（ActionButton）", () => {
  it("用 aria-disabled 標示、不設 disabled：停用的按鈕會丟掉焦點，這一列跟著不見時焦點就找不到外框", () => {
    vi.mocked(useActionState).mockReturnValueOnce([{}, vi.fn(), true]);

    const button = html().match(/<button[^>]*>/)![0];

    expect(button).toContain('aria-disabled="true"');
    expect(button).not.toMatch(/\sdisabled(?:=|\s|>)/);
  });

  it("再按一次不會重複送出；要先確認的也不再跳確認", () => {
    const confirm = vi.fn(() => true);
    vi.stubGlobal("window", { confirm });
    const plain = clickEvent();
    const withConfirm = clickEvent();

    find(tree(true), (element) => element.type === "button")!.props.onClick!(plain);
    const confirmButton = find(tree(true, { confirmMessage: "確定刪除？" }), (element) => element.type === ConfirmSubmitButton)!;
    find(ConfirmSubmitButton(confirmButton.props as Parameters<typeof ConfirmSubmitButton>[0]), (element) => element.type === "button")!.props.onClick!(withConfirm);

    expect(plain.preventDefault).toHaveBeenCalled();
    expect(withConfirm.preventDefault).toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
  });

  it("閒著時照常送出，要確認的先確認", () => {
    const confirm = vi.fn(() => true);
    vi.stubGlobal("window", { confirm });
    const event = clickEvent();

    const confirmButton = find(tree(false, { confirmMessage: "確定刪除？" }), (element) => element.type === ConfirmSubmitButton)!;
    find(ConfirmSubmitButton(confirmButton.props as Parameters<typeof ConfirmSubmitButton>[0]), (element) => element.type === "button")!.props.onClick!(event);

    expect(confirm).toHaveBeenCalledExactlyOnceWith("確定刪除？");
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("成功後這一列跟著不見時焦點交給最近的外框，不掉到 body", () => {
    expect(find(tree(false), (element) => element.type === "form")!.props.ref).toBe(keepFocusInFrame);
  });
});
