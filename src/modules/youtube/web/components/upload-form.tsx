"use client";

import { unstable_rethrow } from "next/navigation";
import { useActionState } from "react";
import { FormFeedback } from "@/core/ui/form-message";
import { Icon } from "@/core/ui/icon";
import { uploadSubtitlesAction, type FormState } from "../actions";
import { prepareUpload } from "../upload";

export function UploadToggle({ open, controls, onToggle }: { open: boolean; controls: string; onToggle: () => void }) {
  return (
    <button type="button" aria-expanded={open} aria-controls={controls} onClick={onToggle} className="yt-pill">
      <Icon name="upload" className="size-4" />
      上傳字幕
    </button>
  );
}

export function UploadForm({ id, videoId }: { id: string; videoId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(async (previous, formData) => {
    const prepared = await prepareUpload(formData);
    if ("error" in prepared) return prepared;
    try {
      return await uploadSubtitlesAction(previous, prepared.formData);
    } catch (thrown) {
      // 斷線或伺服器拒收時留在表單上顯示 不讓整頁變成錯誤畫面
      unstable_rethrow(thrown);
      return { error: "上傳失敗（連線中斷或伺服器拒收），請再試一次" };
    }
  }, {});
  return (
    <form id={id} action={action} className="stack border-t border-line pt-4">
      <input type="hidden" name="videoId" value={videoId} />
      <p className="leading-relaxed text-ink-soft">
        上傳自己的韓文字幕檔（.srt／.vtt），會取代目前的字幕並從頭翻譯。可以用 <code>yt-dlp --write-subs --write-auto-subs --sub-langs ko --skip-download 影片網址</code> 下載。
      </p>
      <div className="flex flex-wrap gap-2">
        <input type="file" name="file" accept=".srt,.vtt,text/vtt,application/x-subrip" required className="input min-w-0 flex-1 basis-56 text-sm" />
        <button disabled={pending} className="btn-secondary">
          <Icon name="upload" className="size-4" />
          {pending ? "上傳中…" : "上傳並翻譯"}
        </button>
      </div>
      {!pending && <FormFeedback state={state} />}
    </form>
  );
}
