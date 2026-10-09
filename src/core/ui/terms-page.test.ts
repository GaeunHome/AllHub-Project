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

  it("刪除帳號一節是最終版（跟各模組資料依帳號分開一起上線）：刪除帳號時連帶刪除各功能的資料", () => {
    for (const line of [
      "你可以在「帳號設定」頁輸入密碼後刪除自己的帳號，刪除後無法復原。",
      "刪除帳號時，你的追蹤名單、加密的 API Key 與 HoYoLAB cookie、記帳資料會一起刪除。",
      "已經共用的翻譯字幕會留給其他使用者，但不再連到你的帳號。",
      "帳號被濫用時，站長可以停用或刪除帳號。",
    ]) {
      expect(text, line).toContain(line);
    }
    expect(text).not.toContain("之後的版本");
  });

  it("影片的保存方式跟實作一致：每人只留追蹤頻道的最新 20 支，不在任何人清單裡的影片刪掉，翻譯不跟著刪（不是 14 天）", () => {
    expect(text).toContain("YouTube 影片只留每個人追蹤頻道的最新 20 支：不在任何人清單裡的影片（剛發布兩天內的除外）會自動刪除；翻譯好的字幕不會跟著刪除，永久保留");
    expect(text).not.toMatch(/新影片紀錄[^。]*14 天/);
    expect(text).not.toMatch(/翻譯[^。]*(一起|跟著影片)刪除/);
  });

  it("翻譯共用一節跟實作一致：續翻用自己的 API Key、沒有 Key 只能看、只有發起人或站長能重新翻譯或換字幕、專有名詞表跟著翻譯保存、翻譯永久保留", () => {
    for (const line of [
      "接著翻譯時用的是觀看者自己的 API Key，費用由他支付；沒有設定 API Key 的人只能看已經翻好的部分。",
      "只有發起翻譯的人或站長可以重新翻譯或上傳字幕取代；重新翻譯或上傳的人會成為新的發起人。",
      "發起時的專有名詞表會跟著這份翻譯保存，之後誰接著翻都用同一份，譯名才會一致；刪除帳號後也會留在翻譯裡。",
      "翻譯好的字幕永久保留：影片從清單裡清掉、頻道沒有人追蹤時都不會刪除。",
    ]) {
      expect(text, line).toContain(line);
    }
  });

  it("翻譯共用一節：別人發起、還沒翻完的不會自動用你的 API Key 接著翻；你的 Key 出錯只顯示給你", () => {
    for (const line of [
      "別人發起、還沒翻完的翻譯，網站不會自動用你的 API Key 接著翻：會先顯示已經翻好的部分，你按「用我的 API Key 繼續翻譯」才會開始；自己發起的翻譯，觀看頁開著時會自動接著翻。",
      "你的 API Key 出問題（無效、額度用完、請求太頻繁）或連線失敗時，錯誤只顯示給你，不影響共用的翻譯，其他人也看不到。",
    ]) {
      expect(text, line).toContain(line);
    }
  });

  it("保存的資料：帳號包含停用時間；用語跟設定頁一致叫「專有名詞表」", () => {
    expect(text).toContain("帳號：帳號名稱、角色（站長或成員）、建立時間，以及被停用時的停用時間");
    expect(text).not.toContain("用語表");
  });

  it("API Key 與 cookie 何時解密：呼叫 AI、讀取 HoYoLAB 的當下，以及每天的重新加密排程", () => {
    expect(text).toContain("只有伺服器端在呼叫 AI 翻譯、讀取 HoYoLAB 的當下，以及每天的重新加密排程（換加密金鑰時把舊資料改用新金鑰加密）才會解密");
  });

  it("第三方服務：HoYoLAB 列出便箋、角色、開拓月曆、終局戰績、簽到與兌換碼（用你的帳號送出），外部資料只放快取不存資料庫", () => {
    for (const line of [
      "HoYoLAB：網站會在伺服器端用你的 cookie 查詢即時便箋、角色、開拓月曆與終局戰績；排程每天替你簽到、每 30 分鐘查一次開拓力（快滿時提醒）；你輸入的兌換碼會用你的帳號送出兌換。",
      "這些向外部服務查到的資料不存進資料庫，只放在伺服器的快取裡：HoYoLAB 的資料最多 30 分鐘（即時便箋最多 5 分鐘），頭像這類很少變的資料最多一天；兌換碼與兌換結果都不保存。",
    ]) {
      expect(text, line).toContain(line);
    }
  });

  it("刪除帳號一節也列出跟著刪除的通知、簽到紀錄與邀請連結", () => {
    expect(text).toContain("網站通知、HoYoLAB 的簽到紀錄與你建立的邀請連結也會一起刪除。");
  });

  it("刪除帳號一節寫清楚停用的效果：凍結、資料與訂閱保留、恢復後要重新登入", () => {
    for (const line of [
      "停用等於凍結：停用期間不能登入，排程不會用你的 HoYoLAB cookie 簽到、查便箋或發開拓力提醒，也不會寫網站通知給你（追蹤的主播開台、頻道有新影片都不通知）。",
      "你的資料全部保留，追蹤的主播與頻道的訂閱也照樣保留；恢復後照常運作，但要重新登入（停用前的登入狀態不會恢復）。",
    ]) {
      expect(text, line).toContain(line);
    }
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
