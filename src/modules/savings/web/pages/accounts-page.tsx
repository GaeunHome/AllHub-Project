import { requireSession } from "@/core/auth";
import type { ModuleInfo, SearchParams } from "@/core/module";
import { cachedCategories, cachedRecurring } from "../../service/cached";
import { AccountsBoard } from "../components/accounts/accounts-board";
import { AccountsPageSkeleton } from "../components/accounts/accounts-skeleton";
import { SavingsPageFrame, StreamSection } from "../components/page-frame";
import { accountsPageView, depositOptions, entryFormOptions } from "../dashboard-view";
import { loadAccounts } from "../overview-data";

/**
 * 存款與信用卡 證券帳戶在投資頁 所以不查股價
 * 從別頁連過來帶 add=deposit 或 credit 時打開新增的視窗
 */
export async function AccountsLoader({ searchParams }: { searchParams?: SearchParams } = {}) {
  const user = await requireSession();
  const [{ input, state }, categories, rules, params] = await Promise.all([loadAccounts(user.id, new Date(), { quotes: false }), cachedCategories(user.id), cachedRecurring(user.id), searchParams]);
  const { accounts, today } = input;
  const add = params?.add;

  return (
    <AccountsBoard
      view={accountsPageView(input, state, rules)}
      context={{ options: entryFormOptions(accounts, categories, today, state.withHoldings), depositAccounts: depositOptions(accounts), today }}
      openAdd={add === "deposit" || add === "credit" ? add : null}
    />
  );
}

// web 層不能 import 模組根目錄 所以 info 由 src/app 傳進來
export function AccountsPage({ info, searchParams }: { info: ModuleInfo; searchParams?: SearchParams }) {
  return (
    <SavingsPageFrame info={info} current="accounts">
      <StreamSection fallback={<AccountsPageSkeleton />}>
        <AccountsLoader searchParams={searchParams} />
      </StreamSection>
    </SavingsPageFrame>
  );
}
