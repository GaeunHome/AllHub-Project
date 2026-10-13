import type { ReactNode } from "react";
import { Icon } from "../ui/icon";
import { DiscardHiddenPages } from "./discard-hidden-pages";

/** 卡片裡的提示（還沒有帳號、帳號已刪除、邀請連結的狀態） */
export function AuthNotice({ icon, children }: { icon: "info" | "circle-alert" | "circle-check"; children: ReactNode }) {
  return (
    <p role="status" className="notice">
      <Icon name={icon} />
      <span>{children}</span>
    </p>
  );
}

/** 登入與註冊共用的外框：置中的一張卡片、同一個寬度；卡片裡分成標題、表單、頁尾三段，段與段之間 gap-6（比欄位之間的 gap-4 大一級） */
export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <DiscardHiddenPages />
      <div className="card flex w-full max-w-md flex-col gap-6">
        <header className="flex flex-col items-center gap-4 text-center">
          <span className="logo-mark size-16">
            <Icon name="flower-2" className="size-8" />
          </span>
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-bold tracking-tight text-ink">{title}</h1>
            {subtitle && <p>{subtitle}</p>}
          </div>
        </header>
        {children}
      </div>
    </main>
  );
}
