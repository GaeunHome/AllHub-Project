import { ActionButton } from "@/core/ui/action-button";
import { Icon } from "@/core/ui/icon";
import { renewAction } from "../actions";

/** WebSub 的訂閱會到期 排程會自動續訂 失敗或快到期時也能手動再送一次 */
export function RenewButton() {
  return (
    <ActionButton
      action={renewAction}
      fields={{}}
      formClassName="flex flex-col items-end gap-2"
      className="yt-pill yt-pill-sm"
      title="重新訂閱快到期或失敗的頻道"
      showMessage="block"
      pendingLabel={
        <>
          <Icon name="refresh-cw" className="size-4 motion-safe:animate-spin" />
          續訂中…
        </>
      }
    >
      <Icon name="refresh-cw" className="size-4" />
      續訂
    </ActionButton>
  );
}
