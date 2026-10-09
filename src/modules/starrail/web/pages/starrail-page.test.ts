import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OTHER_SESSION, TEST_SESSION, requireSession } from "@/dev/session-stub";
import { mocksOf } from "@/dev/test-helpers";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
// next/font 只能在 Next 的建置裡執行
vi.mock("../game-font", () => ({ gameFont: { variable: "" } }));
vi.mock("../../service/cached", { spy: true });

const cached = mocksOf(await import("../../service/cached"), "cachedAccounts");
const { AccountArea } = await import("./starrail-page");

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
