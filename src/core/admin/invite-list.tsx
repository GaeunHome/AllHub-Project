import { inviteStatus, type InviteStatus, type InviteSummary } from "../auth/invites";
import { formatTaipeiDateTime } from "../time";
import { ActionButton } from "../ui/action-button";
import { EmptyState } from "../ui/empty-state";
import { Icon } from "../ui/icon";
import { revokeInviteAction } from "./actions";

const STATUS: Record<InviteStatus, { label: string; chip: string }> = {
  active: { label: "有效", chip: "chip chip-success" },
  used_up: { label: "已用完", chip: "chip" },
  expired: { label: "已過期", chip: "chip chip-warning" },
  revoked: { label: "已撤銷", chip: "chip chip-danger" },
};

/** now 由頁面傳進來：清單本身有快取，狀態要用這次請求的時間算 */
export function InviteList({ invites, now }: { invites: InviteSummary[]; now: Date }) {
  if (invites.length === 0) return <EmptyState compact icon="link" title="還沒有邀請連結" />;

  return (
    <ul aria-label="已建立的邀請連結" className="card-list">
      {invites.map((invite) => {
        const status = inviteStatus(invite, now);
        const dates = [
          `到期 ${formatTaipeiDateTime(invite.expiresAt)}`,
          ...(invite.revokedAt ? [`撤銷於 ${formatTaipeiDateTime(invite.revokedAt)}`] : []),
          `${invite.createdBy} 建立於 ${formatTaipeiDateTime(invite.createdAt)}`,
        ];
        return (
          // 手機上按鈕換到下一行，每一列的文字都是同樣的寬度
          <li key={invite.id} className="card-row flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <p className="flex flex-wrap items-center gap-2">
                <span className={STATUS[status].chip}>{STATUS[status].label}</span>
                <span className="chip">{`已用 ${invite.usedCount}／${invite.maxUses} 次`}</span>
                <span className="font-medium break-all">{invite.note ?? "（沒有備註）"}</span>
              </p>
              <p className="leading-relaxed">{dates.join("，")}</p>
            </div>
            {status === "active" && (
              <div className="button-row shrink-0">
                <ActionButton
                  action={revokeInviteAction}
                  fields={{ inviteId: invite.id }}
                  confirmMessage="確定撤銷這個邀請連結？撤銷後就不能再用它註冊，已經註冊的帳號不受影響。"
                  pendingLabel="撤銷中…"
                  className="btn-danger btn-sm"
                >
                  <Icon name="x" className="size-3.5" />
                  撤銷
                </ActionButton>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
