"use client";

import { ActionButton } from "@/core/ui/action-button";
import { Icon } from "@/core/ui/icon";
import { setupAction } from "../../actions";

/**
 * 重按也不會重複建立 結果用提示視窗
 * 成功後整張卡片會被換掉 焦點交給外面的外框
 */
export function SetupButton() {
  return (
    <ActionButton
      action={setupAction}
      fields={{}}
      pendingLabel={
        <>
          <Icon name="loader-circle" className="size-4 animate-spin motion-reduce:animate-none" />
          建立中…
        </>
      }
      className="btn-primary"
    >
      <Icon name="sparkles" className="size-4" />
      開始使用
    </ActionButton>
  );
}
