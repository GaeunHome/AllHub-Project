import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { inputOf, markup as render, selectedOption, textOf, valueOf } from "@/dev/test-helpers";
import type { PayCardDraft } from "../../../account-details";
import type { ConfirmDraft } from "../../../pending-view";

// 只看表單送出什麼 其他照原本的實作
vi.mock("@/core/ui/dialog", { spy: true });
vi.mock("../../../actions-recurring", () => ({ confirmOccurrenceAction: vi.fn() }));
vi.mock("../../../actions-cards", () => ({ payCardAction: vi.fn() }));

const dialog = await import("@/core/ui/dialog");
const actions = { ...(await import("../../../actions-recurring")), ...(await import("../../../actions-cards")) };
const { ConfirmForm } = await import("../confirm-form");
const { PayCardForm } = await import("../../accounts/pay-card-form");

const TODAY = "2026-10-15";

const DEPOSITS = [
  { id: 1, name: "台銀", kind: "deposit" as const },
  { id: 2, name: "生活費帳戶", kind: "deposit" as const },
];
const CONFIRM: ConfirmDraft = {
  ruleId: 3,
  period: "2026-10",
  name: "006208 定期定額",
  kind: "transfer",
  amount: 5000,
  date: TODAY,
  minDate: "2026-01-05",
  where: [{ label: "帳戶", value: "台銀 → 臺銀證券" }],
  notePlaceholder: "留空會寫「買進 006208 N 股」",
  regularBuy: { symbol: "006208", name: "富邦台50", closeCents: 10650, quoteDate: "2026-10-14", estimate: { shares: 46, cost: 4900 } },
};
const PAY: PayCardDraft = { cardId: 6, cardName: "國泰卡", amount: 12480, payFromAccountId: 2, minDate: "2026-01-05" };

beforeEach(() => {
  vi.mocked(dialog.useDialogForm).mockClear();
});

describe("確認固定收支", () => {
  const confirm = (draft: ConfirmDraft) => render(createElement(ConfirmForm, { draft, today: TODAY, onDone: vi.fn(), onCancel: vi.fn() }));

  it("定期定額：股數與扣款先填好估算的值，送出規則、那一期、股數、金額、日期與備註", () => {
    const markup = confirm(CONFIRM);

    expect([valueOf(markup, "ruleId"), valueOf(markup, "period"), valueOf(markup, "shares"), valueOf(markup, "amount"), valueOf(markup, "date")]).toEqual(["3", "2026-10", "46", "4900", TODAY]);
    expect(inputOf(markup, "note")).toContain("placeholder=\"留空會寫「買進 006208 N 股」\"");
  });

  it("定期定額讀不到股價：股數與扣款留空，寫出要照券商 App 填", () => {
    const markup = confirm({ ...CONFIRM, regularBuy: { ...CONFIRM.regularBuy!, closeCents: null, quoteDate: null, estimate: null } });

    expect(valueOf(markup, "shares")).toBeUndefined();
    expect(valueOf(markup, "amount")).toBeUndefined();
    expect(markup).toContain("股價暫時無法讀取");
  });

  it("記到哪裡分開寫：帳戶與分類各一列", () => {
    const markup = confirm({ ...CONFIRM, kind: "expense", regularBuy: null, where: [{ label: "帳戶", value: "生活費帳戶" }, { label: "分類", value: "水電" }] });
    const facts = [...markup.matchAll(/<dt[^>]*>(.*?)<\/dt><dd[^>]*>(.*?)<\/dd>/g)].map((m) => [textOf(m[1]), textOf(m[2])]);

    expect(facts).toEqual([
      ["帳戶", "生活費帳戶"],
      ["分類", "水電"],
    ]);
  });

  it("一般的收支：金額先填預計的，可以改；沒有股數", () => {
    const markup = confirm({ ...CONFIRM, kind: "expense", amount: 1800, regularBuy: null });

    expect(valueOf(markup, "amount")).toBe("1800");
    expect(inputOf(markup, "shares")).toBe("");
  });
});

describe("繳卡費", () => {
  it("金額先填本期應繳，從這張卡的扣款帳戶繳；送出卡片、轉出帳戶、金額與日期", () => {
    const markup = render(createElement(PayCardForm, { draft: PAY, accounts: DEPOSITS, today: TODAY, onDone: vi.fn(), onCancel: vi.fn() }));

    expect([valueOf(markup, "cardId"), valueOf(markup, "amount"), valueOf(markup, "date")]).toEqual(["6", "12480", TODAY]);
    expect(selectedOption(markup, "fromAccountId")).toBe("生活費帳戶");
    expect(vi.mocked(dialog.useDialogForm).mock.calls.at(-1)?.[0]).toBe(actions.payCardAction);
  });
});
