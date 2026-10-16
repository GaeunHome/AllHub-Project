"use client";

import { Dialog, useDialog } from "@/core/ui/dialog";
import { StatusChip } from "@/core/ui/status-chip";
import { ACCOUNT_KIND_LABELS } from "../../../lib/kinds";
import { formatTwd } from "../../../lib/money";
import type { AccountGroupView, AccountRowView } from "../../dashboard-view";
import { ListGroup, ListRow } from "../row-controls";
import { AccountDetailBody, type DetailContext } from "./account-detail";

/** 一張卡分成存款 投資 信用卡三組 組的標題列寫小計 點一列打開帳戶詳情 */
export function AccountList({ groups, context }: { groups: AccountGroupView[]; context: DetailContext }) {
  return (
    <section aria-labelledby="fin-accounts">
      <h2 id="fin-accounts" className="sr-only">
        帳戶
      </h2>
      <div className="card divide-y divide-line overflow-hidden p-0">
        {groups.map((group) => (
          <ListGroup
            key={group.kind}
            id={`fin-accounts-${group.kind}`}
            title={ACCOUNT_KIND_LABELS[group.kind]}
            aside={<span className="tabular-nums">{group.kind === "credit" ? `未繳 ${formatTwd(group.total)}` : formatTwd(group.total)}</span>}
          >
            {group.rows.map((row) => (
              <AccountRow key={row.id} row={row} context={context} />
            ))}
          </ListGroup>
        ))}
      </div>
    </section>
  );
}

/** 持股與帳單紀錄是表格 寬一點才排得下 */
function AccountRow({ row, context }: { row: AccountRowView; context: DetailContext }) {
  const dialog = useDialog();
  const wide = (row.account.kind === "investment" && row.account.holdings.length > 0) || (row.account.kind === "credit" && row.account.history.length > 0);
  return (
    <ListRow title={row.name} detail={row.detail} amount={formatTwd(row.amount)} badge={row.badge && <StatusChip badge={row.badge} />} trigger={dialog.triggerProps} actionLabel="查看">
      <Dialog {...dialog.dialogProps} title={row.name} size={wide ? "lg" : "md"}>
        <AccountDetailBody account={row.account} context={context} />
      </Dialog>
    </ListRow>
  );
}
