"use client";

import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import { Dialog, DialogMessage, useDialog } from "@/core/ui/dialog";
import { Icon } from "@/core/ui/icon";
import { MoreMenu } from "@/core/ui/more-menu";
import { SectionTitle } from "@/core/ui/page-header";
import { StatusChip } from "@/core/ui/status-chip";
import type { DateKey } from "../../../lib/dates";
import type { AccountKind } from "../../../lib/kinds";
import { formatTwd } from "../../../lib/money";
import { deleteAccountAction, moveAccountAction, setAccountActiveAction } from "../../actions";
import type { AccountsPageView, CreditCardView, DepositCardView, InactiveAccountView } from "../../dashboard-view";
import { accountDeleteWarning } from "../../settings-display";
import { Meter } from "../dashboard/meter";
import { Illustration } from "../illustration";
import { AccountForm } from "../forms/account-form";
import { ROW_MESSAGE_CLASS } from "../forms/fields";
import type { AccountOption, EntryFormOptions } from "../forms/options";
import { QuickAddButton } from "../forms/quick-add";
import { UpdateBalanceButton } from "../forms/update-balance";
import { ActiveMenuItem, DeleteMenuItem, DialogMenuItem, LIST_ROW_MESSAGE, ListRow, MoveMenuItems, useRemovalNotice } from "../row-controls";
import { AccountKindTile } from "../visuals";
import { AddAccountButton } from "./add-account-button";
import { BillForm, BillHistory } from "./card-bill";
import { CardFace } from "./card-face";
import { PayCardForm } from "./pay-card-form";

export type AccountsContext = {
  /** 記一筆的帳戶與分類 填帳單時差額的分類也從這裡選 */
  options: EntryFormOptions;
  /** 繳卡費能選的存款帳戶 */
  depositAccounts: AccountOption[];
  today: DateKey;
};

type AccountsBoardProps = {
  view: AccountsPageView;
  context: AccountsContext;
  /** 網址帶 add 參數連過來時 打開哪一種的新增視窗 */
  openAdd: "deposit" | "credit" | null;
};

/** 卡片上的動作要的東西 onRemoved 給停用與刪除後會不見的卡片留訊息 */
type CardShared = { context: AccountsContext; payFromAccounts: AccountsPageView["payFromAccounts"]; onRemoved: (message: string) => void };

// 同一列的卡片等寬等高 寬螢幕多排幾張
const GRID = "grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4";
// 新增的按鈕排在最後一格 虛線框跟卡片一樣圓
const ADD_TILE =
  "flex min-h-28 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-line-strong p-5 text-sm font-semibold text-ink-soft transition-colors hover:border-[var(--muted)] hover:bg-surface-muted hover:text-ink";
const PAUSED_HINT = "停用後不能再記帳、不算進總覽，紀錄會留著";

/**
 * 常用的動作直接放在卡片上 ⋮ 只放修改 上移下移 停用與刪除
 * 停用與刪除後卡片會不見 訊息放在最上面不會消失的地方
 */
export function AccountsBoard({ view, context, openAdd }: AccountsBoardProps) {
  const removal = useRemovalNotice();
  const shared: CardShared = { context, payFromAccounts: view.payFromAccounts, onRemoved: removal.report };
  const empty = view.deposits.length === 0 && view.cards.length === 0;

  return (
    <>
      <DialogMessage {...removal.messageProps} />
      {empty && (
        <div className="card flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
          <Illustration name="no-accounts" className="w-32" />
          <div className="flex flex-col gap-1">
            <p className="font-semibold text-ink">還沒有銀行帳戶或信用卡</p>
            <p className="text-ink-soft">先新增常用的銀行帳戶，填銀行 App 上的目前餘額；有信用卡也加進來，之後每期照帳單填。</p>
          </div>
        </div>
      )}
      <section aria-labelledby="fin-deposits" className="stack">
        <SectionHeader id="fin-deposits" title="存款" summary={view.deposits.length > 0 && <Sum label="合計" amount={view.depositTotal} />} />
        <div className={GRID}>
          {view.deposits.map((card) => (
            <DepositCard key={card.detail.id} card={card} {...shared} />
          ))}
          <AddAccountButton kind="deposit" payFromAccounts={view.payFromAccounts} className={ADD_TILE} messageClassName="col-span-full" openFromLink={openAdd === "deposit"} />
        </div>
      </section>
      <section aria-labelledby="fin-cards" className="stack">
        <SectionHeader id="fin-cards" title="信用卡" summary={view.cards.length > 0 && <Sum label="未繳" amount={view.owedTotal} />} />
        <div className={GRID}>
          {view.cards.map((card) => (
            <CreditCard key={card.detail.id} card={card} {...shared} />
          ))}
          <AddAccountButton kind="credit" payFromAccounts={view.payFromAccounts} className={ADD_TILE} messageClassName="col-span-full" openFromLink={openAdd === "credit"} />
        </div>
      </section>
      {view.inactive.length > 0 && <InactiveAccounts items={view.inactive} {...shared} />}
    </>
  );
}

function SectionHeader({ id, title, summary }: { id: string; title: string; summary: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <SectionTitle id={id}>{title}</SectionTitle>
      {summary}
    </div>
  );
}

function Sum({ label, amount }: { label: string; amount: number }) {
  return (
    <p className="text-ink-soft">
      {label} <span className="font-semibold text-ink tabular-nums">{formatTwd(amount)}</span>
    </p>
  );
}

/** 點卡片看這個帳戶的紀錄 按鈕放在連結外面 */
function DepositCard({ card, context, payFromAccounts, onRemoved }: { card: DepositCardView } & CardShared) {
  const { detail } = card;
  const edit = useDialog();
  const nameId = useId();

  return (
    <article aria-labelledby={nameId} className="card flex flex-col gap-4">
      <Link href={detail.recordsHref} className="group flex flex-1 flex-col gap-3 rounded-lg">
        <div className="flex items-start gap-3">
          <AccountKindTile kind="deposit" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <h3 id={nameId} className="font-semibold break-words text-ink underline-offset-4 group-hover:underline">
              {detail.name}
            </h3>
            {detail.label && <p className="text-sm break-words text-ink-soft">{detail.label}</p>}
          </div>
          <Icon name="chevron-right" className="size-5 shrink-0 text-ink-soft" />
        </div>
        <p className="text-3xl font-bold tracking-tight text-ink tabular-nums">{formatTwd(detail.balance)}</p>
        {detail.target && (
          <div className="flex flex-col gap-1.5">
            <Meter percent={detail.target.percent} />
            <p className="text-sm text-ink-soft tabular-nums">
              <span className="sr-only">目標：</span>
              {detail.target.reached ? `已達目標 ${formatTwd(detail.target.amount)}` : `${formatTwd(detail.balance)} / ${formatTwd(detail.target.amount)}`}
            </p>
          </div>
        )}
        <span className="sr-only">查看紀錄</span>
      </Link>
      <div className="flex items-start gap-2">
        <div className="button-row min-w-0 flex-1">
          <QuickAddButton {...context.options} accountId={detail.id} className="btn-secondary btn-sm" />
          <UpdateBalanceButton account={{ id: detail.id, name: detail.name, kind: "deposit", balance: detail.balance }} />
          <DialogMessage {...edit.messageProps} className={ROW_MESSAGE_CLASS} />
        </div>
        <AccountMenu card={card} name={detail.name} editTrigger={edit.triggerProps} onRemoved={onRemoved} />
      </div>
      <Dialog {...edit.dialogProps} title={`修改「${detail.name}」`}>
        <AccountForm account={card.draft} payFromAccounts={payFromAccounts} onDone={edit.done} onCancel={edit.close} />
      </Dialog>
    </article>
  );
}

/**
 * 填了帳單按鈕就換成已繳 繳清後也不見 所以視窗與訊息掛在卡片上
 * 按鈕不見時焦點落在訊息上
 */
function CreditCard({ card, context, payFromAccounts, onRemoved }: { card: CreditCardView } & CardShared) {
  const { detail, status } = card;
  const edit = useDialog();
  const bill = useDialog();
  const pay = useDialog();
  const [showHistory, setShowHistory] = useState(false);
  const nameId = useId();
  const historyId = useId();
  // 沒有存款帳戶就不知道從哪裡繳
  const canPay = context.depositAccounts.length > 0;
  // 沒有結帳日的卡重填會變成新的一期 所以只給有結帳日而且這一期填過的
  const canRefill = status.action !== "bill" && detail.statementDay !== null && detail.statementAmount !== null;
  const shortBy = detail.payFrom?.short ? 0 - detail.payFrom.remaining : null;

  return (
    <article aria-labelledby={nameId} className="card flex flex-col gap-4">
      <Link href={detail.recordsHref} className="block rounded-xl transition-[filter] hover:brightness-105">
        <CardFace style={card.style} name={detail.name} nameId={nameId} lines={card.faceLines} />
        <span className="sr-only">查看紀錄</span>
      </Link>
      <div className="flex flex-col gap-1.5">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-ink tabular-nums">
          {status.text}
          {status.badge && <StatusChip badge={status.badge} />}
        </p>
        {detail.payFrom && shortBy !== null && (
          <p className="flex items-start gap-1.5 text-sm text-ink">
            <Icon name="circle-alert" className="mt-0.5 size-4 shrink-0 text-warning" />
            {detail.payFrom.name}繳完卡費不夠，還差 {formatTwd(shortBy)}
          </p>
        )}
      </div>
      <div className="flex items-start gap-2">
        <div className="button-row min-w-0 flex-1">
          {status.action === "bill" && (
            <button {...bill.triggerProps} aria-label={`填帳單：${detail.name}`} className="btn-secondary btn-sm">
              <Icon name="receipt" className="size-4" />
              填帳單
            </button>
          )}
          {status.action === "pay" && canPay && (
            <button {...pay.triggerProps} aria-label={`已繳：${detail.name}`} className="btn-secondary btn-sm">
              <Icon name="check" className="size-4" />
              已繳
            </button>
          )}
          <QuickAddButton {...context.options} accountId={detail.id} label="記一筆刷卡" className="btn-secondary btn-sm" />
          {detail.history.length > 0 && (
            <button
              type="button"
              aria-expanded={showHistory}
              aria-controls={historyId}
              aria-label={`最近 ${detail.history.length} 期：${detail.name}`}
              onClick={() => setShowHistory((open) => !open)}
              className="btn-ghost btn-sm"
            >
              最近 {detail.history.length} 期
              <Icon name={showHistory ? "chevron-up" : "chevron-down"} className="size-4" />
            </button>
          )}
          <DialogMessage {...bill.messageProps} className={ROW_MESSAGE_CLASS} />
          <DialogMessage {...pay.messageProps} className={ROW_MESSAGE_CLASS} />
          <DialogMessage {...edit.messageProps} className={ROW_MESSAGE_CLASS} />
        </div>
        <AccountMenu card={card} name={detail.name} editTrigger={edit.triggerProps} refillTrigger={canRefill ? bill.triggerProps : undefined} onRemoved={onRemoved} />
      </div>
      {detail.history.length > 0 && (
        <div id={historyId} hidden={!showHistory}>
          <BillHistory bills={detail.history} />
        </div>
      )}
      <Dialog {...bill.dialogProps} title={`填帳單：${detail.name}`}>
        <BillForm draft={detail.bill} categories={context.options.categories} accounts={context.depositAccounts} today={context.today} onDone={bill.done} onCancel={bill.close} />
      </Dialog>
      <Dialog {...pay.dialogProps} title={`已繳：${detail.name}`}>
        <PayCardForm draft={detail.pay} accounts={context.depositAccounts} today={context.today} onDone={pay.done} onCancel={pay.close} />
      </Dialog>
      <Dialog {...edit.dialogProps} title={`修改「${detail.name}」`}>
        <AccountForm account={card.draft} payFromAccounts={payFromAccounts} onDone={edit.done} onCancel={edit.close} />
      </Dialog>
    </article>
  );
}

type DialogTrigger = ReturnType<typeof useDialog>["triggerProps"];

type AccountMenuProps = {
  card: DepositCardView | CreditCardView;
  name: string;
  editTrigger: DialogTrigger;
  /** 這一期的帳單填錯時重填 只有填過帳單的卡才有 */
  refillTrigger?: DialogTrigger;
  onRemoved: (message: string) => void;
};

/** 不常用的收在 ⋮ 視窗放在選單外面 選單收起時才不會一起卸載 */
function AccountMenu({ card, name, editTrigger, refillTrigger, onRemoved }: AccountMenuProps) {
  const id = card.draft.id;
  return (
    <MoreMenu label={`「${name}」的選項`}>
      <DialogMenuItem trigger={editTrigger} icon="pencil" label="修改" />
      {refillTrigger && <DialogMenuItem trigger={refillTrigger} icon="receipt" label="重填本期帳單" />}
      <MoveMenuItems action={moveAccountAction} id={id} isFirst={card.isFirst} isLast={card.isLast} />
      <ActiveMenuItem action={setAccountActiveAction} id={id} active pausedHint={PAUSED_HINT} onChanged={() => onRemoved(`已停用「${name}」，要用時可以在最下面的「已停用」恢復`)} />
      <DeleteMenuItem action={deleteAccountAction} id={id} confirmMessage={accountDeleteWarning(name, card.usage)} label="刪除帳戶" deletedMessage={`已刪除「${name}」`} onDeleted={onRemoved} />
    </MoreMenu>
  );
}

const RESTORED_WHERE: Record<AccountKind, string> = { deposit: "", investment: "，在「投資」頁", credit: "" };

/** 不常看 收起來 點一列可以修改 恢復與刪除在 ⋮ */
function InactiveAccounts({ items, payFromAccounts, onRemoved }: { items: InactiveAccountView[] } & CardShared) {
  return (
    <details className="disclosure">
      <summary>已停用（{items.length}）</summary>
      <div className="card overflow-hidden p-0">
        <ul className="divide-y divide-line">
          {items.map((item) => (
            <InactiveRow key={item.id} item={item} payFromAccounts={payFromAccounts} onRemoved={onRemoved} />
          ))}
        </ul>
      </div>
    </details>
  );
}

function InactiveRow({ item, payFromAccounts, onRemoved }: { item: InactiveAccountView } & Pick<CardShared, "payFromAccounts" | "onRemoved">) {
  const edit = useDialog();
  return (
    <ListRow
      title={item.name}
      detail={item.detail}
      muted
      trigger={edit.triggerProps}
      actionLabel="修改"
      menu={
        <MoreMenu label={`「${item.name}」的選項`}>
          <ActiveMenuItem action={setAccountActiveAction} id={item.id} active={false} pausedHint={PAUSED_HINT} onChanged={() => onRemoved(`已恢復「${item.name}」${RESTORED_WHERE[item.draft.kind]}`)} />
          <DeleteMenuItem action={deleteAccountAction} id={item.id} confirmMessage={accountDeleteWarning(item.name, item.usage)} label="刪除帳戶" deletedMessage={`已刪除「${item.name}」`} onDeleted={onRemoved} />
        </MoreMenu>
      }
    >
      <DialogMessage {...edit.messageProps} className={LIST_ROW_MESSAGE} />
      <Dialog {...edit.dialogProps} title={`修改「${item.name}」`}>
        <AccountForm account={item.draft} payFromAccounts={payFromAccounts} onDone={edit.done} onCancel={edit.close} />
      </Dialog>
    </ListRow>
  );
}
