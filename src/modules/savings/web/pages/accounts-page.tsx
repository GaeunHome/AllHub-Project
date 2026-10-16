import { requireSession } from "@/core/auth";
import type { ModuleInfo } from "@/core/module";
import { CARD_FLOW_DAYS } from "../../lib/cards";
import { addDays, taipeiToday } from "../../lib/dates";
import { cachedAccountFlows, cachedAccounts, cachedCardBills, cachedCardFlows, cachedCategories, cachedHoldings, cachedRecurring } from "../../service/cached";
import { AccountsBoard } from "../components/accounts/accounts-board";
import { AccountsPageSkeleton } from "../components/accounts/accounts-skeleton";
import type { SearchParams } from "../components/month-href";
import { SavingsPageFrame, StreamSection } from "../components/page-frame";
import { accountsPageView, accountsState, depositOptions, entryFormOptions, type AccountsInput } from "../dashboard-view";

/**
 * 存款與信用卡 證券帳戶在投資頁 所以不查股價
 * 從別頁連過來帶 add=deposit 或 credit 時打開新增的視窗
 */
export async function AccountsLoader({ searchParams }: { searchParams?: SearchParams } = {}) {
  const user = await requireSession();
  const today = taipeiToday(new Date());
  const [accounts, flows, holdings, categories, rules, params] = await Promise.all([
    cachedAccounts(user.id),
    cachedAccountFlows(user.id),
    cachedHoldings(user.id),
    cachedCategories(user.id),
    cachedRecurring(user.id),
    searchParams,
  ]);
  const hasCards = accounts.some((account) => account.kind === "credit");
  const [cardFlows, cardBills] = await Promise.all([hasCards ? cachedCardFlows(user.id, addDays(today, -CARD_FLOW_DAYS)) : [], hasCards ? cachedCardBills(user.id) : []]);
  const input: AccountsInput = { accounts, flows, holdings, quotes: null, cardFlows, cardBills, today };
  const state = accountsState(input);
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
