import fs from "node:fs";
import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ModuleInfo } from "@/core/module";
import { OTHER_SESSION, TEST_SESSION, requireSession } from "@/dev/session-stub";
import { readStylesheet } from "@/dev/stylesheet";
import { markup as render, mocksOf } from "@/dev/test-helpers";
import { accountView } from "../../dev/fixtures";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
// next/font 只能在 Next 的建置裡執行
vi.mock("../game-font", () => ({ gameFont: { variable: "" } }));
vi.mock("../../service/cached", { spy: true });

const cached = mocksOf(await import("../../service/cached"), "cachedAccounts");
const { AccountArea, StarrailPage } = await import("./starrail-page");
const { AccountTabs } = await import("../components/account-card");
const { LinkResultBanner, LinkResultProvider } = await import("../components/link-result");
const { StarrailBanner } = await import("../components/starrail-banner");
const { PageTheme } = await import("@/core/ui/page-theme");

const view = (id: number, uid: string) => accountView({ id, uid, nickname: `角色 ${id}`, region: "prod_official_asia" });
const MINE = [view(1, "800000001"), view(2, "800000002")];

/**
 * 頁面交給各區塊的帳號 id 看 account 或 accountId 屬性
 * 只看元素樹 不實際算繪要向 HoYoLAB 查詢的區塊
 */
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
    const page = StarrailPage({ info: { id: "starrail", name: "星穹鐵道", href: "/starrail", description: "", icon: "/icons/ui/train-front.svg" }, searchParams: Promise.resolve({}) });
    const types = typesIn(page);

    expect(types).toContain(LinkResultProvider);
    expect(types.indexOf(LinkResultProvider)).toBeLessThan(types.indexOf(AccountArea));
  });
});

const INFO: ModuleInfo = { id: "starrail", name: "星穹鐵道", href: "/starrail", description: "", icon: "/icons/ui/train-front.svg" };

describe("星穹鐵道頁：整頁主題", () => {
  it("外框是 PageTheme，深色星空鋪滿整個畫面（整頁底色由模組的 page-background.css 換，導覽列維持全站的樣子）；內容直接放在 AppShell 的外框裡，不再是淺灰頁面上的圓角卡片", () => {
    const page = StarrailPage({ info: INFO, searchParams: Promise.resolve({}) }) as ReactElement<{ className?: string }>;
    const classes = page.props.className!.split(" ");

    expect(page.type).toBe(PageTheme);
    expect(classes).toContain("theme-starrail");
    expect(classes.filter((c) => /rounded|border|^-m|^sm:m-|^(?:sm:|lg:)?p[xytb]?-/.test(c))).toEqual([]);
  });

  it("橫幅不再是另一塊星空框：官方標誌直接放在整頁的星空上（標誌就是 h1）", () => {
    const markup = render(createElement(StarrailBanner, { info: INFO }));

    expect(markup).not.toContain("banner-starry");
    expect(markup).toMatch(/<h1[^>]*>.*<img[^>]*alt="星穹鐵道"/);
  });
});

describe("星穹鐵道頁：星空（模組的 page-background.css 與 starrail.css）", () => {
  // 先拿掉註解 選擇器清單裡有這個選擇器的規則都算
  const css = readStylesheet().replace(/\/\*[\s\S]*?\*\//g, "");
  const declarations = (selector: string) =>
    [...css.matchAll(/([^{};]+)\{([^{}]*)\}/g)]
      .filter((m) => m[1].split(",").some((s) => s.trim() === selector))
      .map((m) => m[2])
      .join("\n");
  const PAGE = ":root:has(.theme-starrail:not([data-activity-hidden]))";

  it("星空畫在 body、鋪滿整頁：最上面是自己畫的軌道環與列車軌道（SVG），長頁面跟著拉長", () => {
    expect(declarations(`${PAGE} body`)).toMatch(/background-image:\s*url\("\/images\/starrail-sky\.svg"\),\s*var\(--sr-sky\)/);
    expect(fs.existsSync(new URL("../../../../../public/images/starrail-sky.svg", import.meta.url))).toBe(true);
  });

  it("星空的 SVG 是靜態的：當成 body 背景圖的 SVG 只要有動畫，頁面開著時每一格都在重畫整頁（星點不閃爍）", () => {
    const svg = fs.readFileSync(new URL("../../../../../public/images/starrail-sky.svg", import.meta.url), "utf8");

    expect(svg).not.toMatch(/animation|@keyframes|<animate|<set\b/);
  });

  it("html 自己有底色：body 的星空才不會被當成整個畫布的背景、照視窗的高度一段一段重複", () => {
    expect(declarations(PAGE)).toMatch(/background-color:/);
  });

  it("body 讀得到星空的變數：--sr-sky 放在 :root（只放星空，不放調色盤，導覽列不受影響），不是只在外框上（body 是外框的祖先）", () => {
    expect(declarations(PAGE)).toMatch(/--sr-sky:/);
    expect(declarations(PAGE)).toMatch(/--sr-sky-size:/);
  });

  it("彈出視窗自己畫星空底：整頁主題的 class 只能放在 PageTheme 上，視窗不再掛 theme-starrail", () => {
    expect(declarations(".sr-dialog")).toMatch(/background-image:\s*var\(--sr-sky\)/);
  });
});
