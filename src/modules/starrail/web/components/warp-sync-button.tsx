import { ActionButton } from "@/core/ui/action-button";
import { Icon } from "@/core/ui/icon";
import { syncWarpsAction } from "../actions";

/** 第一次要把整段紀錄讀完 會等比較久 */
export function WarpSyncButton({ accountId }: { accountId: number }) {
  return (
    <ActionButton
      action={syncWarpsAction}
      fields={{ accountId }}
      className="btn-secondary btn-sm"
      pendingLabel={
        <>
          <Icon name="refresh-cw" className="size-4 motion-safe:animate-spin" />
          更新中…
        </>
      }
    >
      <Icon name="refresh-cw" className="size-4" />
      立即更新
    </ActionButton>
  );
}
