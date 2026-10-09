"use client";

import { unstable_rethrow } from "next/navigation";
import { useActionState } from "react";
import { FormFeedback, type FormState } from "@/core/ui/form-message";
import { Icon } from "@/core/ui/icon";
import { classifyYoutubeInput } from "../../lib/parse";
import { addChannelAction, openVideoAction } from "../actions";

const INVALID = "請貼 YouTube 頻道網址、@帳號或影片網址";

/** 像 YouTube 的搜尋列：貼影片網址就開觀看頁，貼頻道網址或 @帳號就追蹤；伺服器端的兩個 Server Action 仍各自驗證 */
export function YoutubeSearchBar() {
  const [state, action, pending] = useActionState<FormState, FormData>(async (previous, formData) => {
    const text = String(formData.get("q") ?? "");
    const input = classifyYoutubeInput(text);
    if (input.kind === "invalid") return { error: INVALID };
    const data = new FormData();
    data.set(input.kind === "video" ? "url" : "channel", text);
    try {
      return input.kind === "video" ? await openVideoAction(previous, data) : await addChannelAction(previous, data);
    } catch (thrown) {
      // 轉址（開觀看頁、登入逾時）交回給 Next；斷線之類的錯誤留在輸入框下方
      unstable_rethrow(thrown);
      return { error: "連線失敗，請稍後再試" };
    }
  }, {});

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <form action={action} className="yt-search">
        <input
          name="q"
          required
          autoComplete="off"
          enterKeyHint="go"
          aria-label="頻道或影片網址"
          placeholder="貼上頻道網址追蹤，或影片網址翻譯"
          className="yt-search-input"
        />
        <button disabled={pending} className="yt-search-button" aria-label="送出" title="追蹤頻道或開啟影片">
          <Icon name={pending ? "loader-circle" : "search"} className={pending ? "size-5 motion-safe:animate-spin" : "size-5"} />
        </button>
      </form>
      {!pending && <FormFeedback state={state} />}
    </div>
  );
}
