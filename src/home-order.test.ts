import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { stubAllEnv } from "@/dev/test-env";

// 使用者要天氣與提醒與倒數放在首頁最前面 比 Twitch 還前面
// core 不能 import 模組 所以順序寫在 src/app 這裡檢查

stubAllEnv();

const { default: Page } = await import("./app/(main)/page");

type Entry = { id: string };
type Slots = { top: Entry[]; wide: Entry[]; half: Entry[]; compact: Entry[] };

describe("首頁的順序", () => {
  it("最上面是天氣與提醒與倒數，天氣在前；再來 Twitch、YouTube，最後星穹鐵道、理財", () => {
    const { top, wide, half, compact } = (Page() as ReactElement<Slots>).props;

    expect(top.map((card) => card.id)).toEqual(["weather", "reminders"]);
    expect(wide.map((card) => card.id)).toEqual(["twitch", "youtube"]);
    expect(half.map((card) => card.id)).toEqual(["starrail"]);
    expect(compact.map((card) => card.id)).toEqual(["savings"]);
  });
});
