"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { DialogButton, DialogMessage } from "@/core/ui/dialog";
import { Icon } from "@/core/ui/icon";
import { StatusChip } from "@/core/ui/status-chip";
import { dueText, formatSlashDate, type DateKey } from "../../../lib/dates";
import { formatTwd } from "../../../lib/money";
import { creditOverdue, overdueBadge, profitText, type AccountDetail, type CreditDetail, type DepositDetail, type InvestmentDetail } from "../../dashboard-view";
import { Fact, FactList } from "../fact-list";
import { ROW_MESSAGE_CLASS } from "../forms/fields";
import type { AccountOption, EntryFormOptions } from "../forms/options";
import { QuickAddButton } from "../forms/quick-add";
import { UpdateBalanceButton } from "../forms/update-balance";
import { Meter } from "../dashboard/meter";
import { useRemovalNotice } from "../row-controls";
import { BillForm, BillHistory } from "./card-bill";
import { AddHoldingForm } from "./holding-forms";
import { Holdings } from "./holdings";
import { PayCardForm } from "./pay-card-form";

export type DetailContext = {
  /** 記一筆的帳戶與分類 */
  options: EntryFormOptions;
  /** 繳卡費與買賣能選的存款帳戶 */
  depositAccounts: AccountOption[];
  today: DateKey;
};

/** 點總覽的一列打開 這裡的動作都是現在的事 用目前的餘額 */
export function AccountDetailBody({ account, context }: { account: AccountDetail; context: DetailContext }) {
  switch (account.kind) {
    case "deposit":
      return <DepositBody account={account} context={context} />;
    case "investment":
      return <InvestmentBody account={account} context={context} />;
    case "credit":
      return <CreditBody account={account} context={context} />;
  }
}

/** 帳戶的主要數字 視窗裡只有這一個大字 */
function Figure({ label, value, note }: { label: string; value: number; note?: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-sm text-ink-soft">{label}</span>
      <span className="text-3xl font-bold tracking-tight text-ink">{formatTwd(value)}</span>
      {note && <span className="text-sm text-ink-soft">{note}</span>}
    </div>
  );
}

const FACTS_CLASS = "border-y border-line";

function RecordsLink({ href }: { href: string }) {
  return (
    <Link href={href} className="btn-ghost btn-sm">
      查看紀錄
      <Icon name="chevron-right" className="size-4" />
    </Link>
  );
}

function DepositBody({ account, context }: { account: DepositDetail; context: DetailContext }) {
  return (
    <>
      <Figure label="餘額" value={account.balance} />
      <FactList className={FACTS_CLASS}>
        <Fact label="用途">{account.purposeName ?? "未設定用途"}</Fact>
        {account.monthlyPlan !== null && <Fact label="每月規劃">{formatTwd(account.monthlyPlan)}</Fact>}
        {account.target && (
          <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-2 py-3">
            <dt className="text-ink-soft">目標</dt>
            {/* 長條撐滿整列 放在 dd 裡 contents 讓它排到下一行 */}
            <dd className="contents">
              {/* 餘額已經是上面的大字 這裡只寫目標 */}
              <span className="text-right text-ink tabular-nums">{account.target.reached ? `已達目標 ${formatTwd(account.target.amount)}` : formatTwd(account.target.amount)}</span>
              <Meter percent={account.target.percent} className="col-span-2" />
            </dd>
          </div>
        )}
      </FactList>
      <div className="button-row">
        <QuickAddButton {...context.options} accountId={account.id} className="btn-secondary btn-sm" />
        <UpdateBalanceButton account={{ id: account.id, name: account.name, kind: "deposit", balance: account.balance }} />
        <RecordsLink href={account.recordsHref} />
      </div>
    </>
  );
}

/** 刪掉最後一檔時持股清單整個不見 刪除的訊息與焦點放在按鈕列上面 */
function InvestmentBody({ account, context }: { account: InvestmentDetail; context: DetailContext }) {
  const removal = useRemovalNotice();
  const hasHoldings = account.holdings.length > 0;
  const startDate = context.options.accounts.find((option) => option.id === account.id)?.startDate ?? context.today;
  return (
    <>
      <Figure label="市值" value={account.value} note={hasHoldings && account.quoteDate ? `${formatSlashDate(account.quoteDate)} 收盤` : undefined} />
      <FactList className={FACTS_CLASS}>
        <Fact label="成本">{formatTwd(account.cost)}</Fact>
        <Fact label="損益">{account.priced ? profitText(account.profit, account.profitPercent) : "股價暫時讀不到"}</Fact>
      </FactList>
      {hasHoldings && <Holdings holdings={account.holdings} accounts={context.depositAccounts} today={context.today} minDate={startDate} onDeleted={removal.report} />}
      <DialogMessage {...removal.messageProps} />
      <div className="button-row">
        {!hasHoldings && <UpdateBalanceButton account={{ id: account.id, name: account.name, kind: "investment", balance: account.ledgerBalance }} />}
        <DialogButton
          label={
            <>
              <Icon name="plus" className="size-4" />
              新增持股
            </>
          }
          buttonClassName="btn-secondary btn-sm"
          title="新增持股"
          messageClassName={ROW_MESSAGE_CLASS}
        >
          {({ done, close }) => <AddHoldingForm accountId={account.id} onDone={done} onCancel={close} />}
        </DialogButton>
        <RecordsLink href={account.recordsHref} />
      </div>
    </>
  );
}

/** 這一期的截止日寫在大字下面 */
function dueNote(account: CreditDetail): string | undefined {
  if (account.dueDate === null || account.remainingDue === 0) return undefined;
  if (account.status === "overdue" || account.daysLeft === null) return `${formatSlashDate(account.dueDate)} 截止`;
  return account.daysLeft === 0 ? "今天截止" : `${formatSlashDate(account.dueDate)} 截止 · ${dueText(account.daysLeft)}`;
}

function CreditBody({ account, context }: { account: CreditDetail; context: DetailContext }) {
  const canPay = context.depositAccounts.length > 0;
  const { bill } = account;
  return (
    <>
      <Figure label={account.needsBill ? "本期應繳（還沒填帳單）" : "本期應繳"} value={account.remainingDue} note={dueNote(account)} />
      {creditOverdue(account) && <StatusChip badge={overdueBadge(account.daysLeft)} className="self-start" />}
      <FactList className={FACTS_CLASS}>
        <Fact label="繳款截止日">{account.dueDay ? `每月 ${account.dueDay} 日` : "未設定"}</Fact>
        <Fact label="結帳日">{account.statementDay ? `每月 ${account.statementDay} 日` : "未設定"}</Fact>
        {/* 跟本期應繳一樣時不重複寫 */}
        {account.owedNow !== account.remainingDue && <Fact label="目前未繳">{formatTwd(account.owedNow)}</Fact>}
        {account.balance > 0 && <Fact label="溢繳">{formatTwd(account.balance)}</Fact>}
        <Fact label="扣款帳戶">{account.payFrom?.name ?? "未設定"}</Fact>
        {account.payFrom && (
          <Fact label="扣款後剩">
            {account.payFrom.short ? <StatusChip badge={{ label: `不夠扣，還差 ${formatTwd(-account.payFrom.remaining)}`, tone: "warning" }} /> : formatTwd(account.payFrom.remaining)}
          </Fact>
        )}
        {account.autopay && <Fact label="自動扣繳">是</Fact>}
      </FactList>
      {account.history.length > 0 && <BillHistory bills={account.history} />}
      <div className="button-row">
        {bill && (
          <DialogButton label="填本期帳單" buttonClassName="btn-secondary btn-sm" title={`填帳單：${account.name}`} messageClassName={ROW_MESSAGE_CLASS}>
            {({ done, close }) => <BillForm draft={bill} categories={context.options.categories} accounts={context.depositAccounts} today={context.today} onDone={done} onCancel={close} />}
          </DialogButton>
        )}
        {canPay && (
          <DialogButton label="已繳" buttonClassName="btn-secondary btn-sm" title={`已繳：${account.name}`} messageClassName={ROW_MESSAGE_CLASS}>
            {({ done, close }) => <PayCardForm draft={account.pay} accounts={context.depositAccounts} today={context.today} onDone={done} onCancel={close} />}
          </DialogButton>
        )}
        <QuickAddButton {...context.options} accountId={account.id} className="btn-secondary btn-sm" />
        <RecordsLink href={account.recordsHref} />
      </div>
    </>
  );
}
