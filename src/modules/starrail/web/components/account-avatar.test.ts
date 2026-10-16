import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OTHER_SESSION, requireSession } from "@/dev/session-stub";
import { mocksOf } from "@/dev/test-helpers";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("../../service/cached", { spy: true });

const cached = mocksOf(await import("../../service/cached"), "cachedProfile");
const { LoadedAccountAvatar } = await import("./account-avatar");

const account = { id: 3, uid: "900000003", nickname: "開拓者", region: "prod_official_cht", level: 70, staminaAlertThreshold: null, cookieInvalid: false, autoRedeem: false, canAutoRedeem: false, gameReminders: true };
const TRAIN = createElement("span", null, "列車圖示");
const AVATAR = "https://act-webstatic.hoyoverse.com/darkmatter/hkrpg/head/201102.png";

const html = async () => renderToStaticMarkup((await LoadedAccountAvatar({ account, size: "md", placeholder: TRAIN })) as ReactElement);

beforeEach(() => {
  requireSession.mockReset();
  cached.cachedProfile.mockReset().mockResolvedValue(null);
});

describe("帳號名牌的遊戲頭像", () => {
  it("用登入者的 id 加帳號 id 讀（別人的帳號 id 讀到的是 null）", async () => {
    requireSession.mockResolvedValue(OTHER_SESSION);

    await html();

    expect(cached.cachedProfile).toHaveBeenCalledWith(OTHER_SESSION.id, 3);
  });

  it("有頭像_換掉列車圖示，畫出頭像（瀏覽器直接向 CDN 載入）", async () => {
    cached.cachedProfile.mockResolvedValue(AVATAR);

    const markup = await html();

    expect(markup).toMatch(/<img[^>]*src="https:\/\/act-webstatic\.hoyoverse\.com\/darkmatter\/hkrpg\/head\/201102\.png"/);
    expect(markup).not.toContain("列車圖示");
  });

  it("沒有頭像（讀不到、資料沒有這個欄位）_維持列車圖示", async () => {
    expect(await html()).toBe("<span>列車圖示</span>");
  });

  it("網址不是 http(s)_經 externalAssetUrl 擋下，維持列車圖示", async () => {
    cached.cachedProfile.mockResolvedValue("javascript:alert(1)");

    expect(await html()).toBe("<span>列車圖示</span>");
  });
});
