"use client";

import { useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { DialogMessage } from "@/core/ui/dialog";
import { Fact, FactList } from "@/core/ui/fact-list";
import { CardHeader } from "@/core/ui/page-header";
import { formatDay } from "../../../lib/dates";
import { CATEGORY_KINDS, CATEGORY_KIND_LABELS, TRANSACTION_KINDS, TRANSACTION_KIND_LABELS } from "../../../lib/kinds";
import { UNCATEGORIZED_KEY, type MonthTotals } from "../../../lib/ledger";
import { formatTwd } from "../../../lib/money";
import type { ExpenseRow } from "../../dashboard-view";
import { UNCATEGORIZED_LABEL } from "../../entry-display";
import { pausedName } from "../../format";
import { NO_FILTERS, filterRecords, groupByDate, hasFilters, recordTotals, type RecordFilters, type RecordItem } from "../../record-filter";
import { ExpenseList } from "../dashboard/expense-list";
import type { AccountChoice, CategoryOption } from "../forms/options";
import { ListGroup, useRemovalNotice } from "../row-controls";
import { RecordRow } from "./record-row";

type RecordListProps = {
  records: RecordItem[];
  accounts: AccountChoice[];
  categories: CategoryOption[];
  today: string;
  /** 工具列最前面的月份切換 由伺服器算好連結 */
  monthSwitcher: ReactNode;
  /** 沒有紀錄時的說明與側欄的標題 例如本月或 9 月 */
  monthLabel: string;
  /** 側欄寫這個月的合計與各分類的支出 不跟著篩選 */
  month?: { totals: MonthTotals; expenses: ExpenseRow[] };
  /** 網址的 account 與 category 參數 伺服器已確認是自己的 空字串是不篩選 */
  initialAccount?: string;
  initialCategory?: string;
};

/** 在瀏覽器裡篩選 換條件不必再問伺服器 合計跟著篩選結果 */
export function RecordList({ records, accounts, categories, today, monthSwitcher, monthLabel, month, initialAccount = "", initialCategory = "" }: RecordListProps) {
  // 換月份時元件留著 篩選條件也留著
  const linked = { ...NO_FILTERS, account: initialAccount, category: initialCategory };
  const [filters, setFilters] = useState<RecordFilters>(linked);
  // 又從總覽點了別的帳戶或分類時換成那個條件
  // 換月份的連結不帶這兩個參數 篩選照舊
  const linkKey = `${initialAccount}|${initialCategory}`;
  const [seenLink, setSeenLink] = useState(linkKey);
  if (linkKey !== seenLink) {
    setSeenLink(linkKey);
    if (initialAccount !== "" || initialCategory !== "") setFilters(linked);
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
  // 側欄再點一次同一個分類就取消
  const pickCategory = (category: string) => setFilters({ ...filters, category: filters.category === category ? "" : category });

  return (
    // 刪除的訊息固定放最上面 刪掉最後一筆換成空狀態時訊息與焦點還在
    <div className="stack">
      <DialogMessage {...removal.messageProps} />
      {/* 超寬螢幕清單限寬 旁邊固定放這個月的合計 */}
      <div className="flex flex-col gap-8 2xl:flex-row 2xl:items-start">
        <div className="stack min-w-0 flex-1 xl:max-w-5xl">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            {monthSwitcher}
            {records.length > 0 && (
              // 手機上三個選單並排很窄 不篩選時只寫欄位名 選了才寫名稱
              <div role="group" aria-label="篩選紀錄" className="grid w-full grid-cols-3 gap-2 lg:flex lg:w-auto">
                <select ref={firstFilter} aria-label="帳戶" value={filters.account} onChange={change("account")} className="input min-w-0 lg:w-auto">
                  <option value="">帳戶</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {pausedName(account.name, account.active)}
                    </option>
                  ))}
                </select>
                <select aria-label="分類" value={filters.category} onChange={change("category")} className="input min-w-0 lg:w-auto">
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
                <select aria-label="類型" value={filters.kind} onChange={change("kind")} className="input min-w-0 lg:w-auto">
                  <option value="">類型</option>
                  {TRANSACTION_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {TRANSACTION_KIND_LABELS[kind]}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          {records.length === 0 ? (
            <p className="text-ink">{monthLabel}還沒有紀錄。</p>
          ) : (
            <>
              <div className="flex min-h-9 flex-wrap items-center gap-x-3 gap-y-1 text-ink tabular-nums">
                <p>
                  {filtered && `篩選後 ${shown.length} 筆（共 ${records.length} 筆） · `}收入 {formatTwd(totals.income)} · 支出 {formatTwd(totals.expense)}
                </p>
                {filtered && (
                  <button type="button" onClick={clearFilters} className="btn-ghost btn-sm">
                    清除篩選
                  </button>
                )}
              </div>
              {shown.length === 0 ? (
                <p className="text-ink">沒有符合篩選條件的紀錄。</p>
              ) : (
                <div className="card divide-y divide-line overflow-hidden p-0">
                  {groupByDate(shown).map((group) => (
                    <ListGroup
                      key={group.date}
                      id={`savings-day-${group.date}`}
                      as="h2"
                      title={
                        <span className="flex items-center gap-2">
                          {formatDay(group.date)}
                          {group.date === today && <span className="font-normal text-ink-soft">今天</span>}
                        </span>
                      }
                    >
                      {group.records.map((record) => (
                        <RecordRow key={record.id} record={record} accounts={accounts} categories={categories} today={today} onDeleted={removal.report} />
                      ))}
                    </ListGroup>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        {month && records.length > 0 && <MonthPanel label={monthLabel} month={month} selected={filters.category} onSelect={pickCategory} />}
      </div>
    </div>
  );
}

/** 只在超寬螢幕出現 捲動清單時留在原位 點一個分類就篩選 */
function MonthPanel({ label, month, selected, onSelect }: { label: string; month: NonNullable<RecordListProps["month"]>; selected: string; onSelect: (category: string) => void }) {
  const { income, expense, saved } = month.totals;
  return (
    <section aria-labelledby="savings-month-panel" className="card stack hidden min-w-0 overflow-hidden 2xl:sticky 2xl:top-20 2xl:flex 2xl:w-96 2xl:shrink-0">
      <CardHeader id="savings-month-panel">{label}</CardHeader>
      <FactList>
        <Fact label="收入">{formatTwd(income)}</Fact>
        <Fact label="支出">{formatTwd(expense)}</Fact>
        <Fact label={saved < 0 ? "多花" : "存下"}>{formatTwd(Math.abs(saved))}</Fact>
      </FactList>
      {month.expenses.length > 0 && <ExpenseList rows={month.expenses} selected={selected} onSelect={onSelect} />}
    </section>
  );
}
