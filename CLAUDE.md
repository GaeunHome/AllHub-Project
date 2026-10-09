@AGENTS.md

# CLAUDE.md

AllHub Project：個人整合系統（站長管理，其他人只能用站長的邀請連結註冊；各模組的資料依使用者分開，只有 YouTube 的翻譯共用），Next.js 16 App Router＋TypeScript＋Drizzle＋PostgreSQL＋Tailwind 4，部署到 Vercel Hobby＋Supabase。使用者文件見 README.md（精簡的專案首頁）與 `docs/`：部署 `deploy.md`、密鑰 `secrets.md`、模組 `modules.md`、架構 `architecture.md`、本機開發 `development.md`。

## 指令

- 檢查：`npm test`（vitest，整合測試用記憶體 PGlite；`vitest.config.mts` 固定 `maxWorkers: 4`，機器忙時才不會逾時）、`npm run lint`、`npm run build`、`npm run typecheck`（要用 build 產生的 `.next/types`，放最後；增量資訊寫在 `.next/cache/tsconfig.tsbuildinfo`，根目錄不會有 `tsconfig.tsbuildinfo`）。
- 改 `core/db/schema.ts` 或模組的 `data/schema.ts` 後：`npm run db:generate`，migration 產生在 `src/core/db/migrations/` 並一起 commit；不要從本機對正式資料庫 migrate。
- 本機：`npm run db:local`（PGlite，要設 `DATABASE_POOL_MAX=1`）、`npm run mock:external`（假外部服務，搭配 `DEV_EXTERNAL_ORIGIN=http://127.0.0.1:4010`）。
- 帳號：`npm run account create`（第一個是站長，之後是成員）／`passwd <帳號>`（也會解除登入鎖定）／`unlock <帳號>`（只解除登入鎖定，不改密碼）／`list`（含角色與停用），在 `src/dev/account.ts`，用 node 直接執行（型別剝除）。

## 架構規則（`src/architecture.test.ts` 檢查，改規則時兩邊一起改）

所有程式碼都在 `src/`，根目錄只放設定檔與文件。

- `src/app/`：路由殼。頁面只 render 模組 `web/pages/` 或 core 的頁面元件；route handler 只轉接（`export { GET } from …`）。segment config（例如 `maxDuration`）必須直接寫在這裡。只能用模組的 `info`、`cron`、`web/pages`、`web/routes`。
- `src/core/`：共用基礎，不能 import 模組、模組清單或 `src/app`。
  - `env.ts`：所有環境變數（zod，分組用到才驗證，順序同 `.env.example`，`env.test.ts` 檢查；`docs/secrets.md` 產生亂數的那行指令也由它實際執行並驗證）；別處不直接讀 `process.env`，例外只有 `NODE_ENV`、`proxy.ts` 的 `SESSION_SECRET`、`drizzle.config.ts` 的 `DATABASE_URL`、`src/dev` 的命令列工具（有 `import.meta.main` 的入口）、假外部服務（`dev/mock-external.mjs`、模組的 `dev/mock.mjs`）的 `MOCK_` 設定（`MOCK_PORT`、`MOCK_AI_MS_PER_LINE`），以及測試檔。`architecture.test.ts` 會掃 `src/` 與根目錄的設定檔檢查；新的用法對不上這份清單時，先回報再決定要不要改規則，不要直接放寬。
  - `db/`：postgres-js（`prepare: false` 配 Supabase pooler）；`db/schema.ts` 放 core 的表（`core_users`、`core_invites`、`core_rate_limits`、`core_notifications`）。
  - `admin/`：管理頁（只有站長）：使用者清單（停用、恢復、刪除）與邀請連結；讀取在 `admin/cached.ts`。
  - `auth/`、`notifications/`、`ui/`、`cron.ts`（排程入口，合併 core 自己的排程，模組蓋不掉；名稱來自網址，只認自己登記的，用 `Object.hasOwn` 比對，`constructor` 這類名稱回 404）、`cache.ts`、`cooldown.ts`（`takeCooldown()`：每人每段時間只能做一次，例如手動同步訂閱，計數在 `core_rate_limits`，只存使用者 id 的雜湊）、`crypto.ts`、`notify.ts`、`retention.ts`、`external-url.ts`（`externalFetch()`；瀏覽器載入的圖片網址用 `externalAssetUrl()`）、`module.ts`（`ModuleInfo`、`CronTask` 型別）、`time.ts`（台北時間的顯示）、`errors.ts`（`errorKind()`、`logError()`、`connectionProblem()`：逾時、連不上這類連線錯誤給畫面看的中文摘要）、`robots.ts`（robots.txt 與 `NO_INDEX`）、`form.ts`（Server Action 的欄位解析與 `runAction()`；不能加 `"use server"`，否則每個 export 都會變成可直接 POST 的 action）。
  - `ui/` 的共用件：`home-page.tsx`＋`home-card.tsx`（首頁的排版與卡片外框）、`card-error-boundary.tsx`（`next/error` 的 `catchError`，畫面只說讀不到、可以重試，不顯示錯誤內容）、`empty-state.tsx`（`compact` 是卡片裡的橫向小版，可以帶 `action` 按鈕）、`external-image.tsx`（外部圖片）、`avatar.tsx`（圓形頭像，只有 xs／sm／md／lg 四種大小，退回文字頭像）、`page-header.tsx`（`PageHeader` 頁首、`CardHeader` 卡片的標題列、`SectionTitle` 卡片外的區段標題）、`status-chip.tsx`（狀態標籤）、`form-message.tsx`（`FormState`、`FormFeedback`、`InlineFeedback`）、`action-button.tsx`（只有一個按鈕的表單）、`notify-toggle.tsx`＋`notify-toggle-form.ts`（通知開關與它的欄位解析）、`local-pref.ts`（`createLocalPref()`，存在瀏覽器的偏好，跨分頁同步）、`more-menu.tsx`（⋮ 選單：寬螢幕貼著按鈕、手機從底部升起；fixed 定位，放在會橫向捲動的列裡也不會被裁掉）、`theme.ts`＋`theme-sync.tsx`（外觀：淺色／深色／跟隨系統）、`copy-button.tsx`（複製到剪貼簿）、`password-input.tsx`（密碼欄位，眼睛按鈕切換明碼與隱碼）。
- `src/modules/<id>/`：功能模組，彼此獨立（不能 import 其他模組、模組清單或 `src/app`）。
  - 根目錄只有 `info.ts` 與 `cron.ts`，分別登記在 `src/modules/index.ts`、`src/modules/cron.ts`；各層都不能 import 根目錄（環境變數用 `@/core/env`，service 裡另外寫死模組 id）。沒有呼叫 `notify()` 的模組在 `info.ts` 設 `notifies: false`，「提醒方式」只列會發通知的模組（`architecture.test.ts` 檢查）。
  - 四層只能往下依賴：`web → service → data → lib`。web 只能 `import type` data，不能用 `@/core/db`。
  - `web/`（`pages/`、`components/`、`actions.ts`、`routes/`）、`service/`、`data/schema.ts`、`lib/`、`dev/mock.mjs`（假外部服務，`mock:external` 自動載入）。
- 首頁卡片放在模組的 `web/pages/home-card.tsx`，由 `src/app/(main)/page.tsx` 組合，傳給 core 的 `HomePage` 排版（`wide` 一張一列、`compact` 兩張並排等寬等高，最後一張固定是 core 的未讀通知；core 不 import 模組）；`architecture.test.ts` 檢查每張卡片都組合到首頁。卡片外框用 `core/ui/home-card.tsx` 的 `HomeCard`（標題列與前往模組頁的連結先出現，內容各自包一層 Suspense 骨架與 `CardErrorBoundary`，慢或出錯都只影響那一張）；內容是 server component，先 `requireSession()` 再讀模組自己的 `service/cached.ts`（使用者 id 當第一個參數，跟模組頁共用同一份快取），不另外寫一套讀法。
- 資料表只能定義在 `core/db/schema.ts`（`core_` 開頭）或模組的 `data/schema.ts`（`<id>_` 開頭）。
- `src/dev/`：命令列工具、假外部服務入口、測試輔助，正式程式不能 import。測試輔助：`test-db.ts` 的 `setupTestDb()`（PGlite）與 `insertTestUser()`（依使用者的表有外鍵，先建帳號；可以指定成 `TEST_SESSION.id`）、`test-env.ts`（`stubCoreEnv()` 等，要在 `await import()` 被測模組前呼叫）、`test-helpers.ts`（`form`、`captureErrorLog`、`loggedText`、`tagged`／`updated`／`expiredTags`、`mocksOf`）、`session-stub.ts`（`vi.mock("@/core/auth", () => import("@/dev/session-stub"))`；預設是站長 `TEST_SESSION`，測擁有權時用 `requireSession.mockResolvedValue(OTHER_SESSION)` 換成成員 bob）、`fake-fetch.ts`、`next-cache-stub.ts`＋`vitest-setup.ts`、`icu-simulation.ts`。換掉模組的部分函式用 `vi.mock(path, { spy: true })`，不寫轉接的 `(...a) => fn(...a)`。命令列工具與 `core/auth/credentials.ts`（含它 import 的 `password-rules.ts`、`common-passwords.ts`）、`core/db/schema.ts`、`core/errors.ts` 會被純 node 載入：相對路徑寫 `.ts`、不能用 `@/`、型別用 `import type`（`account.test.ts` 實際載入一次確認）。

## 程式碼慣例

- 檔名與資料夾 kebab-case，元件與型別 PascalCase，函式與變數 camelCase，常數 UPPER_SNAKE_CASE。
- 註解只寫「為什麼」，一律一行（`//`、`/** */` 或 JSX 的 `{/* */}`）；不重述程式碼。測試名稱與介面文字不算註解。
- 介面文字、註解、測試名稱用繁體中文。
- 每個行為改變都先寫或改出會失敗的測試，確認失敗再實作；不刪除或放寬既有測試。
- 不裝新套件、不改資料表結構，除非使用者要求。
- 只有一個按鈕的表單（刪除、開關、排序）用 `core/ui/action-button.tsx`，刪除類帶 `confirmMessage` 先確認（底層是 `confirm-submit-button.tsx`）；按鈕旁的回饋用 `InlineFeedback`，表單下方用 `FormFeedback`。圖示用 `core/ui/icon.tsx`（名稱列在 `UI_ICON_NAMES`，檔案在 `public/icons/ui/`），卡片的標題列用 `CardHeader`、卡片外的區段標題用 `SectionTitle`，空狀態用 `EmptyState`。
- 對外請求一律經 `core/external-url` 的 `externalFetch()`（開發時改送假伺服器、預設 15 秒逾時，AI 翻譯用 `AI_TIMEOUT_MS`），新增外部呼叫也要用它。
- 外部圖片（頭像、縮圖、角色圖）由瀏覽器直接向平台的 CDN 載入，網站與資料庫都不存：用 `core/ui/external-image.tsx`（`next/image` 加 `unoptimized`，不經 Vercel 的圖片最佳化；`referrerPolicy="no-referrer"`；載入失敗或沒有網址時顯示 `fallback`），圓形頭像用 `core/ui/avatar.tsx`（退回名稱的第一個字）。網址一律先在伺服器端經 `core/external-url` 的 `externalAssetUrl()`：開發時有 `DEV_EXTERNAL_ORIGIN` 就改寫到假伺服器（E2E 不會連到真的 CDN），正式環境原樣輸出，不是 http(s) 的回 null。固定大小的圖給 `width`／`height`，填滿固定比例外框的用 `fill`（外框要是 relative）。
- 畫面風格：全站簡潔中性（`globals.css` 的 token：白／淡灰底、灰色細框、陰影很輕），主色只有一個深藍，只用在主要按鈕、連結與焦點框；模組的品牌色（`data-accent`：`blue`／`red`／`violet`／`gold`／`green`，型別是 `core/module.ts` 的 `ModuleAccent`）只用在圖示與小標籤。Twitch 頁用 `.theme-twitch`、星穹鐵道頁用 `.theme-starrail`（兩頁固定深色），YouTube 頁用 `.theme-youtube`（照 YouTube 網站的淺色與深色，跟著外觀切換，紅色只用在標誌與進度條）：只換 CSS 變數，共用的 class（`card`、`chip`、按鈕、`input`…）自動跟著換色，不要另外複製一套元件。
- 間距與對齊（主題頁也照這套，只換配色）：
  - 距離交給父層的 gap，子元素不加零散的 margin（例外：`details` 的展開內容、絕對定位、對齊用的負邊距）。頁面的區塊之間 `page-stack`（gap-8）；卡片與區段裡、表單的欄位之間 `stack`（gap-4）；欄位是 `field`＋`field-label`（標籤與輸入框 gap-1.5）；一排按鈕 `button-row`（gap-2）。
  - 卡片內距一律 `card`（p-5／sm:p-6）；卡片裡撐滿左右的清單用 `card-list`＋`card-row`（列的左右內距跟卡片一樣，文字對齊卡片內容），只有清單的卡片是 `card p-0`＋`card-row`；卡片裡再小一級的區塊用 `panel`／`panel-outline`（p-4）。標題放在卡片裡用 `CardHeader`，頁首、區段標題、卡片對齊同一條左邊線；主要頁面都在 AppShell 的 max-w-5xl 裡，登入與註冊共用 `AuthCard`（max-w-md）。
  - 高度：按鈕、輸入框、下拉選單、分段選擇、YouTube 的膠囊與搜尋列都是 44px；清單列與工具列裡的次要按鈕（`btn-sm`）、導覽膠囊、⋮ 是 36px，觸控裝置一律放大到 44px（`globals.css` 最後的 `pointer: coarse`），太小的元素用透明的偽元素把點擊範圍撐到 44px；只有圖示的按鈕是正方形（`btn-icon`、`icon-button`）；chip 一律 22px。
  - 同一列的卡片用 grid 等寬等高、清單的列一樣高；頭像只用 `Avatar` 的四種大小；圖示與文字垂直置中；金額與數字靠右加 `tabular-nums`，同一欄用固定欄寬對齊。
  - 手機：單欄、左右內距 16px（彈出面板也一樣）、不能橫向捲動（刻意橫捲的頭像列、篩選膠囊列、觀看頁的膠囊列除外）。
- 外觀（淺色／深色／跟隨系統）在導覽列的人像選單切換：`createLocalPref`（key `allhub:theme`）存在瀏覽器、跨分頁同步，寫在 `<html data-theme>`（跟隨系統時拿掉）。根 layout `<head>` 的同步腳本（`THEME_INIT_SCRIPT`）在第一次繪製前套用，深色不會先閃一下淺色；`ThemeSync` 補回開發模式 StrictMode 清掉的屬性。深色的樣式一律用 `@variant dark`／`dark:`（`globals.css` 的 `@custom-variant dark`：有 `data-theme` 時以它為準，沒有時跟隨系統），不要直接寫 `prefers-color-scheme`（`theme.test.ts` 檢查）。
- 少用灰色小字：使用者需要的狀態用標籤（`StatusChip`、`chip`）或圖示加正常大小的深色文字；不常看的說明收進 `<details>`（`disclosure`）或移到 docs；時間與數量保留但要夠深（`text-ink-soft`）。錯誤與提醒照常用 `FormFeedback`／`InlineFeedback`。
- Server Action：先 `requireSession()`（管理用的先 `requireOwner()`），拿到的使用者 id 傳給 service（見〈多人〉），欄位用 `core/form.ts` 的 `formText`／`formId`／`formFlag` 讀，寫入包在 `runAction()` 裡（錯誤變成表單訊息、log 只記種類，不會跳錯誤畫面）；`requireSession()` 與 `redirect()` 放在 `runAction()` 外面，`updateTags` 照〈快取〉放 finally 或成功之後。
- 日期時間顯示一律用 `core/time.ts`，不直接用 `Intl.DateTimeFormat` 或 `toLocale*String`（ICU 版本不同時空白字元會變，CI 曾因此失敗；`architecture.test.ts` 檢查）。
- README 保持精簡，細節寫在 docs/；新增功能時更新對應的 docs 頁。

## 安全

- `proxy.ts` 只驗 JWT 簽章與期限（不查資料庫，維持 edge 可用）。**Server Action 與讀資料的元件都要呼叫 `requireSession()`**：Server Action 可被直接 POST，改密碼後舊 cookie 的簽章仍有效、被停用的帳號 cookie 也還有效，只有它會比對資料庫的 `session_version` 與 `disabled_at`。停用帳號時 `session_version` 也加一，恢復後停用前的 cookie 不能再用。`(main)/layout.tsx` 的 `SessionGuard` 讓沒讀資料的頁面也會擋；Route Handler 用 `currentSession()`，沒登入回 401。
- 角色：`core_users.role` 是 `owner`／`member`，權限一律讀資料庫（cookie 不帶角色）。管理頁的讀取與 Server Action 都呼叫 `requireOwner()`（不是站長就導回首頁），導覽列的「管理」只是不顯示。
- 公開頁面只有 `/login`、`/register`、`/terms` 與驗證碼圖片 `/api/auth/captcha`（`proxy.ts` 的 matcher 排除，整段比對）；不用登入的 Server Action 只有 `login`、`registerAction`（各自有次數限制與圖形驗證碼）與 `logout`（只刪自己的 cookie），其他都要登入。
- 圖形驗證碼（`core/auth/captcha.ts`、`captcha-image.ts`）：5 個不易混淆的字，用內建的筆畫字型畫成扭曲的 `<path>`，SVG 裡不能有 `<text>` 或字元本身。`/api/auth/captcha?for=login|register` 回 SVG（`no-store`）並設 HttpOnly、SameSite=Strict（production 加 Secure）的 cookie，只放 nonce、5 分鐘的到期時間與兩個 HMAC（金鑰從 `SESSION_SECRET` 用 `allhub:captcha` 衍生，跟 IP 雜湊分開）：一個含答案，一個不含答案、只涵蓋用途、nonce 與到期時間；不放驗證碼。Server Action 先用 `takeCaptchaToken()` 讀出並清掉 cookie（每次送出都換一張），再 `verifyCaptcha()`：先驗不含答案的 HMAC（偽造、改過期限或用途的 cookie 在這裡就擋下，不寫資料庫），通過了才用 `claimOnce()` 把 nonce 的 sha256 記在 `core_rate_limits`（每個只能用一次，答錯也用掉，超過 1 天的順便清掉），最後不分大小寫與空白比對答案。登入在檢查密碼前驗證，答錯不算帳號的鎖定次數、只算 IP 的；註冊在蜜罐之後驗證。錯誤一律「驗證碼錯誤，請重新輸入」。
- 只能用邀請註冊：`core_invites` 只存邀請碼（32 bytes 亂數）的 sha256，完整連結只在 `createInviteAction` 的回應裡出現一次。用掉一次是條件式 update（沒撤銷、沒過期、已用次數小於上限才加一），跟建立帳號在同一個交易裡，資料庫另有 `used_count <= max_uses` 的檢查。註冊表單有蜜罐欄位（`messages.ts` 的 `HONEYPOT_FIELD`）、要勾選同意 `/terms`；邀請有效時才告訴對方帳號已被使用。
- 次數限制：註冊（每個 IP 每小時 10 次）與無效邀請碼（10 次）的計數存在資料庫（`core/auth/attempts.ts`、`core_rate_limits`，serverless 的記憶體不共用），IP 用 `SESSION_SECRET` 做 HMAC 後才存，不存原文。登入依帳號鎖定（`core_users.failed_logins`、`locked_until`：連錯 5 次鎖 15 分鐘，之後 30、60 分鐘），先在資料庫占用一次再驗證密碼；錯誤一律「帳號或密碼錯誤」，鎖定中也一樣。依 IP 的登入限制仍在記憶體（盡力而為）。
- 外部呼叫的端點不走登入、各自驗證：`/api/twitch/eventsub`（HMAC-SHA256）、`/api/youtube/websub`（GET 要帶 callback 上跟頻道綁定的 `k`，訂閱只確認追蹤中頻道；POST 驗 HMAC-SHA1，不符回 204 但忽略）、`/api/cron/<排程>`（`CRON_SECRET`）。新增這類端點要同步改 `proxy.ts` 的 matcher（整段比對，後面接 `(?:/|$)`）。webhook 只在真的寫入時才讓快取失效。
- `/api/notifications` 的 POST 檢查同源（`Origin` 對 `Host`）與 JSON。
- 錯誤訊息可能夾帶憑證或 SQL 參數：對外回應（cron 結果、Server Action 回傳）只放摘要，log 用 `core/errors.ts` 的 `logError()` 只記錯誤種類（`error.name`，DecryptionError 記原因代碼），不記 message。寫進資料庫、會顯示在畫面上的狀態也一樣：Twitch 與 YouTube 的訂閱失敗用各自 lib 的 `subscriptionFailure()` 寫中文摘要（依錯誤種類與狀態碼，逾時是「連線逾時，稍後會自動重試」），不寫原文。
- 防機器人：`/robots.txt`（實作在 `core/robots.ts`，`src/app/robots.ts` 只轉接）對所有爬蟲 `Disallow: /`，根版面的 metadata 帶 `NO_INDEX`（noindex、nofollow）；`robots.txt` 在 `proxy.ts` matcher 的排除清單裡，沒登入的爬蟲才讀得到。登入與註冊次數的 Vercel Firewall 規則（同一條規則用 OR 涵蓋 POST `/login`、POST `/register` 與 `/api/auth/captcha`）與 Attack Mode 寫在 `docs/deploy.md`。
- 第三方憑證（HoYoLAB cookie、AI API Key）用 `core/crypto` 的 `encryptSecret` 加密後才存；畫面與 log 不出現原文（AI Key 只顯示末 4 碼 hint）。新增加密欄位要加進該模組的 `reencrypt` 排程。
- 原始碼與部署設定不放任何密碼或密鑰；正式環境的密鑰只存在 Vercel 環境變數與 GitHub Secrets，本機不保存。

## 多人：依使用者的資料與擁有權

- 依使用者的表都有 `user_id`，外鍵指向 `core_users`、`on delete cascade`（刪除帳號時一起刪）：`core_notifications`、`twitch_follows`、`youtube_follows`、`youtube_settings`、`starrail_accounts`（簽到紀錄跟著帳號刪）、`savings_goals`、`savings_entries`；`core_invites.created_by` 也是 cascade。共用的表：`twitch_streamers`、`twitch_stream_events`、`youtube_channels`、`youtube_videos`、`youtube_translations`（發起人 `requested_by` 是 `on delete set null`，翻譯留給其他人）。新增依使用者的表照同樣寫，新增 core 以外的連帶刪除不用改 `deleteOwnAccount()`（core 不能 import 模組，連帶刪除只靠外鍵）。
- 使用者 id 一律來自 `requireSession()`（Route Handler 是 `currentSession()`），當 service 函式的第一個參數（重新翻譯、上傳字幕要看角色，傳整個 session）；不從表單、網址或其他地方拿使用者 id。表單或網址送來的資料 id 只決定操作哪一筆。
- 擁有權在 service 的 SQL 裡檢查：收 id 的讀寫一律同時比對 `user_id`（`where id = ? and user_id = ?`），別人的 id 當作不存在（回 null／false／「找不到…，請重新整理頁面」，不另外說「沒有權限」，免得透露那筆資料存在）。頁面的選擇（例如星穹鐵道的 `?account=`）只從自己的清單裡挑。每一類收 id 的 Server Action、Route Handler、頁面都要有 IDOR 測試：用 A 的 session 操作 B 的資料，結果被拒絕或沒有效果（service 的整合測試用 `insertTestUser()` 建兩個人；Server Action 的測試確認傳給 service 的是登入者的 id）。
- 例外：
  - **YouTube 翻譯共用**：同一支影片所有人看同一份；開始翻譯沿用已經有的；續翻用觀看者自己的 API Key（沒有 Key 只能看）、發起時的專有名詞表快照（`youtube_translations.glossary`，null 是舊程式寫的，改用觀看者自己的）；重新翻譯與上傳字幕只有發起人或站長（`canManageTranslation()`，條件寫進同一個 SQL），做的人成為新的發起人。
    - 續翻由觀看者自己決定：別人發起、還沒翻完的翻譯，觀看頁不自動用他的 Key 接著翻（「自動即時翻譯」開著也一樣），顯示已翻好的部分與「用我的 API Key 繼續翻譯」，按了（或按開始、重試）才跑續翻迴圈；自己發起的照舊自動接著翻（`web/auto-translate.ts` 的 `shouldAutoContinue()`，頁面傳 `startedByViewer`）。
    - 錯誤分兩類（`continueTranslation` 的 catch）：AiError 的 `bad_output`、`refused`（模型拒絕翻譯）是字幕內容的問題，才把共用那一列標成 failed；`auth`、`quota`、`rate_limit`、`network`、`other` 與非預期的錯誤是觀看者自己的問題，放掉鎖（回 queued）、不寫 error，錯誤只丟給這次呼叫的人（auth 是 `ApiKeySetupError`，畫面附設定頁連結）。
    - 專有名詞表存檔時有上限（`lib/parse.ts` 的 `GLOSSARY_LIMITS`：200 筆、每個詞 50 字、合計 5,000 字，超過丟中文的 `TranslationUserError`）；送給 AI 時 `translateBatch` 只帶這一批與前後文裡出現的詞條（`relevantGlossary()`）。上傳字幕最多 5,000 句。
  - **字幕下載**（`/api/youtube/subtitles/<影片 id>`）不檢查擁有權：翻譯共用，登入的人在觀看頁本來就看得到同一份，下載只是另一種格式。
  - **星穹鐵道的 UID 全站唯一**：別人已經連結的 UID 拒絕（整批不寫入）；沒有擁有者的列由貼得出有效 cookie 的人認領。
- 共用的主播與頻道：追蹤時 upsert 共用的那一列再加自己的追蹤（同一個交易），取消追蹤只刪自己的；最後一位追蹤者取消時才刪主播／頻道並刪掉 EventSub／WebSub 訂閱（交易裡鎖住那一列再數追蹤者）。刪除帳號留下沒人追蹤的，由每天的 `twitch:sync`、`youtube:renew` 刪掉。
- 手動的「同步訂閱」（`syncSubscriptionsFor`）與「續訂」（`renewSubscriptionsFor`）所有人都能按，處理的是全站共用的訂閱；回應只說自己追蹤的數量，不透露全站的主播或頻道數；每人 60 秒冷卻（`takeCooldown()`）。排程用不分使用者的 `syncSubscriptions`、`renewSubscriptions`，回應是全站摘要。開台與新影片通知只送給追蹤、而且通知開著（`*_follows.notify_enabled`）的人；主播表、頻道表的 `notify_enabled` 是單人版的舊欄位，新程式不讀。
- `notify({ recipients, … })`：收件人是使用者 id 陣列，由各模組決定（Twitch／YouTube 是追蹤而且開著通知的人，星穹鐵道是帳號的擁有者）；空陣列就不寫，查完之後才刪除帳號的人、被停用的人直接略過。
- **停用＝凍結**：被停用的帳號資料全部保留，追蹤照樣算數（共用的主播與頻道不會被當成沒人追蹤而刪掉，恢復後不用重建訂閱）；只是 `notify()` 不寫通知給他，星穹鐵道的排程（簽到、開拓力）不處理他的帳號（`listAccounts()` 只取擁有者沒停用的）。新增會用使用者憑證的排程也要照這樣略過停用的人；重新加密排程例外，照樣處理所有人（移除舊金鑰前要全部換好）。跨模組的檢查在 `src/account-disable.integration.test.ts`。
- `user_id` 是 null 的列是部署空窗期的舊程式寫的：新程式一律不讀、不處理（排程也略過），見 `docs/deploy.md`。

## 快取（`src/cache-rules.test.ts` 檢查）

- 讀取：各模組 `service/cached.ts`（通知在 `core/notifications/cached.ts`，管理頁在 `core/admin/cached.ts`；登入檢查不快取），函式開頭依序 `"use cache: remote"`、`cacheLife("db")`（外部資料見下一點，profile 都定義在 `next.config.ts`）、`cacheTag(...)`。只給頁面與輪詢 API 用；寫入流程、排程、翻譯鎖要讀最新資料，用原本的 service（service、cron 不能 import cached.ts）。
- 一律 `use cache: remote`：Vercel 是 serverless，記憶體快取與 tag 失效跨不了實例。本機與測試自動退回記憶體快取。
- 外部資料（Helix 的頭像與直播、頻道頁的頭像、oEmbed、HoYoLAB 的便箋、角色、開拓月曆、終局戰績）**不存資料庫**，只放在 `service/cached.ts` 的快取：
  - 效期依資料變動的頻率：直播狀態 `live`（2 分鐘）、HoYoLAB 戰績類 `records`（30 分鐘）、即時便箋 `external`（5 分鐘）、頭像與遊戲封面 `avatar`（一天）。讀不到（被擋、出錯、資料不公開）時改用短效期 `external`，幾分鐘後再試：成功與失敗各一個 `cacheLife`，寫在讀完之後。
  - tag 用各模組的 `<模組 id>:external`（沒有寫入點，靠效期更新）；依附資料庫狀態的另外標那張表（例如直播狀態標 `twitch:streamers`，EventSub 寫入開關台時跟著重抓；HoYoLAB 的資料讀了帳號的 cookie，標 `starrail:accounts`）。
  - 參數一律是明確的識別碼（頻道 id 或 @handle、主播 id、遊戲 id；HoYoLAB 是使用者 id 加帳號 id），清單排序後才當參數（Twitch 用 `cacheKeyIds()`）；不寫成「抓全部帳號」。Helix 與頻道頁這類公開資料不分使用者（頁面只拿自己追蹤的 id 去查）；HoYoLAB 的資料在快取函式裡用使用者 id 加帳號 id 讀帳號，別人的帳號 id 讀不到。cookie 在快取函式裡自己從資料庫讀並解密（照即時便箋的寫法），不進 key 也不進回傳值。
- 依使用者的讀取把使用者 id 當快取函式的第一個參數（頁面從 `requireSession()` 拿到後傳進去；快取函式裡不能讀 cookie 或 session），每個人各自一份快取。共用的資料（翻譯）只用影片 id，所有人共用一份。
- tag 不分使用者，只到資料表層級：寫入讓整張表的 tag 失效，所有人的快取一起重讀。原因：邀請制、使用者很少，多查幾次資料庫的成本很小；共用的表（主播、頻道、影片、翻譯）一次寫入會影響很多人的畫面（例如開台時所有追蹤者），分使用者的 tag 要寫入點算出每個受影響的人，容易漏。不要加 `…:<使用者 id>` 這種 tag。
- tag 是 `<模組 id>:<資料表>[:<id>]`（core 用 `core:`，例如 `core/auth/cache-tags.ts` 的 `core:users`、`core:invites`），定義在各自的 `cache-tags.ts`，呼叫處不手寫字串。core 沒有 service 資料夾，寫資料庫的檔案列在 `cache-rules.test.ts` 的 `CORE_WRITERS`。讀取標上讀到的每張表，寫入讓改到的表失效。
- 失效由寫入點負責，`*.cache*.test.ts` 是「寫入點 → tag」對照表，新增寫入要加一列：
  - Server Action：`updateTags()`（`updateTag`）。它已經會讓這次回應帶著重新算繪的頁面，**不要再呼叫 `refresh()`**；`refresh()` 只用在沒有失效任何 tag、但畫面需要重繪的路徑。寫入分好幾步（資料庫＋外部 API、逐筆迴圈）的放 `finally`，單一指令或交易放在成功之後。例外：觀看頁續翻每批寫回不能重繪，改用 `after(() => expireTags(...))`。
  - Route Handler、`after()`：`expireTags()`（`revalidateTag(tag, { expire: 0 })`）。`notify()` 自己會讓通知的 tag 失效。
  - 排程：`expiringTask(task, ...tags)` 登記，成功或失敗都失效。
- 快取函式裡不讀 cookies／headers、不呼叫 `requireSession()`、不寫資料庫（要寫就回傳結果，讓頁面在 `after()` 寫）。參數會以明文成為快取 key，不能放 cookie 或金鑰；回傳值不含金鑰、cookie（連密文）、翻譯鎖、密碼雜湊。
- 直接改資料庫時快取最多一天後更新，重新部署（build id 改變）立即生效。
- vitest 把 `next/cache` 換成 `src/dev/next-cache-stub.ts` 的 spy，`vitest-setup.ts` 每個測試前清空；要檢查失效的測試直接 `import { updateTag } from "next/cache"` 斷言（`vi.mocked()`），或用 `test-helpers.ts` 的 `updated()`、`expiredTags()`、`tagged()`，不要再 `vi.mock("next/cache")`。

## 測試與 E2E

- **不對真實外部服務發請求**。單元與整合測試把 fetch 或 lib 換成替身；E2E 一律用 `next dev`＋`npm run mock:external`＋`DEV_EXTERNAL_ORIGIN`。
- fetch 防護：`src/dev/vitest-setup.ts` 把全域 `fetch` 換成只能連 localhost／127.0.0.1 的版本，其他目的地直接丟錯（訊息說明怎麼換成替身）。要回應的測試把 `fakeFetch().impl` 傳給 `fetchImpl`，或 `vi.stubGlobal("fetch", …)`（`vi.unstubAllGlobals()` 會還原成防護版）；`vi.mock(path, { spy: true })` 的函式一定要設定回應，沒設定會呼叫真的實作而被擋下。
- **production 模式（`next start`）會忽略 `DEV_EXTERNAL_ORIGIN`**，請求會送到真的服務（之前就因此打到一次真的 Twitch）。`next start` 下只測不會對外連線的流程（登入、記帳、通知頁、帳號頁，以及還沒追蹤、沒連結帳號的使用者的首頁）；加主播、加頻道、webhook 補資訊、簽到、即時便箋、翻譯、YouTube 頁的背景字幕檢查，以及有追蹤或連結帳號時的首頁（直播狀態、頻道頭像、即時便箋）都會對外，只能用 `next dev`＋mock。
- 改了 `globals.css` 畫面卻沒變：停掉 `next dev`、刪 `.next/dev/cache` 再重開（Turbopack 的持久快取偶爾會留著舊的 CSS）。
- 手機版截圖要一起開觸控模擬（CDP 的 `Emulation.setTouchEmulationEnabled`），`(hover: none)` 才會成立：卡片的 ⋮ 在可以滑過的裝置上要滑過才出現。
- 瀏覽器用獨立的 headless Chrome：暫存設定檔，`--host-resolver-rules="MAP * 127.0.0.1:9, EXCLUDE localhost, EXCLUDE 127.0.0.1"` 擋掉所有外部網域。截圖時順便確認瀏覽器沒有向 localhost 與假伺服器以外的網址發請求。
- 假外部服務也要回應圖片：瀏覽器載入的頭像、縮圖、角色圖經 `externalAssetUrl()` 改寫到假伺服器，各模組的 `dev/mock.mjs` 用 `ctx.image(label, { width, height })` 回傳產生的 SVG 佔位圖（每張圖的字與顏色不同，看得出有沒有對應正確）；新增外部 API 時 mock 也要加上逼真的回應。
- 觀看頁每次載入前都要先注入假的 `window.YT.Player`（`Page.addScriptToEvaluateOnNewDocument`），否則瀏覽器會向 youtube.com 載入 iframe_api。假播放器要非同步呼叫 `events.onReady`、按播放時呼叫 `events.onStateChange({ data: 1 })`（自動即時翻譯靠它開始），並提供 `getCurrentTime()`（秒）與 `destroy()`。
- 登入與註冊有圖形驗證碼：E2E 在 `next dev` 加 `DEV_CAPTCHA_CODE=K7MRX`（經 `core/env.ts` 驗證，只在非 production 生效，`captcha-route.test.ts` 確認 production 不理它）固定驗證碼。
- 不建立 `.env.local` 或 `.pglite`：環境變數寫在指令前面，PGlite 用暫存目錄，結束時刪掉並關掉自己啟動的程序。
- E2E 的第一個帳號不跑互動式的 `npm run account`：用 `core/auth/credentials.ts` 的 `hashPassword()` 算好雜湊，直接 insert 進 `core_users`（`role` 給 `owner`），成員走邀請連結註冊。
- 測試腳本直接查 E2E 的資料庫時，要等頁面載入完、網站閒下來再查並準備重試：PGlite 只有一條真正的連線，腳本與網站的查詢同時送出會混在一起（`bind message supplies 1 parameters…`）。

## 各模組注意事項

### 帳號（core/auth）
- 帳號存在 `core_users`。第一個帳號用 `npm run account create` 建立，就是站長（CLI 在 insert 裡判斷資料庫是不是空的）；其他人只能用站長在 `/admin` 建立的邀請連結到 `/register` 註冊，一律是成員。CLI 先讀環境變數 `DATABASE_URL`；沒有的話在終端機提示輸入（不顯示、不留在 shell 歷史）；不是 TTY 就報錯、不連線。不讀 `.env.local`。連線字串缺 port 或資料庫名稱（貼上時中間斷行）直接報錯，不往下問帳號。
- 密碼欄位一律用 `core/ui/password-input.tsx` 的 `PasswordInput`（眼睛按鈕切換明碼，預設隱藏；`type="button"`、`aria-pressed`）；外面用 `label htmlFor` 對應，不要用 label 包住（裡面有按鈕）。登入與註冊表單另有 `CaptchaField`（圖片、換一張、輸入框），圖片網址用 `messages.ts` 的 `captchaImageUrl()` 在伺服器算繪時帶時間參數。
- 設定新密碼（註冊、改密碼、CLI）用 `credentials.ts` 的 `newPasswordProblem()`：12–256 字、不在 `common-passwords.ts`、不是同一小段重複、不含帳號名稱；`passwordProblem()` 只管長度，登入不檢查強度。
- 解除登入鎖定：管理頁的使用者清單顯示「鎖定中，到 HH:mm」與「解除鎖定」（`unlockUserAction`，只把 `failed_logins` 歸零、清掉 `locked_until`，不改密碼與停用狀態；自己那一列沒有）；站長自己被鎖住時用 `npm run account unlock <帳號>`。鎖定狀態是登入失敗時寫入的，登入流程不讓快取失效（回應時間不能因帳號存在而不同），所以管理頁用 `listLockedUsers()` 每次直接讀，不走 `cached.ts`。
- 刪除自己的帳號：帳號頁輸入密碼並確認；最後一個未停用的站長不能刪除自己（交易裡依 id 鎖住所有站長再判斷）。邀請、通知與各模組依使用者的資料跟著外鍵刪除，共用的翻譯只把發起人改成 null（見〈多人〉；跨模組的檢查在 `src/account-deletion.integration.test.ts`）。
- CLI 的錯誤訊息依錯誤代碼判斷：drizzle 會把資料庫錯誤包成 `DrizzleQueryError`（name 是 Error、沒有 code），代碼要往 `cause` 找。連不上資料庫（ECONNREFUSED、ENOTFOUND、28P01、CONNECT_TIMEOUT…）用中文說明原因，並提示檢查連線字串的主機、port 和密碼；不回顯連線字串或密碼。
- scrypt 雜湊（`scrypt$N$r$p$salt$hash`，網站與 CLI 共用 `credentials.ts`）；帳號不存在或鎖定中也跑一次假的 scrypt，錯誤一律「帳號或密碼錯誤」，只有密碼正確時才說明帳號已停用。改密碼遞增 `session_version` 並重發這台裝置的 cookie。依 IP 的登入失敗次數在記憶體內（多實例下只是盡力而為），依帳號的在 `core_users`。

### 通知（core/notifications）
- 模組發通知只能用 `core/notify.ts` 的 `notify()`，每個收件人寫一列 `core_notifications`（`user_id`），不呼叫外部服務；`url` 只收 http(s) 或站內路徑。追蹤的通知開關（`*_follows.notify_enabled`）關掉時照樣記錄，只是不把他列進收件人。鈴鐺、通知頁、輪詢 API、標已讀都只讀寫登入者自己的通知（送來別人的通知 id 沒有效果）；清理不分收件人。
- 首頁的未讀摘要（`home-notifications.tsx`）直接用通知中心的同一份輪詢資料（`useNotificationCenter()`；`loaded` 分辨還在載入與沒有未讀），不另外向伺服器讀；在鈴鐺或首頁標成已讀，兩邊一起更新。
- 輪詢與標已讀用 Route Handler（`/api/notifications`）不用 Server Action：每個分頁一次只送一個 Server Action，會排在觀看頁的翻譯後面。分頁可見時每 10 秒輪詢、背景時 60 秒，切回分頁立刻抓一次。純邏輯（`poller.ts`、`alerts.ts`、`chime.ts`…）不依賴 React，各自有測試。
- 提醒偏好依模組分開：每個模組各有提示音與瀏覽器通知兩個開關（`prefs.ts`，localStorage 的 `allhub:notifications:<sound|browser>:<模組 id>`，用 `createLocalPref`，跨分頁同步），預設全開；還沒個別設定的模組沿用舊版全域值（`allhub:notifications:sound`／`browser`，`createLocalPref` 的 `fallback`）。開關在鈴鐺面板（齒輪 →「提醒方式」）與通知頁，兩邊是同一份設定；模組清單由 `src/app` 傳進來（版面 → `AppShell` → 通知中心），core 不 import 模組清單；`notifies: false` 的模組不列出。依模組過濾在 `alerts.ts` 的 `planAlerts()`：兩種都關的模組只算進未讀數（不跳提示卡片），提示音與系統通知只給 `claimAlerts()` 認領到的通知；未讀數一律包含所有模組。任何模組打開瀏覽器通知時，權限還沒決定就跟瀏覽器要（`shouldRequestPermission()`），有模組開著但沒權限時顯示提示（`permissionNotice()`）。

### 資料保留
- `core/retention.ts` 的 14 天只用在通知類紀錄：`twitch_stream_events`、`starrail_checkin_logs`（各模組的 `cleanup` 排程）與 `core_notifications`（`notifications:cleanup`）。
- `youtube_videos` 不用 14 天：每個人的清單是自己追蹤頻道的最新 20 支（`LIST_LIMIT`），`youtube:cleanup` 刪掉不在任何人最新 20 支裡、而且發布超過 48 小時的影片。留 48 小時是為了 hub 在 24 小時通知窗內重送時不會重複通知，背景也還會重新檢查中文字幕。
- `youtube_translations` 永久保留：影片被清掉、頻道沒人追蹤而被刪掉時都不刪（翻譯表跟影片表、頻道表沒有外鍵，清理也不碰它），花錢翻好的字幕重看不用再付費。
- 其他資料永久保留，刪除帳號時依使用者的資料一起刪除。

### HoYoLAB（starrail）
- 非官方介面，參考 genshin.py。DS salt、act_id、header 可能隨 HoYoLAB 改版失效；**尚未用真實帳號驗證**，第一次連結帳號時要確認回應格式。cookie 只留需要的鍵，加密存放；即時便箋快取 5 分鐘（`cacheLife("external")`），cookie 失效標記由頁面在 `after()` 寫回。
- 角色詳情（`avatar/info`）、開拓月曆（`srledger/month_info`）、終局戰績（`challenge`、`challenge_story`、`challenge_boss`）與兌換碼（`webExchangeCdkeyRisk`）也都**尚未用真實帳號驗證**：解析都在 lib，讀不到的欄位給 null 並記下欄位路徑，service 的 log 只記 retcode 與缺少的欄位名稱，不記回應原文；資料不公開（10102）提示到「HoYoLAB → 戰績 → 設定」打開。
- 帳號每人一份（`starrail_accounts.user_id`）；UID 全站唯一，別人已經連結的 UID 拒絕。排程（簽到、開拓力提醒）處理所有有擁有者的帳號，同一個 HoYoLAB 帳號只簽到一次，每個擁有者只收到自己帳號的結果。
- 連結帳號時先選伺服器：同一個 cookie 有好幾個角色時，Server Action 第一步回傳清單（`linkAccount(userId, cookie, "ask")`），cookie 只留在瀏覽器的表單狀態裡，第二步跟勾選的 UID 一起再送一次，伺服器不存也不記 log；只信任 HoYoLAB 查到的角色，表單送來的 UID 只用來挑選。頁面一次只看一個帳號，選擇放在網址參數 `?account=<id>`。
- 兌換碼要 cookie 的 `cookie_token_v2` 加 `account_id_v2`（或 `account_mid_v2`），缺的話請使用者重新連結；兌換碼與結果都不存，log 只記 retcode；畫面上按完停用按鈕約 5 秒（HoYoLAB 兩次兌換之間的冷卻）。

### Twitch
- 追蹤每人一份（`twitch_follows`），主播與 EventSub 訂閱共用；頁面、直播預覽、側欄與開關台紀錄只列自己追蹤的主播。
- 畫面用的 Helix（`users` 頭像與離線橫幅、`streams` 直播狀態與預覽圖、`games` 封面）一次查多位主播；快取函式先用 `core/env.ts` 的 `hasTwitchEnv()` 判斷，沒設定憑證或出錯都回 null，畫面退回資料庫存的頭像與 `is_live`，不顯示錯誤。直播中 = EventSub 寫的 `is_live` 或 Helix 查得到直播（剛開台時 Helix 常常還查不到）。
- 加主播與手動同步前先看 `missingTwitchEnv()`：缺 `TWITCH_CLIENT_ID`／`SECRET` 回「尚未設定 Twitch 應用程式：請到 Vercel 的環境變數加上…」，缺其他的列出名稱，不讓使用者只看到「加入主播失敗（詳見伺服器 log）」。

### YouTube
- 畫面照 YouTube 網站：列表頁上方只有一個輸入框（`lib/parse.ts` 的 `classifyYoutubeInput()`：影片網址開觀看頁、頻道網址或 @帳號就追蹤；伺服器端的 `openVideoAction`、`addChannelAction` 仍各自驗證），篩選膠囊（`web/video-filter.ts`）在瀏覽器切換、不再問伺服器；卡片的動作收進 ⋮ 選單，頻道列在「訂閱內容」（手機是頭像列），通知開關與刪除收進每個頻道的選單。有中文字幕的影片點了直接到 YouTube，不進觀看頁（觀看頁按播放就會自動翻譯、花 API 費用）。觀看頁：播放器下方是標題與頻道列，翻譯按鈕是頻道列右邊的膠囊，右側（手機在下方）是「接下來播放」。
- 追蹤每人一份（`youtube_follows`，`channel_id` 跟影片表一樣是 YouTube 的頻道 id），頻道與 WebSub 訂閱共用。影片清單是自己追蹤頻道的最新 20 支。追蹤時從 RSS feed 補進最近的影片、不發通知；已經有人追蹤的頻道只補發布超過 24 小時的（24 小時內的交給 WebSub 推送，照常通知所有追蹤者）。翻譯設定與 API Key 每人一列（`youtube_settings.user_id`；`id` 是 BY DEFAULT 的 identity，從 2 開始，單人版的那一列是 1）。
- 影片縮圖用影片 id 組（`lib/urls.ts` 的 `youtubeThumbnailUrl()`，不呼叫 API）；追蹤中頻道的頭像讀頻道頁的 og:image（非官方，`lib/channel-page.ts`），快取一天，讀不到時用追蹤時存下的頭像，再不行就是文字頭像。觀看頁的頻道列與標題：自己追蹤的頻道的影片從資料庫找，其他影片用 oEmbed。
- `lib/subtitles/`：字幕格式（毫秒）、批次、抓韓文字幕與判斷中文字幕（非官方，讀觀看頁的 ytInitialPlayerResponse）、三家 AI 翻譯（`translateBatch`，錯誤分 `AiError.kind`，訊息已去除金鑰）。
- 中文字幕只認人工上傳的 zh-Hant、zh-TW、zh-HK、zh、zh-Hans、zh-CN；結果存 `youtube_videos.zh_captions`（yes／no／unknown），抓不到時不覆蓋之前的結果。影片清單在 `after()` 背景重新檢查到期的影片（發布 48 小時內、不是 yes、超過 1 小時沒檢查，一次最多 5 支），只讀字幕清單、不觸發翻譯。
- 翻譯是可續跑批次：`continueTranslation` 每批寫回。帶播放位置時由 `pickNextBatch` 從播放位置挑句子：15 秒內就會播到的用 10 句小批次，其餘每批 30 句，前方約 2 分半翻好後從頭補，每翻完一批就回傳；沒帶位置時從頭依序在 40 秒預算內做幾批。進度以已翻句數計算。
- 翻譯鎖：`status=running` + `lock_id`（fencing token），每次寫回都要 `lock_id` 相符，寫不進去就停；上傳、重試、重新翻譯會換掉它。心跳（`updated_at`）在每次呼叫 AI 前更新，超過 AI 逾時＋30 秒沒更新才可接手。翻譯共用的規則見〈多人〉。
- **只在使用者打開觀看頁播放（「自動即時翻譯」開關，localStorage，預設開）或按「開始翻譯」時翻譯**；新影片推送、排程、背景一律不翻譯（`translation.triggers.test.ts` 檢查只有 `web/actions.ts` 會呼叫）。
- 上傳字幕檔先在瀏覽器解碼（UTF-8 或 CP949）再以 UTF-8 送出：Node 的 `TextDecoder("euc-kr")` 不含 CP949 擴充字，伺服器端只當備援。上限 900 KB（Server Action 預設 1MB）、5,000 句。

### 存錢記帳（savings）
- 記帳資料永久保留：不加清理排程，不套用 `core/retention`。金額是新台幣整數（1 元～1 億，資料庫有 check 約束）；`savings_entries.month` 存當月 1 號的 `date`，「本月」一律用 `lib/month.ts` 的 `taipeiMonth()`。
- 刪除項目時紀錄保留：外鍵 `on delete set null`，畫面靠 `goal_name` 快照顯示原名（改名時同步更新）；`goal_id` 與 `goal_name` 都是 null 才是臨時存款。
- 項目與紀錄每人一份；記到項目前先確認那個項目是自己的，新項目的排序只看自己的項目。
- 記帳頁重點先顯示：最上面是選到的月份的總覽（已存、應存、還差、達成率；`lib/summary.ts` 的 `monthProgress()`，首頁卡片共用），接著是項目清單（每列只有名稱、狀態、每月金額，「記一筆」與「臨時存款」按了才展開輸入框）；紀錄明細、統計、管理項目收在預設關著的 `<details>`。同一個數字不重複出現（合計只在總覽）。

## 部署

- 推上 main 時 Vercel 部署與 `db-migrate.yml` 平行執行，舊程式會在新的資料表上跑一小段時間，migration 一律先擴充、之後再收斂：
  - 新欄位可為 null 或有預設值，新表直接加；不刪也不改舊欄位（舊程式明列欄位的 select、insert、upsert 仍要能用；唯一例外是 `youtube_settings.id` 加上 BY DEFAULT 的 identity，舊程式明確給 id 照樣寫得進去）。
  - 既有資料的回填寫在同一個 migration 的 SQL 裡（例如 `0006_per_user_data` 把單人版的資料歸給最早建立的站長）。
  - `src/core/db/migrations.integration.test.ts`：先套到上一版、用舊程式的寫法寫入，再套新的 migration，確認回填與舊寫法仍可用，並靜態檢查新 migration 沒有 drop、rename、NOT NULL 的新欄位。
  - 收斂（刪舊欄位、把 `user_id` 改成 NOT NULL、刪掉舊索引）要等舊程式不再上線之後的版本，先把空窗期 `user_id` 是 null 的列補回或刪掉。db-migrate 用 GitHub Secrets 的 `MIGRATION_DATABASE_URL`（Session pooler 5432），網站用 `DATABASE_URL`（Transaction pooler 6543）。
- 第一次部署的順序（網頁操作）：Supabase 建專案 → Vercel 匯入並填環境變數 → GitHub Secrets 填 `MIGRATION_DATABASE_URL`、`CRON_SECRET`、`HUB_URL` → 重新部署 → 手動跑 db-migrate → `npm run account create`（依提示貼上 Session pooler 連線字串，第一個帳號是站長）→ 登入 → 在「管理」頁用邀請連結邀請其他人。帳號一定在 migration 之後建立。
- 密鑰正本就是 Vercel 的環境變數與 GitHub Secrets（步驟見 `docs/secrets.md`）；Vercel 的環境變數改完要重新部署才生效。換 `ENCRYPTION_KEY`（都在 Vercel 網頁上）：舊值複製到 `ENCRYPTION_KEY_PREVIOUS` → 設新值 → 重新部署 → 等 reencrypt 排程回報 0 筆、沒有失敗 → 刪掉 `ENCRYPTION_KEY_PREVIOUS` 再重新部署。
- 排程：每天一次的寫在 `vercel.json`（UTC，Hobby 只保證在那個小時內執行）；`starrail:stamina` 每 30 分鐘由 `.github/workflows/cron.yml` 呼叫。新增排程要登記到 `src/modules/cron.ts`、`vercel.json` 與 `docs/architecture.md` 的排程表。
