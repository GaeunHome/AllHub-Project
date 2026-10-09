import type { UserRole } from "../auth";
import { formatTaipeiDateTime, formatTaipeiHourMinute } from "../time";
import { ActionButton } from "../ui/action-button";
import { Icon } from "../ui/icon";
import { deleteUserAction, setUserDisabledAction, unlockUserAction } from "./actions";
import type { ManagedUser } from "./service";

const ROLE: Record<UserRole, { label: string; chip: string }> = {
  owner: { label: "站長", chip: "chip chip-brand" },
  member: { label: "成員", chip: "chip" },
};

/** 停用等於凍結：排程與通知不再處理他，資料與訂閱保留；停用時 session 版本加一，恢復後要重新登入 */
export const disableConfirmMessage = (username: string) =>
  `確定停用「${username}」？停用後他會立刻被登出、不能再登入，排程與通知也會暫停；資料與追蹤的訂閱都會保留，恢復後要重新登入。`;

/** 自己那一列不給停用與刪除：停用自己就沒人能恢復，刪除自己要到帳號頁輸入密碼；站長被鎖時本來就進不了這一頁，也不必解除自己的鎖定 */
export function UserList({ users, currentUserId, lockedUntil }: { users: ManagedUser[]; currentUserId: string; lockedUntil: ReadonlyMap<string, Date> }) {
  return (
    <ul aria-label="使用者清單" className="card-list">
      {users.map((user) => {
        const self = user.id === currentUserId;
        const lockEnd = self ? undefined : lockedUntil.get(user.id);
        const dates = [`建立於 ${formatTaipeiDateTime(user.createdAt)}`, ...(user.disabledAt ? [`停用於 ${formatTaipeiDateTime(user.disabledAt)}`] : [])];
        return (
          // 手機上按鈕換到下一行，每一列的文字都是同樣的寬度
          <li key={user.id} className="card-row flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <span className="icon-tile hidden size-9 shrink-0 rounded-full sm:inline-grid">
                <Icon name="circle-user-round" />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold break-all">{user.username}</span>
                  {self && <span>（你）</span>}
                  <span className={ROLE[user.role].chip}>{ROLE[user.role].label}</span>
                  {user.disabledAt && <span className="chip chip-danger">已停用</span>}
                  {lockEnd && <span className="chip chip-warning">{`鎖定中，到 ${formatTaipeiHourMinute(lockEnd)}`}</span>}
                </p>
                <p>{dates.join("，")}</p>
              </div>
            </div>
            {!self && (
              <div className="button-row shrink-0">
                {lockEnd && (
                  <ActionButton action={unlockUserAction} fields={{ userId: user.id }} pendingLabel="解除中…" className="btn-secondary btn-sm">
                    <Icon name="key-round" className="size-3.5" />
                    解除鎖定
                  </ActionButton>
                )}
                <ActionButton
                  action={setUserDisabledAction}
                  fields={{ userId: user.id, disabled: user.disabledAt ? "false" : "true" }}
                  confirmMessage={user.disabledAt ? undefined : disableConfirmMessage(user.username)}
                  className="btn-secondary btn-sm"
                >
                  <Icon name={user.disabledAt ? "refresh-cw" : "lock"} className="size-3.5" />
                  {user.disabledAt ? "恢復" : "停用"}
                </ActionButton>
                <ActionButton
                  action={deleteUserAction}
                  fields={{ userId: user.id }}
                  confirmMessage={`確定刪除帳號「${user.username}」？刪除後無法復原，他建立的邀請連結也會一起刪除。`}
                  aria-label={`刪除「${user.username}」`}
                  className="btn-danger btn-sm btn-icon sm:w-auto sm:px-3"
                >
                  <Icon name="trash-2" className="size-3.5" />
                  <span className="sr-only sm:not-sr-only">刪除</span>
                </ActionButton>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
