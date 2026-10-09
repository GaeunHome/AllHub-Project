"use client";

import { catchError, type ErrorInfo } from "next/error";
import { Icon } from "./icon";

/** 錯誤內容可能夾帶 SQL 參數或憑證，畫面上只說讀不到；retry 會重新向伺服器要這一塊 */
export function CardError(_props: object, { retry }: ErrorInfo) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--danger-line)] bg-[var(--danger-soft)] p-4">
      <Icon name="circle-alert" className="size-5 text-danger" />
      <p className="min-w-0 flex-1 font-medium text-danger">這張卡片暫時讀不到資料</p>
      <button type="button" onClick={() => retry()} className="btn-secondary">
        <Icon name="refresh-cw" className="size-4" />
        重試
      </button>
    </div>
  );
}

/** 首頁每張卡片各包一層：一張出錯只影響那一張，不會讓整頁變成錯誤畫面 */
export const CardErrorBoundary = catchError(CardError);
