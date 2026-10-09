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
  - route handler 只轉接，例如 `export { GET } from …`。
- **首頁卡片**：每個模組的首頁卡片放在自己的 `web/pages/home-card.tsx`，由 `src/app/(main)/page.tsx` 組合後交給 core 的 `HomePage` 排版（core 不 import 模組）；每張卡片都要組合到首頁。
- **資料表的位置**：只能定義在 `core/db/schema.ts`（表名以 `core_` 開頭）或模組的 `data/schema.ts`（表名以 `<id>_` 開頭）。
- **環境變數**：都定義在 `core/env.ts`，順序同 `.env.example`；其他地方不直接讀 `process.env`（少數例外列在 CLAUDE.md，也由 `architecture.test.ts` 檢查）。
- **快取寫法**：由 `src/cache-rules.test.ts` 檢查（見下方〈快取〉）。

## 資料表

各模組的資料依使用者分開：每個人只看得到、改得到自己的資料。依使用者的表都有 `user_id`，外鍵指向 `core_users`，刪除帳號時一起刪除（`on delete cascade`）；共用的表不屬於任何人。

| 資料表 | 依使用者／共用 | 內容 | 保留 |
|---|---|---|---|
| `core_users` | — | 帳號、角色、停用、登入失敗次數 | 永久 |
| `core_invites` | 依使用者（建立者） | 邀請，只存雜湊 | 永久，刪除帳號時一起刪 |
| `core_rate_limits` | — | 註冊與邀請碼的嘗試次數、用過的驗證碼 nonce 的雜湊、手動同步與續訂的冷卻時間（帳號 id 的雜湊） | 一小時／一天 |
| `core_notifications` | 依使用者（收件人） | 網站通知 | 14 天 |
| `twitch_follows` | 依使用者 | 追蹤的主播、通知開關 | 永久 |
| `twitch_streamers` | 共用 | 主播與 EventSub 訂閱（同一位主播只訂閱一次） | 沒有人追蹤時刪除 |
| `twitch_stream_events` | 共用 | 開台／關台紀錄（只顯示給追蹤那位主播的人） | 14 天 |
| `youtube_follows` | 依使用者 | 追蹤的頻道、通知開關 | 永久 |
| `youtube_channels` | 共用 | 頻道與 WebSub 訂閱（同一個頻道只訂閱一次） | 沒有人追蹤時刪除 |
| `youtube_videos` | 共用 | 影片與中文字幕狀態（每個人看自己追蹤頻道的最新 20 支） | 見〈資料保留〉 |
| `youtube_settings` | 依使用者 | 翻譯設定、加密的 AI API Key | 永久 |
| `youtube_translations` | 共用 | 翻譯好的字幕；記下發起人（刪除帳號時改成 null）與發起時的專有名詞表 | 永久（影片被清掉、頻道被刪除時都不刪） |
| `starrail_accounts` | 依使用者 | 連結的 HoYoLAB 帳號、加密的 cookie（UID 全站唯一） | 永久 |
| `starrail_checkin_logs` | 跟著帳號 | 簽到紀錄 | 14 天 |
| `savings_goals`、`savings_entries` | 依使用者 | 存錢記帳的項目與紀錄 | 永久 |

- **擁有權**：Server Action、頁面與 Route Handler 都用登入者的 id 呼叫 service，service 的 SQL 同時比對 `user_id`，別人的 id 一律當作不存在。例外是 YouTube 的翻譯：所有人共用，字幕下載也不檢查擁有權。
  - 續翻用觀看者自己的 API Key；別人發起、還沒翻完的翻譯不會自動用他的 Key 接著翻，要他在觀看頁按「用我的 API Key 繼續翻譯」。
  - 只有字幕內容的問題（AI 輸出格式不對、模型拒絕翻譯）才把共用的翻譯標成失敗；觀看者自己的金鑰、額度、頻率限制或連線錯誤只回給他，翻譯維持排隊中，別人看不到。
  - 只有發起人或站長能重新翻譯或換字幕。
- **部署空窗期的舊資料**：`user_id` 可以是 null，是為了部署時還在跑的舊程式（見 [部署 › 從單人版升級](deploy.md#之後的部署)）；新程式不讀這些列。

## 排程

所有排程都是 `GET /api/cron/<排程>`，要帶 `Authorization: Bearer <CRON_SECRET>`。

| 排程 | 做什麼 | 時間（台北） | 由誰呼叫 |
|---|---|---|---|
| `starrail:checkin` | 每日簽到 | 每天 00:10 | Vercel Cron |
| `starrail:stamina` | 開拓力快滿提醒 | 每 30 分鐘 | GitHub Actions `cron.yml` |
| `twitch:cleanup` | 刪除超過 14 天的開台／關台紀錄 | 每天 02:00 | Vercel Cron |
| `youtube:cleanup` | 刪除不在任何人最新 20 支裡、發布超過 48 小時的影片（翻譯不刪） | 每天 02:20 | Vercel Cron |
| `starrail:cleanup` | 刪除超過 14 天的簽到紀錄 | 每天 02:40 | Vercel Cron |
| `starrail:reencrypt` | 每個人的 HoYoLAB cookie 改用目前的金鑰加密 | 每天 03:00 | Vercel Cron |
| `youtube:reencrypt` | 每個人的 AI API Key 改用目前的金鑰加密 | 每天 03:30 | Vercel Cron |
| `twitch:sync` | 檢查並補建 EventSub 訂閱；刪掉沒有人追蹤的主播與它的訂閱 | 每天 04:00 | Vercel Cron |
| `youtube:renew` | 續訂快到期的 WebSub 訂閱；取消並刪掉沒有人追蹤的頻道 | 每天 04:30 | Vercel Cron |
| `notifications:cleanup` | 刪除超過 14 天的網站通知 | 每天 05:00 | Vercel Cron |

**Vercel Cron**

- `vercel.json` 裡的時間是 UTC，也就是台北時間減 8 小時。
- Hobby 方案每個排程一天最多跑一次，而且只保證在設定的那個小時內執行。

**GitHub Actions**

- `starrail:stamina` 要每 30 分鐘跑一次，Vercel Hobby 做不到，所以改由 `cron.yml` 呼叫。它需要 GitHub Secrets 的 `HUB_URL` 與 `CRON_SECRET`。
- GitHub 的排程在尖峰時段可能延遲。
- 公開 repo 連續 60 天沒有活動時，GitHub 會停用排程，要到 Actions 頁面重新啟用。
- 在 Actions 頁面手動執行 `cron.yml` 時，可以指定任何排程。
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
  - 為什麼留 48 小時：hub 在影片發布 24 小時內重送時要找得到原本那一列，才不會重複通知；背景的中文字幕重新檢查也看發布 48 小時內的影片。
- **翻譯好的字幕永久保留**：影片被清掉、頻道沒有人追蹤而被刪除時都不刪（翻譯表跟影片表、頻道表沒有外鍵），花錢翻好的字幕重看不用再付費。
- **永久保留**：邀請連結、追蹤名單、翻譯設定與加密的 API Key、連結的 HoYoLAB 帳號、存錢記帳的所有資料。刪除帳號時，這些連同他的網站通知與簽到紀錄一起刪除。
- **共用、刪除帳號後留下**：翻譯好的字幕（發起人改成 null，發起時的專有名詞表也留在翻譯裡）；主播與頻道在沒有人追蹤時，由取消追蹤的最後一個人或每天的 `twitch:sync`、`youtube:renew` 刪掉。
- **不存**：外部服務的資料（頭像、直播狀態、角色、開拓月曆、終局戰績、兌換碼與結果）只放在快取裡，見下方〈快取〉；圖片由瀏覽器直接向平台的 CDN 載入，網站不轉送也不存。
- **`core_rate_limits`**：註冊與邀請碼的嘗試次數（IP 只存雜湊，時間窗一小時）、用過的驗證碼 nonce 的雜湊、手動同步與續訂的冷卻時間（帳號 id 的雜湊，60 秒）。超過一天的紀錄會在下一次有人登入、註冊或按同步、續訂時順便刪除，不另外排程。

## 快取

- **快取範圍**：頁面與鈴鐺讀的資料都有快取，在 Vercel 上用的是 Runtime Cache。
- **自動失效**：網站上的修改、webhook 與排程寫入資料時，會讓對應的快取失效。所以重新整理頁面時，通常只查一次資料庫（用來確認登入）。
- **外部資料**：向外部服務讀的資料不存資料庫，只放快取，效期依資料變動的頻率：
  | 資料 | 效期 | profile |
  |---|---|---|
  | Twitch 直播狀態、觀看人數、預覽圖 | 最多 2 分鐘 | `live` |
  | HoYoLAB 即時便箋 | 最多 5 分鐘 | `external` |
  | HoYoLAB 角色、開拓月曆、終局戰績 | 最多 30 分鐘 | `records` |
  | Twitch 頭像、離線橫幅、遊戲封面；YouTube 頻道頭像、影片資訊 | 最多一天 | `avatar` |
  - 讀不到（被擋、出錯、資料不公開）時只快取幾分鐘，之後再試。
  - EventSub 收到開台或關台時，直播狀態跟著重抓；重新連結 HoYoLAB 帳號時，HoYoLAB 的資料跟著重抓。
  - 資料函式的參數都是明確的識別碼（頻道、主播、遊戲；HoYoLAB 是使用者加帳號），頁面只拿自己追蹤的、自己連結的去查。
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
  - 邀請碼是 32 bytes 的亂數，`core_invites` 只存它的 sha256；完整連結只在建立當下的回應裡出現一次。
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
  - 停用等於凍結：排程不用他的 HoYoLAB cookie 簽到、查便箋或發開拓力提醒，`notify()` 也不寫通知給他。資料、追蹤名單與共用的訂閱都保留（他追蹤的主播與頻道不會被當成沒人追蹤而刪掉），恢復後照常運作。
  - 每個人都可以在帳號頁輸入密碼刪除自己的帳號；最後一個（未停用的）站長不能刪除自己。他的邀請、通知、追蹤名單、加密的 API Key 與 HoYoLAB cookie、記帳資料由外鍵一起刪除，共用的翻譯留下但不再連到他（見〈資料表〉）。
- **登入狀態**：cookie 保留 30 天。改密碼後，其他裝置的 cookie 會立刻失效。
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
- **core 的資料表**：`core_users`（帳號、角色、停用、登入失敗次數）、`core_invites`（邀請，只存雜湊）、`core_rate_limits`（註冊與邀請碼的嘗試次數、用過的驗證碼 nonce 的雜湊、手動同步與續訂的冷卻時間）、`core_notifications`（網站通知，依收件人）；各模組的表見〈資料表〉。
- **不把密鑰放進 repo**：
  - `.env*` 都在 `.gitignore` 裡，只有不含值的 `.env.example` 例外。
  - 密鑰只放在 Vercel 的環境變數與 GitHub Secrets，電腦上不保存。
  - 錯誤回應與 log 只記錯誤種類，不帶可能含憑證的原文。畫面上的訂閱狀態也只顯示中文摘要（例如「連線逾時，稍後會自動重試」）。

## 新增模組

1. **建目錄**：建 `src/modules/<id>/`，照上面的結構放檔案，資料表名稱以 `<id>_` 開頭。
2. **路由**：
   - 頁面放在 `src/app/(main)/<id>/page.tsx`，只 render 模組 `web/pages/` 的元件。
   - API 放在 `src/app/api/<id>/…/route.ts`，只轉接 `web/routes/` 的 handler。
   - `maxDuration` 這類設定要直接寫在 `src/app` 的檔案裡。
3. **登記模組**：在 `src/modules/index.ts` 登記 `info`。不會發通知的模組在 `info.ts` 設 `notifies: false`，它就不會出現在「提醒方式」（`src/architecture.test.ts` 會檢查這個設定跟有沒有呼叫 `notify()` 一致）。
4. **排程**（有的話）：
   - 在 `src/modules/cron.ts` 登記。
   - 一天一次的加進 `vercel.json`；更頻繁的加進 `.github/workflows/cron.yml`。
   - 更新上方的排程表。
5. **環境變數**（有的話）：加在 `src/core/env.ts`，並依同樣順序加進 `.env.example`。
6. **首頁卡片**（選填）：在 `web/pages/home-card.tsx` 用 `core/ui/home-card.tsx` 的 `HomeCard` 包住卡片內容（標題列先出現，內容有自己的 Suspense 骨架與錯誤邊界），內容先 `requireSession()` 再讀自己的 `service/cached.ts`；再到 `src/app/(main)/page.tsx` 把它放進 `wide`（一張一列）或 `compact`（兩張並排）。
7. **讀寫資料與通知**：
   - 每個人自己的資料表加 `user_id`（外鍵指向 `core_users`、`on delete cascade`），service 的讀寫一律比對登入者的 id，並寫擁有權（IDOR）測試（規則見 CLAUDE.md〈多人〉）。
   - 頁面讀資料用 `service/cached.ts` 的快取函式，使用者 id 當參數；寫入時讓對應的 tag 失效（規則見 CLAUDE.md〈快取〉）。
   - 發通知用 `core/notify.ts` 的 `notify()`，指定收件人的使用者 id。
8. **假外部服務**（有的話）：放在 `dev/mock.mjs`，`npm run mock:external` 會自動載入。
9. **Migration**：執行 `npm run db:generate` 產生 migration，跟程式一起 commit；要跟還在跑的舊程式相容（先擴充再收斂，見 [部署 › 之後的部署](deploy.md#之後的部署)）。
10. **文件**：在 [模組設定與使用](modules.md) 加上這個模組的說明。
