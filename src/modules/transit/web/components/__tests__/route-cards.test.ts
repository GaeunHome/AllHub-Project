import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TEST_SESSION } from "@/dev/session-stub";
import { markup, textOf } from "@/dev/test-helpers";

vi.mock("next/navigation", () => import("@/dev/navigation-stub"));
vi.mock("@/core/ui/more-menu", () => import("@/dev/more-menu-stub"));
vi.mock("@/core/ui/live-clock", { spy: true });
vi.mock("../../actions", () => ({ deleteRouteAction: vi.fn(), setTrackedAction: vi.fn() }));
vi.mock("../../use-live-reading", () => ({ useLiveReading: () => ({ kind: "none" }) }));

const { useClockStep } = await import("@/core/ui/live-clock");
const { RouteCard, TrackedCard } = await import("../route-cards");

const NOW = Date.parse("2026-11-05T22:34:00+08:00");
const stamp = (clock: string) => Date.parse(`2026-11-05T${clock}:00+08:00`);
const departure = (overrides = {}) => ({ at: stamp("22:40"), arrivesAt: stamp("23:35"), trainNo: "150", kind: "自強(3000)", toward: "高雄", ...overrides });
const route = (overrides = {}) => ({ id: 1, userId: TEST_SESSION.id, mode: "tra" as const, system: "", line: "150", originId: "1000", originName: "臺北", destinationId: "4400", destinationName: "高雄", tracked: false, createdAt: new Date(), ...overrides });
const card = (routeFields = {}, departures: ReturnType<typeof departure>[] = [departure()], problem: string | null = null) => markup(createElement(RouteCard, { route: route(routeFields), departures, problem, status: null }));

beforeEach(() => {
  vi.mocked(useClockStep).mockReset().mockReturnValue(NOW);
});

describe("常用路線的班次卡", () => {
  it("使用者要的：上面是車種與車次 中間是倒數 下面是起訖站與時間", () => {
    const html = card();

    expect(html).toMatch(/chip-danger[^>]*>自強\(3000\)/);
    expect(textOf(html, { spaced: true })).toMatch(/自強\(3000\) 150 車次 .*6 分 0 秒.*臺北 22:40 高雄 23:35/);
  });

  it("使用者不喜歡灰字：拿掉幾點開的小字 整張卡沒有灰色的字", () => {
    const html = card();

    expect(textOf(html)).not.toContain("開");
    expect(html).not.toContain("text-ink-soft");
  });

  it("捷運寫方向 迄站也寫方向 沒有到站時間就不寫", () => {
    const html = card({ mode: "metro", system: "TRTC", line: "", originName: "府中", destinationName: "南港展覽館" }, [departure({ arrivesAt: null, trainNo: null, kind: null })]);
    const text = textOf(html, { spaced: true });

    expect(text).toContain("往南港展覽館");
    expect(text).toMatch(/府中 22:40 往南港展覽館 /);
    expect(html).not.toContain("chip");
  });

  it("公車寫路線", () => {
    const text = textOf(card({ mode: "bus", system: "Taipei", line: "307", originName: "板橋", destinationName: "臺北車站" }, [departure({ arrivesAt: null, trainNo: null, kind: null })]), { spaced: true });

    expect(text).toMatch(/307 .*板橋 22:40 往臺北車站/);
  });

  it("以前存的路線沒有車次_標題寫整段路 車種照下一班", () => {
    const html = card({ line: "" });

    expect(textOf(html)).toContain("臺北 → 高雄");
    expect(html).toContain("chip-danger");
  });

  it("明天的班次寫出明天 才不會以為今天還有車", () => {
    const tomorrow = departure({ at: Date.parse("2026-11-06T06:00:00+08:00"), arrivesAt: Date.parse("2026-11-06T09:00:00+08:00") });

    expect(textOf(card({}, [tomorrow]), { spaced: true })).toContain("明天 06:00");
  });

  it("讀不到時說讀不到 車站照樣看得到", () => {
    const text = textOf(card({}, [], "TDX 回 500"));

    expect(text).toContain("資料讀不到");
    expect(text).toContain("臺北");
  });

  it("這班車開走了_說明白", () => {
    expect(textOf(card({}, [departure({ at: stamp("08:00"), arrivesAt: stamp("09:00") })]))).toContain("這班車今天已開走");
  });
});

describe("追蹤中的大卡", () => {
  it("使用者不喜歡灰字：拿掉灰色的字", () => {
    const html = markup(createElement(TrackedCard, { route: route({ tracked: true }), departures: [departure()], problem: null, status: null }));

    expect(html).not.toContain("text-ink-soft");
    expect(textOf(html)).toContain("150 車次");
  });
});
