import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FormState } from "@/core/ui/form-message";

// 刪除鈕 要拿到交給一個按鈕表單的 action
vi.mock("@/core/ui/action-button", { spy: true });

const { ActionButton } = await import("@/core/ui/action-button");
const { DeleteMenuItem } = await import("./row-controls");

const onDeleted = vi.fn();
const action = vi.fn<(previous: FormState, formData: FormData) => Promise<FormState>>();
const render = () => renderToStaticMarkup(createElement(DeleteMenuItem, { action, id: 5, confirmMessage: "確定刪除用途「生活費」？", label: "刪除用途", deletedMessage: "已刪除「生活費」", onDeleted }));
const run = () => vi.mocked(ActionButton).mock.calls[0][0].action({}, new FormData());

beforeEach(() => {
  vi.mocked(ActionButton).mockClear();
  onDeleted.mockReset();
  action.mockReset();
});

describe("選單裡的刪除（DeleteMenuItem）", () => {
  it("刪除成功：這一列會跟選單一起消失，伺服器的訊息交給清單外面", async () => {
    action.mockResolvedValue({ message: "已刪除「生活費」（伺服器）" });
    render();

    expect(await run()).toEqual({ message: "已刪除「生活費」（伺服器）" });
    expect(onDeleted).toHaveBeenCalledWith("已刪除「生活費」（伺服器）");
  });

  it("伺服器沒給訊息（例如別的裝置已經刪掉了）_用預先寫好的那句，焦點照樣有地方去", async () => {
    action.mockResolvedValue({});
    render();

    await run();

    expect(onDeleted).toHaveBeenCalledWith("已刪除「生活費」");
  });

  it("失敗_錯誤留在選單裡（按鈕旁），不交給清單外面", async () => {
    action.mockResolvedValue({ error: "刪除用途失敗（詳見伺服器 log）" });
    render();

    expect(await run()).toEqual({ error: "刪除用途失敗（詳見伺服器 log）" });
    expect(onDeleted).not.toHaveBeenCalled();
  });
});
