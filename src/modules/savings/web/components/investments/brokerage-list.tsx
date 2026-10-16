"use client";

import Link from "next/link";
import { DialogMessage } from "@/core/ui/dialog";
import type { DateKey } from "../../../lib/dates";
import type { InvestmentsView } from "../../investments-view";
import { SAVINGS_PATHS } from "../../paths";
import { AddAccountButton } from "../accounts/add-account-button";
import type { AccountOption } from "../forms/options";
import { Illustration } from "../illustration";
import { useRemovalNotice } from "../row-controls";
import { BrokerageCard } from "./brokerage-card";

type BrokerageListProps = {
  view: InvestmentsView;
  depositAccounts: AccountOption[];
  payFromAccounts: { id: number; name: string; active: boolean }[];
  today: DateKey;
  /** 網址的 add=investment 打開一次新增證券帳戶 */
  openAdd: boolean;
};

/** 停用或刪除帳戶後那張卡片會不見 訊息放在清單上面還在的地方 */
export function BrokerageList({ view, depositAccounts, payFromAccounts, today, openAdd }: BrokerageListProps) {
  const removal = useRemovalNotice();
  const addButton = <AddAccountButton kind="investment" payFromAccounts={payFromAccounts} openFromLink={openAdd} cleanHref={SAVINGS_PATHS.investments} />;

  if (view.brokerages.length === 0) {
    return (
      <div className="stack">
        <DialogMessage {...removal.messageProps} />
        <section aria-labelledby="savings-no-brokerage" className="card flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
          <Illustration name="no-holdings" className="w-36" />
          <div className="flex flex-col items-center gap-3 sm:items-start">
            <h2 id="savings-no-brokerage" className="text-lg font-semibold text-ink">
              還沒有證券帳戶
            </h2>
            <p className="text-ink">新增證券帳戶後，照券商 App 填持股的代號、股數與成本，市值會照每天的收盤價自動算。</p>
            <div className="button-row">{addButton}</div>
          </div>
        </section>
        <PausedNote count={view.pausedCount} />
      </div>
    );
  }

  return (
    <div className="stack">
      <DialogMessage {...removal.messageProps} />
      {view.brokerages.map((brokerage) => (
        <BrokerageCard key={brokerage.id} brokerage={brokerage} depositAccounts={depositAccounts} payFromAccounts={payFromAccounts} today={today} onRemoved={removal.report} />
      ))}
      <div className="button-row">{addButton}</div>
      <PausedNote count={view.pausedCount} />
    </div>
  );
}

function PausedNote({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <p className="text-ink">
      另外有 {count} 個停用的證券帳戶，在
      <Link href={SAVINGS_PATHS.accounts} className="link">
        帳戶
      </Link>
      頁最下面的「已停用」裡。
    </p>
  );
}
