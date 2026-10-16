"use client";

import { useId } from "react";
import { Dialog, DialogMessage, useDialog } from "@/core/ui/dialog";
import { Icon, type UiIconName } from "@/core/ui/icon";
import { MoreMenu } from "@/core/ui/more-menu";
import type { DateKey } from "../../../lib/dates";
import { formatTwd } from "../../../lib/money";
import { deleteHoldingAction } from "../../actions";
import { averagePriceText, formatShares, priceText, profitText, type HoldingView } from "../../dashboard-view";
import type { AccountOption } from "../forms/options";
import { DeleteMenuItem } from "../row-controls";
import { EditHoldingForm, BuySellForm } from "./holding-forms";

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

// 窄的時候股數 均價 收盤寫成名稱下面一整行 夠寬時排成有欄位名稱的表格 每一欄的數字對齊
const COLUMNS = "@xl:grid @xl:grid-cols-[minmax(0,1fr)_repeat(5,auto)_auto] @xl:gap-x-5";
const ROW = "@xl:col-span-full @xl:grid-cols-subgrid @xl:gap-x-5";
const HEADERS = ["股數", "均價", "收盤", "市值", "損益"];

/** 每檔的市值與損益 買進 賣出 修改 刪除收在 ⋮ */
export function Holdings({ holdings, accounts, today, minDate, onDeleted }: HoldingsProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="stack @container">
      <h3 id={headingId} className="font-semibold text-ink">
        持股
      </h3>
      <ul className={`flex flex-col divide-y divide-line border-y border-line ${COLUMNS}`}>
        {/* 欄位名稱給看得到的人 每一格另外帶報讀器念的名稱 */}
        <li aria-hidden="true" className={`hidden py-2 text-right text-sm text-ink-soft @xl:grid ${ROW}`}>
          <span />
          {HEADERS.map((header) => (
            <span key={header}>{header}</span>
          ))}
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

  return (
    <li className={`grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-0.5 py-3 ${ROW}`}>
      <span className="col-start-1 row-start-1 break-words text-ink">
        <span className="font-medium">{holding.symbol}</span> {holding.name}
      </span>
      <span className="col-span-2 col-start-1 row-start-2 text-sm text-ink-soft @xl:contents @xl:text-base @xl:text-ink">
        <span className="tabular-nums @xl:col-start-2 @xl:row-start-1 @xl:text-right">{formatShares(holding.shares)}</span>
        <span aria-hidden="true" className="@xl:hidden">
          {" · "}
        </span>
        <span className="tabular-nums @xl:col-start-3 @xl:row-start-1 @xl:text-right">
          <span className="@xl:sr-only">均價 </span>
          {average ?? "—"}
        </span>
        <span aria-hidden="true" className="@xl:hidden">
          {" · "}
        </span>
        <span className="tabular-nums @xl:col-start-4 @xl:row-start-1 @xl:text-right">
          {holding.priced && holding.closeCents !== null ? (
            <>
              <span className="@xl:sr-only">收盤 </span>
              {priceText(holding.closeCents)}
            </>
          ) : (
            "股價暫時讀不到"
          )}
        </span>
      </span>
      <span className="col-start-2 row-start-1 text-right font-medium text-ink tabular-nums @xl:col-start-5">
        <span className="sr-only">市值 </span>
        {formatTwd(holding.value)}
      </span>
      {holding.priced && (
        <span className="col-span-2 col-start-1 row-start-3 text-right text-ink tabular-nums @xl:col-span-1 @xl:col-start-6 @xl:row-start-1">
          <span className="sr-only">損益 </span>
          {profitText(holding.profit, holding.profitPercent)}
        </span>
      )}
      <div className="col-start-3 row-span-3 row-start-1 @xl:col-start-7 @xl:row-span-1">
        <MoreMenu label={`「${label}」的選項`}>
          <MenuItem trigger={buy.triggerProps} icon="plus" label="買進" />
          {holding.shares > 0 && <MenuItem trigger={sell.triggerProps} icon="arrow-left-right" label="賣出" />}
          <MenuItem trigger={edit.triggerProps} icon="pencil" label="修改股數與成本" />
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

/** 選單看到 aria-haspopup dialog 就收起 焦點先回到 ⋮ */
function MenuItem({ trigger, icon, label }: { trigger: ReturnType<typeof useDialog>["triggerProps"]; icon: UiIconName; label: string }) {
  return (
    <button {...trigger} className="menu-item">
      <Icon name={icon} className="size-4" />
      {label}
    </button>
  );
}
