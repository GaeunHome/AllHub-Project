import { Icon, type UiIconName } from "@/core/ui/icon";
import type { AccountKind, TransactionKind } from "../../lib/kinds";

export const ACCOUNT_KIND_ICONS: Record<AccountKind, UiIconName> = { deposit: "landmark", investment: "trending-up", credit: "credit-card" };

export const TRANSACTION_KIND_ICONS: Record<TransactionKind, UiIconName> = { expense: "trending-down", income: "trending-up", transfer: "arrow-left-right", adjust: "scale" };

export function AccountKindIcon({ kind, className = "size-4" }: { kind: AccountKind; className?: string }) {
  return <Icon name={ACCOUNT_KIND_ICONS[kind]} className={className} />;
}
