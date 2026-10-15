import { useEffect, useEffectEvent, type EffectCallback } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// effect 只在瀏覽器跑 直接呼叫 hook 把 effect 收起來自己跑
vi.mock("react", { spy: true });
const router = { replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const { useOpenFromLink } = await import("./open-from-link");

/** hook 要在元件裡呼叫 所以直接呼叫這個元件 不經過 React 算繪 */
function Probe(enabled: boolean, open: () => void) {
  useOpenFromLink(enabled, open, "/savings/settings#accounts");
}

function mount(enabled: boolean) {
  const open = vi.fn();
  const effects: EffectCallback[] = [];
  vi.mocked(useEffect).mockImplementation((effect) => void effects.push(effect));
  vi.mocked(useEffectEvent).mockImplementation(((fn: () => void) => fn) as never);
  Probe(enabled, open);
  return { open, runEffects: () => effects.forEach((effect) => effect()) };
}

beforeEach(() => {
  router.replace.mockClear();
});

afterEach(() => {
  vi.mocked(useEffect).mockReset();
  vi.mocked(useEffectEvent).mockReset();
});

describe("從別頁的「新增帳戶」連過來（?add=account）", () => {
  it("打開一次視窗，網址換成不帶參數的（不留在上一頁的紀錄裡）：重新整理或按上一頁都不會再打開", () => {
    const { open, runEffects } = mount(true);

    runEffects();

    expect(open).toHaveBeenCalledOnce();
    expect(router.replace).toHaveBeenCalledWith("/savings/settings#accounts", { scroll: false });
  });

  it("網址沒有參數_不打開、也不動網址", () => {
    const { open, runEffects } = mount(false);

    runEffects();

    expect(open).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });
});
