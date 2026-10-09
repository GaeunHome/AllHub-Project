import { requireSession } from "@/core/auth";
import { ActionButton } from "@/core/ui/action-button";
import { EmptyState } from "@/core/ui/empty-state";
import { Icon } from "@/core/ui/icon";
import { formatTwd } from "../../lib/money";
import type { SavingsGoal } from "../../data/schema";
import { deleteGoalAction, moveGoalAction, setGoalActiveAction } from "../actions";
import { cachedGoals } from "../../service/cached";
import { GoalRow } from "./goal-row";

export async function GoalList() {
  const user = await requireSession();
  const goals = await cachedGoals(user.id);

  if (goals.length === 0) {
    return <EmptyState compact icon="sparkles" title="還沒有每月固定要存的項目" hint="在下面新增一個，例如「緊急預備金」每月 10,000 元" />;
  }

  return (
    // 手機上不再多框一層，每一列的按鈕才放得進一行；寬螢幕是有外框的小清單
    <ul className="flex flex-col divide-y divide-line sm:rounded-xl sm:border sm:border-line">
      {goals.map((goal, index) => (
        <GoalRow
          key={goal.id}
          goal={{ id: goal.id, name: goal.name, monthlyAmount: goal.monthlyAmount, note: goal.note }}
          controls={<GoalControls goal={goal} isFirst={index === 0} isLast={index === goals.length - 1} />}
          deleteControl={<DeleteGoalButton goal={goal} />}
        >
          <div className="flex items-center gap-4">
            <div className="flex min-w-0 flex-1 flex-col">
              <span className={`truncate font-semibold ${goal.active ? "text-ink" : "text-ink-soft"}`}>{goal.name}</span>
              {goal.note && <p className="text-sm break-words text-ink-soft">{goal.note}</p>}
            </div>
            <span className="w-32 shrink-0 text-right">
              <span className="text-sm text-ink-soft">每月 </span>
              <span className="font-semibold text-ink tabular-nums">{formatTwd(goal.monthlyAmount)}</span>
            </span>
          </div>
        </GoalRow>
      ))}
    </ul>
  );
}

function GoalControls({ goal, isFirst, isLast }: { goal: SavingsGoal; isFirst: boolean; isLast: boolean }) {
  return (
    <>
      <ActionButton
        action={setGoalActiveAction}
        fields={{ goalId: goal.id, active: String(!goal.active) }}
        role="switch"
        aria-checked={goal.active}
        aria-label={`啟用「${goal.name}」`}
        title={goal.active ? "啟用中：算進每月預計" : "已停用：不算進每月預計，紀錄仍保留"}
        className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm font-medium text-ink disabled:cursor-not-allowed disabled:opacity-55"
      >
        <span
          aria-hidden
          className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border transition-colors ${goal.active ? "border-accent bg-accent" : "border-line-strong bg-surface-sunken"}`}
        >
          <span className={`absolute top-0.5 size-3.5 rounded-full bg-white shadow transition-transform ${goal.active ? "translate-x-4.5" : "translate-x-0.5"}`} />
        </span>
        {goal.active ? "啟用中" : "已停用"}
      </ActionButton>
      <ActionButton
        action={moveGoalAction}
        fields={{ goalId: goal.id, direction: "up" }}
        disabled={isFirst}
        aria-label={`把「${goal.name}」往上移`}
        title="往上移"
        className="btn-ghost btn-icon"
      >
        <Icon name="arrow-up" className="size-4" />
      </ActionButton>
      <ActionButton
        action={moveGoalAction}
        fields={{ goalId: goal.id, direction: "down" }}
        disabled={isLast}
        aria-label={`把「${goal.name}」往下移`}
        title="往下移"
        className="btn-ghost btn-icon"
      >
        <Icon name="arrow-down" className="size-4" />
      </ActionButton>
    </>
  );
}

function DeleteGoalButton({ goal }: { goal: SavingsGoal }) {
  return (
    <ActionButton
      action={deleteGoalAction}
      fields={{ goalId: goal.id }}
      confirmMessage={`確定刪除「${goal.name}」？過去的存款紀錄會保留（標示為已刪除的項目），之後不會再出現在每月清單。`}
      aria-label={`刪除「${goal.name}」`}
      className="btn-danger btn-icon sm:w-auto sm:px-4"
    >
      <Icon name="trash-2" className="size-4" />
      <span className="sr-only sm:not-sr-only">刪除</span>
    </ActionButton>
  );
}
