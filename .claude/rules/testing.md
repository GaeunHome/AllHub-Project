---
paths:
  - "**/__tests__/**"
  - "src/dev/**"
  - "src/**/dev/**"
  - "vitest.config.mts"
---

# 測試與 E2E

在瀏覽器驗證（E2E）前，就算沒有讀到上面這些檔，也要先讀這份。

- **不對真實外部服務發請求**。單元與整合測試把 fetch 或 lib 換成替身；E2E 一律用 `next dev`＋`npm run mock:external`＋`DEV_EXTERNAL_ORIGIN`。
- fetch 防護：`src/dev/vitest-setup.ts` 把全域 `fetch` 換成只能連 localhost／127.0.0.1 的版本，其他目的地直接丟錯（訊息說明怎麼換成替身）。要回應的測試把 `fakeFetch().impl` 傳給 `fetchImpl`，或 `vi.stubGlobal("fetch", …)`（下一個測試前自動還原成防護版）；`vi.mock(path, { spy: true })` 的函式一定要設定回應，沒設定會呼叫真的實作而被擋下。
- 自動還原：`vitest.config.mts` 開了 `unstubGlobals`，`vi.stubGlobal` 換掉的全域每個測試前自動還原，不用寫 `afterEach(() => vi.unstubAllGlobals())`；換全域一律在測試或 `beforeEach` 裡（寫在檔案最上層或 `beforeAll` 的會在第一個測試前就被還原）。環境變數不自動還原（`unstubEnvs` 不開：很多測試在 `await import()` 被測模組前就設好，要整個檔案都有效）。`vitest-setup.ts` 每個測試前把 `DEV_EXTERNAL_ORIGIN` 清空，本機 shell 設了假伺服器也看到真正的網址；要用假伺服器的測試自己在測試裡設。
- 測試檔一律是 `.test.ts`，放在同資料夾的 `__tests__/` 裡（使用者要的：跟程式分開放），`__tests__/` 裡也只放測試：vitest 只跑 `.test.ts`，`.test.tsx` 這類不會執行（`architecture.test.ts` 檢查）。相對路徑從 `__tests__/` 算，要多一層 `../`。
- **production 模式（`next start`）會忽略 `DEV_EXTERNAL_ORIGIN`**，請求會送到真的服務（之前就因此打到一次真的 Twitch）。`next start` 下只測不會對外連線的流程（登入、沒有持股的理財、通知頁、帳號頁，以及還沒追蹤、沒連結帳號、沒有持股的使用者的首頁）；加主播、加頻道、webhook 補資訊、簽到、即時便箋、翻譯、YouTube 頁的背景字幕檢查、新增持股與有持股的理財頁（證交所與櫃買中心的收盤價與除權息預告）、`youtube:cleanup` 排程（讀追蹤中頻道的 RSS、逐支請求 `/shorts/` 找 Shorts）、`starrail:stamina`（便箋與活動日曆）、`starrail:redeem`（社群的兌換碼清單與兌換）、`weather:rain`（全台的天氣預報）、`weather:warnings`（全台的天氣警特報）、`savings:dividends`（除權息預告），以及有追蹤、連結帳號、持股或選了天氣縣市時的首頁（直播狀態、頻道頭像、即時便箋、遊戲頭像、收盤價、天氣預報、警特報與空氣品質）都會對外，只能用 `next dev`＋mock。
- 改了 CSS（`globals.css`、`core/ui/styles/` 或模組的 `web/*.css`）畫面卻沒變：停掉 `next dev`、刪 `.next/dev/cache` 再重開（Turbopack 的持久快取偶爾會留著舊的 CSS）。
- 手機版截圖要一起開觸控模擬（CDP 的 `Emulation.setTouchEmulationEnabled`），`(hover: none)` 才會成立：卡片的 ⋮ 在可以滑過的裝置上要滑過才出現。
- 瀏覽器用獨立的 headless Chrome：暫存設定檔，`--host-resolver-rules="MAP * 127.0.0.1:9, EXCLUDE localhost, EXCLUDE 127.0.0.1"` 擋掉所有外部網域。截圖時順便確認瀏覽器沒有向 localhost 與假伺服器以外的網址發請求。啟動時加 `--disable-features=MacAppCodeSignClone`：Chrome 每次啟動會在暫存資料夾複製一份自己（`code_sign_clone`），每一份都會在 macOS 的「隱私權與安全性 → 區域網路」多一個刪不掉的 Google Chrome（macOS 的 bug），直接結束程序時複製檔也不會清掉（v0.1.5 開發期間累積了 26 個與約 2 GB）。結束時一樣用 CDP 的 `Browser.close` 正常關閉。
- 點按一律用 CDP 的 `Input.dispatchMouseEvent`（手機用 `Input.dispatchTouchEvent`）模擬真的滑鼠與手指，不用 `element.click()`：它不經過命中測試、也不發 pointerdown，人像選單按下的瞬間就收起、項目全都點不到的問題就是這樣漏掉的。
- 分頁用 CDP 的 `Target.createTarget` 開新的，再 `Page.bringToFront`，不用 Chrome 啟動時的 about:blank 分頁：它算是藏起來的分頁，`requestAnimationFrame` 不跑、`<dialog>` 關閉的事件也收不到，字幕同步與視窗關掉後的訊息、焦點都測不出來。
- 假外部服務也要回應圖片：瀏覽器載入的頭像、縮圖、角色圖經 `externalAssetUrl()` 改寫到假伺服器，各模組的 `dev/mock.mjs` 用 `ctx.image(label, { width, height })` 回傳產生的 SVG 佔位圖（每張圖的字與顏色不同，看得出有沒有對應正確）；YouTube 的影片縮圖例外，自己畫同樣的圖再補到真實縮圖的大小（約 12 KB）：Chrome 的 LCP 不算每像素不到 0.05 bit 的圖，幾百 bytes 的 SVG 放大成卡片縮圖會被略過，E2E 量到的 LCP（與 next/image 的 LCP 警告）就不準，其他大圖量 LCP 時也要注意這點；新增外部 API 時 mock 也要加上逼真的回應。
- 觀看頁每次載入前都要先注入假的 `window.YT.Player`（`Page.addScriptToEvaluateOnNewDocument`），否則瀏覽器會向 youtube.com 載入 iframe_api。假播放器要非同步呼叫 `events.onReady`、按播放時呼叫 `events.onStateChange({ data: 1 })`（自動即時翻譯靠它開始），並提供 `getCurrentTime()`（秒）與 `destroy()`；`getPlaybackRate()` 與 `events.onPlaybackRateChange({ data: 速度 })` 可以省略（播放器當成 1 倍速）。要看字幕同步時讓假播放器的時間真的前進，`getCurrentTime()` 只在「回報」時更新（每 250ms 以上，加一點抖動與延遲，像真的 iframe），影片 id 用 `syncsubs` 開頭（40 句長短不一、有短空檔的字幕，見 docs/development.md）。
- 登入與註冊有圖形驗證碼：E2E 在 `next dev` 加 `DEV_CAPTCHA_CODE=K7MRX`（經 `core/env.ts` 驗證，只在非 production 生效，`captcha-route.test.ts` 確認 production 不理它）固定驗證碼。
- 不建立 `.env.local` 或 `.pglite`：環境變數寫在指令前面，PGlite 用暫存目錄，結束時刪掉並關掉自己啟動的程序。
- E2E 的第一個帳號不跑互動式的 `npm run account`：用 `core/auth/credentials.ts` 的 `hashPassword()` 算好雜湊，直接 insert 進 `core_users`（`role` 給 `owner`），成員走邀請連結註冊。
- 測試腳本直接查 E2E 的資料庫時，要等頁面載入完、網站閒下來再查並準備重試：PGlite 只有一條真正的連線，腳本與網站的查詢同時送出會混在一起（`bind message supplies 1 parameters…`）。

## `src/dev/` 的測試輔助

換掉模組的部分函式用 `vi.mock(path, { spy: true })`，不寫轉接的 `(...a) => fn(...a)`。

- `test-db-snapshot.ts`：vitest 的 `globalSetup`，整輪只建一次資料庫，存成兩份快照（套好 migration 的與空的），放在 `node_modules/.cache/allhub-test-db/`，migration 或 PGlite 版本一變就重建。
- `test-db.ts`：`setupTestDb()`（PGlite；同一個檔案共用一個資料庫，每個測試開始前清空資料、序號歸零並拆掉裝在連線上的 spy，所以測試裡不能改表結構，要改的放到自己的檔案，例如 `users-old-schema.integration.test.ts`；要一個測試一個資料庫的改 `describe` 各自呼叫）、`openEmptyDb()`（還沒套 migration 的資料庫，測 migration 本身用）、`insertTestUser()`（依使用者的表有外鍵，先建帳號；可以指定成 `TEST_SESSION.id`）、`insertTestUsers()`（站長 alice＋成員 bob，id 跟 `TEST_SESSION`、`OTHER_SESSION` 一樣，`[me, other] = await insertTestUsers(getDb())`）、`pgliteOf()`、`logQueries(db)`／`logStatements(db)`（看送出的 SQL）。
- `test-env.ts`：`stubCoreEnv()` 等，要在 `await import()` 被測模組前呼叫；跨模組的測試用 `stubAllEnv()`（新模組的環境變數要加進去，`env.test.ts` 檢查）。
- `test-helpers.ts`：`form`、`captureErrorLog`、`loggedText`、`tagged`／`updated`／`expiredTags`、`mocksOf`、`markup()`（`renderToStaticMarkup`，伺服器元件先 await 再傳）、`textOf()`（去標籤，把 React 跳脫的 `&amp;`、`&quot;`、`&#x27;` 這類換回原字；`{ spaced: true }` 時每個標籤換成空白並合併連續空白）、`captureWarnLog()`（同 `captureErrorLog`，攔 `console.warn`）。
- `audit-stub.ts`：`vitest-setup.ts` 把 `@/core/audit` 全部換成它（單元測試沒有請求可以讀 header），`audit` 是 spy，每個測試前清空；測紀錄本身的測試檔用 `vi.unmock("@/core/audit")`。
- 替身：
  - `session-stub.ts`（`vi.mock("@/core/auth", () => import("@/dev/session-stub"))`；預設是站長 `TEST_SESSION`，測擁有權時用 `requireSession.mockResolvedValue(OTHER_SESSION)` 換成成員 bob）
  - `navigation-stub.ts`（`vi.mock("next/navigation", () => import("@/dev/navigation-stub"))`：`redirect` 跟真的一樣丟錯，訊息是 `NEXT_REDIRECT:<網址>`；`useRouter()` 一律回傳同一個 `router`；`usePathname` 預設 `/`；`notFound`、`unstable_rethrow` 用真的）
  - `toast-stub.ts`（`vi.mock("@/core/ui/toast", () => import("@/dev/toast-stub"))`：跳出的提示記在 `toasts` 陣列，`vitest-setup.ts` 每個測試前清空）
  - `more-menu-stub.ts`（`vi.mock("@/core/ui/more-menu", () => import("@/dev/more-menu-stub"))`：選單項目直接畫在 `<more-menu data-menu="名稱">` 裡；`menuOf(html, 名稱)` 取某個選單裡面，`outsideMenus(html)` 拿掉所有選單）
  - `fake-fetch.ts`
  - `fake-storage.ts`（`fakeStorage()` 是 localStorage 的替身，`data` 看存了什麼；`brokenStorage` 讀寫都丟錯；`storageEvent(key)` 模擬別的分頁改了設定）
- `mock-request.ts`：`await mockRequest(handle, 路徑, { method, body, headers })` 直接呼叫模組 `dev/mock.mjs` 的 `handle`，ctx 跟 `mock:external` 共用 `mock-context.mjs`；回傳 `handled`、`status`、`headers`、`body`、`data`（JSON）、`image`（`ctx.image` 收到的字與大小）。
- `next-cache-stub.ts`＋`vitest-setup.ts`（設定見上面）、`icu-simulation.ts`、`stylesheet.ts`（`readStylesheet()`：`globals.css` 加上它引入的 core 與模組樣式，讀樣式的測試一律用它，不直接讀 `globals.css`；`stylesheetImports()`：引入了哪些檔）。
