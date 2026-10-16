import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CardDailyFlow } from "../../../lib/cards";
import type { AccountMonthFlow } from "../../../lib/ledger";
import type { CardBillRecord } from "../../../service/cards";
import type { AccountsInput, OverviewAccount } from "../../dashboard-view";

// 視窗與選單關著時不算繪內容 換掉才看得到裡面 選單帶著名稱才分得出是哪一張卡的
vi.mock("@/core/ui/dialog", { spy: true });
vi.mock("@/core/ui/action-button", { spy: true });
vi.mock("@/core/ui/more-menu", () => ({ MoreMenu: ({ label, children }: { label: string; children: ReactNode }) => createElement("menu-mock", { "data-menu": label }, children) }));
vi.mock("../../actions", () =>
  Object.fromEntries(
    ["createAccountAction", "updateAccountAction", "setAccountActiveAction", "moveAccountAction", "deleteAccountAction", "payCardAction", "enterCardBillAction"].map((name) => [name, vi.fn()]),
  ),
);
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }), usePathname: () => "/savings/accounts" }));
// 停用與刪除的訊息要看交給誰
vi.mock("../row-controls", { spy: true });
// 網址的 add 參數要看交給哪一個新增按鈕
vi.mock("./add-account-button", { spy: true });
// 記一筆與更新餘額另外測 這裡只看卡片交給它們哪個帳戶
vi.mock("../forms/quick-add", () => ({
  QuickAddButton: (p: { accountId?: number; label?: string }) => createElement("button", { "data-form": "quick-add", "data-account": p.accountId }, p.label ?? "記一筆"),
}));
vi.mock("../forms/update-balance", () => ({
  UpdateBalanceButton: (p: { account: { id: number; balance: number } }) => createElement("button", { "data-form": "update-balance", "data-account": p.account.id, "data-balance": p.account.balance }, "更新餘額"),
}));

const dialog = await import("@/core/ui/dialog");
const { ActionButton } = await import("@/core/ui/action-button");
const actions = await import("../../actions");
const rowControls = await import("../row-controls");
const { AddAccountButton } = await import("./add-account-button");
const { accountsPageView, accountsState } = await import("../../dashboard-view");
const { AccountsBoard } = await import("./accounts-board");

const TODAY = "2026-10-15";
const CREATED = new Date("2026-01-05T02:00:00Z");
const textOf = (markup: string) => markup.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"');

const account = (fixture: Pick<OverviewAccount, "id" | "name" | "kind"> & Partial<OverviewAccount>): OverviewAccount => ({
  purposeId: null,
  label: null,
  cardStyle: null,
  openingBalance: 0,
  openingCost: null,
  monthlyPlan: null,
  targetAmount: null,
  dueDay: null,
  payFromAccountId: null,
  active: true,
  sortOrder: fixture.id,
  createdAt: CREATED,
  statementDay: null,
  autopay: false,
  ...fixture,
});

const ACCOUNTS = [
  account({ id: 1, name: "台銀", kind: "deposit", label: "交割", openingBalance: 8300 }),
  account({ id: 2, name: "生活費帳戶", kind: "deposit", openingBalance: 86000 }),
  account({ id: 3, name: "緊急預備金 A", kind: "deposit", openingBalance: 8200, targetAmount: 10000 }),
  account({ id: 6, name: "國泰卡", kind: "credit", statementDay: 5, payFromAccountId: 2 }),
  account({ id: 7, name: "台新卡", kind: "credit", statementDay: 25, payFromAccountId: 2 }),
  account({ id: 8, name: "舊帳戶", kind: "deposit", openingBalance: 9000, active: false }),
  account({ id: 9, name: "舊卡", kind: "credit", active: false }),
];
const flow = (accountId: number, month: string, values: Partial<AccountMonthFlow>): AccountMonthFlow => ({ accountId, month, income: 0, expense: 0, transferIn: 0, transferOut: 0, adjust: 0, ...values });
const dayFlow = (accountId: number, date: string, values: Partial<CardDailyFlow>): CardDailyFlow => ({ accountId, date, income: 0, expense: 0, transferIn: 0, transferOut: 0, adjust: 0, ...values });
// 國泰卡 9/20 刷 12,480 是 10/5 結帳的帳單 已經填了 台新卡 9/25 結帳的還沒填
// 生活費帳戶每月轉 5,000 到台銀
const FLOWS = [flow(6, "2026-09", { expense: 12480 }), flow(7, "2026-09", { expense: 3000 }), flow(2, "2026-10", { transferOut: 5000 }), flow(1, "2026-10", { transferIn: 5000 })];
const CARD_FLOWS = [dayFlow(6, "2026-09-20", { expense: 12480 }), dayFlow(7, "2026-09-10", { expense: 3000 })];
const BILLS: CardBillRecord[] = [{ id: 1, accountId: 6, statementDate: "2026-10-05", dueDate: "2026-10-20", amount: 12480, paid: 0, lastPaidOn: null }];
const RULES = [
  { accountId: 2, counterAccountId: 1 },
  { accountId: 2, counterAccountId: null },
];
const OPTIONS = { accounts: ACCOUNTS.filter((item) => item.active).map(({ id, name, kind }) => ({ id, name, kind })), categories: [], today: TODAY };
const DEPOSITS = OPTIONS.accounts.filter((item) => item.kind === "deposit");

const board = (overrides: Partial<AccountsInput> = {}, openAdd: "deposit" | "credit" | null = null) => {
  const input: AccountsInput = { accounts: ACCOUNTS, flows: FLOWS, holdings: [], quotes: null, cardFlows: CARD_FLOWS, cardBills: BILLS, today: TODAY, ...overrides };
  const view = accountsPageView(input, accountsState(input), RULES);
  return renderToStaticMarkup(createElement(AccountsBoard, { view, context: { options: OPTIONS, depositAccounts: DEPOSITS, today: TODAY }, openAdd }) as never);
};
const cardOf = (markup: string, name: string) => markup.split("<article").find((part) => part.includes(`>${name}</h3>`))?.split("</article>")[0] ?? "";
const menuOf = (markup: string, name: string) => markup.match(new RegExp(`<menu-mock data-menu="「${name}」的選項">([\\s\\S]*?)</menu-mock>`))?.[1] ?? "";
const menuItems = (menu: string) => [...menu.matchAll(/<button[^>]*class="menu-item[^"]*"[^>]*>(.*?)<\/button>/g)].map((m) => textOf(m[1]));
/** 卡片上看得到的部分 不含 ⋮ 選單與關著的視窗 */
const surfaceOf = (card: string) => card.replace(/<menu-mock[\s\S]*?<\/menu-mock>/g, "").replace(/<dialog-mock[\s\S]*?<\/dialog-mock>/g, "");
const dialogOf = (markup: string, title: string) => markup.match(new RegExp(`<dialog-mock data-title="${title}">([\\s\\S]*?)</dialog-mock>`))?.[1] ?? "";
const hrefOf = (card: string) => card.match(/<a[^>]*href="([^"]+)"/)?.[1].replace(/&amp;/g, "&");
const dialogButtons = (markup: string) => [...markup.matchAll(/<button[^>]*aria-haspopup="dialog"[^>]*>(.*?)<\/button>/g)].map((m) => textOf(m[1]));

beforeEach(() => {
  vi.mocked(dialog.useDialogForm).mockClear();
  vi.mocked(ActionButton).mockClear();
  vi.mocked(AddAccountButton).mockClear();
  vi.mocked(rowControls.useRemovalNotice).mockRestore();
  vi.mocked(dialog.Dialog).mockImplementation(({ title, children }) => createElement("dialog-mock", { "data-title": typeof title === "string" ? title : "" }, children));
});

describe("存款的卡片", () => {
  it("餘額與用途寫在卡上；有目標時寫出存到多少", () => {
    const text = textOf(surfaceOf(cardOf(board(), "台銀")));

    expect(text).toContain("交割");
    // 8,300 加上從生活費帳戶轉進來的 5,000
    expect(text).toContain("$13,300");
    expect(textOf(surfaceOf(cardOf(board(), "緊急預備金 A")))).toContain("$8,200 / $10,000");
  });

  it("「記一筆」「更新餘額」直接在卡上、不在 ⋮ 裡，帶著這個帳戶與目前的餘額", () => {
    const card = surfaceOf(cardOf(board(), "生活費帳戶"));

    expect(card).toMatch(/data-form="quick-add" data-account="2"/);
    // 生活費帳戶 86,000 轉出 5,000
    expect(card).toMatch(/data-form="update-balance" data-account="2" data-balance="81000"/);
  });

  it("點卡片（按鈕以外）看這個帳戶的紀錄：連結到紀錄頁篩好這個帳戶，按鈕不在連結裡", () => {
    const card = cardOf(board(), "台銀");

    expect(hrefOf(card)).toBe("/savings/records?account=1");
    expect(card.match(/<a[^>]*>([\s\S]*?)<\/a>/)![1]).not.toContain("<button");
  });

  it("⋮ 只放不常用的：修改、上移、下移、停用、刪除（上移下移只在存款裡，第一個不能上移、最後一個不能下移）", () => {
    const markup = board();

    expect(menuItems(menuOf(markup, "台銀"))).toEqual(["修改", "下移", "停用", "刪除帳戶"]);
    expect(menuItems(menuOf(markup, "生活費帳戶"))).toEqual(["修改", "上移", "下移", "停用", "刪除帳戶"]);
    expect(menuItems(menuOf(markup, "緊急預備金 A"))).toEqual(["修改", "上移", "停用", "刪除帳戶"]);
  });

  it("修改的視窗放在 ⋮ 外面（選單收起時不會跟著卸載），帶入原本的設定", () => {
    const markup = board();

    expect(dialogButtons(menuOf(markup, "台銀"))).toEqual(["修改"]);
    expect(menuOf(markup, "台銀")).not.toContain("<form class=\"stack\"");
    expect(dialogOf(markup, "修改「台銀」")).toMatch(/name="label" value="交割"/);
  });
});

describe("信用卡", () => {
  it("卡上直接放現在要按的：結帳了還沒填帳單是「填帳單」，填了還沒繳是「已繳」；「記一筆刷卡」一直都在", () => {
    const markup = board();
    const cathay = surfaceOf(cardOf(markup, "國泰卡"));
    const taishin = surfaceOf(cardOf(markup, "台新卡"));

    expect(dialogButtons(cathay)).toEqual(["已繳"]);
    expect(dialogButtons(taishin)).toEqual(["填帳單"]);
    expect(textOf(taishin)).toContain("待填帳單");
    expect(cathay).toMatch(/data-form="quick-add" data-account="6"[^>]*>記一筆刷卡/);
    expect(taishin).toMatch(/data-form="quick-add" data-account="7"[^>]*>記一筆刷卡/);
  });

  it("填帳單打開這一期（9/25 結帳）的帳單表單，已繳打開繳這張卡的表單、先填本期的 12,480", () => {
    const markup = board();
    const bill = dialogOf(markup, "填帳單：台新卡");
    const pay = dialogOf(markup, "已繳：國泰卡");

    expect(bill).toMatch(/name="cardId" value="7"/);
    expect(textOf(bill)).toContain("9/25 結帳的帳單金額");
    expect(pay).toMatch(/name="cardId" value="6"/);
    expect(pay).toMatch(/name="amount" value="12480"/);
  });

  it("繳清了：「填帳單」「已繳」都不放，寫本期已繳清", () => {
    const paid = { cardBills: [{ ...BILLS[0], paid: 12480, lastPaidOn: "2026-10-12" }], flows: [...FLOWS, flow(6, "2026-10", { transferIn: 12480 })], cardFlows: [...CARD_FLOWS, dayFlow(6, "2026-10-12", { transferIn: 12480 })] };
    const card = surfaceOf(cardOf(board(paid), "國泰卡"));

    expect(dialogButtons(card)).toEqual([]);
    expect(textOf(card)).toContain("本期已繳清");
  });

  it("卡面寫卡名、結帳日與扣款帳戶；點卡面看這張卡的紀錄", () => {
    const card = cardOf(board(), "國泰卡");

    expect(hrefOf(card)).toContain("account=6");
    expect(textOf(card.match(/<a[^>]*>([\s\S]*?)<\/a>/)![1])).toMatch(/國泰卡.*每月 5 日結帳.*生活費帳戶/);
  });

  it("「最近 N 期」：有填過帳單才有，預設收起，按了才展開帳單的表格", () => {
    const cathay = surfaceOf(cardOf(board(), "國泰卡"));
    const toggles = [...cathay.matchAll(/<button(?![^>]*aria-haspopup)[^>]*aria-expanded="false"[^>]*aria-controls="([^"]+)"[^>]*>(.*?)<\/button>/g)];

    expect(toggles.map((m) => textOf(m[2]))).toEqual(["最近 1 期"]);
    expect(cathay).toMatch(new RegExp(`<div id="${toggles[0][1]}" hidden="">`));
    expect(surfaceOf(cardOf(board(), "台新卡"))).not.toContain("最近");
  });

  it("信用卡照帳單繳，卡上沒有「更新餘額」", () => {
    expect(cardOf(board(), "國泰卡")).not.toContain('data-form="update-balance"');
  });

  it("扣款帳戶繳完所有從它扣的卡費就不夠時：寫出還差多少", () => {
    // 生活費帳戶 10,000 轉出 5,000 剩 5,000 國泰卡本期 12,480 台新卡還沒填帳單照紀錄估 3,000 差 10,480
    const poorer = ACCOUNTS.map((item) => (item.id === 2 ? { ...item, openingBalance: 10000 } : item));

    expect(textOf(surfaceOf(cardOf(board({ accounts: poorer }), "國泰卡")))).toContain("還差 $10,480");
  });

  it("⋮ 只有修改類、上移下移、停用、刪除；填帳單、已繳、記一筆刷卡不在裡面。這一期的帳單填過了才有「重填本期帳單」（填錯時用）", () => {
    const markup = board();

    expect(menuItems(menuOf(markup, "國泰卡"))).toEqual(["修改", "重填本期帳單", "下移", "停用", "刪除帳戶"]);
    expect(menuItems(menuOf(markup, "台新卡"))).toEqual(["修改", "上移", "停用", "刪除帳戶"]);
  });
});

describe("已停用的帳戶", () => {
  it("收在最下面的「已停用（N）」，預設收起；不分類型都在這裡，⋮ 是恢復與刪除", () => {
    const markup = board();
    const details = markup.slice(markup.indexOf('<details class="disclosure">'));

    expect(details).toMatch(/^<details class="disclosure"><summary>已停用（2）<\/summary>/);
    expect(textOf(details)).toContain("舊帳戶");
    expect(textOf(details)).toContain("舊卡");
    expect(menuItems(menuOf(markup, "舊帳戶"))).toEqual(["恢復", "刪除帳戶"]);
    expect(cardOf(markup, "舊帳戶")).toBe("");
  });

  it("恢復送出的是啟用；停用送出的是停用", () => {
    board();
    const fieldsOf = (id: number) => vi.mocked(ActionButton).mock.calls.map(([props]) => props.fields).filter((fields) => fields.id === id && "active" in fields);

    expect(fieldsOf(8)).toEqual([{ id: 8, active: "true" }]);
    expect(fieldsOf(1)).toEqual([{ id: 1, active: "false" }]);
  });
});

describe("刪除與停用", () => {
  it("刪除先確認：紀錄和固定收支（轉入是它的也算）會一起刪；有轉帳時提醒其他帳戶的餘額會變；還沒有紀錄的直接說", () => {
    board();
    const confirms = vi.mocked(ActionButton).mock.calls.map(([props]) => props.confirmMessage).filter((message) => message !== undefined);

    expect(confirms.find((message) => message.includes("「生活費帳戶」"))).toContain("這個帳戶的所有紀錄和 2 筆固定收支都會一起刪除");
    expect(confirms.find((message) => message.includes("「台銀」"))).toContain("那些帳戶的餘額會跟著改變");
    expect(confirms.find((message) => message.includes("「緊急預備金 A」"))).toContain("還沒有任何紀錄");
  });

  it("停用、恢復或刪除後卡片會換地方或不見：訊息交給最上面不會消失的位置", async () => {
    const report = vi.fn();
    vi.mocked(rowControls.useRemovalNotice).mockReturnValue({ messageProps: { message: undefined, ref: { current: null } }, report });
    vi.mocked(actions.setAccountActiveAction).mockResolvedValue({});
    board();

    expect(vi.mocked(rowControls.DeleteMenuItem).mock.calls.every(([props]) => props.onDeleted === report)).toBe(true);
    const pause = vi.mocked(ActionButton).mock.calls.find(([props]) => props.fields.id === 1 && "active" in props.fields)![0];
    await pause.action({}, new FormData());
    expect(report).toHaveBeenCalledWith(expect.stringContaining("已停用「台銀」"));
  });
});

describe("新增帳戶", () => {
  it("存款與信用卡最後各有一個新增的按鈕，新增的就是那一種", () => {
    board();

    expect(vi.mocked(AddAccountButton).mock.calls.map(([props]) => props.kind)).toEqual(["deposit", "credit"]);
  });

  it("網址帶 add=credit 從別頁連過來：只打開新增信用卡的視窗", () => {
    board({}, "credit");

    expect(vi.mocked(AddAccountButton).mock.calls.map(([props]) => [props.kind, props.openFromLink])).toEqual([
      ["deposit", false],
      ["credit", true],
    ]);
  });

  it("還沒有銀行帳戶與信用卡：新增銀行帳戶與信用卡的按鈕照樣在", () => {
    board({ accounts: [], flows: [], cardFlows: [], cardBills: [] });

    expect(vi.mocked(AddAccountButton).mock.calls.map(([props]) => props.kind)).toEqual(["deposit", "credit"]);
  });
});
