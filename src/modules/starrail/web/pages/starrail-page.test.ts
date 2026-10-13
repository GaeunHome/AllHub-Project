import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OTHER_SESSION, TEST_SESSION, requireSession } from "@/dev/session-stub";
import { mocksOf } from "@/dev/test-helpers";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
// next/font 只能在 Next 的建置裡執行
vi.mock("../game-font", () => ({ gameFont: { variable: "" } }));
vi.mock("../../service/cached", { spy: true });

const cached = mocksOf(await import("../../service/cached"), "cachedAccounts");
const { AccountArea, StarrailPage } = await import("./starrail-page");
const { AccountTabs } = await import("../components/account-card");
const { LinkResultBanner, LinkResultProvider } = await import("../components/link-result");

const view = (id: number, uid: string) => ({ id, uid, nickname: `角色 ${id}`, region: "prod_official_asia", level: 70, staminaAlertThreshold: null, cookieInvalid: false });
const MINE = [view(1, "800000001"), view(2, "800000002")];

/** 頁面交給各區塊的帳號 id（account 或 accountId 屬性）；只看元素樹，不實際算繪向 HoYoLAB 查詢的區塊 */
function accountIdsIn(node: ReactNode, found = new Set<number>()): Set<number> {
  if (Array.isArray(node)) node.forEach((child) => accountIdsIn(child, found));
  else if (isValidElement<{ account?: { id: number }; accountId?: number; children?: ReactNode }>(node)) {
    if (node.props.account) found.add(node.props.account.id);
    if (typeof node.props.accountId === "number") found.add(node.props.accountId);
    accountIdsIn(node.props.children, found);
  }
  return found;
}

const area = (account?: string) => AccountArea({ searchParams: Promise.resolve(account ? { account } : {}) });

beforeEach(() => {
  requireSession.mockReset();
  cached.cachedAccounts.mockReset().mockResolvedValue(MINE);
});

describe("星穹鐵道頁：一次只看自己的一個帳號", () => {
  it("帳號清單用登入者的 id 讀（每個人只看得到自己連結的帳號）", async () => {
    requireSession.mockResolvedValue(OTHER_SESSION);

    await area();

    expect(cached.cachedAccounts).toHaveBeenCalledWith(OTHER_SESSION.id);
  });

  it("?account= 是自己的帳號_每一塊都顯示那個帳號", async () => {
    expect([...accountIdsIn(await area("2"))]).toEqual([2]);
    expect(cached.cachedAccounts).toHaveBeenCalledWith(TEST_SESSION.id);
  });

  it("?account= 是別人的帳號 id_當作不存在，改看自己的第一個帳號", async () => {
    expect([...accountIdsIn(await area("99"))]).toEqual([1]);
  });
});

/** 直接子元素裡有 key 以 prefix 開頭的元素的那一層（頁面用 key 區分各區塊） */
function parentOfKey(node: ReactNode, prefix: string): { className?: string } | null {
  if (Array.isArray(node)) return node.map((child) => parentOfKey(child, prefix)).find(Boolean) ?? null;
  if (!isValidElement<{ className?: string; children?: ReactNode }>(node)) return null;
  const children = [node.props.children].flat();
  if (children.some((child) => isValidElement(child) && String(child.key).startsWith(prefix))) return node.props;
  return parentOfKey(node.props.children, prefix);
}

describe("星穹鐵道頁：超寬螢幕的並排", () => {
  it("兌換碼與簽到紀錄同一列：兩張卡等高（格子不貼齊上方，卡片撐滿整格）", async () => {
    const row = parentOfKey(await area(), "redeem-");

    expect(row?.className).toContain("2xl:grid-cols-2");
    expect(row?.className).not.toContain("items-start");
    expect(row?.className).toContain("[&>section>.sr-panel]:flex-1");
  });

  it("簽到紀錄收起時兌換碼卡片比內容高：內容由兌換碼卡片自己的格線放在中間（見 redeem-panel）；展開更早的紀錄後回到上方，不會停在很高的卡片中間", async () => {
    const row = parentOfKey(await area(), "redeem-");

    expect(row?.className).toContain("2xl:has-[details[open]]:[&>section>form.sr-panel]:grid-rows-[auto_auto_1fr]");
    // 兌換碼卡片在超寬螢幕是格線：justify-content 置中會讓唯一的一欄縮成內容的寬度
    expect(row?.className).not.toMatch(/form\.sr-panel\]:justify-/);
  });

  it("開拓月曆與終局戰績同一列：內容高度差很多，各自照內容的高度（標題列另外對齊）", async () => {
    const row = parentOfKey(await area(), "ledger-");

    expect(row?.className).toContain("2xl:grid-cols-2");
    expect(row?.className).toContain("items-start");
  });
});

/** 元素樹裡依出現順序列出的元素類型 */
function typesIn(node: ReactNode, found: unknown[] = []): unknown[] {
  if (Array.isArray(node)) node.forEach((child) => typesIn(child, found));
  else if (isValidElement<{ children?: ReactNode }>(node)) {
    found.push(node.type);
    typesIn(node.props.children, found);
  }
  return found;
}

describe("連結帳號的結果", () => {
  it("顯示在帳號分頁上方：只交給選到的帳號（剛連結的那個才會顯示）", async () => {
    const tree = await area("2");
    const types = typesIn(tree);

    expect(types).toContain(LinkResultBanner);
    expect(types.indexOf(LinkResultBanner)).toBeLessThan(types.indexOf(AccountTabs));
    expect([...accountIdsIn(tree)]).toEqual([2]);
  });

  it("整個帳號區包在同一份結果裡：頁面最下面的視窗、還沒有帳號時的整頁表單都交得到帳號分頁上方", () => {
    const page = StarrailPage({ info: { id: "starrail", name: "星穹鐵道", href: "/starrail", description: "" }, searchParams: Promise.resolve({}) });
    const types = typesIn(page);

    expect(types).toContain(LinkResultProvider);
    expect(types.indexOf(LinkResultProvider)).toBeLessThan(types.indexOf(AccountArea));
  });
});

