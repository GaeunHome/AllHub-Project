"use client";

import { useState, type ReactNode } from "react";
import { Icon } from "@/core/ui/icon";
import { EditGoalForm, type GoalDraft } from "./goal-forms";

type GoalRowProps = { goal: GoalDraft; controls: ReactNode; deleteControl: ReactNode; children: ReactNode };

/** 列的內容與按鈕由伺服器算繪好傳進來，這裡只管「修改」的展開與收合 */
export function GoalRow({ goal, controls, deleteControl, children }: GoalRowProps) {
  const [editing, setEditing] = useState(false);

  return (
    <li className="flex flex-col gap-3 px-5 py-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1 basis-48">{children}</div>
        <div className="flex items-start gap-1">
          {controls}
          <button
            type="button"
            onClick={() => setEditing((open) => !open)}
            aria-expanded={editing}
            aria-label={`修改「${goal.name}」`}
            className="btn-ghost btn-sm px-2.5 sm:px-3.5"
          >
            <Icon name="pencil" className="size-3.5" />
            {/* 手機上只留圖示，整排按鈕才放得進一行 */}
            <span className="sr-only sm:not-sr-only">修改</span>
          </button>
          {deleteControl}
        </div>
      </div>
      {editing && <EditGoalForm goal={goal} onClose={() => setEditing(false)} />}
    </li>
  );
}
