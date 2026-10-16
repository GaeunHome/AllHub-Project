"use client";

import { useId } from "react";
import { Dialog, DialogMessage, useDialog } from "@/core/ui/dialog";
import { Icon } from "@/core/ui/icon";
import { MoreMenu } from "@/core/ui/more-menu";
import type { DateKey } from "../../../lib/dates";
import { formatTwd } from "../../../lib/money";
import { deleteHoldingAction } from "../../actions";
import { averagePriceText, formatShares, priceText, profitText, type HoldingView } from "../../dashboard-view";
import type { AccountOption } from "../forms/options";
import { DeleteMenuItem } from "../row-controls";
import { Ticker } from "../visuals";
import { BuySellForm, EditHoldingForm } from "./holding-forms";

type HoldingsProps = {
  holdings: HoldingView[];
  /** 買進扣款與賣出入帳能選的存款帳戶 */
  accounts: AccountOption[];
  today: DateKey;
  /** 投資帳戶開始記帳的那天 買賣的日期不能更早 */
  minDate: DateKey;
  /** 刪掉最後一檔時整個清單會不見 訊息交給外面 */
  onDeleted: (message: string) => void;
};

// 夠寬時排成有欄位名稱的表格 每一欄的數字對齊 窄的時候名稱與數字兩行 按鈕在下面靠右
const TABLE = "@4xl:grid @4xl:grid-cols-[auto_minmax(0,1fr)_repeat(5,auto)_auto_auto] @4xl:gap-x-4";
const ROW = "@4xl:col-span-full @4xl:grid-cols-subgrid @4xl:gap-x-4";
const NUMBER_HEADERS = ["股數", "均價", "收盤", "市值", "損益"];

/** 每檔的股數 均價 市值與損益 買進賣出在列上 修改與刪除收在 ⋮ */
export function Holdings({ holdings, accounts, today, minDate, onDeleted }: HoldingsProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="stack @container">
      <h3 id={headingId} className="font-semibold text-ink">
        持股
      </h3>
      <ul className={`flex flex-col divide-y divide-line border-y border-line ${TABLE}`}>
        {/* 欄位名稱給看得到的人 每一格另外帶報讀器念的名稱 */}
        <li aria-hidden="true" className={`hidden py-2 text-sm text-ink-soft @4xl:grid ${ROW}`}>
          <span>代號</span>
          <span>名稱</span>
          {NUMBER_HEADERS.map((header) => (
            <span key={header} className="text-right">
              {header}
            </span>
          ))}
          <span />
          <span />
        </li>
        {holdings.map((holding) => (
          <HoldingRow key={holding.id} holding={holding} accounts={accounts} today={today} minDate={minDate} onDeleted={onDeleted} />
        ))}
      </ul>
    </section>
  );
}

type HoldingRowProps = Omit<HoldingsProps, "holdings"> & { holding: HoldingView };

/** 視窗放在選單外面 選單收起時才不會一起卸載 */
function HoldingRow({ holding, accounts, today, minDate, onDeleted }: HoldingRowProps) {
  const buy = useDialog();
  const sell = useDialog();
  const edit = useDialog();
  const label = `${holding.symbol} ${holding.name}`;
  const average = averagePriceText(holding);
  const close = holding.priced && holding.closeCents !== null ? priceText(holding.closeCents) : null;
  // 沒有扣款的存款帳戶時不能買賣 伺服器也會擋
  const canTrade = accounts.length > 0;

  return (
    <li className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-3 ${ROW}`}>
      <span className="col-start-1 row-start-1 flex min-w-0 items-center gap-2 @4xl:contents">
        <span className="@4xl:col-start-1 @4xl:row-start-1">
          <Ticker symbol={holding.symbol} />
        </span>
        <span className="min-w-0 truncate font-medium text-ink @4xl:col-start-2 @4xl:row-start-1 @4xl:whitespace-normal">{holding.name}</span>
      </span>
      <span className="col-start-1 row-start-2 text-sm text-ink-soft @4xl:contents @4xl:text-base @4xl:text-ink">
        <span className="tabular-nums @4xl:col-start-3 @4xl:row-start-1 @4xl:text-right">{formatShares(holding.shares)}</span>
        <span aria-hidden="true" className="@4xl:hidden">
          {" · "}
        </span>
        <span className="tabular-nums @4xl:col-start-4 @4xl:row-start-1 @4xl:text-right">
          <span className="@4xl:sr-only">均價 </span>
          {average ?? "—"}
        </span>
        <span aria-hidden="true" className="@4xl:hidden">
          {" · "}
        </span>
        <span className="tabular-nums @4xl:col-start-5 @4xl:row-start-1 @4xl:text-right">
          {close ? (
            <>
              <span className="@4xl:sr-only">收盤 </span>
              {close}
            </>
          ) : (
            "股價暫時讀不到"
          )}
        </span>
      </span>
      <span className="col-start-2 row-start-1 text-right font-medium text-ink tabular-nums @4xl:col-start-6">
        <span className="sr-only">市值 </span>
        {formatTwd(holding.value)}
      </span>
      <span className="col-start-2 row-start-2 text-right text-sm text-ink tabular-nums @4xl:col-start-7 @4xl:row-start-1 @4xl:text-base">
        {holding.priced && (
          <>
            <span className="sr-only">損益 </span>
            {profitText(holding.profit, holding.profitPercent)}
          </>
        )}
      </span>
      {/* 窄的時候按鈕與 ⋮ 在第三列靠右 夠寬時各佔表格最後兩欄 */}
      <div className="col-span-2 col-start-1 row-start-3 flex items-center justify-end gap-2 @4xl:contents">
        <div className="flex items-center justify-end gap-2 @4xl:col-start-8 @4xl:row-start-1">
          {canTrade && (
            <>
              <button {...buy.triggerProps} aria-label={`買進：${label}`} className="btn-secondary btn-sm">
                買進
              </button>
              {holding.shares > 0 ? (
                <button {...sell.triggerProps} aria-label={`賣出：${label}`} className="btn-secondary btn-sm">
                  賣出
                </button>
              ) : (
                // 賣光了不能再賣 留著位置 每一列的按鈕才對齊
                <span aria-hidden="true" className="invisible btn-secondary btn-sm">
                  賣出
                </span>
              )}
            </>
          )}
        </div>
        <div className="@4xl:col-start-9 @4xl:row-start-1">
          <MoreMenu label={`「${label}」的選項`}>
            <button {...edit.triggerProps} className="menu-item">
              <Icon name="pencil" className="size-4" />
              修改股數與成本
            </button>
            <DeleteMenuItem
              action={deleteHoldingAction}
              id={holding.id}
              confirmMessage={`確定刪除「${label}」？買賣紀錄會留著，這一檔的定期定額會一起刪除。`}
              label="刪除"
              deletedMessage={`已刪除「${label}」`}
              onDeleted={onDeleted}
            />
          </MoreMenu>
        </div>
      </div>
      <DialogMessage {...buy.messageProps} className="col-span-full" />
      <DialogMessage {...sell.messageProps} className="col-span-full" />
      <DialogMessage {...edit.messageProps} className="col-span-full" />
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
