# 架構

這頁說明程式碼結構、架構規則、資料表、排程、資料保留、快取與安全，以及怎麼新增模組。寫程式時要遵守的完整規則與慣例在 [CLAUDE.md](../CLAUDE.md)。

## 程式碼結構

所有程式碼都在 `src/`，根目錄只放設定檔與文件。

```text
src/
├─ app/              Next.js 路由，只轉接到 core 或模組
├─ core/             共用基礎（不依賴任何模組）
│  ├─ admin/         管理頁（只有站長）：使用者清單、邀請連結
│  ├─ auth/          帳號、登入／註冊／帳號頁、邀請、次數限制、session
│  ├─ db/            資料庫連線、core 的資料表、migrations
│  ├─ notifications/ 通知中心：鈴鐺、提示卡片、通知頁、輪詢 API
│  ├─ ui/            共用元件與圖示、首頁的排版與卡片外框、使用聲明（/terms）
│  └─ env.ts、cron.ts、cache.ts、crypto.ts、notify.ts…
├─ modules/
│  ├─ index.ts       模組清單（導覽列、首頁的模組入口）
│  ├─ cron.ts        排程清單
│  └─ <id>/          twitch、youtube、starrail、savings
│     ├─ info.ts     名稱、網址、圖示
│     ├─ cron.ts     排程（選填）
│     ├─ web/        頁面（含首頁卡片 pages/home-card.tsx）、元件、Server Actions、API handler
│     ├─ service/    商業流程與資料庫讀寫
│     ├─ data/       資料表
│     ├─ lib/        純函式、外部 API client
│     └─ dev/        本機假外部服務（選填）
├─ dev/              命令列工具（account）、假外部服務入口、測試用資料庫與測試輔助
└─ proxy.ts          擋未登入的請求
```

## 架構規則

這些規則由 `src/architecture.test.ts` 自動檢查，`npm test` 時會跑：

- **模組彼此獨立**：模組不能 import 其他模組、模組清單或 `src/app`；`core` 也不能 import 模組。
- **依賴只能往下**：模組內是 `web → service → data → lib`。`web` 只能 `import type` data 的型別，不能直接存取資料庫。
- **`src/app` 只做轉接**：
  - 頁面只 render 模組 `web/pages/` 或 core 的頁面元件。
  - route handler 只轉接，例如 `export { GET } from …`；排程的 `api/cron/[task]` 例外，把模組的排程清單交給 core 的 `runCron()`（core 不能 import 模組清單）。
  - 測試檢查的是 `src/app` 只透過模組的 `info`、`cron`、`web/pages`、`web/routes` 使用模組。
- **首頁卡片**：每個模組的首頁卡片放在自己的 `web/pages/home-card.tsx`，由 `src/app/(main)/page.tsx` 組合後交給 core 的 `HomePage` 排版（core 不 import 模組）；每張卡片都要組合到首頁。
- **資料表的位置**：只能定義在 `core/db/schema.ts`（表名以 `core_` 開頭）或模組的 `data/schema.ts`（表名以 `<id>_` 開頭）；每張表都加 `.enableRLS()`（見〈安全〉的資料庫的 RLS）。
- **環境變數**：都定義在 `core/env.ts`，順序同 `.env.example`（由 `env.test.ts` 檢查）；其他地方不直接讀 `process.env`（少數例外列在 CLAUDE.md，也由 `architecture.test.ts` 檢查）。
- **快取寫法**：由 `src/cache-rules.test.ts` 檢查（見下方〈快取〉）。

## 資料表

各模組的資料依使用者分開：每個人只看得到、改得到自己的資料。依使用者的表都有 `user_id`，外鍵指向 `core_users`，刪除帳號時一起刪除（`on delete cascade`）；共用的表不屬於任何人。

| 資料表 | 依使用者／共用 | 內容 | 保留 |
|---|---|---|---|
| `core_users` | — | 帳號、角色、停用、登入失敗次數 | 永久 |
| `core_invites` | 依使用者（建立者） | 邀請，只存雜湊 | 永久，刪除帳號時一起刪 |
| `core_rate_limits` | — | 註冊與邀請碼的嘗試次數、用過的驗證碼 nonce 的雜湊、手動同步與續訂的冷卻時間（帳號 id 的雜湊）、星穹鐵道的提醒發過了沒（遊戲帳號與期別的雜湊） | 一小時／一天 |
| `core_notifications` | 依使用者（收件人） | 網站通知 | 14 天 |
| `twitch_follows` | 依使用者 | 追蹤的主播、通知開關 | 永久 |
| `twitch_streamers` | 共用 | 主播與 EventSub 訂閱（同一位主播只訂閱一次） | 沒有人追蹤時刪除 |
| `twitch_stream_events` | 共用 | 開台／關台紀錄（只顯示給追蹤那位主播的人） | 14 天 |
| `youtube_follows` | 依使用者 | 追蹤的頻道、通知開關 | 永久 |
| `youtube_channels` | 共用 | 頻道與 WebSub 訂閱（同一個頻道只訂閱一次） | 沒有人追蹤時刪除 |
| `youtube_videos` | 共用 | 影片與中文字幕狀態（每個人看自己追蹤頻道的最新 20 支） | 見〈資料保留〉 |
| `youtube_settings` | 依使用者 | 翻譯設定、加密的 AI API Key | 永久 |
| `youtube_translations` | 共用 | 翻譯好的字幕；記下發起人（刪除帳號時改成 null）與發起時的專有名詞表 | 永久（影片被清掉、頻道被刪除時都不刪） |
| `youtube_saved_videos` | 依使用者 | 保留的影片（每人最多 15 部：手動保留，或按過翻譯時自動加入；滿了先擠掉最舊的自動項目），存標題與頻道名稱的快照，跟影片表沒有外鍵 | 永久，直到自己移除或刪除帳號 |
| `starrail_accounts` | 依使用者 | 連結的 HoYoLAB 帳號、加密的 cookie（UID 全站唯一）、開拓力提醒門檻、自動兌換與提醒的開關 | 永久 |
| `starrail_checkin_logs` | 跟著帳號 | 簽到紀錄 | 14 天 |
| `starrail_redeem_codes` | 跟著帳號 | 自動兌換試過的兌換碼（社群公開的碼）與結果，試過的不再送出 | 永久，移除帳號時一起刪 |
| `savings_accounts` | 依使用者 | 理財的帳戶：自己取的名稱、類型（存款、投資、信用卡）、用途文字、起始餘額、每月規劃、目標；信用卡的結帳日、扣款帳戶、自動扣繳與卡面顏色（舊的繳款截止日只當第一張帳單截止日的預設）。不存帳號、卡號 | 永久 |
| `savings_purposes` | 依使用者 | 舊的用途表，已改成帳戶上的用途文字，程式不再讀寫（之後的版本刪掉） | 永久 |
| `savings_categories` | 依使用者 | 收入、支出的分類與圖示，支出分類的每月預算 | 永久 |
| `savings_transactions` | 依使用者 | 收入、支出、轉帳與調整（更新餘額、帳單差額）；買賣持股、確認固定收支記下的也在這裡 | 永久（刪除帳戶時，跟它有關的紀錄一起刪） |
| `savings_recurring` | 依使用者 | 固定收支：每幾個月一次、遇假日提前或延後、自動記帳或到期請你確認（含薪水與定期定額） | 永久 |
| `savings_holdings` | 依使用者 | 投資帳戶的持股：代號、名稱、目前股數與總成本 | 永久（刪除投資帳戶時一起刪） |
| `savings_card_bills` | 依使用者 | 信用卡帳單：結帳日、截止日（照帳單填的）與金額 | 每張卡留最新 5 張 |

- **擁有權**：Server Action、頁面與 Route Handler 都用登入者的 id 呼叫 service，service 的 SQL 同時比對 `user_id`，別人的 id 一律當作不存在。例外是 YouTube 的翻譯：所有人共用，字幕下載也不檢查擁有權。
  - 續翻用觀看者自己的 API Key；別人發起、還沒翻完的翻譯不會自動用他的 Key 接著翻，要他在觀看頁按「用我的 API Key 繼續翻譯」。
  - 只有字幕內容的問題（AI 輸出格式不對、模型拒絕翻譯）才把共用的翻譯標成失敗；觀看者自己的金鑰、額度、頻率限制或連線錯誤只回給他，翻譯維持排隊中，別人看不到。
  - 只有發起人或站長能重新翻譯或換字幕。
- **部署空窗期的舊資料**：`user_id` 可以是 null，是為了部署時還在跑的舊程式（見 [部署 › 從單人版升級](deploy.md#之後的部署)）；新程式不讀這些列（重新加密的排程與 14 天的清理例外，照樣處理）。

## 排程

所有排程都是 `GET /api/cron/<排程>`，要帶 `Authorization: Bearer <CRON_SECRET>`。

| 排程 | 做什麼 | 時間（台北） | 由誰呼叫 |
|---|---|---|---|
| `starrail:checkin` | 每日簽到 | 每天 00:10 | Vercel Cron |
| `starrail:stamina` | 查每個帳號的便箋：開拓力兩小時內會達到門檻就提醒（每 6 分鐘回 1 點，兩小時 20 點）；提醒開著的帳號，每日實訓（晚上 9 點後）、每週內容（週日傍晚 6 點後）沒做完時提醒，傍晚 6 點後再查活動日曆，終局挑戰剩 1～2 天還沒拿滿時提醒（時間照遊戲伺服器當地） | 大約每小時一次 | Vercel Cron（每個小時一條） |
| `savings:recurring` | 補記到今天為止該自動記的固定收支（排程漏跑的期別會補上，最多 12 期；停用的使用者、停用的帳戶與固定收支略過）；寄到期通知（要確認的固定收支到期當天、信用卡結帳隔天還沒填帳單、帳單截止前 3 天還沒繳清）；每張信用卡只留最新 5 張帳單 | 每天 00:30 | Vercel Cron |
| `twitch:cleanup` | 刪除超過 14 天的開台／關台紀錄 | 每天 02:00 | Vercel Cron |
| `youtube:cleanup` | 對照每個有人追蹤的頻道的 RSS 刪掉 Shorts，RSS 裡沒有、還在清單上的再逐支確認（每次最多 50 支；同時 4 個請求、合計最多 60 秒，超過的隔天再試），再刪除不在任何人最新 20 支裡、發布超過 48 小時的影片（翻譯不刪） | 每天 02:20 | Vercel Cron |
| `starrail:cleanup` | 刪除超過 14 天的簽到紀錄 | 每天 02:40 | Vercel Cron |
| `starrail:reencrypt` | 每個人的 HoYoLAB cookie 改用目前的金鑰加密 | 每天 03:00 | Vercel Cron |
| `youtube:reencrypt` | 每個人的 AI API Key 改用目前的金鑰加密 | 每天 03:30 | Vercel Cron |
| `twitch:sync` | 檢查並補建 EventSub 訂閱；刪掉沒有人追蹤的主播與它的訂閱 | 每天 04:00 | Vercel Cron |
| `youtube:renew` | 續訂快到期的 WebSub 訂閱；取消並刪掉沒有人追蹤的頻道 | 每天 04:30 | Vercel Cron |
| `notifications:cleanup` | 刪除超過 14 天的網站通知 | 每天 05:00 | Vercel Cron |
| `starrail:redeem` | 替打開自動兌換的帳號，兌換社群兌換碼清單上還沒試過的碼（清單最多 50 個；每次約 30 秒、同一個 HoYoLAB 帳號每 6 秒一個，剩下的隔天再試；成功時通知） | 每天 12:00 | Vercel Cron |

**Vercel Cron**

- `vercel.json` 裡的時間是 UTC，也就是台北時間減 8 小時。
- Hobby 方案每個排程一天最多跑一次，而且只保證在設定的那個小時內執行；每個專案最多 100 個排程。
- 同一個路徑可以登記好幾個時間：`starrail:stamina` 每個 UTC 小時各一條（共 24 條），所以大約每小時跑一次。每條都可能在那個小時裡的任何時候觸發，相鄰兩次可能只隔幾分鐘，也可能隔將近兩小時。
- 排程的 route 沒有設 `maxDuration`，用的是 Fluid compute 的預設（Hobby 300 秒）。最久的是 `youtube:cleanup`（外部請求最多 60 秒）與 `starrail:redeem`（約 45 秒），所以 Fluid compute 要開著（新專案預設開啟，見 [部署](deploy.md#2-vercel匯入-repo填環境變數)）。
- Vercel 偶爾會漏送或重送同一次排程（[官方說明](https://vercel.com/docs/cron-jobs/manage-cron-jobs#cron-job-delivery-and-idempotency)）：排程都可以重跑，自動記帳與提醒會先認領，同一件事不會做兩次。

**GitHub Actions**

- `cron.yml` 只用來手動執行：在 Actions 頁面按 Run workflow，可以指定任何排程（例如補跑、換金鑰後立刻重新加密）。它需要 GitHub Secrets 的 `HUB_URL` 與 `CRON_SECRET`。
- 為什麼不用 GitHub 的定時排程：`starrail:stamina` 以前由 `cron.yml` 每 30 分鐘呼叫，但 GitHub 常常略過，實際一天只跑 4–5 次、間隔 3–8 小時，開拓力提醒晚了好幾個小時才到。
- 其他 workflow：
  - `ci.yml`：在 PR 與 main 上依序跑測試、lint、建置、型別檢查。
  - `db-migrate.yml`：main 的 migration 有變動或手動執行時，套用 migration。

**手動執行**

- 指令：`curl -H "Authorization: Bearer $CRON_SECRET" https://<網址>/api/cron/<排程>`，一次跑一個排程。
- 回應格式是 `{"results":{…}}`。失敗時只寫「失敗（詳見伺服器 log）」。
- 密鑰錯誤回 401；排程名稱錯誤回 404，並列出所有排程。只認登記過的排程名稱，`constructor`、`toString` 這類名稱也回 404。

## 資料保留

- **14 天後清掉**（由上面的 cleanup 排程刪除）：開台／關台紀錄、簽到紀錄、網站通知。
- **YouTube 影片：每人只看最新 20 支**。`youtube:cleanup` 刪掉不在任何人最新 20 支裡、而且發布超過 48 小時的影片；那支影片的翻譯不刪。
  - 為什麼不再用 14 天：更新少的頻道過了 14 天清單就會變空，還在別人清單裡的影片也會被刪；用「最新 20 支」清單永遠是滿的，資料量也有上限（最多約 20 × 人數支）。
  - 為什麼留 48 小時：hub 在影片發布 24 小時內重送時要找得到原本那一列，才不會重複通知。
  - 背景的中文字幕重新檢查（打開 YouTube 頁時）只看每個人清單上的最新 20 支：從沒檢查過的先，檢查過但讀不到的隔 24 小時再試；清單外、之後會被清掉的影片不對 YouTube 發請求。
  - Shorts 不留：`youtube:cleanup` 先對照每個有人追蹤的頻道的 RSS，刪掉連結是 `/shorts/` 的影片（翻譯一樣不刪），一般影片才不會被 Shorts 擠出最新 20 支。
    - RSS 只有最新十幾支：RSS 裡沒有、還在某人最新 20 支裡的影片（這個規則上線前存進來的、推送時確認不了的）再逐支請求 `/shorts/<id>` 確認，新的先、每次最多 50 支，刪掉 Shorts 後往前補進清單的也一起確認；確認不了的當一般影片留著，隔天再試。資料表沒有記號記住確認過的一般影片，每天都會再問一次，所以有上限；清單上 RSS 裡沒有的超過 50 支時，每天問的都是最新的 50 支，更舊的要等掉出最新 20 支才會清掉。
    - 讀 RSS 與逐支確認都是同時 4 個、每個最多等 5 秒，兩者合計最多 60 秒，超過就略過剩下的（排程結果寫出略過幾個頻道、還有幾支沒確認）；RSS 讀不到的頻道隔天再讀，它還在清單上的影片當天就改成逐支確認（算在 50 支裡）。這一步出錯或超過時間都不擋後面「最新 20 支」的刪除，排程不會因為 YouTube 慢而被 Vercel 中斷。
    - 已經發過通知、發布不到 48 小時的 Shorts 先留著（推送時沒確認到是 Shorts 而通知了），理由同上：hub 重送時才不會重複通知。這段期間它不算進最新 20 支，最舊的一般影片不會因此被刪掉。
- **翻譯好的字幕永久保留**：影片被清掉、頻道沒有人追蹤而被刪除時都不刪（翻譯表跟影片表、頻道表沒有外鍵），花錢翻好的字幕重看不用再付費。
- **保留的影片**：每人最多 15 部，滿了時先擠掉最舊的自動項目（按過翻譯時加入的），沒有清理排程；影片被清掉、頻道沒有人追蹤時都不刪（跟影片表沒有外鍵），自己移除或刪除帳號時才刪。移除不影響共用的翻譯。
- **永久保留**：邀請連結、追蹤名單、保留的影片、翻譯設定與加密的 API Key、連結的 HoYoLAB 帳號與自動兌換試過的兌換碼、理財的帳戶、分類、紀錄、固定收支與持股（信用卡帳單見下一條）。刪除帳號時，這些連同他的網站通知與簽到紀錄一起刪除。
- **信用卡帳單：每張卡只留最新 5 張**。`savings:recurring` 每天清掉更舊的；填帳單時補的那一筆紀錄留著，餘額不會變。
- **共用、刪除帳號後留下**：翻譯好的字幕（發起人改成 null，發起時的專有名詞表也留在翻譯裡）；主播與頻道在沒有人追蹤時，由取消追蹤的最後一個人或每天的 `twitch:sync`、`youtube:renew` 刪掉。
- **不存**：畫面上即時讀的外部資料（最新的頭像、直播的觀看人數與預覽圖、遊戲封面、觀看頁的影片資訊、即時便箋、星穹鐵道的遊戲頭像、角色、開拓月曆、活動日曆、終局戰績、證交所與櫃買中心的收盤價）只放在快取裡，見下方〈快取〉；手動輸入的兌換碼與兌換結果不存也不快取。會存進資料庫的平台資料是追蹤時存下的主播與頻道名稱和頭像網址、主播有沒有在直播（EventSub 寫入的 `is_live`）、影片的標題、發布時間與中文字幕狀態、連結時查到的星穹鐵道帳號資料（UID、暱稱、伺服器、開拓等級與 cookie 裡的 `ltuid`）、自動兌換試過的兌換碼與結果（只記成功、已兌換、過期、無效這類不會變的）、保留影片時的標題與頻道名稱快照、新增持股時抄下的股票名稱，以及上面列的通知、開台與簽到紀錄、翻譯（使用聲明第四節照這份寫）。圖片由瀏覽器直接向平台的 CDN 載入，網站不轉送也不存（星穹鐵道的元素、命途、屬性小圖示是固定的遊戲素材，內建在 `public/icons/starrail/`）。
- **`core_rate_limits`**：註冊與邀請碼的嘗試次數（IP 只存雜湊，時間窗一小時）、用過的驗證碼 nonce 的雜湊、手動同步與續訂的冷卻時間（帳號 id 的雜湊，60 秒）、星穹鐵道的提醒與自動兌換的 cookie 通知發過了沒（遊戲帳號與期別的雜湊，避免同一件事提醒兩次）。超過一天的紀錄會在下一次有人登入、註冊、按同步或續訂、排程發提醒時順便刪除，不另外排程。

## 快取

- **快取範圍**：頁面與鈴鐺讀的資料都有快取，在 Vercel 上用的是 Runtime Cache。
- **自動失效**：網站上的修改、webhook 與排程寫入資料時，會讓對應的快取失效。所以重新整理頁面時，通常只查一次資料庫（用來確認登入）。
- **外部資料**：畫面上即時讀的外部資料不存資料庫，只放快取（追蹤、連結、保留時存下的平台資料見上方〈資料保留〉的「不存」），效期依資料變動的頻率：
  | 資料 | 效期 | profile |
  |---|---|---|
  | Twitch 直播狀態、觀看人數、預覽圖 | 最多 2 分鐘 | `live` |
  | HoYoLAB 即時便箋 | 最多 5 分鐘 | `external` |
  | HoYoLAB 角色、開拓月曆、活動日曆、終局戰績 | 最多 30 分鐘 | `records` |
  | 證交所與櫃買中心的收盤價（一天更新一次） | 每小時重讀，最多 6 小時 | `quotes` |
  | Twitch 頭像、離線橫幅、遊戲封面；YouTube 頻道頭像、影片資訊；HoYoLAB 遊戲頭像 | 最多一天 | `avatar` |
  - 讀不到（被擋、出錯、資料不公開）時只快取幾分鐘，之後再試；收盤價只讀到其中一個來源時也一樣。
  - EventSub 收到開台或關台時，直播狀態跟著重抓；重新連結 HoYoLAB 帳號、cookie 失效的標記改變時，HoYoLAB 的資料跟著重抓。每小時的開拓力排程沒改到帳號就不會讓它重抓。
  - 資料函式的參數都是明確的識別碼（頻道、主播、遊戲、股票代號；HoYoLAB 是使用者加帳號），頁面只拿自己追蹤的、自己連結的、自己持有的去查；沒有持股時不讀收盤價。
- **依使用者的資料**：快取函式的第一個參數是使用者 id（頁面確認登入後傳進去），每個人各自一份；tag 只到資料表層級，任何人的寫入都讓整張表的快取失效（使用者少，多查幾次資料庫比漏掉失效安全）。翻譯是共用的，所有人讀同一份快取。
- **管理頁**：使用者與邀請清單有快取（`core:users`、`core:invites`），註冊、刪除帳號與管理頁的操作都會讓它失效；登入檢查不快取，每次都查資料庫。用 `npm run account` 建帳號時不會通知快取，清單可能晚一點才出現（重新部署立即生效）。
- **直接改資料庫**：在 Supabase 後台直接改資料時，快取不會知道。
  - 大約一小時後的下一次讀取才會更新；沒人瀏覽的話，最多一天。
  - **重新部署會立即生效。**
- **費用**：Vercel Hobby 不收費，用量可以在 Vercel 後台的 Observability 查看。
- **寫法規則**：`use cache: remote`、cache tag，以及由誰負責讓快取失效，見 CLAUDE.md〈快取〉。

## 安全

- **帳號與角色**：
  - `core_users` 的 `role` 是 `owner`（站長）或 `member`（成員），新帳號預設 member。第一個帳號由 `npm run account create` 建立，就是站長；其他人只能用站長的邀請連結註冊，一律是成員。
  - 權限一律以資料庫為準：cookie 只帶使用者 id 與 session 版本，`requireSession()` 每次都查資料庫拿角色；管理頁與它的 Server Action 都呼叫 `requireOwner()`，不是站長就導回首頁。導覽列的「管理」只是不顯示。
- **邀請制註冊**：
  - 邀請碼是 32 bytes 的亂數，`core_invites` 只存它的 sha256；完整連結只在建立當下的回應裡出現一次：之後的請求不會帶回去，管理頁換到別頁時也會從畫面上清掉。
  - 期限 1／7／30 天、次數 1／5／10 次，可以撤銷。用掉一次是條件式 update（沒撤銷、沒過期、已用次數小於上限才加一），跟建立帳號在同一個交易裡；資料庫另有檢查約束，已用次數不會超過上限。
  - `/register` 是公開頁面：沒有有效的邀請碼就不顯示表單。表單有蜜罐欄位、要勾選同意使用聲明；邀請碼有效時才會告訴對方「帳號已經有人使用」，沒有邀請的人不能拿註冊頁查帳號。
  - 同一個 IP 每小時最多送出 10 次註冊、用錯 10 次邀請碼（到上限後連有效的邀請碼也先不受理）。計數存在 `core_rate_limits`：Vercel 是 serverless，記憶體不共用。IP 用 `SESSION_SECRET` 加料雜湊（HMAC）後才存，只拿到資料庫算不回原本的 IP。
- **圖形驗證碼**（登入與註冊都要）：
  - 5 個不容易看錯的字（沒有 0／O、1／I／L 這類），伺服器用內建的筆畫字型畫成扭曲的 SVG `<path>`，加上干擾線與雜點；原始碼裡沒有 `<text>`，也找不到驗證碼的字元。
  - 圖片從公開的 `/api/auth/captcha` 載入（`no-store`），同時設一個 HttpOnly、SameSite=Strict 的 cookie（production 另加 Secure），裡面只有 nonce、5 分鐘的到期時間與兩個 HMAC，沒有驗證碼本身：一個含答案，另一個不含答案、只涵蓋用途、nonce 與到期時間。HMAC 的金鑰從 `SESSION_SECRET` 衍生，跟 IP 雜湊的金鑰分開。
  - 送出時先驗不含答案的 HMAC：cookie 是偽造的、改過期限或用途就直接拒絕，不會寫資料庫。通過了才記下 nonce（每個只能用一次，答錯也算用掉；雜湊記在 `core_rate_limits`，超過一天的順便刪除），再不分大小寫與空白比對答案。每次送出後都清掉 cookie、換一張新的。
  - 登入在檢查密碼前驗證：答錯不算帳號的鎖定次數（還沒查帳號，也看不出帳號是否存在），只算 IP 的失敗次數。註冊在蜜罐之後驗證。
  - 本機的 E2E 可以用 `DEV_CAPTCHA_CODE` 固定驗證碼，production 一定不會生效。
- **登入**：
  - 帳號加密碼登入，密碼用 scrypt 雜湊；密碼欄位可以用眼睛按鈕切換顯示。設定新密碼時（註冊、改密碼、命令列）要 12 個字元以上，不能是常見密碼、不能只是同一小段重複，也不能包含帳號名稱。
  - 錯誤訊息一律是「帳號或密碼錯誤」：帳號不存在、密碼錯誤、帳號鎖定中都一樣，也都會跑一次 scrypt，不透露帳號是否存在。只有密碼正確時才會說明帳號已停用。
- **次數限制**：
  - 同一個 IP 在 15 分鐘內錯 5 次，就鎖 15 分鐘（記憶體，多個執行個體時只是盡力而為）。
  - 同一個帳號連錯 5 次鎖 15 分鐘，之後每連錯 5 次鎖 30、60 分鐘（`core_users` 的 `failed_logins`、`locked_until`，換 IP 也一樣）。每次嘗試先在資料庫占用一次再驗證密碼，同時送出很多請求也只有鎖定前的幾次會被驗證；登入成功、管理頁的「解除鎖定」、`npm run account unlock` 或 `passwd` 會歸零。
  - 在網站上改密碼與刪除帳號要輸入目前的密碼，錯 5 次鎖 15 分鐘，以帳號計算（記憶體計數，多個執行個體時只是盡力而為）。
- **停用與刪除**：
  - 站長可以停用（`disabled_at`）或刪除其他帳號，不能停用或刪除自己。停用後 `requireSession()` 立刻擋下簽章仍有效的 cookie；停用時 session 版本也加一，恢復後停用前的 cookie 不能再用，要重新登入。
  - 停用等於凍結：排程不用他的 HoYoLAB cookie 簽到、查便箋、發提醒或自動兌換，也不替他自動記固定收支，`notify()` 也不寫通知給他。資料、追蹤名單與共用的訂閱都保留（他追蹤的主播與頻道不會被當成沒人追蹤而刪掉），恢復後照常運作。
  - 每個人都可以在帳號頁輸入密碼刪除自己的帳號；最後一個（未停用的）站長不能刪除自己。他的邀請、通知、追蹤名單、保留的影片、加密的 API Key 與 HoYoLAB cookie、理財資料由外鍵一起刪除，共用的翻譯留下但不再連到他（見〈資料表〉）。
- **登入狀態**：cookie 保留 30 天。改密碼後，其他裝置的 cookie 會立刻失效。登出（或被導回登入頁）後，登入頁會整頁重新載入一次：頁面切換時 Next 會把前一個人的頁面藏起來保留狀態，重新載入才不會讓下一個在同一個分頁登入的人看到他打到一半的密碼或表單。
- **手動同步訂閱與續訂**：Twitch 的「同步訂閱」與 YouTube 的「續訂」處理的是共用的訂閱，所有人都能按；回應只說自己追蹤的主播或頻道，不透露全站的數量。每個人 60 秒只能按一次（冷卻時間記在 `core_rate_limits`）。
- **每個操作都再驗證一次**：`proxy.ts` 會擋下未登入的請求，每個 Server Action 與讀資料的元件還會再確認一次登入；不用登入的只有登入、註冊（各自有次數限制與驗證碼）、登出（只刪自己的 cookie）、使用聲明與驗證碼圖片。
- **只碰自己的資料**：表單或網址送來的 id 只決定操作哪一筆，service 一律用登入者的 id 比對擁有者；改 id 去操作別人的資料會被當作不存在（每一類都有測試）。
- **公開頁面**：`/login`、`/register`、`/terms` 與驗證碼圖片 `/api/auth/captcha` 不用登入（`proxy.ts` 的 matcher 整段比對，`/registerx` 這類路徑照樣要登入）。
- **不讓搜尋引擎收錄**：`/robots.txt` 全部 Disallow，每一頁帶 `noindex, nofollow`；登入、註冊與驗證碼圖片另外可以用 Vercel Firewall 限制次數（見 [部署 › 防機器人與被攻擊時](deploy.md#防機器人與被攻擊時)）。
- **外部服務的端點各自驗證**：
  - Twitch EventSub：驗 HMAC-SHA256 簽章。
  - YouTube WebSub：推送驗 HMAC-SHA1 簽章，訂閱確認要帶跟頻道綁定的驗證碼。
  - 排程：要帶 `CRON_SECRET`。
- **加密欄位**：HoYoLAB cookie 與 AI API Key 用 AES-256-GCM 加密後才存，畫面與 log 都不顯示原文。
- **資料庫的 RLS**：每張資料表都開了 RLS、沒有 policy。網站與 db-migrate 用資料表的擁有者（Supabase 的 `postgres`）連線，不受 RLS 限制；Supabase 的 Data API 用的 anon、authenticated 角色就算拿到專案的 anon key，也一列都讀寫不到。新增資料表時在 `pgTable(...)` 後面加 `.enableRLS()`，不加 policy、不用 FORCE（`migrations.integration.test.ts` 檢查）。Data API 網站用不到，建議關掉（見 [部署 › Supabase 的 Data API 建議關閉](deploy.md#supabase-的-data-api-建議關閉)）。
- **core 的資料表**：`core_users`（帳號、角色、停用、登入失敗次數）、`core_invites`（邀請，只存雜湊）、`core_rate_limits`（註冊與邀請碼的嘗試次數、用過的驗證碼 nonce 的雜湊、手動同步與續訂的冷卻時間、提醒發過了沒的雜湊）、`core_notifications`（網站通知，依收件人）；各模組的表見〈資料表〉。
- **不把密鑰放進 repo**：
  - `.env*` 都在 `.gitignore` 裡，只有不含值的 `.env.example` 例外。
  - 密鑰只放在 Vercel 的環境變數與 GitHub Secrets，電腦上不保存。
  - 錯誤回應與 log 只記錯誤種類，不帶可能含憑證的原文。畫面上的訂閱狀態也只顯示中文摘要（例如「連線逾時，稍後會自動重試」）。

## 新增模組

1. **建目錄**：建 `src/modules/<id>/`，照上面的結構放檔案，資料表名稱以 `<id>_` 開頭、`pgTable(...)` 後面加 `.enableRLS()`。
2. **路由**：
   - 頁面放在 `src/app/(main)/<id>/page.tsx`，只 render 模組 `web/pages/` 的元件。
   - API 放在 `src/app/api/<id>/…/route.ts`，只轉接 `web/routes/` 的 handler。
   - `maxDuration` 這類設定要直接寫在 `src/app` 的檔案裡。
3. **登記模組**：在 `src/modules/index.ts` 登記 `info`。不會發通知的模組在 `info.ts` 設 `notifies: false`，它就不會出現在「提醒方式」（`src/architecture.test.ts` 會檢查這個設定跟有沒有呼叫 `notify()` 一致）。
4. **排程**（有的話）：
   - 在 `src/modules/cron.ts` 登記。
   - 加進 `vercel.json`。Hobby 每條一天最多跑一次，要更頻繁就用同一個路徑多登記幾條（像 `starrail:stamina` 每個 UTC 小時一條）；不要用 GitHub Actions 的定時排程，它常常略過。
   - 更新上方的排程表。
5. **環境變數**（有的話）：加在 `src/core/env.ts`，並依同樣順序加進 `.env.example`。
6. **首頁卡片**（選填）：在 `web/pages/home-card.tsx` 用 `core/ui/home-card.tsx` 的 `HomeCard` 包住卡片內容（標題列先出現，內容有自己的 Suspense 骨架與錯誤邊界），內容先 `requireSession()` 再讀自己的 `service/cached.ts`；再到 `src/app/(main)/page.tsx` 把它放進 `wide`（一張一列，彼此不並排）、`half`（平常一張一列，2xl 以上跟 `compact` 那組各佔半列）或 `compact`（兩張並排）。卡片外框是 `@container`，內容的欄數用容器查詢（`@md:`、`@4xl:`）依卡片寬度決定。
7. **讀寫資料與通知**：
   - 每個人自己的資料表加 `user_id`（外鍵指向 `core_users`、`on delete cascade`），service 的讀寫一律比對登入者的 id，並寫擁有權（IDOR）測試（規則見 CLAUDE.md〈多人〉）。
   - 頁面讀資料用 `service/cached.ts` 的快取函式，使用者 id 當參數；寫入時讓對應的 tag 失效（規則見 CLAUDE.md〈快取〉）。
   - 發通知用 `core/notify.ts` 的 `notify()`，指定收件人的使用者 id。
8. **假外部服務**（有的話）：放在 `dev/mock.mjs`，`npm run mock:external` 會自動載入。
9. **Migration**：執行 `npm run db:generate` 產生 migration，跟程式一起 commit；一個版本只有一個，資料夾只留基準檔與這一版的；要跟還在跑的舊程式相容（先擴充再收斂，見 [部署 › 之後的部署](deploy.md#之後的部署)）。
10. **文件**：在 [模組設定與使用](modules.md) 加上這個模組的說明。
