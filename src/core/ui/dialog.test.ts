import fs from "node:fs";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { FormState } from "./form-message";
import { Dialog, DialogButton, dialogFormAction, dialogReducer, isBackdropClick, returnFocusTarget, shownMessage, showDialog, useDialog, useDialogForm } from "./dialog";

const textOf = (markup: string) => markup.replace(/<[^>]+>/g, "");
const amountInput = createElement("input", { name: "amount" });
type DialogProps = Parameters<typeof Dialog>[0];
type DialogButtonProps = Parameters<typeof DialogButton>[0];
/** 內容照 JSX 的寫法放在第三個參數；props 的型別要求 children，所以先轉型 */
const renderDialog = (props: Omit<DialogProps, "children">, child: ReactNode = amountInput) => renderToStaticMarkup(createElement(Dialog, props as DialogProps, child));

describe("彈出視窗（core/ui/dialog）", () => {
  it("關著時只有 dialog 外框，內容還沒算繪（表單每次打開都是新的）", () => {
    const markup = renderDialog({ open: false, onClose: vi.fn(), title: "記一筆" });

    expect(markup).toMatch(/^<dialog[^>]*class="dialog dialog-md[^"]*"/);
    expect(markup).not.toContain("open");
    expect(markup).not.toContain('name="amount"');
  });

  it("開著時：標題列有標題與關閉的 X（type=button、正方形），dialog 以標題命名；內容在可捲動的本文裡", () => {
    const markup = renderDialog({ open: true, onClose: vi.fn(), title: "記一筆", size: "sm", className: "sr-dialog" });

    const dialog = markup.match(/^<dialog[^>]*>/)![0];
    expect(dialog).toContain("dialog-sm");
    expect(dialog).toContain("sr-dialog");
    const labelledBy = dialog.match(/aria-labelledby="([^"]+)"/)![1];
    expect(markup).toMatch(new RegExp(`<h2[^>]*id="${labelledBy}"[^>]*>記一筆</h2>`));
    const close = markup.match(/<button[^>]*aria-label="關閉"[^>]*>/)![0];
    expect(close).toContain('type="button"');
    expect(close).toContain("btn-icon");
    expect(markup).toMatch(/<div class="dialog-body[^"]*">.*name="amount"/);
    expect(markup.indexOf("dialog-header")).toBeLessThan(markup.indexOf("dialog-body"));
  });

  it("標題列跟卡片的 CardHeader 同一個樣子：圖示方塊、標題、右邊的關閉鈕", () => {
    const markup = renderDialog({ open: true, onClose: vi.fn(), title: "記一筆", icon: createElement("span", { className: "icon" }) });

    const header = markup.slice(markup.indexOf("dialog-header"), markup.indexOf("dialog-body"));
    expect(header).toContain('class="icon-tile size-9 rounded-xl"');
    expect(header).toMatch(/<h2[^>]*class="min-w-0 flex-1 basis-24 text-lg font-semibold text-ink"/);
    expect(header.indexOf("<h2")).toBeLessThan(header.indexOf('aria-label="關閉"'));
  });

  it("describedBy：打開時報讀器連同標題一起念的說明（內容跟視窗一起出現，live region 來不及念）", () => {
    const markup = renderDialog({ open: true, onClose: vi.fn(), title: "邀請連結已建立", describedBy: "summary warning" }, createElement("p", { id: "summary" }, "已建立邀請連結"));

    expect(markup).toMatch(/^<dialog[^>]*aria-describedby="summary warning"/);
    expect(renderDialog({ open: true, onClose: vi.fn(), title: "記一筆" })).not.toContain("aria-describedby");
  });

  it("size=full：滿版的大面板（角色詳情、主播詳情）用 dialog-full；其他尺寸照舊", () => {
    expect(renderDialog({ open: true, onClose: vi.fn(), title: "希兒", size: "full" })).toMatch(/^<dialog[^>]*class="dialog dialog-full"/);
    expect(renderDialog({ open: true, onClose: vi.fn(), title: "記一筆", size: "lg" })).toMatch(/^<dialog[^>]*class="dialog dialog-lg"/);
  });

  it("沒有標題時不畫標題列：內容自己帶標題與關閉按鈕，用 labelledBy 指定名稱", () => {
    const markup = renderDialog({ open: true, onClose: vi.fn(), labelledBy: "detail-title", bare: true }, createElement("h3", { id: "detail-title" }, "姬子"));

    expect(markup).toMatch(/^<dialog[^>]*aria-labelledby="detail-title"/);
    expect(markup).not.toContain("dialog-header");
    expect(markup).not.toContain('aria-label="關閉"');
    expect(textOf(markup)).toBe("姬子");
  });
});

describe("打開與關閉（showDialog）", () => {
  const fakeDialog = (open = false) => {
    const field = { focus: vi.fn() };
    const dialog = {
      open,
      showModal: vi.fn(() => {
        dialog.open = true;
      }),
      close: vi.fn(() => {
        dialog.open = false;
      }),
      querySelector: vi.fn((selector: string) => (selector === "[data-autofocus]" ? field : null)),
    };
    return { dialog, field };
  };

  it("用 showModal 打開（焦點鎖在裡面、背景不能點），再把焦點交給標了 data-autofocus 的欄位", () => {
    const { dialog, field } = fakeDialog();

    showDialog(dialog as unknown as HTMLDialogElement);

    expect(dialog.showModal).toHaveBeenCalledOnce();
    expect(field.focus).toHaveBeenCalledOnce();
  });

  it("已經開著時不再呼叫 showModal（會丟錯），焦點也不搶", () => {
    const { dialog, field } = fakeDialog(true);

    showDialog(dialog as unknown as HTMLDialogElement);

    expect(dialog.showModal).not.toHaveBeenCalled();
    expect(field.focus).not.toHaveBeenCalled();
  });

  it("回傳的函式會關掉視窗：收起、卸載或頁面被 Activity 藏起來時都要關，開著的 modal 會讓整份文件不能操作", () => {
    const { dialog } = fakeDialog();

    const cleanup = showDialog(dialog as unknown as HTMLDialogElement);
    cleanup();

    expect(dialog.close).toHaveBeenCalledOnce();
    expect(dialog.open).toBe(false);
  });
});

describe("按鈕＋彈出視窗（DialogButton、useDialog）", () => {
  it("按鈕不會送出表單，標明會打開對話框、目前關著並指向那個 dialog；內容點了才出現", () => {
    const markup = renderToStaticMarkup(createElement(DialogButton, { label: "臨時存款", title: "臨時存款", buttonClassName: "btn-secondary" } as DialogButtonProps, createElement("input", { name: "note" })));

    const button = markup.match(/<button[^>]*>/)![0];
    expect(button).toContain('type="button"');
    expect(button).toContain('aria-haspopup="dialog"');
    expect(button).toContain('aria-expanded="false"');
    expect(button).toContain('class="btn-secondary"');
    const controls = button.match(/aria-controls="([^"]+)"/)![1];
    expect(markup).toMatch(new RegExp(`<dialog[^>]*id="${controls}"`));
    expect(markup).not.toContain('name="note"');
  });

  it("size 交給視窗：清單列打開的詳情也能用滿版的大面板（主播詳情）", () => {
    const markup = renderToStaticMarkup(createElement(DialogButton, { label: "Hanabi", title: "Hanabi", size: "full" } as DialogButtonProps, createElement("p", null, "詳情")));

    expect(markup).toMatch(/<dialog[^>]*class="dialog dialog-full"/);
  });

  it("內容是函式時，視窗關著就不呼叫（點了才算繪）", () => {
    const children = vi.fn(() => createElement("input", { name: "note" }));

    // 函式內容只能從 JSX 的 children 傳；createElement 的第三個參數型別只收 ReactNode
    renderToStaticMarkup(createElement(DialogButton, { label: "臨時存款", title: "臨時存款" } as DialogButtonProps, children as unknown as ReactNode));

    expect(children).not.toHaveBeenCalled();
  });

  it("useDialog：自己排版時，按鈕與 Dialog 各展開一組屬性，兩邊用同一個 id 對起來", () => {
    function Probe() {
      const dialog = useDialog();
      return createElement(
        "div",
        null,
        createElement("button", { ...dialog.triggerProps, className: "btn-secondary" }, "記一筆"),
        createElement(Dialog, { ...dialog.dialogProps, title: "記一筆" } as DialogProps, amountInput),
        dialog.message && createElement("span", null, dialog.message),
      );
    }

    const markup = renderToStaticMarkup(createElement(Probe));

    const button = markup.match(/<button[^>]*>/)![0];
    expect(button).toContain('type="button"');
    expect(button).toContain('aria-haspopup="dialog"');
    expect(button).toContain('aria-expanded="false"');
    const controls = button.match(/aria-controls="([^"]+)"/)![1];
    expect(markup).toMatch(new RegExp(`<dialog[^>]*id="${controls}"`));
    expect(markup).not.toContain('name="amount"');
  });
});

describe("視窗裡的表單（useDialogForm）", () => {
  it("給 <form> 的是 onSubmit 與 ref，不是 action：React 的 <form action> 送完一定清空欄位，失敗時打的字會不見", () => {
    function Probe() {
      const form = useDialogForm(vi.fn(), vi.fn());
      return createElement("form", { ...form.formProps, className: "stack" }, createElement("input", { name: "amount" }));
    }

    const markup = renderToStaticMarkup(createElement(Probe));

    expect(markup).toBe('<form class="stack"><input name="amount"/></form>');
  });

  it("一開始沒有結果、也不在送出中", () => {
    let result: ReturnType<typeof useDialogForm> | undefined;
    function Probe() {
      result = useDialogForm(vi.fn(), vi.fn());
      return null;
    }

    renderToStaticMarkup(createElement(Probe));

    expect(result?.state).toEqual({});
    expect(result?.pending).toBe(false);
  });
});

describe("視窗裡的表單送出後（dialogFormAction）", () => {
  type LinkState = FormState & { accountId?: number; roles?: string[] };
  /** 回傳固定結果的 Server Action 替身 */
  const returning = <S extends FormState>(result: S) => vi.fn<(previous: S, formData: FormData) => Promise<S>>(async () => result);

  it("失敗：不呼叫 onDone（視窗留著、保留打的字），結果原樣交給表單顯示錯誤", async () => {
    const onDone = vi.fn();
    const action = returning<FormState>({ error: "金額要是 1 到 1 億的整數" });

    const result = await dialogFormAction(action, onDone)({}, new FormData());

    expect(result).toEqual({ error: "金額要是 1 到 1 億的整數" });
    expect(onDone).not.toHaveBeenCalled();
  });

  it("成功：帶著訊息呼叫 onDone（關掉視窗、把訊息留在按鈕旁邊）", async () => {
    const onDone = vi.fn();
    const formData = new FormData();
    const action = returning<FormState>({ message: "已記錄 $3,000" });

    const result = await dialogFormAction(action, onDone)({ error: "上一次的錯誤" }, formData);

    expect(action).toHaveBeenCalledWith({ error: "上一次的錯誤" }, formData);
    expect(result).toEqual({ message: "已記錄 $3,000" });
    expect(onDone).toHaveBeenCalledExactlyOnceWith("已記錄 $3,000", { message: "已記錄 $3,000" });
  });

  it("成功但沒有訊息：照樣關掉視窗", async () => {
    const onDone = vi.fn();

    await dialogFormAction(returning<FormState>({}), onDone)({}, new FormData());

    expect(onDone).toHaveBeenCalledWith(undefined, {});
  });

  it("onDone 也拿得到整個結果（例如剛連結的帳號 id）", async () => {
    const onDone = vi.fn();
    const result: LinkState = { message: "已連結 開拓者", accountId: 9 };

    await dialogFormAction(returning(result), onDone)({}, new FormData());

    expect(onDone).toHaveBeenCalledExactlyOnceWith("已連結 開拓者", result);
  });

  it("有下一步的表單（例如還要選伺服器）：isDone 說還沒完成就不呼叫 onDone，視窗留著", async () => {
    const onDone = vi.fn();
    const isDone = (result: LinkState) => !result.error && !result.roles;

    const result = await dialogFormAction(returning<LinkState>({ roles: ["900000001", "800000002"] }), onDone, isDone)({}, new FormData());

    expect(result).toEqual({ roles: ["900000001", "800000002"] });
    expect(onDone).not.toHaveBeenCalled();
  });
});

describe("按鈕與視窗的狀態（dialogReducer）", () => {
  it("打開：清掉上一次的成功訊息", () => {
    expect(dialogReducer({ open: false, message: "已記錄 $3,000" }, { type: "open" })).toEqual({ open: true, message: undefined });
  });

  it("成功（done）：關掉視窗並留下這次的訊息", () => {
    expect(dialogReducer({ open: true }, { type: "done", message: "已儲存「旅遊基金」" })).toEqual({ open: false, message: "已儲存「旅遊基金」" });
  });

  it("取消（close）：只關掉視窗，不動訊息", () => {
    expect(dialogReducer({ open: true, message: "已記錄 $3,000" }, { type: "close" })).toEqual({ open: false, message: "已記錄 $3,000" });
    expect(dialogReducer({ open: true }, { type: "close" })).toEqual({ open: false });
  });
});

describe("關掉視窗後焦點放哪裡（returnFocusTarget）", () => {
  const element = (isConnected: boolean) => ({ isConnected });

  it("焦點掉了：回到打開視窗的按鈕", () => {
    const trigger = element(true);

    expect(returnFocusTarget(true, trigger, element(true))).toBe(trigger);
  });

  it("按鈕已經不見了（例如記滿後「記一筆」消失）：改放到備援的位置（結果訊息），不掉到 body", () => {
    const fallback = element(true);

    expect(returnFocusTarget(true, element(false), fallback)).toBe(fallback);
    expect(returnFocusTarget(true, null, fallback)).toBe(fallback);
  });

  it("按鈕與備援都不在：不移動", () => {
    expect(returnFocusTarget(true, element(false), element(false))).toBeNull();
    expect(returnFocusTarget(true, null, null)).toBeNull();
  });

  it("焦點已經被別的地方接走（例如連結帳號後的結果橫幅）：不搶回來", () => {
    expect(returnFocusTarget(false, element(true), element(true))).toBeNull();
  });
});

describe("同一頁只留最新一則成功訊息（shownMessage）", () => {
  it("沒有包在範圍裡：照樣顯示自己的訊息", () => {
    expect(shownMessage("已記錄 $3,000", "row-1", null)).toBe("已記錄 $3,000");
  });

  it("最新的一則是自己：顯示", () => {
    expect(shownMessage("已記錄 $3,000", "row-1", { latest: "row-1" })).toBe("已記錄 $3,000");
  });

  it("後來別的視窗也成功了，或範圍被清空（頁面被藏起來）：不顯示，免得舊訊息越積越多、內容過期", () => {
    expect(shownMessage("已記錄 $3,000", "row-1", { latest: "row-2" })).toBeUndefined();
    expect(shownMessage("已記錄 $3,000", "row-1", { latest: null })).toBeUndefined();
  });
});

describe("點背景關閉（isBackdropClick）", () => {
  const dialog = {} as EventTarget;
  const inside = {} as EventTarget;

  it("按下與放開都在 dialog 本身（卡片外的背景）才算", () => {
    expect(isBackdropClick(dialog, dialog, dialog)).toBe(true);
  });

  it("在卡片裡按下、拖到背景放開（例如選取文字）不算，反過來也不算", () => {
    expect(isBackdropClick(inside, dialog, dialog)).toBe(false);
    expect(isBackdropClick(dialog, inside, dialog)).toBe(false);
    expect(isBackdropClick(null, dialog, dialog)).toBe(false);
  });
});

describe("開視窗時背後的頁面（globals.css）", () => {
  const css = fs.readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
  const rule = (selector: string) => new RegExp(`^\\s*${selector.replace(/[.()[\]]/g, "\\$&")} \\{([^}]*)\\}`, "m").exec(css)?.[1] ?? "";

  it("html 一律保留捲軸的位置：沒有捲軸的頁面打開視窗時，整頁不會左移捲軸的寬度", () => {
    expect(rule("html")).toMatch(/scrollbar-gutter:\s*stable/);
  });

  it("視窗開著時只鎖住背後的捲動，不再臨時加上捲軸的位置", () => {
    const open = rule("html:has(.dialog[open])");

    expect(open).toMatch(/overflow:\s*hidden/);
    expect(open).not.toContain("scrollbar-gutter");
  });
});

describe("滿版的大面板（globals.css 的 .dialog-full）", () => {
  // 先拿掉註解：規則前面的註解不能算進選擇器
  const css = fs.readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  /** 每一條 .dialog-full 規則的內容，連同它所在的最內層 @media（沒有就是 null） */
  const fullRules = () => {
    const found: { media: string | null; body: string }[] = [];
    const stack: (string | null)[] = [];
    for (const token of css.matchAll(/([^{};]+)\{|\}/g)) {
      if (token[0] === "}") {
        stack.pop();
        continue;
      }
      const head = token[1].trim();
      stack.push(head.startsWith("@media") ? head : null);
      if (head === ".dialog-full") found.push({ media: stack.findLast((m) => m !== null) ?? null, body: css.slice(token.index + token[0].length, css.indexOf("}", token.index)) });
    }
    return found;
  };

  it("手機：整個螢幕（高度跟著網址列伸縮），不留圓角與邊框", () => {
    const mobile = fullRules().find((r) => r.media === null)!.body;

    expect(mobile).toMatch(/height:\s*100dvh/);
    expect(mobile).toMatch(/max-height:\s*none/);
    expect(mobile).toMatch(/border-radius:\s*0/);
    expect(mobile).toMatch(/border-width:\s*0/);
  });

  it("寬螢幕：四周只留 1rem，寬高不設上限（不像 sm～lg 是置中的固定寬度卡片）", () => {
    const wide = fullRules().find((r) => r.media === "@media (min-width: 40rem)")!.body;

    expect(wide).toMatch(/inset:\s*1rem/);
    expect(wide).toMatch(/width:\s*auto/);
    expect(wide).toMatch(/height:\s*auto/);
    expect(wide).toMatch(/max-width:\s*none/);
    expect(wide).toMatch(/max-height:\s*none/);
  });
});
