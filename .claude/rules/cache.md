---
paths:
  - "src/**/cached.ts"
  - "src/**/cache-tags.ts"
  - "src/core/cache.ts"
  - "src/**/service/**"
  - "src/**/web/actions*.ts"
  - "src/**/web/routes/**"
  - "src/**/web/pages/**"
  - "src/**/cron.ts"
  - "next.config.ts"
  - "**/*.cache*.test.ts"
---

# 快取

`src/__tests__/cache-rules.test.ts` 檢查。

- 讀取：各模組 `service/cached.ts`（通知在 `core/notifications/cached.ts`，管理頁在 `core/admin/cached.ts`；登入檢查不快取），函式開頭依序 `"use cache: remote"`、`cacheLife("db")`（外部資料見下一點，profile 都定義在 `next.config.ts`）、`cacheTag(...)`。只給頁面與輪詢 API 用；寫入流程、排程、翻譯鎖要讀最新資料，用原本的 service（service、cron、模組的 `web/actions*.ts` 與 `web/routes/`、core 的寫入流程都不能 import cached.ts）。例外：保留影片的 Server Action 用 `cachedVideoInfo()` 拿觀看頁讀過的 oEmbed 當標題快照（外部資料、只是顯示用的，不是寫入的判斷依據），經 `keepVideo()` 的 `lookup` 交給 service；交通的輪詢 API（`web/routes/live.ts`）用 `cachedRoutes()`、`cachedLive()`，每分鐘都會問，全部讀最新的會用掉資料庫與 TDX 的額度；旅遊的匯率 API（`web/routes/rates.ts`）用 `cachedRates()`，匯率大家共用一份（`cache-rules.test.ts` 的 `ALLOWED_READS` 逐條列出）。
- 一律 `use cache: remote`：Vercel 是 serverless，記憶體快取與 tag 失效跨不了實例。本機與測試自動退回記憶體快取。
- 外部資料（旅遊的匯率、Helix 的頭像、直播與開台時間表、頻道頁的頭像、oEmbed、HoYoLAB 的便箋、遊戲頭像、角色、開拓月曆、活動日曆、終局戰績、躍遷紀錄、證交所與櫃買中心的收盤價與除權息預告、氣象署的預報與警特報、環境部的空氣品質、Open-Meteo 的一週預報、TDX 的車站、時刻表、票價、行車時間與即時資料）**不存資料庫**，只放在 `service/cached.ts` 的快取：
  - 效期依資料變動的頻率：直播狀態 `live`（2 分鐘）、HoYoLAB 戰績類與躍遷紀錄 `hoyolab`（15 分鐘重讀、最多 6 小時）、Twitch 的開台時間表 `schedule`（15 分鐘重讀、最多 6 小時）、TDX 的公車班距 `records`（30 分鐘）、即時便箋 `external`（5 分鐘）、天氣預報 `forecast`（15 分鐘重讀、最多 6 小時）、空氣品質 `air`（15 分鐘重讀、最多一小時）、天氣警特報 `warnings`（一分鐘重讀、最多一小時）、頭像、遊戲封面與 TDX 的票價、行車時間 `avatar`（一天）、收盤價、除權息預告與最新的匯率 `quotes`（每小時重讀、最多 6 小時）、過去日期的匯率 `stations`、TDX 的即時資料 `board`（最多 1 分鐘）、TDX 的時刻表 `timetable`（半天重讀、最多一天）、TDX 的車站與捷運路線 `stations`（一天重讀、最多 30 天）。讀不到（被擋、出錯、資料不公開）時改用短效期 `external`，幾分鐘後再試：成功與失敗各一個 `cacheLife`，寫在讀完之後（收盤價與除權息預告只讀到其中一個來源時也用 `external`）。
  - tag 用各模組的 `<模組 id>:external`（沒有寫入點，靠效期更新，例如收盤價的 `savings:external`）；依附資料庫狀態的另外標那張表（例如直播狀態標 `twitch:streamers`，EventSub 寫入開台、關台時跟著重抓；HoYoLAB 的資料讀了帳號的 cookie，只標 `starrail:accounts`，星穹鐵道沒有 external tag）。
  - `starrail:accounts` 標著所有 HoYoLAB 的快取，只在帳號那一列真的改了時失效：排程用 `service/accounts.ts` 的 `trackingAccountChanges()` 記下有沒有改到（cookie 失效標記、開拓力提醒的狀態、重新加密），有改才 `expireTags()`；立即簽到由 `checkinAccount()` 回傳 `accountChanged`，有改才 `updateTags()`；兌換不寫資料庫，不失效。不然每小時的開拓力排程會讓頁面重查十幾個 HoYoLAB 端點。
  - 參數一律是明確的識別碼（頻道 id 或 @handle、主播 id、遊戲 id；HoYoLAB 是使用者 id 加帳號 id），清單排序後才當參數（Twitch 用 `cacheKeyIds()`）；不寫成「抓全部帳號」。Helix 與頻道頁這類公開資料不分使用者（頁面只拿自己追蹤的 id 去查）；HoYoLAB 的資料在快取函式裡用使用者 id 加帳號 id 讀帳號，別人的帳號 id 讀不到。cookie 在快取函式裡自己從資料庫讀並解密（照即時便箋的寫法），不進 key 也不進回傳值。
- 依使用者的讀取把使用者 id 當快取函式的第一個參數（頁面從 `requireSession()` 拿到後傳進去；快取函式裡不能讀 cookie 或 session），每個人各自一份快取。共用的資料（翻譯）只用影片 id，所有人共用一份。
- tag 不分使用者，只到資料表層級：寫入讓整張表的 tag 失效，所有人的快取一起重讀。原因：邀請制、使用者很少，多查幾次資料庫的成本很小；共用的表（主播、頻道、影片、翻譯）一次寫入會影響很多人的畫面（例如開台時所有追蹤者），分使用者的 tag 要寫入點算出每個受影響的人，容易漏。不要加 `…:<使用者 id>` 這種 tag。
- tag 是 `<模組 id>:<資料表>[:<id>]`（core 用 `core:`，例如 `core/auth/cache-tags.ts` 的 `core:users`、`core:invites`），定義在各自的 `cache-tags.ts`，呼叫處不手寫字串。core 沒有 service 資料夾，`cache-rules.test.ts` 自動把 import `core/db` 連線或 `core/auth/attempts`、或開頭有 `"use server"` 的檔（`cached.ts` 除外）當成寫入流程。讀取標上讀到的每張表，寫入讓改到的表失效。
- 失效由寫入點負責，`*.cache*.test.ts` 是「寫入點 → tag」對照表，新增寫入要加一列：
  - Server Action：`updateTags()`（`updateTag`）。它已經會讓這次回應帶著重新算繪的頁面，**不要再呼叫 `refresh()`**；`refresh()` 只用在沒有失效任何 tag、但畫面需要重繪的路徑。寫入分好幾步（資料庫＋外部 API、逐筆迴圈）的放 `finally`，單一指令或交易放在成功之後。例外：觀看頁續翻每批寫回不能重繪，改用 `after(() => expireTags(...))`。
  - Route Handler、`after()`：`expireTags()`（`revalidateTag(tag, { expire: 0 })`）。`notify()` 自己會讓通知的 tag 失效。
  - 排程：`expiringTask(task, ...tags)` 登記，成功或失敗都失效。例外是星穹鐵道的 `starrail:accounts`：不登記，由 service 在帳號真的改了時失效（見上面的外部資料）。
- 快取函式裡不讀 cookies／headers、不呼叫 `requireSession()`、不寫資料庫（要寫就回傳結果，讓頁面在 `after()` 寫）；所在的檔案也不 import `next/headers`、`core/auth` 的登入（core 裡的相對路徑也算）與其他會讀 cookie 或 header 的檔，不呼叫 `requireSession`／`requireOwner`／`currentSession`（`cache-rules.test.ts` 檢查）。參數會以明文成為快取 key，不能放 cookie 或金鑰；回傳值不含金鑰、cookie（連密文）、翻譯鎖、密碼雜湊。
- 直接改資料庫時快取最多一天後更新，重新部署（build id 改變）立即生效。
- vitest 把 `next/cache` 換成 `src/dev/next-cache-stub.ts` 的 spy，`vitest-setup.ts` 每個測試前清空；要檢查失效的測試直接 `import { updateTag } from "next/cache"` 斷言（`vi.mocked()`），或用 `test-helpers.ts` 的 `updated()`、`expiredTags()`、`tagged()`，不要再 `vi.mock("next/cache")`。
