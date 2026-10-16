"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Dialog, DialogMessage, useDialog } from "@/core/ui/dialog";
import { Icon, type UiIconName } from "@/core/ui/icon";
import { CardHeader } from "@/core/ui/page-header";
import type { EntryKind } from "../../../lib/kinds";
import { formatTwd } from "../../../lib/money";
import { addTransactionAction } from "../../actions";
import { formatShares } from "../../dashboard-view";
import type { BalanceTarget, CardTarget, HoldingTarget, QuickActionsView } from "../../overview-view";
import { SAVINGS_PATHS, addAccountPath } from "../../paths";
import { BillForm } from "../accounts/card-bill";
import { PayCardForm } from "../accounts/pay-card-form";
import { EntryForm } from "../forms/entry-form";
import { UpdateBalanceForm } from "../forms/update-balance";
import { Illustration, type IllustrationName } from "../illustration";
import { BuySellForm } from "../investments/holding-forms";
import { Segmented } from "../segmented";
import { Ticker } from "../visuals";

export type ActionId = EntryKind | "card" | "trade" | "balance";

const ACTIONS: { id: ActionId; label: string; icon: UiIconName; title: string }[] = [
  { id: "expense", label: "記支出", icon: "circle-minus", title: "記一筆" },
  { id: "income", label: "記收入", icon: "circle-plus", title: "記一筆" },
  { id: "transfer", label: "轉帳", icon: "arrow-left-right", title: "記一筆" },
  { id: "card", label: "信用卡", icon: "credit-card", title: "信用卡" },
  { id: "trade", label: "買賣股票", icon: "chart-line", title: "買賣股票" },
  { id: "balance", label: "更新餘額", icon: "scale", title: "更新餘額" },
];

type Done = { onDone: (message?: string) => void; onCancel: () => void };

/**
 * 常用的動作一按就打開視窗 要先選對象的在視窗裡先選
 * 六個按鈕共用一個視窗 成功訊息接在按鈕下面
 */
export function QuickActions({ view, menu }: { view: QuickActionsView; menu?: ReactNode }) {
  const dialog = useDialog();
  const [active, setActive] = useState<ActionId>("expense");
  const headingId = useId();
  const current = ACTIONS.find((action) => action.id === active) ?? ACTIONS[0];

  return (
    <section aria-labelledby={headingId} className="card stack @container min-w-0">
      <CardHeader id={headingId} actions={menu}>
        我要…
      </CardHeader>
      <div className="grid grid-cols-2 gap-2 @lg:grid-cols-3 @2xl:grid-cols-6">
        {ACTIONS.map((action) => (
          <button
            key={action.id}
            {...dialog.triggerProps}
            aria-expanded={dialog.open && active === action.id}
            onClick={() => {
              setActive(action.id);
              dialog.triggerProps.onClick();
            }}
            className="fin-action"
          >
            <span className="fin-action-icon">
              <Icon name={action.icon} />
            </span>
            {action.label}
          </button>
        ))}
      </div>
      <DialogMessage {...dialog.messageProps} />
      <Dialog {...dialog.dialogProps} title={current.title}>
        <QuickActionBody action={active} view={view} onDone={dialog.done} onCancel={dialog.close} />
      </Dialog>
    </section>
  );
}

/** 視窗的內容 只在打開時算繪 每次打開都從頭選 */
export function QuickActionBody({ action, view, ...done }: { action: ActionId; view: QuickActionsView } & Done) {
  switch (action) {
    case "card":
      return <CardAction view={view} {...done} />;
    case "trade":
      return <TradeAction view={view} {...done} />;
    case "balance":
      return <BalanceAction view={view} {...done} />;
    default:
      if (view.entry.accounts.length === 0) return <Missing text="沒有啟用中的帳戶可以記。" href={addAccountPath("deposit")} label="新增銀行帳戶" />;
      return <EntryForm accounts={view.entry.accounts} categories={view.entry.categories} today={view.today} action={addTransactionAction} defaultKind={action} remember onDone={done.onDone} onCancel={done.onCancel} />;
  }
}

/** 只有一個對象時直接打開表單 不用先選 */
function usePicked<T extends { id: number }>(targets: readonly T[]) {
  const [id, setId] = useState<number | null>(targets.length === 1 ? targets[0].id : null);
  const [last, setLast] = useState<number | null>(null);
  return {
    picked: targets.find((target) => target.id === id) ?? null,
    pick: setId,
    /** 換一個 回到清單時焦點放在剛才選的那一個 */
    back:
      targets.length > 1
        ? () => {
            setLast(id);
            setId(null);
          }
        : undefined,
    last,
  };
}

function CardAction({ view, onDone, onCancel }: { view: QuickActionsView } & Done) {
  const { picked, pick, back, last } = usePicked(view.cards);
  if (view.cards.length === 0) return <Missing text="還沒有信用卡。新增信用卡後，結帳時可以在這裡填帳單、記繳款。" href={addAccountPath("credit")} label="新增信用卡" />;
  if (!picked) return <Picker prompt="哪一張卡？" items={view.cards.map((card) => ({ id: card.id, name: card.name, detail: card.status }))} focusId={last} onPick={pick} />;
  return <CardForms key={picked.id} card={picked} view={view} back={back} onDone={onDone} onCancel={onCancel} />;
}

/** 還沒填這一期的帳單就先填帳單 填了就是繳卡費 兩個都可以切換 */
function CardForms({ card, view, back, onDone, onCancel }: { card: CardTarget; view: QuickActionsView; back?: () => void } & Done) {
  const canPay = view.depositAccounts.length > 0;
  const [mode, setMode] = useState<"bill" | "pay">(card.needsBill || !canPay ? "bill" : "pay");
  return (
    <Picked name={card.name} detail={card.status} back={back} backLabel="換一張卡">
      {canPay && (
        <Segmented
          label="要做什麼"
          options={[
            { id: "bill", label: "填帳單" },
            { id: "pay", label: "繳卡費" },
          ]}
          value={mode}
          onChange={setMode}
        />
      )}
      {mode === "bill" ? (
        <BillForm draft={card.bill} categories={view.categories} accounts={view.depositAccounts} today={view.today} onDone={onDone} onCancel={onCancel} />
      ) : (
        <PayCardForm draft={card.pay} accounts={view.depositAccounts} today={view.today} onDone={onDone} onCancel={onCancel} />
      )}
    </Picked>
  );
}

function TradeAction({ view, onDone, onCancel }: { view: QuickActionsView } & Done) {
  const targets = view.holdings.map((target) => ({ ...target, id: target.holding.id }));
  const { picked, pick, back, last } = usePicked(targets);
  if (targets.length === 0) {
    return view.hasInvestmentAccount ? (
      <Missing illustration="no-holdings" text="還沒有持股。到投資頁新增持股後，就能在這裡記買進賣出。" href={SAVINGS_PATHS.investments} label="前往投資" />
    ) : (
      <Missing illustration="no-holdings" text="還沒有證券帳戶。新增證券帳戶與持股後，就能在這裡記買進賣出。" href={addAccountPath("investment")} label="新增證券帳戶" />
    );
  }
  if (view.depositAccounts.length === 0) return <Missing text="買進要從銀行帳戶扣款，賣出也要入帳到銀行帳戶，請先新增銀行帳戶。" href={addAccountPath("deposit")} label="新增銀行帳戶" />;
  if (!picked) {
    return (
      <Picker
        prompt="哪一檔？"
        items={targets.map((target) => ({ id: target.id, name: <HoldingName target={target} />, detail: `${target.accountName} · 目前 ${formatShares(target.holding.shares)}` }))}
        focusId={last}
        onPick={pick}
      />
    );
  }
  return <TradeForms key={picked.id} target={picked} view={view} back={back} onDone={onDone} onCancel={onCancel} />;
}

function HoldingName({ target }: { target: HoldingTarget }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Ticker symbol={target.holding.symbol} />
      <span className="min-w-0 break-words">{target.holding.name}</span>
    </span>
  );
}

/** 賣光的只能買進 跟投資頁一樣 */
function TradeForms({ target, view, back, onDone, onCancel }: { target: HoldingTarget; view: QuickActionsView; back?: () => void } & Done) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  return (
    <Picked name={<HoldingName target={target} />} detail={target.accountName} back={back} backLabel="換一檔">
      {target.holding.shares > 0 && (
        <Segmented
          label="買進或賣出"
          options={[
            { id: "buy", label: "買進" },
            { id: "sell", label: "賣出" },
          ]}
          value={side}
          onChange={setSide}
        />
      )}
      <BuySellForm key={side} side={side} holding={target.holding} accounts={view.depositAccounts} today={view.today} minDate={target.minDate} onDone={onDone} onCancel={onCancel} />
    </Picked>
  );
}

const FIGURE_NAMES: Record<BalanceTarget["kind"], string> = { deposit: "記錄上的餘額", investment: "記錄上的市值" };

function BalanceAction({ view, onDone, onCancel }: { view: QuickActionsView } & Done) {
  const { picked, pick, back, last } = usePicked(view.balances);
  if (view.balances.length === 0) return <Missing text="沒有可以更新餘額的帳戶：信用卡照帳單繳，有持股的證券帳戶照收盤價算。" href={addAccountPath("deposit")} label="新增銀行帳戶" />;
  if (!picked) {
    return <Picker prompt="哪個帳戶？" items={view.balances.map((account) => ({ id: account.id, name: account.name, detail: `${FIGURE_NAMES[account.kind]} ${formatTwd(account.balance)}` }))} focusId={last} onPick={pick} />;
  }
  return (
    <Picked key={picked.id} name={picked.name} back={back} backLabel="換一個帳戶">
      <UpdateBalanceForm account={picked} onDone={onDone} onCancel={onCancel} />
    </Picked>
  );
}

type PickerItem = { id: number; name: ReactNode; detail: string };

/** 先選對象 每一個是一顆按鈕 回到清單時焦點放在剛才選的那一個 */
function Picker({ prompt, items, focusId, onPick }: { prompt: string; items: PickerItem[]; focusId: number | null; onPick: (id: number) => void }) {
  const promptId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (focusId !== null) listRef.current?.querySelector<HTMLElement>(`[data-target-id="${focusId}"]`)?.focus();
  }, [focusId]);

  return (
    <div className="stack">
      <p id={promptId} className="font-medium text-ink">
        {prompt}
      </p>
      <ul ref={listRef} aria-labelledby={promptId} className="flex flex-col gap-2">
        {items.map((item, index) => (
          <li key={item.id}>
            <button type="button" data-target-id={item.id} data-autofocus={index === 0 || undefined} onClick={() => onPick(item.id)} className="fin-pick">
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="font-semibold text-ink">{item.name}</span>
                <span className="text-sm text-ink-soft">{item.detail}</span>
              </span>
              <Icon name="chevron-right" className="size-5 shrink-0 text-ink-soft" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 選好的對象寫在表單上面 選完把焦點交給表單的第一個欄位 */
function Picked({ name, detail, back, backLabel, children }: { name: ReactNode; detail?: string; back?: () => void; backLabel?: string; children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    rootRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
  }, []);

  return (
    <div ref={rootRef} className="stack">
      <div className="panel flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-semibold text-ink">{name}</span>
          {detail && <span className="text-sm text-ink-soft">{detail}</span>}
        </span>
        {back && (
          <button type="button" onClick={back} className="btn-ghost btn-sm shrink-0">
            {backLabel}
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

/** 沒有可以選的對象時說明並連到新增的地方 */
function Missing({ text, href, label, illustration }: { text: string; href: string; label: string; illustration?: IllustrationName }) {
  return (
    <div className="stack items-center py-2 text-center">
      {illustration && <Illustration name={illustration} className="w-36" />}
      <p className="text-ink">{text}</p>
      <Link href={href} data-autofocus className="btn-primary">
        {label}
        <Icon name="chevron-right" className="size-4" />
      </Link>
    </div>
  );
}
