import { beforeEach, describe, expect, it, vi } from "vitest";
import { FOCUS_FRAME, focusFrameIfLost, framesOf, keepFocusInFrame } from "../focus-frame";

/** 等 React 這次更新做完 拿掉元素之後才看焦點在哪 */
const afterUpdate = () => new Promise<void>((resolve) => queueMicrotask(resolve));

const FRAME_ATTRIBUTE = Object.keys(FOCUS_FRAME).find((key) => key.startsWith("data-"))!;

type Doc = { body: object; activeElement: unknown };
let doc: Doc;

beforeEach(() => {
  doc = { body: { tag: "body" }, activeElement: null };
  doc.activeElement = doc.body;
  vi.stubGlobal("document", doc);
});

type FakeNode = { name: string; frame: boolean; parentElement: FakeNode | null; isConnected: boolean; focus: ReturnType<typeof vi.fn>; contains(other: unknown): boolean; closest(selector: string): FakeNode | null };

/** 只認得外框的屬性 跟瀏覽器的 closest 一樣從自己往外找 */
function node(name: string, parent: FakeNode | null, frame = false): FakeNode {
  const self: FakeNode = {
    name,
    frame,
    parentElement: parent,
    isConnected: true,
    focus: vi.fn(),
    contains(other) {
      for (let current = other as FakeNode | null; current; current = current.parentElement) if (current === self) return true;
      return false;
    },
    closest(selector) {
      if (selector !== `[${FRAME_ATTRIBUTE}]`) return null;
      for (let current: FakeNode | null = self; current; current = current.parentElement) if (current.frame) return current;
      return null;
    },
  };
  return self;
}

/** main 裡有一張卡片 卡片裡有一列 列裡有一顆按鈕 */
function page() {
  const main = node("main", null, true);
  const card = node("card", main, true);
  const row = node("row", card);
  const button = node("button", row);
  return { main, card, row, button };
}
const asElement = (fake: FakeNode) => fake as unknown as HTMLElement;
const remove = (...fakes: FakeNode[]) => {
  for (const fake of fakes) fake.isConnected = false;
};

describe("不會消失的外框（FOCUS_FRAME）", () => {
  it("程式放得了焦點，Tab 不會停在這裡（tabIndex -1）", () => {
    expect(FOCUS_FRAME.tabIndex).toBe(-1);
  });

  it("framesOf 由近到遠列出外面的每一層外框；沒有元素時是空的", () => {
    const { main, card, button } = page();

    expect(framesOf(asElement(button))).toEqual([card, main]);
    expect(framesOf(null)).toEqual([]);
  });
});

describe("帶著焦點被拿掉時（keepFocusInFrame）", () => {
  it("焦點在它裡面、拿掉後掉到 body：這次更新做完後移到最近的外框，不捲動頁面", async () => {
    const { card, main, row, button } = page();
    doc.activeElement = button;

    keepFocusInFrame(asElement(row))!();
    remove(row, button);
    doc.activeElement = doc.body;
    await afterUpdate();

    expect(card.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
    expect(main.focus).not.toHaveBeenCalled();
  });

  it("最近的外框也跟著被拿掉（例如刪掉最後一列、整張卡片換成空狀態）：改用外面一層還在的，最後是 main", async () => {
    const { card, main, row, button } = page();
    doc.activeElement = button;

    keepFocusInFrame(asElement(row))!();
    remove(card, row, button);
    doc.activeElement = doc.body;
    await afterUpdate();

    expect(card.focus).not.toHaveBeenCalled();
    expect(main.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
  });

  it("焦點不在它裡面：不動", async () => {
    const { card, row } = page();

    keepFocusInFrame(asElement(row))!();
    remove(row);
    await afterUpdate();

    expect(card.focus).not.toHaveBeenCalled();
  });

  it("重新算繪時 ref 先清掉再掛上：元素還在、焦點還在它上面，不動", async () => {
    const { card, row, button } = page();
    doc.activeElement = button;

    keepFocusInFrame(asElement(row))!();
    await afterUpdate();

    expect(card.focus).not.toHaveBeenCalled();
  });

  it("拿掉後焦點已經被別的地方接走（例如視窗把焦點還給打開它的按鈕）：不搶", async () => {
    const { card, main, row, button } = page();
    doc.activeElement = button;

    keepFocusInFrame(asElement(row))!();
    remove(row, button);
    doc.activeElement = node("trigger", main);
    await afterUpdate();

    expect(card.focus).not.toHaveBeenCalled();
  });
});

describe("這次更新後焦點掉了才移（focusFrameIfLost）", () => {
  it("掉到 body：移到還在文件裡最近的外框", async () => {
    const { card, main } = page();

    focusFrameIfLost([asElement(card), asElement(main)]);
    await afterUpdate();

    expect(card.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
  });

  it("焦點還在別的元素上，或沒有外框：不動", async () => {
    const { card, main } = page();
    doc.activeElement = node("input", card);

    focusFrameIfLost([asElement(card), asElement(main)]);
    focusFrameIfLost([]);
    await afterUpdate();

    expect(card.focus).not.toHaveBeenCalled();
    expect(main.focus).not.toHaveBeenCalled();
  });
});
