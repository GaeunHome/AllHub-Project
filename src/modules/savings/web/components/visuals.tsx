import { Icon, type UiIconName } from "@/core/ui/icon";
import { ACCOUNT_KIND_ICONS, ACCOUNT_KIND_LABELS, type AccountKind } from "../../lib/kinds";

// 各頁共用的小圖 一律中性色

const TILE_SIZE = { sm: "size-8 [&>.icon]:size-4", md: "size-10 [&>.icon]:size-5" } as const;

/** 灰底圓形的圖示 放在列的最前面 */
export function IconTile({ name, size = "md", label }: { name: UiIconName; size?: keyof typeof TILE_SIZE; label?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full bg-surface-muted text-ink-soft ${TILE_SIZE[size]}`}>
      <Icon name={name} label={label} />
    </span>
  );
}

/** 旁邊沒寫類型時加 labelled 讓報讀器念出來 */
export function AccountKindTile({ kind, size, labelled = false }: { kind: AccountKind; size?: keyof typeof TILE_SIZE; labelled?: boolean }) {
  return <IconTile name={ACCOUNT_KIND_ICONS[kind]} size={size} label={labelled ? ACCOUNT_KIND_LABELS[kind] : undefined} />;
}

/** 股票代號 */
export function Ticker({ symbol }: { symbol: string }) {
  return <span className="inline-flex h-[22px] shrink-0 items-center rounded-md border border-line bg-surface-muted px-1.5 font-mono text-xs font-medium tabular-nums text-ink">{symbol}</span>;
}
