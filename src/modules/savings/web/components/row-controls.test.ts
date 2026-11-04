import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FormState } from "@/core/ui/form-message";
import { markup } from "@/dev/test-helpers";

// 刪除鈕 要拿到交給一個按鈕表單的 action
vi.mock("@/core/ui/action-button", { spy: true });

const { ActionButton } = await import("@/core/ui/action-button");
const { DeleteMenuItem } = await import("@/core/ui/delete-menu-item");

const action = vi.fn<(previous: FormState, formData: FormData) => Promise<FormState>>();
const render = () => markup(createElement(DeleteMenuItem, { action, fields: { id: 5 }, confirmMessage: "確定刪除分類「餐飲」？", label: "刪除分類", deletedMessage: "已刪除「餐飲」" }));
const props = () => vi.mocked(ActionButton).mock.calls[0][0];

beforeEach(() => {
  vi.mocked(ActionButton).mockClear();
  action.mockReset();
});

describe("選單裡的刪除（DeleteMenuItem）", () => {
  it("送出這一列的 id，先跳確認；結果交給提示視窗，伺服器沒給訊息（例如別的裝置已經刪掉了）時提示預先寫好的那句", () => {
    render();

    expect(props().action).toBe(action);
    expect(props().fields).toEqual({ id: 5 });
    expect(props().confirmMessage).toBe("確定刪除分類「餐飲」？");
    expect(props().successMessage).toBe("已刪除「餐飲」");
  });
});
