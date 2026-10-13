import { Fragment, createElement, useLayoutEffect, type EffectCallback, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 視窗關著時內容不算繪：換掉 Dialog／DialogButton／useDialog 才看得到送出後與視窗裡的樣子，其他照原本的實作
vi.mock("@/core/ui/dialog", { spy: true });
// 伺服器算繪不跑 layout effect：要看焦點怎麼移時先把 effect 收起來自己跑
vi.mock("react", { spy: true });
vi.mock("../actions", () => ({ addEntryAction: vi.fn(), createGoalAction: vi.fn(), updateGoalAction: vi.fn() }));

const dialog = await import("@/core/ui/dialog");
const actions = await import("../actions");
const { GoalEntryRow, RecordGoalForm, TemporaryEntry, TemporaryEntryForm } = await import("./entry-forms");
const { AddGoalDialog, EditGoalForm, FirstGoalForm } = await import("./goal-forms");
const { GoalRow } = await import("./goal-row");

const textOf = (markup: string) => markup.replace(/<[^>]+>/g, "");
const tagOf = (markup: string, name: string) => markup.match(new RegExp(`<input[^>]*name="${name}"[^>]*>`))![0];
/** label 包住輸入框時，標籤文字就是輸入框的名稱（看得到的字與報讀器念的一樣） */
const labelTextOf = (markup: string, name: string) => {
  const label = markup.split("<label").find((part) => part.includes(`name="${name}"`))!;
  return textOf(`<label${label}`.split("</label>")[0]);
};
const done = { onDone: vi.fn(), onCancel: vi.fn() };

describe("記一筆的視窗內容", () => {
  it("金額欄位的標籤寫出記到哪個月（補記過去的月份也對），預設帶入還差的金額，打開後先拿到焦點", () => {
    const markup = renderToStaticMarkup(createElement(RecordGoalForm, { goalId: 3, month: "2026-08", defaultAmount: 2500, ...done }));

    expect(markup).toMatch(/<input type="hidden" name="goalId" value="3"/);
    expect(markup).toMatch(/<input type="hidden" name="month" value="2026-08"/);
    const amount = tagOf(markup, "amount");
    expect(amount).toContain('value="2500"');
    expect(amount).toContain("data-autofocus");
    expect(amount).not.toContain("aria-label");
    expect(labelTextOf(markup, "amount")).toBe("2026 年 8 月存的金額（元）");
  });

  it("取消不會送出表單；記錄是送出鈕", () => {
    const markup = renderToStaticMarkup(createElement(RecordGoalForm, { goalId: 3, month: "2026-08", defaultAmount: 2500, ...done }));

    expect(markup).toMatch(/<button type="button"[^>]*>取消<\/button>/);
    expect(markup).toMatch(/<button class="btn-primary"[^>]*>(?:(?!<\/button>).)*記錄<\/button>/);
  });
});

describe("臨時存款的視窗內容", () => {
  it("金額與備註都用看得到的標籤當名稱，說明記在哪個月", () => {
    const markup = renderToStaticMarkup(createElement(TemporaryEntryForm, { month: "2026-10", ...done }));

    expect(markup).toMatch(/<input type="hidden" name="month" value="2026-10"/);
    expect(markup).not.toContain('name="goalId"');
    expect(tagOf(markup, "amount")).toContain("data-autofocus");
    for (const name of ["amount", "note"]) expect(tagOf(markup, name)).not.toContain("aria-label");
    expect(labelTextOf(markup, "amount")).toBe("金額（元）");
    expect(labelTextOf(markup, "note")).toBe("備註（選填）");
    expect(textOf(markup)).toContain("2026 年 10 月");
  });
});

describe("視窗裡的表單不用 <form action>", () => {
  it("給 <form> 的是 onSubmit（React 的 <form action> 送完一定清空欄位，失敗時打的字會不見）", () => {
    const forms = [
      renderToStaticMarkup(createElement(RecordGoalForm, { goalId: 3, month: "2026-08", defaultAmount: 2500, ...done })),
      renderToStaticMarkup(createElement(TemporaryEntryForm, { month: "2026-10", ...done })),
      renderToStaticMarkup(createElement(EditGoalForm, { goal: { id: 5, name: "旅遊基金", monthlyAmount: 3000, note: null }, ...done })),
    ];

    for (const markup of forms) expect(markup).toMatch(/^<form(?![^>]*action=)[^>]*>/);
  });

  it("還沒有任何項目時直接放在清單裡的新增表單也一樣（失敗時打的字要留著）", () => {
    expect(renderToStaticMarkup(createElement(FirstGoalForm, { show: true }))).toMatch(/^<form(?![^>]*action=)[^>]*>/);
  });
});

describe("修改項目的視窗內容", () => {
  it("帶入原本的名稱、每月金額與備註，名稱先拿到焦點；送出時帶著項目 id", () => {
    const markup = renderToStaticMarkup(createElement(EditGoalForm, { goal: { id: 5, name: "旅遊基金", monthlyAmount: 3000, note: "日本" }, ...done }));

    expect(markup).toMatch(/<input type="hidden" name="goalId" value="5"/);
    expect(tagOf(markup, "name")).toContain('value="旅遊基金"');
    expect(tagOf(markup, "name")).toContain("data-autofocus");
    expect(tagOf(markup, "monthlyAmount")).toContain('value="3000"');
    expect(tagOf(markup, "note")).toContain('value="日本"');
    expect(textOf(markup)).toContain("儲存");
  });
});

type DialogControls = ReturnType<typeof dialog.useDialog>;
type Controls = { done: DialogControls["done"]; close: DialogControls["close"] };

/** 送出後的樣子：視窗關著、留下這則成功訊息 */
function afterSuccess(message: string): DialogControls {
  const ref = { current: null };
  return {
    open: false,
    message,
    triggerProps: { ref: vi.fn(), type: "button", "aria-haspopup": "dialog", "aria-expanded": false, "aria-controls": "d1", onClick: vi.fn() },
    dialogProps: { id: "d1", open: false, onClose: vi.fn(), fallbackFocus: ref },
    messageProps: { message, ref },
    close: vi.fn(),
    done: vi.fn(),
  };
}

/** 視窗打開時的內容：Dialog 直接算繪內容、DialogButton 把 done／close 交給內容 */
const openDialogs = () => {
  vi.mocked(dialog.Dialog).mockImplementation(({ children }) => createElement(Fragment, null, children));
  vi.mocked(dialog.DialogButton).mockImplementation(({ children }) =>
    createElement(Fragment, null, typeof children === "function" ? (children as (controls: Controls) => ReactNode)({ done: vi.fn(), close: vi.fn() }) : children),
  );
};
const formActions = () => vi.mocked(dialog.useDialogForm).mock.calls.map(([action]) => action);
const goal = { id: 5, name: "旅遊基金", monthlyAmount: 3000, note: null };
// children 照 lint 規定用第三個參數傳；型別上 children 是必填，props 斷言成完整的型別
type EntryRowProps = Parameters<typeof GoalEntryRow>[0];
type GoalRowProps = Parameters<typeof GoalRow>[0];
const entryRow = (canRecord = true) =>
  createElement(GoalEntryRow, { goalId: 3, goalName: "旅遊基金", month: "2026-10", defaultAmount: 1500, canRecord, amount: "每月 $3,000" } as EntryRowProps, createElement("span", null, "旅遊基金"));
const goalRow = () => createElement(GoalRow, { goal, controls: null, deleteControl: null } as GoalRowProps, createElement("span", null, "旅遊基金"));

describe("每個視窗的表單送到對的 Server Action、成功時交給同一個視窗的 done", () => {
  beforeEach(() => {
    vi.mocked(dialog.useDialogForm).mockClear();
    vi.mocked(dialog.useDialog).mockClear();
    openDialogs();
  });

  it("記一筆（項目清單的一列）→ addEntryAction；成功交給這一列的 done（關掉視窗、訊息留在這一列）", () => {
    renderToStaticMarkup(entryRow());

    expect(formActions()).toEqual([actions.addEntryAction]);
    const controls = vi.mocked(dialog.useDialog).mock.results[0].value as DialogControls;
    expect(vi.mocked(dialog.useDialogForm).mock.calls[0][1]).toBe(controls.done);
  });

  it("臨時存款 → addEntryAction，視窗裡是不屬於任何項目的表單（有備註、沒有項目 id）", () => {
    const markup = renderToStaticMarkup(createElement(TemporaryEntry, { month: "2026-10" }));

    expect(formActions()).toEqual([actions.addEntryAction]);
    expect(markup).toContain('name="note"');
    expect(markup).not.toContain('name="goalId"');
  });

  it("修改項目（管理項目的一列）→ updateGoalAction；成功交給這一列的 done", () => {
    renderToStaticMarkup(goalRow());

    expect(formActions()).toEqual([actions.updateGoalAction]);
    const controls = vi.mocked(dialog.useDialog).mock.results[0].value as DialogControls;
    expect(vi.mocked(dialog.useDialogForm).mock.calls[0][1]).toBe(controls.done);
  });

  it("新增固定項目（管理項目）→ createGoalAction", () => {
    renderToStaticMarkup(createElement(AddGoalDialog));

    expect(formActions()).toEqual([actions.createGoalAction]);
  });

  it("還沒有任何項目時清單裡的新增表單 → createGoalAction；成功交給外層的 done（表單會被換成清單，訊息留在外層）", () => {
    renderToStaticMarkup(createElement(FirstGoalForm, { show: true }));

    expect(formActions()).toEqual([actions.createGoalAction]);
    const controls = vi.mocked(dialog.useDialog).mock.results[0].value as DialogControls;
    expect(vi.mocked(dialog.useDialogForm).mock.calls[0][1]).toBe(controls.done);
  });
});

describe("視窗成功關掉後的訊息", () => {
  beforeEach(() => {
    vi.mocked(dialog.Dialog).mockReset();
    vi.mocked(dialog.DialogButton).mockReset();
  });

  it("記一筆：訊息用醒目的成功樣式留在這一列下面；記滿後按鈕不見了，訊息可以接焦點", () => {
    vi.mocked(dialog.useDialog).mockReturnValueOnce(afterSuccess("已記錄「旅遊基金」$1,500"));

    const markup = renderToStaticMarkup(entryRow(false));

    expect(markup).toMatch(/<p[^>]*tabindex="-1"[^>]*role="status"[^>]*class="form-message form-message-success"[^>]*>.*已記錄「旅遊基金」\$1,500/);
    expect(markup).not.toContain("記一筆");
    expect(markup.indexOf("每月 $3,000")).toBeLessThan(markup.indexOf("已記錄"));
  });

  it("修改項目：訊息用醒目的成功樣式留在這一列下面", () => {
    vi.mocked(dialog.useDialog).mockReturnValueOnce(afterSuccess("已儲存「旅遊基金」，每月 $6,000"));

    const markup = renderToStaticMarkup(goalRow());

    expect(markup).toMatch(/role="status"[^>]*class="form-message form-message-success"[^>]*>.*已儲存「旅遊基金」，每月 \$6,000/);
    expect(markup.indexOf("修改")).toBeLessThan(markup.indexOf("已儲存"));
  });
});

describe("加第一個項目之後（還沒有任何項目時直接放在清單裡的表單）", () => {
  const MESSAGE = "已新增「旅遊基金」，每月 $3,000";
  const body = { tagName: "BODY" };
  /** 跑一次元件、收起 layout effect，在指定的焦點位置跑它；回傳訊息有沒有拿到焦點 */
  function focusAfter(show: boolean, active: object | null) {
    const controls = afterSuccess(MESSAGE);
    const message = { isConnected: true, focus: vi.fn() };
    controls.messageProps.ref.current = message as never;
    vi.mocked(dialog.useDialog).mockReturnValueOnce(controls);
    const effects: EffectCallback[] = [];
    vi.mocked(useLayoutEffect).mockImplementation((effect) => {
      effects.push(effect);
    });
    renderToStaticMarkup(createElement(FirstGoalForm, { show }));
    vi.mocked(useLayoutEffect).mockReset();
    vi.stubGlobal("document", { body, activeElement: active });
    for (const effect of effects) effect();
    return message.focus.mock.calls.length > 0;
  }

  beforeEach(() => {
    vi.mocked(dialog.useDialog).mockReset();
    vi.mocked(dialog.useDialogForm).mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("表單換成清單後，同一個位置留下跟其他新增一樣的成功訊息（圖示與底色，可以接焦點）", () => {
    vi.mocked(dialog.useDialog).mockReturnValueOnce(afterSuccess(MESSAGE));

    const markup = renderToStaticMarkup(createElement(FirstGoalForm, { show: false }));

    expect(markup).toMatch(/^<p[^>]*tabindex="-1"[^>]*role="status"[^>]*class="form-message form-message-success"[^>]*>.*已新增「旅遊基金」，每月 \$3,000/);
    expect(markup).not.toContain("<form");
  });

  it("伺服器重新算繪、表單還沒換掉之前不先顯示訊息（不會在表單下面閃一下）", () => {
    vi.mocked(dialog.useDialog).mockReturnValueOnce(afterSuccess(MESSAGE));

    const markup = renderToStaticMarkup(createElement(FirstGoalForm, { show: true }));

    expect(markup).toMatch(/^<form/);
    expect(textOf(markup)).not.toContain("已新增");
  });

  it("表單被拿掉、焦點掉到 body（送出中停用的按鈕或被拿掉的欄位）：焦點移到訊息上，報讀器也會念", () => {
    expect(focusAfter(false, body)).toBe(true);
    expect(focusAfter(false, null)).toBe(true);
  });

  it("焦點已經在別的地方（使用者先點了別處），或表單還在：不搶焦點", () => {
    expect(focusAfter(false, { tagName: "BUTTON" })).toBe(false);
    expect(focusAfter(true, body)).toBe(false);
  });

  it("沒有訊息（還沒新增，或後來別的視窗留下了新的訊息）：不移動焦點", () => {
    const controls = { ...afterSuccess(MESSAGE), message: undefined, messageProps: { message: undefined, ref: { current: { isConnected: true, focus: vi.fn() } } } };
    vi.mocked(dialog.useDialog).mockReturnValueOnce(controls as never);
    const effects: EffectCallback[] = [];
    vi.mocked(useLayoutEffect).mockImplementation((effect) => {
      effects.push(effect);
    });
    renderToStaticMarkup(createElement(FirstGoalForm, { show: false }));
    vi.mocked(useLayoutEffect).mockReset();
    vi.stubGlobal("document", { body, activeElement: body });
    for (const effect of effects) effect();

    expect(controls.messageProps.ref.current.focus).not.toHaveBeenCalled();
  });
});
