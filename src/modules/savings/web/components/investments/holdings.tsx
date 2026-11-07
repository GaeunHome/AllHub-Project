"use client";

import { useId, type ReactNode } from "react";
import { DeleteMenuItem } from "@/core/ui/delete-menu-item";
import { Dialog, useDialog } from "@/core/ui/dialog";
import { Fact, FactList } from "@/core/ui/fact-list";
import { MoreMenu } from "@/core/ui/more-menu";
import type { DateKey } from "../../../lib/dates";
import { formatTwd } from "../../../lib/money";
import type { HoldingView } from "../../account-details";
import { deleteHoldingAction } from "../../actions";
import { averagePriceText, formatShares, priceText, profitText } from "../../format";
import { CARD_GRID } from "../dashboard/layout";
import type { AccountOption } from "../forms/options";
import { DialogMenuItem } from "../row-controls";
import { Ticker } from "../visuals";
import { BuySellForm, EditHoldingForm } from "./holding-forms";

type HoldingsProps = {
  holdings: HoldingView[];
  /** 買進扣款與賣出入帳能選的存款帳戶 */
  accounts: AccountOption[];
  today: DateKey;
  /** 投資帳戶開始記帳的那天 買賣的日期不能更早 */
  minDate: DateKey;
  /** 排在最後一格的新增持股 */
  addTile?: ReactNode;
};

/** 一檔一張卡 買進賣出在卡片上 修改與刪除收在 ⋮ */
export function Holdings({ holdings, accounts, today, minDate, addTile }: HoldingsProps) {
  return (
    <ul className={CARD_GRID}>
      {holdings.map((holding) => (
        <HoldingCard key={holding.id} holding={holding} accounts={accounts} today={today} minDate={minDate} />
      ))}
      {addTile && <li className="grid">{addTile}</li>}
    </ul>
  );
}

type HoldingCardProps = Omit<HoldingsProps, "holdings" | "addTile"> & { holding: HoldingView };

/** 視窗放在選單外面 選單收起時才不會一起卸載 */
function HoldingCard({ holding, accounts, today, minDate }: HoldingCardProps) {
  const buy = useDialog();
  const sell = useDialog();
  const edit = useDialog();
  const nameId = useId();
  const label = `${holding.symbol} ${holding.name}`;
  const close = holding.priced && holding.closeCents !== null ? priceText(holding.closeCents) : null;
  // 沒有扣款的存款帳戶時不能買賣 伺服器也會擋
  const canTrade = accounts.length > 0;

  return (
    <li aria-labelledby={nameId} className="card flex min-w-0 flex-col gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <Ticker symbol={holding.symbol} />
        <h3 id={nameId} className="min-w-0 font-semibold break-words text-ink">
          {holding.name}
        </h3>
      </div>
      <p className="text-3xl font-bold tracking-tight text-ink tabular-nums">
        <span className="sr-only">市值 </span>
        {formatTwd(holding.value)}
      </p>
      <FactList className="flex-1">
        {holding.priced && <Fact label="損益">{profitText(holding.profit, holding.profitPercent)}</Fact>}
        <Fact label="股數">{formatShares(holding.shares)}</Fact>
        <Fact label="均價">{averagePriceText(holding) ?? "—"}</Fact>
        <Fact label="收盤">{close ?? "股價暫時無法讀取"}</Fact>
      </FactList>
      <div className="flex items-center gap-2">
        <div className="button-row min-w-0 flex-1">
          {canTrade && (
            <button {...buy.triggerProps} aria-label={`買進：${label}`} className="btn-secondary btn-sm">
              買進
            </button>
          )}
          {canTrade && holding.shares > 0 && (
            <button {...sell.triggerProps} aria-label={`賣出：${label}`} className="btn-secondary btn-sm">
              賣出
            </button>
          )}
        </div>
        <MoreMenu label={`「${label}」的選項`}>
          <DialogMenuItem trigger={edit.triggerProps} icon="pencil" label="修改股數與成本" />
          <DeleteMenuItem
            action={deleteHoldingAction}
            fields={{ id: holding.id }}
            confirmMessage={`確定刪除「${label}」？買賣紀錄會留著，這一檔的定期定額會一起刪除。`}
            label="刪除"
            deletedMessage={`已刪除「${label}」`}
          />
        </MoreMenu>
      </div>
      <Dialog {...buy.dialogProps} title={`買進 ${label}`}>
        <BuySellForm side="buy" holding={holding} accounts={accounts} today={today} minDate={minDate} onDone={buy.done} onCancel={buy.close} />
      </Dialog>
      <Dialog {...sell.dialogProps} title={`賣出 ${label}`}>
        <BuySellForm side="sell" holding={holding} accounts={accounts} today={today} minDate={minDate} onDone={sell.done} onCancel={sell.close} />
      </Dialog>
      <Dialog {...edit.dialogProps} title={`修改 ${label}`} size="sm">
        <EditHoldingForm holding={holding} onDone={edit.done} onCancel={edit.close} />
      </Dialog>
    </li>
  );
}
