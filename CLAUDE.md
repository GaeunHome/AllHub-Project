@AGENTS.md

# CLAUDE.md

AllHub Project：個人整合系統（單人使用），Next.js 16 App Router＋TypeScript＋Drizzle＋PostgreSQL＋Tailwind 4，部署到 Vercel Hobby＋Supabase。使用者文件見 README.md（精簡的專案首頁）與 `docs/`：部署 `deploy.md`、密鑰 `secrets.md`、模組 `modules.md`、架構 `architecture.md`、本機開發 `development.md`。

## 指令

- 檢查：`npm test`（vitest，整合測試用記憶體 PGlite）、`npm run lint`、`npm run build`、`npm run typecheck`（要用 build 產生的 `.next/types`，放最後）。
- 改 `core/db/schema.ts` 或模組的 `data/schema.ts` 後：`npm run db:generate`，migration 產生在 `src/core/db/migrations/` 並一起 commit；不要從本機對正式資料庫 migrate。
- 本機：`npm run db:local`（PGlite，要設 `DATABASE_POOL_MAX=1`）、`npm run mock:external`（假外部服務，搭配 `DEV_EXTERNAL_ORIGIN=http://127.0.0.1:4010`）。
- 帳號：`npm run account create`／`passwd <帳號>`／`list`，在 `src/dev/account.ts`，用 node 直接執行（型別剝除）。

## 架構規則（`src/architecture.test.ts` 檢查，改規則時兩邊一起改）

所有程式碼都在 `src/`，根目錄只放設定檔與文件。

- `src/app/`：路由殼。頁面只 render 模組 `web/pages/` 或 core 的頁面元件；route handler 只轉接（`export { GET } from …`）。segment config（例如 `maxDuration`）必須直接寫在這裡。只能用模組的 `info`、`cron`、`web/pages`、`web/routes`。
- `src/core/`：共用基礎，不能 import 模組、模組清單或 `src/app`。
  - `env.ts`：所有環境變數（zod，分組用到才驗證，順序同 `.env.example`，`env.test.ts` 檢查；`docs/secrets.md` 產生亂數的那行指令也由它實際執行並驗證）；別處不直接讀 `process.env`，例外只有 `NODE_ENV`、`proxy.ts` 的 `SESSION_SECRET`、`drizzle.config.ts` 的 `DATABASE_URL`、`src/dev` 的命令列工具（有 `import.meta.main` 的入口）、假外部服務（`dev/mock-external.mjs`、模組的 `dev/mock.mjs`）的 `MOCK_` 設定（`MOCK_PORT`、`MOCK_AI_MS_PER_LINE`），以及測試檔。`architecture.test.ts` 會掃 `src/` 與根目錄的設定檔檢查；新的用法對不上這份清單時，先回報再決定要不要改規則，不要直接放寬。
  - `db/`：postgres-js（`prepare: false` 配 Supabase pooler）；`db/schema.ts` 放 core 的表（`core_users`、`core_notifications`）。
  - `auth/`、`notifications/`、`ui/`、`cron.ts`（排程入口，合併 core 自己的排程，模組蓋不掉；名稱來自網址，只認自己登記的，用 `Object.hasOwn` 比對，`constructor` 這類名稱回 404）、`cache.ts`、`crypto.ts`、`notify.ts`、`retention.ts`、`external-url.ts`（`externalFetch()`）、`module.ts`（`ModuleInfo`、`CronTask` 型別）、`time.ts`（台北時間的顯示）、`errors.ts`（`errorKind()`、`logError()`、`connectionProblem()`：逾時、連不上這類連線錯誤給畫面看的中文摘要）、`robots.ts`（robots.txt 與 `NO_INDEX`）、`form.ts`（Server Action 的欄位解析與 `runAction()`；不能加 `"use server"`，否則每個 export 都會變成可直接 POST 的 action）。
  - `ui/` 的共用件：`form-message.tsx`（`FormState`、`FormFeedback`、`InlineFeedback`）、`action-button.tsx`（只有一個按鈕的表單）、`notify-toggle.tsx`＋`notify-toggle-form.ts`（通知開關與它的欄位解析）、`local-pref.ts`（`createLocalPref()`，存在瀏覽器的偏好，跨分頁同步）。
- `src/modules/<id>/`：功能模組，彼此獨立（不能 import 其他模組、模組清單或 `src/app`）。
  - 根目錄只有 `info.ts` 與 `cron.ts`，分別登記在 `src/modules/index.ts`、`src/modules/cron.ts`；各層都不能 import 根目錄（環境變數用 `@/core/env`，service 裡另外寫死模組 id）。沒有呼叫 `notify()` 的模組在 `info.ts` 設 `notifies: false`，「提醒方式」只列會發通知的模組（`architecture.test.ts` 檢查）。
  - 四層只能往下依賴：`web → service → data → lib`。web 只能 `import type` data，不能用 `@/core/db`。
  - `web/`（`pages/`、`components/`、`actions.ts`、`routes/`）、`service/`、`data/schema.ts`、`lib/`、`dev/mock.mjs`（假外部服務，`mock:external` 自動載入）。
- 資料表只能定義在 `core/db/schema.ts`（`core_` 開頭）或模組的 `data/schema.ts`（`<id>_` 開頭）。
- `src/dev/`：命令列工具、假外部服務入口、測試輔助，正式程式不能 import。測試輔助：`test-db.ts` 的 `setupTestDb()`（PGlite）、`test-env.ts`（`stubCoreEnv()` 等，要在 `await import()` 被測模組前呼叫）、`test-helpers.ts`（`form`、`captureErrorLog`、`loggedText`、`tagged`／`updated`／`expiredTags`、`mocksOf`）、`session-stub.ts`（`vi.mock("@/core/auth", () => import("@/dev/session-stub"))`）、`fake-fetch.ts`、`next-cache-stub.ts`＋`vitest-setup.ts`、`icu-simulation.ts`。換掉模組的部分函式用 `vi.mock(path, { spy: true })`，不寫轉接的 `(...a) => fn(...a)`。命令列工具與 `core/auth/credentials.ts`、`core/db/schema.ts`、`core/errors.ts` 會被純 node 載入：相對路徑寫 `.ts`、不能用 `@/`、型別用 `import type`（`account.test.ts` 實際載入一次確認）。

## 程式碼慣例

- 檔名與資料夾 kebab-case，元件與型別 PascalCase，函式與變數 camelCase，常數 UPPER_SNAKE_CASE。
- 註解只寫「為什麼」，一律一行（`//`、`/** */` 或 JSX 的 `{/* */}`）；不重述程式碼。測試名稱與介面文字不算註解。
- 介面文字、註解、測試名稱用繁體中文。
- 每個行為改變都先寫或改出會失敗的測試，確認失敗再實作；不刪除或放寬既有測試。
- 不裝新套件、不改資料表結構，除非使用者要求。
- 只有一個按鈕的表單（刪除、開關、排序）用 `core/ui/action-button.tsx`，刪除類帶 `confirmMessage` 先確認（底層是 `confirm-submit-button.tsx`）；按鈕旁的回饋用 `InlineFeedback`，表單下方用 `FormFeedback`。圖示用 `core/ui/icon.tsx`（名稱列在 `UI_ICON_NAMES`，檔案在 `public/icons/ui/`），區塊標題用 `SectionTitle`，空狀態用 `EmptyState`。
- 對外請求一律經 `core/external-url` 的 `externalFetch()`（開發時改送假伺服器、預設 15 秒逾時，AI 翻譯用 `AI_TIMEOUT_MS`），新增外部呼叫也要用它。
- Server Action：先 `requireSession()`，欄位用 `core/form.ts` 的 `formText`／`formId`／`formFlag` 讀，寫入包在 `runAction()` 裡（錯誤變成表單訊息、log 只記種類，不會跳錯誤畫面）；`requireSession()` 與 `redirect()` 放在 `runAction()` 外面，`updateTags` 照〈快取〉放 finally 或成功之後。
- 日期時間顯示一律用 `core/time.ts`，不直接用 `Intl.DateTimeFormat` 或 `toLocale*String`（ICU 版本不同時空白字元會變，CI 曾因此失敗；`architecture.test.ts` 檢查）。
- README 保持精簡，細節寫在 docs/；新增功能時更新對應的 docs 頁。

## 安全

- `proxy.ts` 只驗 JWT 簽章與期限（不查資料庫，維持 edge 可用）。**Server Action 與讀資料的元件都要呼叫 `requireSession()`**：Server Action 可被直接 POST，改密碼後舊 cookie 的簽章仍有效，只有它會比對資料庫的 `session_version`。`(main)/layout.tsx` 的 `SessionGuard` 讓沒讀資料的頁面也會擋；Route Handler 用 `currentSession()`，沒登入回 401。
- 外部呼叫的端點不走登入、各自驗證：`/api/twitch/eventsub`（HMAC-SHA256）、`/api/youtube/websub`（GET 要帶 callback 上跟頻道綁定的 `k`，訂閱只確認追蹤中頻道；POST 驗 HMAC-SHA1，不符回 204 但忽略）、`/api/cron/<排程>`（`CRON_SECRET`）。新增這類端點要同步改 `proxy.ts` 的 matcher（整段比對，後面接 `(?:/|$)`）。webhook 只在真的寫入時才讓快取失效。
- `/api/notifications` 的 POST 檢查同源（`Origin` 對 `Host`）與 JSON。
- 錯誤訊息可能夾帶憑證或 SQL 參數：對外回應（cron 結果、Server Action 回傳）只放摘要，log 用 `core/errors.ts` 的 `logError()` 只記錯誤種類（`error.name`，DecryptionError 記原因代碼），不記 message。寫進資料庫、會顯示在畫面上的狀態也一樣：Twitch 與 YouTube 的訂閱失敗用各自 lib 的 `subscriptionFailure()` 寫中文摘要（依錯誤種類與狀態碼，逾時是「連線逾時，稍後會自動重試」），不寫原文。
- 防機器人：`/robots.txt`（實作在 `core/robots.ts`，`src/app/robots.ts` 只轉接）對所有爬蟲 `Disallow: /`，根版面的 metadata 帶 `NO_INDEX`（noindex、nofollow）；`robots.txt` 在 `proxy.ts` matcher 的排除清單裡，沒登入的爬蟲才讀得到。登入次數的 Vercel Firewall 規則與 Attack Mode 寫在 `docs/deploy.md`。
- 第三方憑證（HoYoLAB cookie、AI API Key）用 `core/crypto` 的 `encryptSecret` 加密後才存；畫面與 log 不出現原文（AI Key 只顯示末 4 碼 hint）。新增加密欄位要加進該模組的 `reencrypt` 排程。
- 原始碼與部署設定不放任何密碼或密鑰；正式環境的密鑰只存在 Vercel 環境變數與 GitHub Secrets，本機不保存。

## 快取（`src/cache-rules.test.ts` 檢查）

- 讀取：各模組 `service/cached.ts`（通知在 `core/notifications/cached.ts`），函式開頭依序 `"use cache: remote"`、`cacheLife("db")`（外部即時資料用 `"external"`，定義在 `next.config.ts`）、`cacheTag(...)`。只給頁面與輪詢 API 用；寫入流程、排程、翻譯鎖要讀最新資料，用原本的 service（service、cron 不能 import cached.ts）。
- 一律 `use cache: remote`：Vercel 是 serverless，記憶體快取與 tag 失效跨不了實例。本機與測試自動退回記憶體快取。
- tag 是 `<模組 id>:<資料表>[:<id>]`（core 用 `core:`），定義在各自的 `cache-tags.ts`，呼叫處不手寫字串。讀取標上讀到的每張表，寫入讓改到的表失效。
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
- **production 模式（`next start`）會忽略 `DEV_EXTERNAL_ORIGIN`**，請求會送到真的服務（之前就因此打到一次真的 Twitch）。`next start` 下只測不會對外連線的流程（登入、首頁、記帳、通知頁、帳號頁）；加主播、加頻道、webhook 補資訊、簽到、即時便箋、翻譯、YouTube 頁的背景字幕檢查都會對外，只能用 `next dev`＋mock。
- 瀏覽器用獨立的 headless Chrome：暫存設定檔，`--host-resolver-rules="MAP * 127.0.0.1:9, EXCLUDE localhost, EXCLUDE 127.0.0.1"` 擋掉所有外部網域。
- 觀看頁每次載入前都要先注入假的 `window.YT.Player`（`Page.addScriptToEvaluateOnNewDocument`），否則瀏覽器會向 youtube.com 載入 iframe_api。假播放器要非同步呼叫 `events.onReady`、按播放時呼叫 `events.onStateChange({ data: 1 })`（自動即時翻譯靠它開始），並提供 `getCurrentTime()`（秒）與 `destroy()`。
- 不建立 `.env.local` 或 `.pglite`：環境變數寫在指令前面，PGlite 用暫存目錄，結束時刪掉並關掉自己啟動的程序。

## 各模組注意事項

### 帳號（core/auth）
- 帳號存在 `core_users`，只能用 `npm run account` 建立，沒有網頁註冊。CLI 先讀環境變數 `DATABASE_URL`；沒有的話在終端機提示輸入（不顯示、不留在 shell 歷史）；不是 TTY 就報錯、不連線。不讀 `.env.local`。
- CLI 的錯誤訊息依錯誤代碼判斷：drizzle 會把資料庫錯誤包成 `DrizzleQueryError`（name 是 Error、沒有 code），代碼要往 `cause` 找。連不上資料庫（ECONNREFUSED、ENOTFOUND、28P01、CONNECT_TIMEOUT…）用中文說明原因，並提示檢查連線字串的主機、port 和密碼；不回顯連線字串或密碼。
- scrypt 雜湊（`scrypt$N$r$p$salt$hash`，網站與 CLI 共用 `credentials.ts`）；帳號不存在也跑一次假的 scrypt，錯誤一律「帳號或密碼錯誤」。改密碼遞增 `session_version` 並重發這台裝置的 cookie。失敗次數限制在記憶體內，多實例下只是盡力而為。

### 通知（core/notifications）
- 模組發通知只能用 `core/notify.ts` 的 `notify()`，寫進 `core_notifications`，不呼叫外部服務；`url` 只收 http(s) 或站內路徑。各模組的通知開關（`notify_enabled`）關掉時照樣記錄，只是不呼叫 `notify()`。
- 輪詢與標已讀用 Route Handler（`/api/notifications`）不用 Server Action：每個分頁一次只送一個 Server Action，會排在觀看頁的翻譯後面。分頁可見時每 10 秒輪詢、背景時 60 秒，切回分頁立刻抓一次。純邏輯（`poller.ts`、`alerts.ts`、`chime.ts`…）不依賴 React，各自有測試。
- 提醒偏好依模組分開：每個模組各有提示音與瀏覽器通知兩個開關（`prefs.ts`，localStorage 的 `allhub:notifications:<sound|browser>:<模組 id>`，用 `createLocalPref`，跨分頁同步），預設全開；還沒個別設定的模組沿用舊版全域值（`allhub:notifications:sound`／`browser`，`createLocalPref` 的 `fallback`）。開關在鈴鐺面板（齒輪 →「提醒方式」）與通知頁，兩邊是同一份設定；模組清單由 `src/app` 傳進來（版面 → `AppShell` → 通知中心），core 不 import 模組清單；`notifies: false` 的模組不列出。依模組過濾在 `alerts.ts` 的 `planAlerts()`：兩種都關的模組只算進未讀數（不跳提示卡片），提示音與系統通知只給 `claimAlerts()` 認領到的通知；未讀數一律包含所有模組。任何模組打開瀏覽器通知時，權限還沒決定就跟瀏覽器要（`shouldRequestPermission()`），有模組開著但沒權限時顯示提示（`permissionNotice()`）。

### 資料保留
- `core/retention.ts` 的 14 天只用在通知類紀錄：`twitch_stream_events`、`youtube_videos`、`starrail_checkin_logs`（各模組的 `cleanup` 排程）與 `core_notifications`（`notifications:cleanup`）。其他資料永久保留。

### HoYoLAB（starrail）
- 非官方介面，參考 genshin.py。DS salt、act_id、header 可能隨 HoYoLAB 改版失效；**尚未用真實帳號驗證**，第一次連結帳號時要確認回應格式。cookie 只留需要的鍵，加密存放；即時便箋快取 5 分鐘（`cacheLife("external")`），cookie 失效標記由頁面在 `after()` 寫回。

### YouTube
- `lib/subtitles/`：字幕格式（毫秒）、批次、抓韓文字幕與判斷中文字幕（非官方，讀觀看頁的 ytInitialPlayerResponse）、三家 AI 翻譯（`translateBatch`，錯誤分 `AiError.kind`，訊息已去除金鑰）。
- 中文字幕只認人工上傳的 zh-Hant、zh-TW、zh-HK、zh、zh-Hans、zh-CN；結果存 `youtube_videos.zh_captions`（yes／no／unknown），抓不到時不覆蓋之前的結果。影片清單在 `after()` 背景重新檢查到期的影片（發布 48 小時內、不是 yes、超過 1 小時沒檢查，一次最多 5 支），只讀字幕清單、不觸發翻譯。
- 翻譯是可續跑批次：`continueTranslation` 每批寫回。帶播放位置時由 `pickNextBatch` 從播放位置挑句子：15 秒內就會播到的用 10 句小批次，其餘每批 30 句，前方約 2 分半翻好後從頭補，每翻完一批就回傳；沒帶位置時從頭依序在 40 秒預算內做幾批。進度以已翻句數計算。
- 翻譯鎖：`status=running` + `lock_id`（fencing token），每次寫回都要 `lock_id` 相符，寫不進去就停；上傳、重試、重新翻譯會換掉它。心跳（`updated_at`）在每次呼叫 AI 前更新，超過 AI 逾時＋30 秒沒更新才可接手。
- **只在使用者打開觀看頁播放（「自動即時翻譯」開關，localStorage，預設開）或按「開始翻譯」時翻譯**；新影片推送、排程、背景一律不翻譯（`translation.triggers.test.ts` 檢查只有 `web/actions.ts` 會呼叫）。
- 上傳字幕檔先在瀏覽器解碼（UTF-8 或 CP949）再以 UTF-8 送出：Node 的 `TextDecoder("euc-kr")` 不含 CP949 擴充字，伺服器端只當備援。上限 900 KB（Server Action 預設 1MB）。

### 存錢記帳（savings）
- 記帳資料永久保留：不加清理排程，不套用 `core/retention`。金額是新台幣整數（1 元～1 億，資料庫有 check 約束）；`savings_entries.month` 存當月 1 號的 `date`，「本月」一律用 `lib/month.ts` 的 `taipeiMonth()`。
- 刪除項目時紀錄保留：外鍵 `on delete set null`，畫面靠 `goal_name` 快照顯示原名（改名時同步更新）；`goal_id` 與 `goal_name` 都是 null 才是臨時存款。

## 部署

- 推上 main 時 Vercel 部署與 `db-migrate.yml` 平行執行，migration 要跟線上的舊程式相容（先加欄位，等程式不再用舊欄位後再刪）。db-migrate 用 GitHub Secrets 的 `MIGRATION_DATABASE_URL`（Session pooler 5432），網站用 `DATABASE_URL`（Transaction pooler 6543）。
- 第一次部署的順序（網頁操作）：Supabase 建專案 → Vercel 匯入並填環境變數 → GitHub Secrets 填 `MIGRATION_DATABASE_URL`、`CRON_SECRET`、`HUB_URL` → 重新部署 → 手動跑 db-migrate → `npm run account create`（依提示貼上 Session pooler 連線字串）→ 登入。帳號一定在 migration 之後建立。
- 密鑰正本就是 Vercel 的環境變數與 GitHub Secrets（步驟見 `docs/secrets.md`）；Vercel 的環境變數改完要重新部署才生效。換 `ENCRYPTION_KEY`（都在 Vercel 網頁上）：舊值複製到 `ENCRYPTION_KEY_PREVIOUS` → 設新值 → 重新部署 → 等 reencrypt 排程回報 0 筆、沒有失敗 → 刪掉 `ENCRYPTION_KEY_PREVIOUS` 再重新部署。
- 排程：每天一次的寫在 `vercel.json`（UTC，Hobby 只保證在那個小時內執行）；`starrail:stamina` 每 30 分鐘由 `.github/workflows/cron.yml` 呼叫。新增排程要登記到 `src/modules/cron.ts`、`vercel.json` 與 `docs/architecture.md` 的排程表。
