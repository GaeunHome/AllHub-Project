import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../auth", () => import("@/dev/session-stub"));
vi.mock("./cached", () => ({ cachedNotificationCounts: vi.fn(), cachedNotificationList: vi.fn() }));

const { NotificationsPage } = await import("./notifications-page");

type Props = { className?: string; children?: ReactNode; "aria-labelledby"?: string };

describe("通知頁的版面", () => {
  it("寬螢幕：通知清單在左、提醒方式在右（固定寬度的一欄），頁首撐滿；排欄不靠第幾個子元素", () => {
    const page = NotificationsPage({ modules: [], searchParams: Promise.resolve({}) }) as ReactElement<Props>;
    const classes = page.props.className!.split(" ");
    const children = (page.props.children as ReactNode[]).filter((child): child is ReactElement<Props> => isValidElement(child));

    expect(classes).toEqual(expect.arrayContaining(["xl:grid", "xl:grid-cols-[minmax(0,1fr)_24rem]", "xl:items-start"]));
    expect(classes.filter((c) => /(?:nth|last|only)-child/.test(c))).toEqual([]);
    expect(children.at(-1)!.props["aria-labelledby"]).toBe("notification-settings");
  });
});
