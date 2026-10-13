import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { form } from "@/dev/test-helpers";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("../actions", { spy: true });

const actions = await import("../actions");
const { AutoSavedContext, SaveVideoButton, WatchSaveButton } = await import("./save-video-button");

const VIDEO = "dQw4w9WgXcQ";
type ButtonProps = { action: unknown; fields: Record<string, string>; confirmMessage?: string; "aria-label"?: string };
const button = (saved: boolean) => SaveVideoButton({ videoId: VIDEO, saved }) as ReactElement<ButtonProps>;
/** 只看按鈕上的字：表單旁邊還有 React 放的 <script> */
const textOf = (saved: boolean) => renderToStaticMarkup(button(saved)).match(/<button[^>]*>([\s\S]*?)<\/button>/)?.[1].replace(/<[^>]+>/g, "");

describe("觀看頁頻道列的「保留」", () => {
  it("還沒保留_顯示「保留」，按了是手動保留這支影片", () => {
    expect(button(false).props.action).toBe(actions.saveVideoAction);
    expect(button(false).props.fields).toEqual({ videoId: VIDEO });
    expect(textOf(false)).toBe("保留");
  });

  it("已經保留（手動保留或翻譯時自動加入的都一樣）_顯示「已保留」，再按一次移除；按錯了可以再按一次保留回來，所以不另外確認", () => {
    expect(button(true).props.action).toBe(actions.removeSavedVideoAction);
    expect(button(true).props.fields).toEqual({ videoId: VIDEO });
    expect(textOf(true)).toBe("已保留");
    expect(button(true).props["aria-label"]).toMatch(/^已保留.*移除/);
    expect(button(true).props.confirmMessage).toBeUndefined();
  });
});

describe("續翻時自動加入的結果（頁面不重繪）", () => {
  type ActionProps = { action: (previous: object, formData: FormData) => Promise<{ error?: string }> };
  const watchButton = (justSaved: string | null, saved = false) =>
    renderToStaticMarkup(
      createElement(AutoSavedContext, { value: { videoId: justSaved, clear: vi.fn() } }, createElement(WatchSaveButton, { videoId: VIDEO, saved })),
    ).match(/<button[^>]*>([\s\S]*?)<\/button>/)?.[1].replace(/<[^>]+>/g, "");

  it("按「用我的 API Key 繼續翻譯」後這一頁剛把這支影片自動加入_伺服器算繪時還是「保留」，也當場顯示「已保留」", () => {
    expect(watchButton(VIDEO)).toBe("已保留");
  });

  it("還沒有自動加入（清單滿了而且都是手動保留的，續翻的回應沒說加入）、或加入的是別支影片_照伺服器的狀態", () => {
    expect(watchButton(null)).toBe("保留");
    expect(watchButton("otherVideo1")).toBe("保留");
    expect(watchButton(null, true)).toBe("已保留");
  });

  it("從「已保留」移除成功_放掉這一頁記下的結果，重繪後才不會又顯示「已保留」；移除失敗就留著", async () => {
    const onRemoved = vi.fn();
    const { action } = (SaveVideoButton({ videoId: VIDEO, saved: true, onRemoved }) as ReactElement<ActionProps>).props;

    vi.mocked(actions.removeSavedVideoAction).mockResolvedValueOnce({ error: "移除保留的影片失敗（詳見伺服器 log）" });
    expect(await action({}, form({ videoId: VIDEO }))).toEqual({ error: "移除保留的影片失敗（詳見伺服器 log）" });
    expect(onRemoved).not.toHaveBeenCalled();

    vi.mocked(actions.removeSavedVideoAction).mockResolvedValueOnce({});
    expect(await action({}, form({ videoId: VIDEO }))).toEqual({});
    expect(onRemoved).toHaveBeenCalledOnce();
  });
});
