import { inviteStatus, type InviteStatus, type InviteSummary } from "../auth/invites";
import type { ModuleInfo } from "../module";
import { formatTaipeiDateTime } from "../time";
import { ActionButton } from "../ui/action-button";
import { EmptyState } from "../ui/empty-state";
import { Icon } from "../ui/icon";
import { revokeInviteAction } from "./actions";

const STATUS: Record<Exclude<InviteStatus, "active">, { label: string; chip: string }> = {
  used_up: { label: "已用完", chip: "chip" },
  expired: { label: "已過期", chip: "chip chip-warning" },
  revoked: { label: "已撤銷", chip: "chip chip-danger" },
};

/** 舊的邀請沒有限制 寫全部功能 */
function openedModules({ deniedModules }: InviteSummary, modules: Pick<ModuleInfo, "id" | "name">[]): string {
  if (deniedModules.length === 0) return "開放：全部功能";
  return `開放：${modules.filter((module) => !deniedModules.includes(module.id)).map((module) => module.name).join("、")}`;
}

type Row = { invite: InviteSummary; status: InviteStatus };

/**
 * 清單有快取 狀態要用這次請求的時間 所以 now 由頁面傳進來
 * 使用者選的 有效的列在上面 用完 過期 撤銷的收進已失效
 */
export function InviteList({ invites, now, modules }: { invites: InviteSummary[]; now: Date; modules: Pick<ModuleInfo, "id" | "name">[] }) {
  if (invites.length === 0) return <EmptyState compact icon="link" title="還沒有邀請連結" />;
  const rows = invites.map((invite): Row => ({ invite, status: inviteStatus(invite, now) }));
  const active = rows.filter((row) => row.status === "active");
  const inactive = rows.filter((row) => row.status !== "active");

  // 不另外包一層 清單接在卡片標題後面 card-list 才畫得出分隔線
  return (
    <>
      {active.length > 0 ? (
        <ul aria-label="有效的邀請連結" className="card-list">
          {active.map((row) => (
            <InviteRow key={row.invite.id} row={row} modules={modules} />
          ))}
        </ul>
      ) : (
        <p className="text-ink">目前沒有有效的邀請連結</p>
      )}
      {inactive.length > 0 && (
        <details className="disclosure">
          <summary>已失效（{inactive.length}）</summary>
          <ul aria-label="已失效的邀請連結" className="card-list">
            {inactive.map((row) => (
              <InviteRow key={row.invite.id} row={row} modules={modules} />
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

/** 有效的都在同一區 不再標有效 失效的寫出是用完 過期還是撤銷 */
function InviteRow({ row: { invite, status }, modules }: { row: Row; modules: Pick<ModuleInfo, "id" | "name">[] }) {
  const dates = [
    `到期 ${formatTaipeiDateTime(invite.expiresAt)}`,
    ...(invite.revokedAt ? [`撤銷於 ${formatTaipeiDateTime(invite.revokedAt)}`] : []),
    `${invite.createdBy} 建立於 ${formatTaipeiDateTime(invite.createdAt)}`,
  ];
  return (
    // 手機上按鈕換到下一行 每列文字才會一樣寬
    <li className="card-row flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="flex flex-wrap items-center gap-2">
          {status !== "active" && <span className={STATUS[status].chip}>{STATUS[status].label}</span>}
          <span className="font-medium break-all">{invite.note ?? "（沒有備註）"}</span>
          <span className="chip">{`已用 ${invite.usedCount}／${invite.maxUses} 次`}</span>
        </p>
        <p className="leading-relaxed">{dates.join("，")}</p>
        <p>{openedModules(invite, modules)}</p>
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
}
