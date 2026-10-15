import type { CSSProperties } from "react";
import { Icon } from "@/core/ui/icon";
import { StatusChip } from "@/core/ui/status-chip";
import { formatDay } from "../../../lib/dates";
import { ACCOUNT_KIND_LABELS } from "../../../lib/kinds";
import { roundedPercent, type AccountBalance, type AccountLike, type CardStatus, type PurposeLike, type TargetProgress } from "../../../lib/ledger";
import { formatSignedTwd, formatTwd } from "../../../lib/money";
import { formatPercent, formatSignedPercent } from "../../dashboard-view";
import { ColorDot } from "../color-dot";
import type { EntryFormOptions } from "../forms/options";
import { QuickAddButton } from "../forms/quick-add";
import { UpdateBalanceButton } from "../forms/update-balance";
import { AccountKindIcon } from "../kind-icon";
import { AnimatedNumber } from "../motion/animated-number";
import { ProgressBar } from "./progress-bar";

type AccountCardProps = {
  account: AccountLike;
  balance: AccountBalance;
  purpose: PurposeLike | null;
  progress: TargetProgress | null;
  /** 只有信用卡有 */
  card: CardStatus | null;
  payFromName: string | null;
  options: EntryFormOptions;
  index: number;
};

const AMOUNT_LABELS = { deposit: "餘額", investment: "市值", credit: "未繳" } as const;

/** 信用卡寫未繳 餘額是正的就是繳多了 改寫溢繳與多繳的金額 */
function headline(kind: AccountLike["kind"], balance: AccountBalance): { label: string; value: number } {
  if (kind !== "credit") return { label: AMOUNT_LABELS[kind], value: balance.balance };
  return balance.balance > 0 ? { label: "溢繳", value: balance.balance } : { label: AMOUNT_LABELS.credit, value: balance.owed ?? 0 };
}

/**
 * 按鈕固定在卡片底部 同一列等高時按鈕才對齊
 * 視窗不放進選單 選單收起時會把視窗一起卸載
 */
export function AccountCard({ account, balance, purpose, progress, card, payFromName, options, index }: AccountCardProps) {
  const headingId = `fin-account-${account.id}`;
  const amount = headline(account.kind, balance);
  return (
    <article aria-labelledby={headingId} className="card fin-rise flex min-w-0 flex-col gap-4" style={{ "--i": index } as CSSProperties}>
      <div className="flex flex-1 flex-col gap-4">
        <header className="flex items-start gap-3">
          <span className="icon-tile size-10 rounded-xl">
            <AccountKindIcon kind={account.kind} />
          </span>
          {/* 名稱優先 放不下時先截斷用途標籤 但至少留色點與兩個字 */}
          <div className="flex min-w-0 flex-auto flex-col">
            <h3 id={headingId} className="truncate font-semibold text-ink">
              {account.name}
            </h3>
            <p className="text-sm text-ink-soft">{ACCOUNT_KIND_LABELS[account.kind]}</p>
          </div>
          {purpose && (
            <span className="chip min-w-16 shrink-[1000]">
              <ColorDot color={purpose.color} className="size-2" />
              <span className="truncate">{purpose.name}</span>
            </span>
          )}
        </header>

        <p className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-ink-soft">{amount.label}</span>
          <span className="text-2xl font-bold tracking-tight text-ink tabular-nums">
            <AnimatedNumber value={amount.value} />
          </span>
        </p>

        {account.kind === "investment" && balance.cost !== null && balance.profit !== null && <InvestmentLine cost={balance.cost} profit={balance.profit} />}
        {card && <CardLines card={card} payFromName={payFromName} />}
        {account.monthlyPlan !== null && (
          <p className="text-sm text-ink-soft">
            每月規劃 <span className="font-semibold text-ink tabular-nums">{formatTwd(account.monthlyPlan)}</span>
            {progress?.reached && "（已達目標，發薪分配會略過）"}
          </p>
        )}
        {progress && <TargetLine progress={progress} index={index} />}
      </div>

      <div className="button-row">
        <QuickAddButton {...options} accountId={account.id} className="btn-secondary btn-sm" />
        <UpdateBalanceButton account={{ id: account.id, name: account.name, kind: account.kind, balance: balance.balance }} />
      </div>
    </article>
  );
}

/** 賺賠是市值減成本 百分比相對成本 成本是 0 時不算 */
function InvestmentLine({ cost, profit }: { cost: number; profit: number }) {
  const percent = cost > 0 ? roundedPercent(profit, cost) : null;
  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-soft">
      <span>
        成本 <span className="font-semibold text-ink tabular-nums">{formatTwd(cost)}</span>
      </span>
      <span className="inline-flex items-center gap-1">
        <Icon name={profit < 0 ? "trending-down" : "trending-up"} className={`size-4 ${profit > 0 ? "text-success" : "text-ink-soft"}`} />
        賺賠{" "}
        <span className={`font-semibold tabular-nums ${profit > 0 ? "text-success" : "text-ink"}`}>
          {formatSignedTwd(profit)}
          {percent !== null && `（${formatSignedPercent(percent)}）`}
        </span>
      </span>
    </p>
  );
}

function CardLines({ card, payFromName }: { card: CardStatus; payFromName: string | null }) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      {card.dueDay !== null && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-ink-soft">
          <span>每月 {card.dueDay} 日繳款</span>
          {card.nextDueDate && <span className="chip tabular-nums">下次 {formatDay(card.nextDueDate)}</span>}
        </p>
      )}
      {card.payFromRemaining === null || payFromName === null ? (
        <p className="text-ink-soft">還沒設定扣款帳戶</p>
      ) : card.short ? (
        <StatusChip badge={{ label: `「${payFromName}」不夠扣，還差 ${formatTwd(-card.payFromRemaining)}`, tone: "warning" }} className="self-start" />
      ) : (
        <p className="text-ink-soft">
          從「{payFromName}」扣款，繳完剩 <span className="font-semibold text-ink tabular-nums">{formatTwd(card.payFromRemaining)}</span>
        </p>
      )}
    </div>
  );
}

function TargetLine({ progress, index }: { progress: TargetProgress; index: number }) {
  return (
    <div className="flex flex-col gap-2">
      <ProgressBar percent={progress.percent} reached={progress.reached} index={index} />
      <p className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
        {progress.reached ? (
          <span className="inline-flex items-center gap-1.5 font-medium text-success">
            <Icon name="circle-check" className="size-4" />
            已達成目標 {formatTwd(progress.target)}
          </span>
        ) : (
          <span className="text-ink-soft">
            目標 <span className="font-semibold text-ink tabular-nums">{formatTwd(progress.target)}</span>，還差{" "}
            <span className="font-semibold text-ink tabular-nums">{formatTwd(progress.remaining)}</span>
          </span>
        )}
        <span className="text-ink-soft tabular-nums">{formatPercent(progress.percent)}</span>
      </p>
    </div>
  );
}
