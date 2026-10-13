import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TermsPage } from "./terms-page";

const markup = renderToStaticMarkup(createElement(TermsPage));
const text = markup.replace(/<[^>]+>/g, "");

describe("使用聲明（公開頁）", () => {
  it("站長確認過的正式版：不再標「草稿」，最後更新也沒有附註", () => {
    expect(text).not.toContain("草稿");
    expect(text).toContain("最後更新：2026 年 10 月");
  });

  it.each([
    ["非商業的個人專案", ["非商業", "個人"]],
    ["存了哪些資料", ["帳號", "密碼", "雜湊", "API Key", "HoYoLAB cookie", "追蹤", "14 天", "永久保留"]],
    ["驗證碼的紀錄只存 nonce 的雜湊，超過 1 天的在下次有人登入或註冊時刪除", ["驗證碼", "nonce", "超過 1 天的紀錄會在下次有人登入、註冊"]],
    ["API Key 加密保存、只在伺服器端解密，站長技術上能存取", ["加密", "伺服器", "解密", "站長技術上"]],
    ["第三方服務與 CDN 看得到 IP", ["Vercel", "Supabase", "YouTube", "Twitch", "HoYoLAB", "AI", "CDN", "IP"]],
    ["翻譯結果共用、記錄發起者", ["共用", "發起"]],
    ["怎麼刪除帳號與資料", ["刪除帳號", "帳號設定"]],
    ["聯絡方式", ["聯絡方式", "有任何問題，或想刪除資料，請直接聯絡邀請你加入的站長。"]],
  ] as const)("包含：%s", (_name, phrases) => {
    for (const phrase of phrases) expect(text, phrase).toContain(phrase);
  });

  it("刪除帳號一節是最終版（跟各模組資料依帳號分開一起上線）：刪除帳號時連帶刪除各功能的資料、通知、簽到紀錄與邀請連結", () => {
    for (const line of [
      "你可以在「帳號設定」頁輸入密碼刪除自己的帳號，刪除後無法復原。",
      "刪除帳號時，追蹤名單、保留的影片清單、加密的 API Key 與 HoYoLAB cookie、記帳資料、網站通知、簽到紀錄與你建立的邀請連結都會一起刪除。",
      "共用的翻譯字幕會留給其他使用者，但不再連到你的帳號。",
      "帳號被濫用時，站長可以停用或刪除帳號。",
    ]) {
      expect(text, line).toContain(line);
    }
    expect(text).not.toContain("之後的版本");
  });

  it("保存多久分項列出：通知類 14 天；影片每人只留追蹤頻道的最新 20 支、其餘發布兩天後刪除、Shorts 確認後就刪除（已通知過的留兩天）；翻譯永久保留（不是 14 天、不跟著影片刪）", () => {
    expect(text).toContain("保存多久：");
    for (const item of [
      "網站通知、開台紀錄、簽到紀錄：14 天後自動刪除",
      "YouTube 影片：只留每個人追蹤頻道的最新 20 支，其餘的在發布兩天後刪除；Shorts 確認後就刪除（已發過通知的留到發布兩天後）",
      "翻譯好的字幕：永久保留（見第五節）",
      "存錢記帳：永久保留，直到你刪除",
    ]) {
      expect(markup, item).toContain(`<li>${item}</li>`);
    }
    expect(text).not.toMatch(/新影片紀錄[^。]*14 天/);
    expect(text).not.toMatch(/翻譯[^。]*(一起|跟著影片)刪除/);
  });

  it("保存多久：保留的影片清單上限 15 部、留到自己移除；自動加入的會先被擠掉，手動保留的不會", () => {
    expect(markup).toContain("<li>保留的影片清單：每人最多 15 部，留到你自己移除；按過翻譯的影片會自動加入，滿了先移除最舊的自動加入項目，你手動保留的不會被移除</li>");
    expect(text).toContain("你設定的內容：追蹤名單（Twitch 主播、YouTube 頻道）、翻譯設定與專有名詞表、保留的 YouTube 影片、連結的 HoYoLAB 帳號、存錢記帳的項目與紀錄。");
  });

  it("保存的資料：帳號包含停用時間與登入失敗的鎖定；用語跟設定頁一致叫「專有名詞表」", () => {
    expect(text).toContain("帳號：帳號名稱、角色（站長或成員）、建立時間、停用時間，以及登入失敗次數與暫時鎖定時間（防止有人猜密碼）。");
    expect(text).not.toContain("用語表");
  });

  it("防濫用紀錄：IP、驗證碼代號與帳號 id 都只存雜湊，超過 1 天的在下次有人用到時刪除", () => {
    expect(text).toContain(
      "防濫用紀錄：註冊與邀請碼的嘗試次數、用過的驗證碼、手動同步與續訂的冷卻時間；IP、驗證碼代號（nonce）與帳號 id 都只存雜湊，看不出原本的值。超過 1 天的紀錄會在下次有人登入、註冊或按同步、續訂時刪除。",
    );
  });

  it("保存的資料：瀏覽器裡的 cookie 期限與偏好設定（含 YouTube 播放器）", () => {
    expect(text).toContain("你的瀏覽器裡：登入 cookie（30 天）、驗證碼 cookie（5 分鐘），以及提示音、通知、外觀與 YouTube 播放器的偏好設定。");
  });

  it("API Key 與 cookie 何時解密：呼叫 AI、讀取 HoYoLAB 的當下，以及每天的重新加密排程", () => {
    expect(text).toContain("只有伺服器在呼叫 AI 翻譯、讀取 HoYoLAB 與每天的重新加密排程時才會解密");
  });

  it("第三方服務：每天的排程會讀追蹤中 YouTube 頻道的 RSS，RSS 裡沒有的影片再逐支確認（找出 Shorts）；頻道頭像與 Shorts 的判斷也列在非官方做法裡", () => {
    for (const line of [
      "YouTube、Twitch：伺服器會向它們查詢頻道、影片、字幕、頭像與開台狀態；每天的排程會讀追蹤中 YouTube 頻道的 RSS，RSS 裡沒有的影片再逐支確認，找出 Shorts 刪掉。",
      "非官方做法：HoYoLAB 的讀取、簽到與兌換，以及 YouTube 的字幕讀取、頻道頭像與 Shorts 判斷，都不是官方 API，可能失效或違反服務條款，請自行評估要不要使用。",
    ]) {
      expect(text, line).toContain(line);
    }
  });

  it("第三方服務：HoYoLAB 列出便箋、角色、開拓月曆、終局戰績、簽到與兌換碼（用你的帳號送出）；只放快取的外部資料分項列出最多保留多久", () => {
    expect(text).toContain(
      "HoYoLAB：伺服器用你的 cookie 查詢即時便箋、角色、開拓月曆與終局戰績；每天替你簽到、每 30 分鐘查一次開拓力（快滿時提醒）；你輸入的兌換碼會用你的帳號送出。",
    );
    expect(text).toContain("只放在伺服器快取、不存資料庫的外部資料（最多保留多久）：");
    for (const item of ["HoYoLAB 即時便箋：5 分鐘", "HoYoLAB 角色、開拓月曆、終局戰績：30 分鐘", "直播觀看人數與預覽圖：2 分鐘", "頭像、遊戲封面、影片資訊：一天"]) {
      expect(markup, item).toContain(`<li>${item}</li>`);
    }
    expect(markup).toContain("<li>兌換碼與兌換結果都不保存。</li>");
  });

  it("只放快取的資料寫的效期跟 next.config.ts 的 cacheLife 一致（以 expire 為準）", () => {
    const config = readFileSync(new URL("../../../next.config.ts", import.meta.url), "utf8");
    const expire = (profile: string) => Number(new RegExp(`${profile}: \\{[^}]*expire: ([\\d_]+)`).exec(config)?.[1].replaceAll("_", ""));

    expect(expire("external")).toBe(5 * 60);
    expect(expire("records")).toBe(30 * 60);
    expect(expire("live")).toBe(2 * 60);
    expect(expire("avatar")).toBe(24 * 60 * 60);
  });

  it("第三方服務：照實作分平台列出會存進資料庫的平台資料，不再說「查到的資料都不存」", () => {
    expect(text).toContain("會存進資料庫的平台資料（保存多久見第二節）：");
    for (const item of [
      "Twitch：主播名稱、追蹤時的頭像網址、是否直播中、開台紀錄（直播標題與分類）",
      "YouTube：頻道名稱與追蹤時的頭像網址；影片標題、發布時間、有無中文字幕；保留影片的標題與頻道名稱；共用的翻譯",
      "星穹鐵道：帳號 UID、暱稱、伺服器、開拓等級、HoYoLAB 帳號 id、簽到紀錄",
      "網站通知：開台、新影片、簽到結果與開拓力提醒",
    ]) {
      expect(markup, item).toContain(`<li>${item}</li>`);
    }
    expect(text).not.toContain("這些向外部服務查到的資料不存進資料庫");
  });

  it("翻譯共用一節跟實作一致：續翻用自己的 API Key、沒有 Key 只能看、只有發起人或站長能重新翻譯或換字幕、專有名詞表跟著翻譯保存、翻譯永久保留", () => {
    for (const line of [
      "接著翻譯用的是觀看者自己的 API Key，費用由他支付；沒設定 API Key 的人只能看已翻好的部分。",
      "只有發起人或站長能重新翻譯或上傳字幕取代，做的人會成為新的發起人。",
      "發起時的專有名詞表會跟著翻譯保存，之後接著翻都用同一份，譯名才會一致；刪除帳號後也會留在翻譯裡。",
      "翻譯好的字幕永久保留，影片被清掉或頻道沒人追蹤時也不刪除。",
    ]) {
      expect(text, line).toContain(line);
    }
  });

  it("翻譯共用一節：別人發起、還沒翻完的不會自動用你的 API Key 接著翻；你的 Key 出錯只顯示給你", () => {
    for (const line of [
      "別人發起、還沒翻完的翻譯不會自動用你的 API Key 接著翻，要你按「用我的 API Key 繼續翻譯」才會開始；自己發起的會在觀看頁開著時自動接著翻。",
      "你的 API Key 出問題（無效、額度用完、請求太頻繁）或連線失敗時，錯誤只顯示給你，不影響共用的翻譯。",
    ]) {
      expect(text, line).toContain(line);
    }
  });

  it("星穹鐵道的屬性與命途圖示內建在網站裡、瀏覽器不會連到 GitHub，第三方服務不列 GitHub", () => {
    expect(text).not.toMatch(/GitHub|githubusercontent/);
  });

  it("刪除帳號一節寫清楚停用的效果：凍結、資料與訂閱保留、恢復後要重新登入", () => {
    for (const line of [
      "停用等於凍結：不能登入，排程不會用你的 HoYoLAB cookie 簽到、查便箋或提醒開拓力，也不會寫網站通知給你。",
      "停用期間資料與訂閱都保留；恢復後照常運作，但要重新登入。",
    ]) {
      expect(text, line).toContain(line);
    }
  });

  it("寫得精簡：每一條（含分項）都不超過 120 字，太長的拆成分項", () => {
    const items = [...markup.matchAll(/<li>((?:(?!<li>|<\/li>).)*)<\/li>/g)].map((m) => m[1].replace(/<[^>]+>/g, ""));
    expect(items.length).toBeGreaterThan(40);
    for (const item of items) expect([...item].length, item).toBeLessThanOrEqual(120);
  });

  it("聯絡方式不放 Email 或任何個人資料，也沒有預留位置", () => {
    expect(text).not.toMatch(/@|email|〔|請站長補上/i);
  });

  it("有連回登入頁", () => {
    expect(markup).toContain('href="/login"');
  });

  it("是不讀資料庫、cookie 的靜態頁（沒登入也能看，可以預先算繪）", () => {
    const source = readFileSync(new URL("./terms-page.tsx", import.meta.url), "utf8");

    expect(source).not.toMatch(/next\/headers|\.\.\/auth|\.\.\/db|"use client"/);
  });
});
