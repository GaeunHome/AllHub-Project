import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ModuleInfo } from "@/core/module";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("../actions", () => ({ addStreamerAction: vi.fn(), syncSubscriptionsAction: vi.fn(), removeStreamerAction: vi.fn(), setStreamerNotifyAction: vi.fn() }));

const { TwitchPage } = await import("./twitch-page");

type Props = { className?: string; children?: ReactNode; "aria-labelledby"?: string };
const INFO: ModuleInfo = { id: "twitch", name: "Twitch", href: "/twitch", description: "", icon: "/icons/brands/twitch.svg", accent: "violet" };

describe("Twitch 頁的版面", () => {
  it("超寬螢幕：最近的開關台紀錄移到右邊一欄（像 Twitch 的聊天室），頁首與輸入框撐滿；col-span 寫在元素自己身上", () => {
    const page = TwitchPage({ info: INFO }) as ReactElement<Props>;
    const classes = page.props.className!.split(" ");
    const children = (page.props.children as ReactNode[]).filter((child): child is ReactElement<Props> => isValidElement(child));

    expect(classes).toEqual(expect.arrayContaining(["2xl:grid", "2xl:grid-cols-[minmax(0,1fr)_24rem]", "2xl:items-start"]));
    expect(classes.filter((c) => /child/.test(c))).toEqual([]);
    expect(children[0].props.className!.split(" ")).toContain("2xl:col-span-2");
    expect(children.at(-1)!.props["aria-labelledby"]).toBe("tw-events");
  });
});
