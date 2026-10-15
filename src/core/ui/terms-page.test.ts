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
      "刪除帳號時，追蹤名單、保留的影片清單、加密的 API Key 與 HoYoLAB cookie、理財資料、網站通知、簽到紀錄與你建立的邀請連結都會一起刪除。",
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
      "理財：永久保留，直到你刪除",
    ]) {
      expect(markup, item).toContain(`<li>${item}</li>`);
    }
    expect(text).not.toMatch(/新影片紀錄[^。]*14 天/);
    expect(text).not.toMatch(/翻譯[^。]*(一起|跟著影片)刪除/);
  });

  it("保存的資料：帳號包含停用時間與登入失敗的鎖定；用語跟設定頁一致叫「專有名詞表」", () => {
    expect(text).toContain("帳號：帳號名稱、角色（站長或成員）、建立時間、停用時間，以及登入失敗次數與暫時鎖定時間（防止有人猜密碼）。");
    expect(text).not.toContain("用語表");
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

  it("星穹鐵道的屬性與命途圖示內建在網站裡、瀏覽器不會連到 GitHub，第三方服務不列 GitHub", () => {
    expect(text).not.toMatch(/GitHub|githubusercontent/);
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
