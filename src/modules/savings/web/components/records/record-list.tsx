"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { DialogMessage } from "@/core/ui/dialog";
import { EmptyState } from "@/core/ui/empty-state";
import { formatDay } from "../../../lib/dates";
import { CATEGORY_KINDS, CATEGORY_KIND_LABELS, TRANSACTION_KINDS, TRANSACTION_KIND_LABELS } from "../../../lib/kinds";
import { UNCATEGORIZED_KEY } from "../../../lib/ledger";
import { formatTwd } from "../../../lib/money";
import { UNCATEGORIZED_LABEL } from "../../entry-display";
import { NO_FILTERS, filterRecords, groupByDate, hasFilters, recordTotals, type RecordFilters, type RecordItem } from "../../record-filter";
import type { AccountChoice, CategoryOption } from "../forms/options";
import { useRemovalNotice } from "../row-controls";
import { RecordRow } from "./record-row";

type RecordListProps = {
  records: RecordItem[];
  accounts: AccountChoice[];
  categories: CategoryOption[];
  today: string;
  /** 沒有紀錄時的說明用 例如本月或 9 月 跟總覽一樣的寫法 */
  monthLabel: string;
  /** 網址的 category 參數 伺服器已確認是自己的分類或未分類 空字串是不篩選 */
  initialCategory?: string;
};

/** 在瀏覽器裡篩選 換條件不必再問伺服器 合計跟著篩選結果 */
export function RecordList({ records, accounts, categories, today, monthLabel, initialCategory = "" }: RecordListProps) {
  // 換月份時元件留著 篩選條件也留著
  const [filters, setFilters] = useState<RecordFilters>(() => ({ ...NO_FILTERS, category: initialCategory }));
  // 又從總覽點了別的一片時換成那個分類
  // 換月份的連結不帶 category 參數 篩選照舊
  const [linkedCategory, setLinkedCategory] = useState(initialCategory);
  if (initialCategory !== linkedCategory) {
    setLinkedCategory(initialCategory);
    if (initialCategory !== "") setFilters({ ...NO_FILTERS, category: initialCategory });
  }
  const removal = useRemovalNotice();
  const firstFilter = useRef<HTMLSelectElement>(null);

  const shown = filterRecords(records, filters);
  const totals = recordTotals(shown);
  const filtered = hasFilters(filters);
  const change = (key: keyof RecordFilters) => (event: ChangeEvent<HTMLSelectElement>) => setFilters({ ...filters, [key]: event.target.value });
  const clearFilters = () => {
    setFilters(NO_FILTERS);
    // 清除篩選按完就不見了 焦點移到篩選 不掉到 body
    firstFilter.current?.focus();
  };

  return (
    // 刪除的訊息固定放最上面 刪掉最後一筆換成空狀態時訊息與焦點還在
    <div className="stack">
      <DialogMessage {...removal.messageProps} />
      {records.length === 0 ? (
        <EmptyState icon="receipt" title={`${monthLabel}還沒有紀錄`} hint="按「記一筆」開始記帳；設定好的固定收支會在當天自動記上。" />
      ) : (
        // 超寬螢幕時篩選與合計固定在左欄 清單才不會拉太寬讓名稱跟金額離太遠
        <div className="stack xl:grid xl:grid-cols-[17rem_minmax(0,1fr)] xl:items-start xl:gap-8">
          <div className="stack xl:sticky xl:top-24">
            {/* 手機上三個選單並排很窄 不篩選時只寫欄位名 選了才寫名稱 */}
            <div role="group" aria-label="篩選紀錄" className="grid grid-cols-3 gap-2 xl:grid-cols-1">
              <select ref={firstFilter} aria-label="帳戶" value={filters.account} onChange={change("account")} className="input min-w-0">
                <option value="">帳戶</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.active ? account.name : `${account.name}（已停用）`}
                  </option>
                ))}
              </select>
              <select aria-label="分類" value={filters.category} onChange={change("category")} className="input min-w-0">
                <option value="">分類</option>
                {CATEGORY_KINDS.map((kind) => (
                  <optgroup key={kind} label={CATEGORY_KIND_LABELS[kind]}>
                    {categories
                      .filter((category) => category.kind === kind)
                      .map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                  </optgroup>
                ))}
                <option value={UNCATEGORIZED_KEY}>{UNCATEGORIZED_LABEL}</option>
              </select>
              <select aria-label="類型" value={filters.kind} onChange={change("kind")} className="input min-w-0">
                <option value="">類型</option>
                {TRANSACTION_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {TRANSACTION_KIND_LABELS[kind]}
                  </option>
                ))}
              </select>
            </div>
            <dl className="panel flex flex-wrap gap-x-10 gap-y-2 xl:grid xl:grid-cols-2 xl:gap-x-4">
              <div className="flex flex-col gap-0.5">
                <dt className="text-sm font-medium text-ink-soft">{filtered ? "篩選後的收入" : `${monthLabel}收入`}</dt>
                <dd className="text-lg font-semibold text-success tabular-nums">{formatTwd(totals.income)}</dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-sm font-medium text-ink-soft">{filtered ? "篩選後的支出" : `${monthLabel}支出`}</dt>
                <dd className="text-lg font-semibold text-ink tabular-nums">{formatTwd(totals.expense)}</dd>
              </div>
            </dl>
            {filtered && (
              <div className="button-row">
                <span className="chip chip-brand">
                  篩選後 {shown.length} 筆（共 {records.length} 筆）
                </span>
                <button type="button" onClick={clearFilters} className="btn-ghost btn-sm">
                  清除篩選
                </button>
              </div>
            )}
          </div>

          {shown.length === 0 ? (
            <EmptyState compact icon="search" title="沒有符合篩選條件的紀錄" hint="換個條件，或清除篩選看全部的紀錄。" />
          ) : (
            <div className="card divide-y divide-line overflow-hidden p-0">
              {groupByDate(shown).map((group) => (
                <section key={group.date} aria-labelledby={`fin-day-${group.date}`}>
                  <h2 id={`fin-day-${group.date}`} className="card-row flex items-center gap-2 border-b border-line bg-surface-muted py-2 text-sm font-semibold text-ink">
                    {formatDay(group.date)}
                    {group.date === today && <span className="font-normal text-ink-soft">今天</span>}
                  </h2>
                  <ul className="divide-y divide-line">
                    {group.records.map((record) => (
                      <RecordRow key={record.id} record={record} accounts={accounts} categories={categories} today={today} onDeleted={removal.report} />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
