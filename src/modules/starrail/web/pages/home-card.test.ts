import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OTHER_SESSION, TEST_SESSION, requireSession } from "@/dev/session-stub";
import { mocksOf } from "@/dev/test-helpers";
import { parseDailyNote } from "../../lib/responses";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("../../service/cached", { spy: true });
vi.mock("../../service/accounts", { spy: true });

const cached = mocksOf(await import("../../service/cached"), "cachedAccounts", "cachedDailyNote");
const accounts = mocksOf(await import("../../service/accounts"), "syncCookieInvalid");
const { after } = await import("next/server");
const { AccountNote, StarrailNotes } = await import("./home-card");

const textOf = (markup: string) => markup.replace(/<[^>]+>/g, "");
const view = (id: number, nickname: string, region = "prod_official_cht", cookieInvalid = false) => ({ id, uid: `80000000${id}`, nickname, region, level: 70, staminaAlertThreshold: null, cookieInvalid });
const IMG = "https://act-webstatic.hoyoverse.com/darkmatter/hkrpg/mock/avatar";

const fetchedAt = new Date();
const okNote = {
  ok: true as const,
  note: parseDailyNote({
    current_stamina: 231,
    max_stamina: 300,
    stamina_recover_time: 22080,
    current_reserve_stamina: 1200,
    accepted_epedition_num: 4,
    total_expedition_num: 4,
    current_train_score: 400,
    max_train_score: 500,
  }),
  expeditions: [
    { name: "看不見的手", status: "ongoing" as const, remainingSeconds: 15_120, avatars: [`${IMG}/1001.png`, `${IMG}/1002.png`], itemUrl: null },
    { name: "陽光下的迷宮", status: "finished" as const, remainingSeconds: 0, avatars: [`${IMG}/1105.png`], itemUrl: null },
  ],
  fetchedAt,
  cookieInvalid: false as const,
};

/** 列表交給每一列的帳號 id；只看元素樹，不實際向 HoYoLAB 查 */
function accountIdsIn(node: ReactNode, found: number[] = []): number[] {
  if (Array.isArray(node)) node.forEach((child) => accountIdsIn(child, found));
  else if (isValidElement<{ account?: { id: number }; children?: ReactNode }>(node)) {
    if (node.type === AccountNote && node.props.account) found.push(node.props.account.id);
    accountIdsIn(node.props.children, found);
  }
  return found;
}

beforeEach(() => {
  requireSession.mockReset();
  vi.mocked(after).mockReset();
  cached.cachedAccounts.mockReset().mockResolvedValue([]);
  cached.cachedDailyNote.mockReset().mockResolvedValue(okNote);
  accounts.syncCookieInvalid.mockReset().mockResolvedValue(true);
});

describe("首頁「即時便箋」（星穹鐵道）：帳號清單", () => {
  it("用登入者的 id 讀帳號：只看得到自己連結的", async () => {
    requireSession.mockResolvedValue(OTHER_SESSION);

    await StarrailNotes();

    expect(cached.cachedAccounts).toHaveBeenCalledWith(OTHER_SESSION.id);
  });

  it("還沒連結帳號_顯示連結的入口（到星穹鐵道頁）", async () => {
    const markup = renderToStaticMarkup((await StarrailNotes()) as ReactElement);

    expect(textOf(markup)).toContain("還沒有連結 HoYoLAB 帳號");
    expect(markup).toMatch(/<a[^>]*href="\/starrail"[^>]*>.*連結帳號/);
  });

  it("有好幾個帳號_一個帳號一列，各自查便箋（慢的那個不會擋住其他帳號）", async () => {
    cached.cachedAccounts.mockResolvedValue([view(1, "開拓者"), view(2, "小號", "prod_official_asia")]);

    const tree = await StarrailNotes();
    const text = textOf(renderToStaticMarkup(tree as ReactElement));

    expect(accountIdsIn(tree)).toEqual([1, 2]);
    // 便箋還在查的時候就先看得到是哪個帳號
    expect(text).toContain("開拓者");
    expect(text).toContain("小號");
    expect(text).toContain("台港澳服");
    expect(text).toContain("亞服");
  });
});

describe("首頁「即時便箋」：每個帳號的便箋", () => {
  const note = async (account = view(1, "開拓者")) => renderToStaticMarkup((await AccountNote({ account })) as ReactElement);

  it("用登入者的 id 加帳號 id 讀便箋", async () => {
    requireSession.mockResolvedValue(OTHER_SESSION);

    await note();

    expect(cached.cachedDailyNote).toHaveBeenCalledWith(OTHER_SESSION.id, 1);
  });

  it("開拓力（目前／上限、回滿時間）、後備開拓力、每日實訓、委託的角色圖與完成數，點帳號到星穹鐵道頁的那個帳號", async () => {
    const markup = await note();
    const text = textOf(markup);

    expect(text).toContain("開拓力");
    expect(text).toMatch(/231\s*\/\s*300/);
    expect(text).toMatch(/(今天|明天) \d{2}:\d{2} 回滿/);
    expect(text).toContain("後備開拓力");
    expect(text).toContain("1200");
    expect(text).toContain("每日實訓");
    expect(text).toMatch(/400\s*\/\s*500/);
    expect(text).toMatch(/委託\s*4\s*\/\s*4/);
    expect(text).toContain("1 個已完成");
    expect(markup).toContain(`${IMG}/1001.png`);
    expect(markup).toContain(`${IMG}/1105.png`);
    expect(markup).toContain('href="/starrail?account=1"');
  });

  it("HoYoLAB 查詢失敗_只在這一列顯示原因", async () => {
    cached.cachedDailyNote.mockResolvedValue({ ok: false, message: "HoYoLAB 說查詢太頻繁，過幾分鐘再試（-110）", fetchedAt, cookieInvalid: false });

    const text = textOf(await note());

    expect(text).toContain("HoYoLAB 說查詢太頻繁，過幾分鐘再試（-110）");
    expect(text).toContain("開拓者");
  });

  it("cookie 失效_標示出來並連到星穹鐵道頁重新連結；跟帳號上的標記不同時，回應後才寫回", async () => {
    cached.cachedDailyNote.mockResolvedValue({ ok: false, message: "HoYoLAB cookie 已失效，請重新登入 hoyolab.com 後貼上新的 cookie（-100：Please login）", fetchedAt, cookieInvalid: true });

    const markup = await note();

    expect(textOf(markup)).toContain("cookie 已失效");
    expect(markup).toContain('href="/starrail?account=1"');
    expect(after).toHaveBeenCalledTimes(1);
    expect(accounts.syncCookieInvalid).not.toHaveBeenCalled();

    await (vi.mocked(after).mock.calls[0][0] as () => Promise<unknown>)();

    expect(accounts.syncCookieInvalid).toHaveBeenCalledWith(TEST_SESSION.id, 1, true);
  });

  it("便箋的 cookie 狀態跟帳號上的標記相同_不寫資料庫", async () => {
    await note();

    expect(after).not.toHaveBeenCalled();
  });
});
