"use client";

import { useActionState, useSyncExternalStore } from "react";
import { ActionButton } from "@/core/ui/action-button";
import { CopyButton } from "@/core/ui/copy-button";
import { FormFeedback, type FormState } from "@/core/ui/form-message";
import { Icon } from "@/core/ui/icon";
import { useToast } from "@/core/ui/toast";
import { withToast } from "@/core/ui/toast-queue";
import { UserAvatar } from "@/core/ui/user-avatar";
import type { TripCheck, TripMember } from "../../service/trips";
import { addCheckAction, deleteCheckAction, removeMemberAction, setCheckDoneAction, setJoinLinkAction } from "../actions";

const noSubscribe = () => () => {};

/** 連結只在瀏覽器組成完整網址 伺服器算繪時沒有這個網站的網址 */
function useOrigin(): string {
  return useSyncExternalStore(noSubscribe, () => window.location.origin, () => "");
}

export function Members({ tripId, members, managerId, userId, joinPath }: { tripId: number; members: TripMember[]; managerId: string | null; userId: string; joinPath: string | null }) {
  const isManager = managerId === userId;
  const origin = useOrigin();
  return (
    <section aria-labelledby="trv-members" className="card stack">
      <h2 id="trv-members" className="text-lg font-semibold text-ink">
        同行的人
      </h2>
      <ul className="stack">
        {members.map((member) => (
          <li key={member.id} className="flex items-center gap-3">
            <UserAvatar username={member.username} name={member.name} size="sm" avatar={member.avatar} />
            <span className="min-w-0 flex-1 break-words text-ink">{member.name}</span>
            {member.id === managerId && <span className="chip chip-brand">建立者</span>}
            {isManager && member.id !== userId && (
              <ActionButton action={removeMemberAction} fields={{ tripId, memberId: member.id }} confirmMessage={`確定把「${member.name}」移出這趟旅程？`} className="btn-ghost btn-sm">
                移除
              </ActionButton>
            )}
          </li>
        ))}
      </ul>
      {isManager && (
        <div className="stack">
          {joinPath ? (
            <>
              <div className="button-row">
                <CopyButton text={`${origin}${joinPath}`} label="複製群組連結" />
                <ActionButton action={setJoinLinkAction} fields={{ tripId, open: "false" }} confirmMessage="撤銷後舊的連結不能再用，已經加入的人不受影響。" className="btn-ghost btn-sm">
                  撤銷連結
                </ActionButton>
              </div>
            </>
          ) : (
            <ActionButton action={setJoinLinkAction} fields={{ tripId, open: "true" }} className="btn-secondary btn-sm self-start">
              <Icon name="link" className="size-4" />
              產生群組連結
            </ActionButton>
          )}
        </div>
      )}
    </section>
  );
}

export function Checklist({ tripId, checks }: { tripId: number; checks: TripCheck[] }) {
  const toast = useToast();
  const [state, action, pending] = useActionState<FormState, FormData>(withToast(toast, addCheckAction, { errors: false }), {});
  const left = checks.filter((check) => !check.done).length;
  return (
    <section aria-labelledby="trv-checks" className="card stack">
      <h2 id="trv-checks" className="flex items-center justify-between gap-2 text-lg font-semibold text-ink">
        出發前清單
        {checks.length > 0 && <span className="text-sm font-medium text-ink-soft">{left > 0 ? `還有 ${left} 項` : "都好了"}</span>}
      </h2>
      {checks.length > 0 && (
        <ul className="stack">
          {checks.map((check) => (
            <li key={check.id} className="flex items-center gap-2">
              <ActionButton action={setCheckDoneAction} fields={{ tripId, checkId: check.id, done: String(!check.done) }} aria-label={check.done ? `取消勾選「${check.title}」` : `勾選「${check.title}」`} className="btn-ghost btn-sm btn-icon">
                <Icon name={check.done ? "circle-check" : "circle"} className={`size-5 ${check.done ? "text-success" : "text-ink-soft"}`} />
              </ActionButton>
              <span className={`min-w-0 flex-1 break-words ${check.done ? "text-ink-soft line-through" : "text-ink"}`}>{check.title}</span>
              <ActionButton action={deleteCheckAction} fields={{ tripId, checkId: check.id }} aria-label={`刪除「${check.title}」`} className="btn-ghost btn-sm btn-icon">
                <Icon name="x" className="size-4" />
              </ActionButton>
            </li>
          ))}
        </ul>
      )}
      <form action={action} className="flex items-start gap-2">
        <input type="hidden" name="tripId" value={tripId} />
        <label className="min-w-0 flex-1">
          <span className="sr-only">新增清單項目</span>
          <input name="title" required placeholder="例如：護照、網卡" autoComplete="off" className="input" />
        </label>
        <button disabled={pending} className="btn-secondary">
          新增
        </button>
      </form>
      <FormFeedback state={{ error: state.error }} />
    </section>
  );
}
