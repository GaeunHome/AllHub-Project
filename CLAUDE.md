@AGENTS.md

# CLAUDE.md

AllHub Project：個人整合系統。

- 使用者：站長管理，其他人只能用站長的邀請連結註冊；各模組的資料依使用者分開，只有 YouTube 的翻譯與旅遊的旅程共用。
- 技術：Next.js 16 App Router＋TypeScript＋Drizzle＋PostgreSQL＋Tailwind 4，部署到 Vercel Hobby＋Supabase。
- 文件：各模組與 core 幾個功能的注意事項在各自資料夾的 `CLAUDE.md`（見最後的〈各模組注意事項〉）；`README.md`（精簡的專案首頁）、`CHANGELOG.md`（每一版的更新紀錄）與 `docs/`：部署 `deploy.md`、密鑰 `secrets.md`、模組 `modules.md`、架構 `architecture.md`、本機開發 `development.md`、還沒做的規劃 `plans/`。

## 指令

- 檢查：`npm test`（vitest，整合測試用記憶體 PGlite；`vitest.config.mts` 用 `threads`、固定 `maxWorkers: 4`，機器忙時才不會逾時）、`npm run lint`、`npm run build`、`npm run typecheck`（TypeScript 7 的 `tsc`；要用 build 產生的 `.next/types`，放最後；增量資訊寫在 `.next/cache/tsconfig.tsbuildinfo`，根目錄不會有 `tsconfig.tsbuildinfo`）。
- 套件（使用者要的：全部升到最新、`npm audit` 連開發工具也是 0）：TypeScript 照官方的共存做法，`typescript` 指向 `@typescript/typescript6`（6.0 的 API，給 Next 的建置、typescript-eslint 與 `architecture.test.ts` 解析程式碼，指令是 `tsc6`），`@typescript/native` 是 7.0（`tsc`，型別檢查用），7.x 有 API 後再合成一個；`package.json` 的 `overrides` 把 drizzle-kit 帶的舊 esbuild 與 lint 工具帶的 minimatch 10 換成修過漏洞的版本，上游更新後拿掉；ESLint 10 的外掛（react、import、jsx-a11y）還沒宣告支援，安裝時 npm 會警告 peer，lint 實測正常；`@types/node` 跟網站與 GitHub Actions 的 Node 一樣留在 24。
- 改 `core/db/schema.ts` 或模組的 `data/schema.ts` 後：`npm run db:generate`，migration 產生在 `src/core/db/migrations/` 並一起 commit；一個版本最多一個 migration（同一版再改資料表就刪掉這一版的 migration 重新產生），不要從本機對正式資料庫 migrate。
- 本機：`npm run db:local`（PGlite，要設 `DATABASE_POOL_MAX=1`）、`npm run mock:external`（假外部服務，搭配 `DEV_EXTERNAL_ORIGIN=http://127.0.0.1:4010`）。
- 帳號：`npm run account create`（第一個是站長，之後是成員）／`passwd <帳號>`（也會解除登入鎖定）／`unlock <帳號>`（只解除登入鎖定，不改密碼）／`list`（含角色與停用），在 `src/dev/account.ts`，用 node 直接執行（型別剝除）。

## 架構規則（`src/__tests__/architecture.test.ts` 檢查，改規則時兩邊一起改）

所有程式碼都在 `src/`，根目錄只放設定檔與文件。

- `src/app/`：路由殼。頁面只 render 模組 `web/pages/` 或 core 的頁面元件；route handler 只轉接（`export { GET } from …`；排程的 `api/cron/[task]` 例外，把模組的排程清單交給 core 的 `runCron()`）。segment config（例如 `maxDuration`）必須直接寫在這裡。只能用模組的 `info`、`cron`、`web/pages`、`web/routes`；core 只能用頁面元件（`*-page`、`home-page`、`app-shell`、`session-guard`）、route handler（`auth/captcha-route`、`auth/avatar-route`、`notifications/api`、`push/api`）、`cron`、`robots`、`manifest`、`ui/theme`＋`ui/theme-sync`（`architecture.test.ts` 的允許清單，新的入口要加進去；`import type` 不算）。
- `src/core/`：共用基礎，不能 import 模組、模組清單或 `src/app`。
  - `env.ts`：所有環境變數（zod，分組用到才驗證，手機通知的金鑰用 `pushKeys()` 讀，兩把都有才算設定好，順序同 `.env.example`，`env.test.ts` 檢查；`docs/secrets.md` 產生亂數的那行指令也由它實際執行並驗證）；別處不直接讀 `process.env`，例外只有 `NODE_ENV`、`proxy.ts` 的 `SESSION_SECRET`、`drizzle.config.ts` 的 `DATABASE_URL`、`src/dev` 的命令列工具（有 `import.meta.main` 的入口）、假外部服務（`dev/mock-external.mjs`、模組的 `dev/mock.mjs`）的 `MOCK_` 設定（`MOCK_PORT`、`MOCK_AI_MS_PER_LINE`、`MOCK_TDX_PER_MINUTE`），以及測試檔；`import { env } from "node:process"`、整個 `node:process` 與 `const { env } = process` 也算讀環境變數。`architecture.test.ts` 會掃 `src/` 與根目錄的設定檔檢查；新的用法對不上這份清單時，先回報再決定要不要改規則，不要直接放寬。
  - `db/`：postgres-js（4.x，`prepare: false` 配 Supabase pooler；參數的型別由資料庫決定，時間照〈程式碼慣例〉一律傳 ISO 字串）；`Executor` 型別是 `db()` 或交易的 `tx`；`db/schema.ts` 放 core 的表（`core_users`（含可以是 null 的暱稱 `nickname` 與頭像 `avatar`）、`core_avatar_images`（上傳的頭像，每人一張）、`core_invites`、`core_rate_limits`、`core_notifications`、`core_module_denials`（模組權限，只記不能用的）、`core_audit_logs`（操作紀錄）、`core_cron_status` 與 `core_service_status`（系統狀態，只更新不新增）、`core_announcements`（公告）、`core_push_subscriptions` 與 `core_push_mutes`（手機通知））與 `ROLE_LABELS`（角色的中文名稱，網站與 account CLI 共用）。
    - `db/users.ts`：`userAvatar`（查詢裡讀頭像用，從整列取值，新程式比 migration 先上線時欄位還不存在也不會整個查詢失敗）、`activeOwnerOf(table.userId, 模組 id)`（`innerJoin(coreUsers, …)` 只留擁有者沒停用、能用這個模組的列，見〈多人〉的停用＝凍結與模組權限）、`canUseModuleSql(模組 id)`（同一個條件的 SQL，`notify()` 也用）、`lockUserRow(executor, userId, mode)`（交易一開始先鎖使用者那一列：`key share` 只擋刪除帳號，`no key update` 連同一個人的其他交易也排隊，先數再新增時用）。
  - `admin/`：管理頁（只有站長）：橫幅上的三個數字（使用者、有效邀請、鎖定中，`AdminStats`）、有帳號被鎖定時的提示列（`LockedNotices`）、使用者清單（停用、恢復、刪除，同時顯示暱稱與帳號名稱）、模組權限表格（`module-access-table.tsx`）與邀請連結；寬螢幕左欄是使用者、權限與公告（`announcement-list.tsx`），右欄是邀請。讀取在 `admin/cached.ts`。模組清單由 `src/app` 傳進來。系統狀態頁 `/admin/status`（`status-page.tsx`、`status-view.ts`，每次直接讀、不走快取）：最上面是總覽（`statusSummary()`），下面是外部服務與排程兩張白底的表（使用者選的：一列一個、名稱前面是燈號、結果與時間對齊，時間靠右，排程的代碼接在名稱後面，不用灰底，`.status-table`，手機上每一列改成兩行），正常是綠色圓圈、異常是紅色圓圈（使用者要的），還沒有紀錄是灰色，有問題的排最前面；排程的中文名稱來自模組 `info.ts` 的 `crons`，core 自己的在 `core/cron.ts` 的 `coreCronLabels`。
  - `auth/`（`attempts.ts` 的 `claimOnce()`：同一件事只認領一次，例如驗證碼的 nonce、星穹鐵道與天氣的提醒，記在 `core_rate_limits`、一天後清掉，週期超過一天的事不能靠它；認領後要做的事沒做成時用 `releaseOnce()` 放掉；`password-rules.ts` 是帳號與密碼的長度與說明文字（`PASSWORD_CASE_RULE`，註冊、改密碼、CLI 與錯誤訊息共用），瀏覽器的表單也用，不 import 任何東西）。
  - `claim.ts`（排程寄的提醒同一件事只寄一次：`claimKey(...parts)` 是認領用的 key，各段用冒號接起來算 sha256；`sendOnce({ scope, key, now, log }, send)` 用 `claimOnce()` 認領到才寄，寄不出去放掉並丟出原本的錯誤；`sendOnceEach({ scope, now, log }, items, keyOf, send)` 一批人各自認領、認領到的一起寄一次，出錯不丟出，結果帶 `sent`／`already`／`failed` 與 `error`；`sendOrRelease(send, release, log)` 給自己用條件式 update 認領的；放掉也失敗時只用 `log` 的 `module`、`what` 記一行，丟出的一律是寄送的錯誤）。
  - `cron.ts`（排程入口，合併 core 自己的排程，模組蓋不掉；名稱來自網址，只認自己登記的，用 `Object.hasOwn` 比對，`constructor` 這類名稱回 404）。
  - `announcements/`（站長的公告，見 `src/core/announcements/CLAUDE.md`）、`push/`（手機通知，見 `src/core/push/CLAUDE.md`）、`manifest.ts`（加到主畫面用的資料）、`same-origin.ts`（`isSameOrigin()`：Route Handler 的同源檢查）。
  - `order.ts`（使用者自己排的順序：`movedIds()` 把一筆放到另一筆前面、`swapTarget()` 上移下移，天氣的城市與交通的常用路線共用，伺服器與畫面用同一套，畫面先換好再等回應）；伺服器存檔用 `db/reorder.ts` 的 `moveOwnRow(executor, table, { userId, id, beforeId }, notFound)`（表要有 `id`、`userId`、`sortOrder`、`createdAt`：先 `lockUserRow`，照 `ownOrder(table)`（`sort_order`、加入時間、id，清單也用它排）讀自己的列，不是自己的 id 丟 `notFound` 給的模組錯誤，放回原位回 false；傳 `db()` 自己開交易、傳 `tx` 就在呼叫的人的交易裡）；新增前用 `nextOwnSlot(tx, table, userId)` 先 `lockUserRow` 再數自己有幾列，回傳 `total` 與排到最後的 `sortOrder`。
  - `cooldown.ts`（`takeCooldown()`：每人每段時間只能做一次，例如手動同步訂閱，計數在 `core_rate_limits`，只存使用者 id 的雜湊）。
  - `crypto.ts`（`encryptSecret()`／`decryptSecret()`；`reencryptEach(items, { ciphertext, write, log })`：換金鑰的排程逐筆解開再用目前的金鑰加密，`write` 只在密文沒變時寫回，回傳寫回與失敗的筆數）。
  - `notify.ts`（`notify()`；`notifiedSince()`：寄之前查這個人在某個時間之後有沒有收過同一種通知，只看他自己的）。
  - `retention/`：`index.ts`（保留期，純函式）＋`cleanup.ts`（`deleteExpired(column, label)`：通知類紀錄的清理排程，照指定的時間欄位刪掉超過保留期的列，回傳摘要）。
  - `external-url.ts`（`externalFetch()`；瀏覽器載入的圖片網址用 `externalAssetUrl()`；`readExternalJson(url, { module, what, parse })` 讀外部的 JSON，狀態碼不對、逾時、不是 JSON 或 `parse` 丟錯都記 log 回 null，log 不記網址；狀態碼不對是 `HttpStatusError`）。
  - `json.ts`（外部回應的欄位：`asRecord()`、`asArray()`、`text()`（只有空白的當成沒有，`allowBlank` 時空字串也收）、`numberOf()`（`stringsOnly` 只收字串）、`boolOf()`、`createMissing()` 記下讀不到的欄位路徑，`logMissing(scope, what, missing, ...context)` 回應少了欄位時用 `console.warn` 記一行，只有欄位路徑）。
  - `api-route.ts`（Route Handler 的共用骨架：`jsonResponse()`／`noContent()` 一律 `private, no-store`；`withSession(guard, work)` 讀 `currentSession()`，沒登入回 401，`guard.module` 有寫時沒權限回 403，出錯回 500、`logError()` 只記種類（未處理的錯誤 Next 會連 message 印出）；`withJsonBody(request, schema, guard, work)` 先擋跨站（403）與不是 JSON（415），登入後才用 zod 解析（400）；通知、手機通知、交通的即時資料與字幕下載都用它）。
  - `parsed.ts`（`Parsed<T>`、`ok()`、`fail()`：lib 解析表單的結果；service 用 `valueOrThrow(result, 模組的使用者錯誤)` 拆開；不 import 任何東西，瀏覽器的表單也能用）。
  - `text.ts`（`tidyText()`：NFC、連續空白縮成一個、去頭尾，名稱與標題存檔前用；`charLength()`：用 code point 算字數；只 trim 的公告、邀請備註不用 `tidyText`；不 import 任何東西）。
  - `token-cache.ts`（`createTokenCache(fetchToken, refreshMarginMs)`：外部服務的 OAuth token 記在記憶體，快到期前重拿，同時要的共用一個請求；`invalidate()` 給對方提早作廢時用（TDX 這次照樣失敗、下次重拿，Twitch 馬上重拿再送一次），`reset()` 給測試，連拿到一半的請求一起清掉）。
  - `number.ts`（`groupDigits()`：千分位，不依賴 ICU）。
  - `ids.ts`（`USER_ID_PATTERN`、`MODULE_ID_PATTERN`；proxy 用的 `auth/session.ts` 也用，不 import 任何東西）。
  - `module.ts`（`ModuleInfo`（`icon` 必填，`cover` 是首頁入口的背景圖，`services` 是系統狀態頁列出的外部服務，`crons` 是排程的中文名稱）、`CronTask`、頁面元件收的 `SearchParams` 型別）。
  - `time.ts`（台北時間的顯示，導覽列時鐘的 `formatTaipeiHourMinuteSecond()`、首頁日期的 `formatTaipeiLongDate()` 也在這裡；`taipeiDateKey()`、`taipeiMonthKey()`、`taipeiDayOffset(date, now)`（台北日曆上差幾天）；`isRealDateKey()`（YYYY-MM-DD 是真實存在的日期，2 月 30 日這種不算）；`formatRelativeTime()` 寫成「3 小時前」，通知用 `largestUnit: "day"` 只寫到幾天前；`DAY_MS`、`HOUR_MS`；`addDaysToKey()`、`daysBetweenKeys()`、`weekdayOfKey()`（0 是星期日）、`dateKeyOf(year, month, day)`（補零，那個月沒有這一天時算月底）：YYYY-MM-DD 的日曆運算，模組不另外寫 `Date.parse(...) / DAY_MS`）。
  - `errors.ts`（`errorKind()`、`logError()`（錯誤帶數字的 `status` 時自動印出狀態碼）、`connectionProblem()`：逾時、連不上這類連線錯誤給畫面看的中文摘要）。
  - `robots.ts`（robots.txt 與 `NO_INDEX`）。
  - `form.ts`（Server Action 的欄位解析；`formId()` 超過 serial 範圍的回 null；`UserError`：訊息給使用者看的錯誤，`runAction()`／`actionErrorMessage()` 一律原樣顯示，判斷參數可以再加別的類別；不能加 `"use server"`，否則每個 export 都會變成可直接 POST 的 action，`architecture.test.ts` 檢查；`toId()`：直接呼叫的 Server Action（不經表單，例如拖曳排序、`.bind` 綁定的 id）收到的 id 一律用它驗，只收 number，跟 `formId()` 共用 serial 的上限，壞值回模組既有的找不到或 `INVALID_FORM_MESSAGE`；`UserError` 的子類別都寫 `name = "類別名稱"`，log 的錯誤種類才看得出是哪一種（不用 `new.target.name`，正式環境壓縮後類別名稱可能被改掉），模組的放在 `service/errors.ts`）。
  - `action.ts`（`runAction()`：寫入包在裡面，錯誤變成表單訊息，成功失敗都寫進操作紀錄；要讀 header 與 session，只有 Server Action 能 import，所以跟給 service 用的 `form.ts` 分開）。
  - `audit/index.ts`（操作紀錄，見〈安全〉；`audit(actor, ...entries)`：回應送出後才寫，同一次呼叫的項目共用一個批次編號；`auditActor()`：動作開始前讀是誰與 IP；`auditLoginFailure()`、`auditMergedFailure()`：外人能無限觸發的失敗合併成一列）。
  - `audit/cron.ts`（`audit:cleanup` 排程）。
  - `status.ts`（系統狀態的資料，使用者要的：只更新不新增，每個排程、每個外部服務固定一列，資料量不會長大，所以不用清理。`recordCronRun()` 由 `runCron()` 統一呼叫；`reportService(服務 id, 問題或 null)` 由模組的 service 呼叫，`trackService()` 包住整段，丟錯時記錯誤種類再丟出去；都寫不進去只記 log，不影響排程與操作。服務 id 是「模組 id:種類」，要在模組的 `info.ts` 宣告 `services`，`architecture.test.ts` 檢查宣告的跟回報的一一對應。同一個平台依功能分開記，例如 `starrail:note`、`starrail:warps`，不然便箋成功會蓋掉躍遷紀錄的錯誤；使用者自己的 cookie 失效不算服務有問題，不回報。快取函式裡不能寫資料庫，只有打開頁面才讀的資料記不到）。
  - `notifications/`（見 `src/core/notifications/CLAUDE.md`）、`cache.ts`（`updateTags()`、`expireTags()`，見〈快取〉）。
  - `ui/` 的共用件：
    - `home-page.tsx`＋`home-card.tsx`（首頁的排版與卡片外框；`HomeSlot` 的 `shown` 給平常不出現的卡片，回 false 時跟被關掉一樣，不算格子也不留外框，判斷時出錯只藏那一張；`HomeCard` 的 `variant` 是 `card`、`plain`（沒有外框，直接放在頁面上）或 `bare`（標題列也由內容自己畫），`art` 是標題列的背景圖）
    - `card-error-boundary.tsx`（`next/error` 的 `catchError`，畫面只說讀不到、可以重試，不顯示錯誤內容；`QuietErrorBoundary` 出錯時什麼都不畫，給提示列的項目用）
    - `scene.tsx`（`Scene`、`SceneImage`：字疊在場景圖上的區塊，見〈程式碼慣例〉的畫面風格）
    - `page-banner.tsx`（`PageBanner`：有場景圖的頁首，理財、管理、帳號共用，`children` 放標題下面的內容）
    - `notice-strip.tsx`（`NoticeStrip`＋`NoticeItem`：重要提示，見〈程式碼慣例〉的畫面風格）
    - `user-avatar.tsx`（`UserAvatar`：站內帳號的頭像，選了範例頭像就畫圖，沒選或認不得時是文字頭像，顏色由帳號名稱決定，暱稱改了也不變）
    - `drag-scroll.ts`＋`drag-scroll-root.tsx`（`DRAG_SCROLL`：橫向列加上這個標記，放不下時滑鼠按住就能拖，使用者要的；整站一組監聽掛在 `AppShell`，手指本來就能滑所以只管滑鼠，超過 6px 才算拖曳（`DRAG_PX`，交通選站的路線圖也用），拖過放開時擋掉那一次 click；旅遊看板不加，它有自己的拖曳）
    - `skeleton.tsx`（`Skeleton`：載入中的骨架；`LoadingState`：外層補上 status 與隱藏文字，報讀器才知道正在載入）
    - `back-link.tsx`（`BackLink`：回上一層的連結）
    - `empty-state.tsx`（`compact` 是卡片裡的橫向小版，可以帶 `action` 按鈕）
    - `external-image.tsx`（外部圖片）
    - `avatar.tsx`（圓形頭像，只有 xs／sm／md／lg 四種大小，退回文字頭像）
    - `page-header.tsx`（`PageHeader` 頁首、`CardHeader` 卡片的標題列、`SectionTitle` 卡片外的區段標題）
    - `status-chip.tsx`（狀態標籤）
    - `form-message.tsx`（`FormState`、`FormMessage`、`FormFeedback`：只放表單的錯誤，分工見〈程式碼慣例〉的回饋）
    - `toast.tsx`＋`toast-queue.ts`＋`toast-layer.ts`（提示視窗：`ToastProvider` 在 AppShell 最外層，`useToast()` 的 `success`／`warning`／`error`／`result(state, fallback)`；佇列、計時與上限在 `toast-queue.ts`，Server Action 的結果跳提示一律包 `withToast(toast, action, { fallback, errors })`（`errors: false` 時錯誤留給表單），搬進最上面開著的 `<dialog>` 再 `showPopover()` 排到 top layer 在 `toast-layer.ts`）
    - `outside-press.ts`（`useOutsidePress()`：鈴鐺面板、人像選單、⋮ 選單、i 說明框共用的點外面收起，Esc 各自處理）
    - `popup-position.ts`（`placeNear()`：⋮ 選單與 i 說明框共用的貼著按鈕、夾在畫面內、下方放不下才放上方）
    - `top-layer.ts`（`showOnTop()`、`hideFromTop()`：彈出層用 popover 放進 top layer，⋮ 選單、i 說明框與提示視窗共用。外層是一層（`isolation`、`filter`）或用了容器查詢（`container-type`）時，fixed 定位會被關在外層裡，被切掉或被後面的卡片蓋住（交通常用路線的 ⋮ 與一些 i 圓圈發生過，`more-menu.test.ts`、`info-tip.test.ts` 檢查）；瀏覽器預設的 popover 樣式（置中、邊框、內距）在 `globals.css` 蓋掉）
    - `focus-frame.ts`（`FOCUS_FRAME`：`data-focus-frame`＋`tabIndex={-1}` 的外框；`keepFocusInFrame()` 掛在打開視窗的按鈕、`ActionButton` 的表單與 ⋮ 選單上，那一列或按鈕不見、焦點掉到 body 時移到最近還在的外框，最外面是 `main`）
    - `action-button.tsx`（只有一個按鈕的表單；成功與失敗都跳提示視窗，伺服器沒給訊息時用 `successMessage`；送出中是 `aria-disabled`、焦點留在按鈕上，再按不重送也不再確認）
    - `notify-toggle.tsx`＋`notify-toggle-form.ts`（通知開關與它的欄位解析；`variant="menu"` 時那一列的文字由模組用 `label` 給）
    - `count-badge.tsx`（`CountBadge`：未讀數，超過 99 寫 99+）
    - `media-grid.tsx`（`MEDIA_GRID`、`MediaGridSkeleton`：首頁影音卡片的格線與骨架）
    - `fact-list.tsx`（`FactList`＋`Fact`：標籤＋值的列，`layout` 是 `wrap`（值放不下時在右邊換行）或 `line`（一列到底））
    - `segmented-control.tsx`（`SegmentedControl`；`variant="field"` 給表單用：撐滿寬度、標籤只給報讀器，`name` 會把選到的值一起送出）
    - `local-pref.ts`（`createLocalPref()`，存在瀏覽器的偏好，跨分頁同步）
    - `html-flag.tsx`（存在瀏覽器的偏好標在 html 的屬性上，樣式依它排版：`htmlFlagScript()` 是整頁載入時第一次繪製前跑的同步腳本、`setHtmlFlag()` 標上或拿掉、`useHtmlFlagSync()` 只在伺服器算繪與 hydration 時放腳本，站內換頁時由 layout effect 在繪製前標好，Activity 藏起來或卸載時拿掉；YouTube 的劇院模式與交通的側邊欄共用）
    - `header-menus.tsx`（導覽列右上角的鈴鐺面板與人像選單，同時只開一個：`useHeaderMenuRoot()` 只給包住按鈕與面板的外框用、每個面板一個，掛點外面與 Esc 收起的監聽；面板裡的項目要收起面板（選單裡的連結）用不掛監聽的 `useHeaderMenu()`。項目用了外框的版本時 ref 沒接上，按哪裡都算外面，按下的瞬間選單就收起、項目全都點不到（v0.1.1～v0.1.2 的人像選單），`header-menus.test.ts` 檢查）
    - `delete-menu-item.tsx`（`DeleteMenuItem`：⋮ 選單裡先確認的刪除項目，所有模組共用，新的不要自己用 `ActionButton` 組；`fields` 是跟著送出的欄位，`deletedMessage` 是提示視窗的備援，沒給時那一列不見就是結果）
    - `form-buttons.tsx`（`FormButtons`：視窗表單最下面的取消與送出，所有模組共用，預設寫「儲存」）
    - `more-menu.tsx`（⋮ 選單：寬螢幕貼著按鈕、手機從底部升起；選單與遮罩放在 top layer（`top-layer.ts`），會橫向捲動的列與卡片都裁不掉也蓋不住；Activity 把頁面藏起來時收起。打開視窗的項目帶 `aria-haspopup="dialog"`（`useDialog()` 的 `triggerProps` 已經有）、按了就做完的項目帶 `data-closes-menu`（例如複製），點了選單就收起、焦點先回到 ⋮，視窗要放在選單外面才不會跟著卸載；Esc 只收起選單，不連外層的視窗一起關）
    - `theme.ts`＋`theme-sync.tsx`（外觀：淺色／深色／跟隨系統）
    - `copy-button.tsx`（複製到剪貼簿：按鈕的字不變，結果在旁邊的 `status`，外層用 `button-row`）
    - `password-input.tsx`（密碼欄位，眼睛按鈕切換明碼與隱碼）
    - `info-tip.tsx`（`InfoTip`：標題旁的 i 圓圈，滑過時反色（使用者要的，`--ink` 底配 `--surface` 字，深色的地方是白底圓圈；場景圖上字色變數是白的，反色會白底白字，所以 `.scene` 寫死白底深字），滑過或用鍵盤移到時顯示說明，點一下固定顯示、觸控裝置靠這個切換，Esc 或點外面收起；說明用 `aria-describedby` 接在按鈕上，按鈕照 `popup-layer.ts` 宣告成彈出層；說明框放在 top layer（`top-layer.ts`）、左右夾在畫面內留 16px，不會被裁掉、蓋住，也不撐出橫向捲動）
    - `dialog.tsx`（彈出視窗：`Dialog`、`DialogButton`、`useDialog()`、`useDialogForm()`，用法見〈程式碼慣例〉的彈出視窗）
    - `page-theme.tsx`（`PageTheme`：會換整頁底色的主題頁外框，Activity 藏起來時標記，見〈程式碼慣例〉的畫面風格）
    - `popup-layer.ts`（`popupLayerOpen()`：有沒有彈出層開著，認開著的 `<dialog>` 與宣告了彈出層而且 `aria-expanded="true"` 的觸發按鈕（`aria-haspopup`，面板不是 menu／dialog 這類角色時標 `POPUP_TRIGGER`（`data-popup-trigger`），例如 ⋮ 選單），Activity 藏起來的不算；`listenPageKeys()`：頁面自己的快捷鍵，按下的當下有彈出層就不處理，Esc 只關掉彈出層。新的彈出層照這樣宣告）
    - `live-clock.tsx`（`useClockStep(stepMs)`：每隔一段時間更新一次的現在時間，對齊到這段時間的倍數，伺服器與第一次算繪是 null；`useCurrentMinute()` 是每分鐘的版本；`LiveClock`：導覽列鈴鐺左邊的台北時間 HH:mm:ss，每秒更新；所有時鐘共用一個對準整秒的 setTimeout，沒有人用或被 Activity 藏起來時停，回到前景立刻對時；伺服器只放看不見的佔位，不會 hydration 不一致；`<time>`，不是 live region）
- `src/modules/<id>/`：功能模組，彼此獨立（不能 import 其他模組、模組清單或 `src/app`）。
  - 根目錄只有 `info.ts`、`cron.ts` 與這個模組的注意事項 `CLAUDE.md`（每個模組都要有），前兩個分別登記在 `src/modules/index.ts`、`src/modules/cron.ts`；各層都不能 import 根目錄（環境變數用 `@/core/env`，service 裡另外寫死模組 id）。沒有呼叫 `notify()` 的模組在 `info.ts` 設 `notifies: false`，「提醒方式」只列會發通知的模組（`architecture.test.ts` 檢查）。模組 id 就是資料夾名稱：`info.id`、`module:`（`notify`、`runAction`、認領失敗的 log）、`logError` 的 scope、認領與冷卻的 scope（`claimOnce`／`releaseOnce`／`takeCooldown` 的第一個參數、`sendOnce` 這類的 `scope:`，寫成「模組 id:種類」的字串或同一個檔案裡的常數）與 `allhub:<id>:` 的 localStorage key 都要一樣（`architecture.test.ts` 檢查）。只有首頁卡片、沒有自己頁面的模組（提醒與倒數）設 `homeOnly: true`，`href` 填 `/`：導覽列與首頁的模組入口不列出它（`core/module.ts` 的 `pageModules()`），卡片標題列也不放連結。
  - 四層只能往下依賴：`web → service → data → lib`。web 只能 `import type` data，不能用 `@/core/db`，登入檢查一律用 `requireModule("<模組 id>")`（不用 `requireSession`／`requireOwner`），也不直接用會寫資料庫的 `core/notify`、`core/cooldown`、`core/auth/attempts`、`core/claim`、`core/retention/cleanup`（經 service）；service、data、lib 不 import `@/core/auth`（登入，`import type` 除外）與 `next/headers`，使用者 id 由 web 傳進來。
  - `web/`（`pages/`、`components/`、`actions.ts`、`routes/`，樣式是 `web/*.css`，見〈程式碼慣例〉的樣式檔）、`service/`、`data/schema.ts`、`lib/`、`dev/`：`dev/mock.mjs`（假外部服務，`mock:external` 自動載入）與測試共用的 TS 輔助（例如 `dev/fixtures.ts`）。只有測試檔可以 import 同一個模組的 `dev/`，正式程式不行；`dev/` 的 TS 輔助只 import 同模組的 lib、data（測試要用資料表物件寫入假資料）與 `src/dev`（不碰 service、web、cached.ts）。
- 首頁卡片放在模組的 `web/pages/home-card.tsx`，要提醒的事放在 `web/pages/home-notices.tsx`（回傳 `NoticeItem`，沒有事就是空的；理財是逾期與待填帳單、提醒與倒數是今天與明天、星穹鐵道是 cookie 失效與開拓力到九成，天氣的特報與帶傘留在自己的卡片上），都由 `src/app/(main)/page.tsx` 組合，傳給 core 的 `HomePage` 排版：每一區是 `{ id, card }` 的陣列，core 先依登入者能用的模組過濾（沒有卡片的區塊不留空列），再排版（`notices` 是最上面的「今天要注意」，都沒有事時整條不出現；`top` 在最前面，天氣與提醒與倒數，使用者要的，`lg` 以上 3:2 兩欄、只剩一張時撐滿；`wide` 一張一列、彼此不並排；`half` 平常也是一張一列，超寬螢幕時跟 `compact` 那組各佔半列，那組在旁邊改成上下排、從上緣對齊，不會被拉高；`compact` 兩張一列等寬等高，最後固定是 core 的未讀通知，過濾後是雙數張時兩欄獨佔一整列、單數張時補滿最後一格（core 自己算，旁邊才不會空一格），超寬螢幕在 `half` 旁邊上下排時照樣一欄；排欄寫在 `HomePage` 的各個外框上，core 不 import 模組）；`architecture.test.ts` 檢查每張卡片都組合到首頁。
  - 卡片外框用 `core/ui/home-card.tsx` 的 `HomeCard`（標題列與前往模組頁的連結先出現，內容各自包一層 Suspense 骨架與 `CardErrorBoundary`，慢或出錯都只影響那一張）；內容是 server component，先 `requireModule("<模組 id>")` 再讀模組自己的 `service/cached.ts`（使用者 id 當第一個參數，跟模組頁共用同一份快取），不另外寫一套讀法。
- 資料表只能定義在 `core/db/schema.ts`（`core_` 開頭）或模組的 `data/schema.ts`（`<id>_` 開頭）。每張表都在 `pgTable(...)` 後面加 `.enableRLS()`，不加 policy、不用 FORCE：Supabase 的 Data API 用 anon、authenticated 讀寫 `public` 的表（預設有讀寫權限），開了 RLS 又沒有 policy 就一列都碰不到；網站與 db-migrate 用資料表的擁有者 `postgres` 連線，不受 RLS 限制（`migrations.integration.test.ts` 檢查每張表都開了、沒有 FORCE 與 policy，並模擬 anon 讀寫不到）。Supabase 的安全通知「Table publicly accessible」（`rls_disabled_in_public`）就是 v0.1.3 以前沒開。
- `src/dev/`：命令列工具、假外部服務入口、測試輔助，正式程式不能 import（模組 `dev/` 的測試輔助可以）。換掉模組的部分函式用 `vi.mock(path, { spy: true })`，不寫轉接的 `(...a) => fn(...a)`。測試輔助：
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
  - `next-cache-stub.ts`＋`vitest-setup.ts`（設定見〈測試與 E2E〉）、`icu-simulation.ts`、`stylesheet.ts`（`readStylesheet()`：`globals.css` 加上它引入的模組樣式，讀樣式的測試用它；`stylesheetImports()`：引入了哪些檔）。
  - 命令列工具與 `core/auth/credentials.ts`（含它 import 的 `password-rules.ts`）、`core/db/schema.ts`、`core/errors.ts` 會被純 node 載入：相對路徑寫 `.ts`、不能用 `@/`、型別用 `import type`（`account.test.ts` 實際載入一次確認）。

## 程式碼慣例

- 檔名與資料夾 kebab-case，元件與型別 PascalCase，函式與變數 camelCase，常數 UPPER_SNAKE_CASE。
- 註解只寫為什麼：白話、簡短、最多兩行；不用標點符號，片語之間用空格隔開，只留檔名、識別字、數字與單位本身的符號（例如 `// 伺服器是 UTC 月底晚上八點後會差一個月 所以本月用台北時間算`）；不重述程式碼。`eslint-disable`、`@ts-expect-error` 這類指令照原樣。測試名稱與介面文字不算註解。行數與全形標點由 `src/__tests__/comment-style.test.ts` 檢查。
- 介面文字、註解、測試名稱用繁體中文。
- 測試只寫答案來自程式以外的：需求（使用者說的，或 CLAUDE.md、docs 寫明的行為）、從輸入手算得出的值、發生過的 bug、架構與快取規則、資料庫與安全（擁有權與 IDOR、交易、migration、登入與權限）。照著程式抄答案的不寫：常數、文案、Tailwind class、內部函式的呼叫次數與順序、先跑程式再貼上的輸出、等於預設值的 props（v0.1.5 依這個標準刪掉了約 225 個測試）。這類行為要改時先寫出會失敗的測試，確認失敗再實作；不為了讓測試通過而刪除或放寬既有測試。
- 不裝新套件、不改資料表結構，除非使用者要求。
- 彈出視窗（`core/ui/dialog.tsx`；原生 `<dialog>` 與 `showModal()` 只寫在這個檔案裡，`architecture.test.ts` 檢查）：
  - 用在哪裡：清單列裡的表單與詳情（修改紀錄、修改帳戶、主播詳情）不要展開在列裡；按鈕打開的表單（記一筆、薪水入帳並分配、更新餘額、填帳單、已繳、買進賣出、新增帳戶、新增帳號或更新 cookie）與建立後要先收好的內容（只在這一頁看得到的邀請連結）也用視窗。用 `DialogButton`；按鈕要自己排版時用 `useDialog()`＋`Dialog`。不在清單列裡、不常用的設定照舊收在 `<details>`（星穹鐵道的「帳號設定」）或按了才展開的區塊（觀看頁的「上傳字幕」），短的動作與狀態放 ⋮ 選單（YouTube 的頻道、理財各頁的修改、上移下移、停用、刪除；理財常用的動作直接放在列上，見 `src/modules/savings/CLAUDE.md`）；一個按鈕的動作照用 `ActionButton`，刪除類照用 `confirmMessage`。
  - 大小：`size` 的 sm／md／lg（24／32／44rem）給表單與短的詳情；內容多、要放大圖的詳情（星穹鐵道的角色詳情、Twitch 的主播詳情）用 `size="full"`：滿版的大面板，寬螢幕四周只留 1rem、手機全螢幕，高度固定，內容依面板大小自己排（角色詳情：使用者三次反映立繪太小，寬螢幕舞台佔面板大半（`web/starrail.css` 的 `.sr-stage`：`max(55cqw, 100cqw - 32rem)`，右欄最多 32rem），立繪預設放大到面板高度的 130–150%（`.sr-stage-art`，方形的圖裁掉左右的空白與腳邊，上面只裁一點，臉才看得到；手機是 135%），舞台左下角的「看全圖」切回完整不裁切（`web/components/character-stage.tsx`）；放大比例是照公開資料推的，真實立繪的留白還要用真實帳號確認；右欄文字比全站大一級，整個面板同一個捲動區，游標在立繪上也捲得動；主播詳情：預覽限高，16:9 的螢幕不用捲動）。開關、焦點、Esc、點背景、捲動鎖與 Activity 的處理跟其他大小一樣；其他視窗維持原本的大小。
  - 視窗裡的表單一律用 `useDialogForm()`：onSubmit 送出（`<form action>` 送完一定清空欄位，失敗時打的字會不見），失敗留在視窗裡、焦點回到 `data-autofocus` 的欄位；有下一步的表單（連結帳號先選伺服器）傳 `isDone` 判斷完成了沒。
  - 成功就關掉視窗，訊息用提示視窗（`done(message)`：先用 `flushSync` 關掉視窗再跳，報讀器不會在關閉中的視窗裡念）。打開視窗的按鈕或整列會不見時（刪除那一列、「開始使用」後卡片被換掉、確認或略過後那一列的按鈕不見、第一次選縣市後天氣卡片的空狀態被換掉），焦點移到最近還在的 `FOCUS_FRAME` 外框（`Dialog` 打開時記下按鈕外面的外框，`useDialogForm` 送出時記下表單外面的），不掉到 body，也不移到提示視窗。外框標在首頁卡片、`main`、管理頁的使用者卡片、理財的整頁與各清單、YouTube 的訂閱內容與已保留清單。
  - 關閉不另外跳確認（Chrome 連按 Esc 時擋不住），要保留的內容關掉後給「再看一次」（邀請連結；下一條建立失敗時上一條也留著，換到別頁時在 Activity 藏起來的清除函式裡忘掉，回來就沒了）。寬螢幕置中、手機從底部升起；標題列是 `CardHeader` 加關閉鈕，本文捲動；Esc、點背景、按 X 關閉；收起、卸載或 Activity 把頁面藏起來時一定關掉（開著的 modal 會讓整份文件不能操作）；內容只在開著時算繪。開著時背後的頁面不捲動，`html` 一律保留捲軸的位置，開關視窗時版面不會左右跳。
  - 報讀器：打開時要讓人知道的說明（邀請連結的建立結果與「只在這一頁看得到」）用 `Dialog` 的 `describedBy`（`aria-describedby`）指過去，說明用的 `FormMessage` 加 `live={false}`：內容跟視窗一起出現，放在 live region 裡來不及念，還會跟描述重複。live region 不巢狀（外層一變會連裡面的再念一次），也不放在按鈕裡（`CopyButton` 的字不變，結果念在旁邊一開始就在的 `status`）。
- 只有一個按鈕的表單（刪除、開關、排序）用 `core/ui/action-button.tsx`，刪除類帶 `confirmMessage` 先確認（底層是 `confirm-submit-button.tsx`）。
  - 回饋（使用者要的：「已新增 XX」這類訊息不留在頁面上，全站用提示視窗）：成功一律用 `useToast()` 的提示視窗；視窗裡與頁面上有欄位的表單，錯誤照舊放在欄位下面的 `FormFeedback`（使用者要對著欄位改）；視窗外的按鈕失敗（`ActionButton`、通知開關、模組權限的勾選框、同步訂閱、續訂）也用提示視窗。
  - 點了之後要一眼看到的結果（兌換碼、立即簽到、設定門檻、連結帳號）用提示視窗的標題寫結果、內容寫原因（預期外的錯誤在 `runAction()` 的 scope 加 `titled`，內容只寫「原因不明（詳見伺服器 log）」；沒有標題的照舊是「<動作>失敗（詳見伺服器 log）」），成功了但要提醒的用 `warning`。
  - 提示視窗在導覽列下方置中（最寬 26rem，手機左右 16px，不跟右下角的通知卡片疊），錯誤一組在上；同時最多 3 則，其他排隊，出現時才開始算：成功 4 秒、提醒與錯誤 8 秒，滑過或鍵盤焦點在上面時暫停，每則都有關閉鈕；兩個一直存在的 live region（錯誤 `alert`、其他 `status`），減少動態時不滑動。
  - 例外：觀看頁翻譯面板的錯誤（續翻暫停、沒有 API Key）是翻譯的狀態，留在面板裡；`CopyButton` 的「已複製」與星穹鐵道各區塊讀不到的錯誤也留在原地；建立後要先收好的邀請連結照舊在視窗裡。
  - 正式程式不能用原生 `alert()`（`architecture.test.ts` 檢查）。
  - 圖示用 `core/ui/icon.tsx`（名稱列在 `UI_ICON_NAMES`，檔案在 `public/icons/ui/`），卡片的標題列用 `CardHeader`、卡片外的區段標題用 `SectionTitle`，空狀態用 `EmptyState`。
- 對外請求一律經 `core/external-url` 的 `externalFetch()`（開發時改送假伺服器、預設 15 秒逾時，AI 翻譯用 `AI_TIMEOUT_MS`），新增外部呼叫也要用它，讀 JSON 用 `readExternalJson()`；正式程式不直接呼叫全域 `fetch()`，例外只有 `core/external-url.ts` 本身與 client 元件呼叫自家的 `/api/`（`architecture.test.ts` 檢查）。
- 外部圖片（頭像、縮圖、角色圖）由瀏覽器直接向平台的 CDN 載入，網站與資料庫都不存：用 `core/ui/external-image.tsx`（`next/image` 加 `unoptimized`，不經 Vercel 的圖片最佳化；`referrerPolicy="no-referrer"`；載入失敗或沒有網址時顯示 `fallback`），圓形頭像用 `core/ui/avatar.tsx`（退回名稱的第一個字）。
  - 網址一律先在伺服器端經 `core/external-url` 的 `externalAssetUrl()`：開發時有 `DEV_EXTERNAL_ORIGIN` 就改寫到假伺服器（E2E 不會連到真的 CDN），正式環境原樣輸出，不是 http(s) 的回 null。
  - 固定大小的圖給 `width`／`height`，填滿固定比例外框的用 `fill`（外框要是 relative）。
  - 畫面最上面一排的縮圖或預覽給 `loading="eager"`（常常是 LCP，延遲載入會慢一拍），其他照預設 lazy；`Scene` 的 `eager` 另外加 `fetchPriority="high"`（首頁天氣卡片與各頁橫幅的場景圖就是 LCP）。
  - 兩類圖片分開：平台資料的圖片（頭像、縮圖、角色圖）照上面由瀏覽器向 CDN 載入；遊戲的固定小圖示（星穹鐵道的元素、命途、屬性）是內建在 `public/icons/starrail/` 的靜態檔，用 `next/image`（`unoptimized`，跟官方標誌一樣）直接畫，不經 `externalAssetUrl()` 與 `ExternalImage`（見 `src/modules/starrail/CLAUDE.md`）；天氣圖與國旗也是（`public/images/weather/`、`public/images/flags/`，見 `src/modules/weather/CLAUDE.md`）。
  - `next/image` 一律加 `unoptimized`（`architecture.test.ts` 檢查）。
- 設計風格先問（使用者要的）：要改變畫面的風格或版面方向時（配色、字型、視覺語言、卡片與版面的排法、整頁改版、新頁面長什麼樣子），先把方向與選項拿給使用者看，確認後才動工，不要自己決定後做完再報告；Impeccable、ui-ux-pro-max 這類工具的建議也一樣，先給使用者看，不直接照改。只有跟著既有規則的小修正（對齊、間距、破版、對比、沿用現有元件）不用問。
- 畫面風格：全站簡潔中性（`globals.css` 的 token：白／淡灰底、灰色細框、陰影很輕），主色只有一個深藍，只用在主要按鈕、連結與焦點框；模組的品牌色（`data-accent`：`blue`／`red`／`violet`／`gold`／`green`，型別是 `core/module.ts` 的 `ModuleAccent`）只用在圖示與小標籤。
  - 場景圖（使用者要的：只有 icon 太陽春）：首頁、理財、管理、帳號與交通頁用自己畫的向量場景圖（天氣頁的大圖是真實照片，見 `src/modules/weather/CLAUDE.md`）（`public/images/scenes/`：天氣 8 張 `weather-<clear|cloudy|rain|storm>-<day|night>.svg`、橫幅 `banner-*.svg`、首頁入口 `module-*.svg`、交通查詢結果的標題 `transit-*.svg`）與交通的小圖（`public/images/transit/`），不是外部素材，也不放進資料庫。`public/images/` 在 `proxy.ts` 的 matcher 裡（要登入才讀得到），登入與註冊頁不能用。字疊在圖上時用 `Scene`（`core/ui/scene.tsx`）：字色用 `text-white` 這類寫死的白色，不換 `.scene` 的 CSS 變數，不然裡面打開的 `<dialog>` 也跟著變白；只有不含視窗的區塊才換變數（`.scene-facts`、`.card-art`）。`.scene-scrim` 左深右淺，右邊留給圖；圖上的小按鈕用 `.scene-button`。
  - 重要提示（使用者要的：不一定要用卡片）：要一眼看到、但不用馬上打斷的事用 `NoticeStrip`＋`NoticeItem`：貼著頁面的一條細線，一件接一件，手機上一件一行；裡面都沒有項目時 `:has()` 整條藏起來。
    - 首頁是「今天要注意」、理財總覽是「要先處理」、管理頁是鎖定的帳號。
    - 帶傘與特報留在天氣卡片的圖上（圖加白字，不用小標籤）；刪除帳號這類不能復原的動作用 `.danger-zone`（左邊一條紅線，平常收在 `<details>`）。
  - 主題頁：Twitch 頁用 `.theme-twitch`、星穹鐵道頁用 `.theme-starrail`（兩頁固定深色），YouTube 頁用 `.theme-youtube`（照 YouTube 網站的淺色與深色，跟著外觀切換，紅色只用在標誌與進度條）：只換 CSS 變數，共用的 class（`card`、`chip`、按鈕、`input`…）自動跟著換色，不要另外複製一套元件。
    - 三頁都是整頁主題：整頁底色鋪滿全寬與整個高度（`:root:has(.theme-…:not([data-activity-hidden]))`），內容直接放在 AppShell 的外框裡（不再包一張圓角大卡片）。
    - YouTube 連導覽列也換（`:root` 換 `--bg-base` 與 `--header-bg`）；Twitch 與星穹鐵道的導覽列、鈴鐺面板、人像選單維持全站的樣子（使用者的決定）：調色盤（含 `color-scheme: dark` 與深色模式的 `--accent-*`、`--*-dot`）只放在 `PageTheme` 的外框上，`:root`／`html`／`body` 只換背景（與星空的變數 `--sr-sky`），這兩頁的導覽列改成不透明（全站的 `--header-bg` 疊在 `--bg-base` 上；半透明疊在深色底上會變灰，`page-theme.test.ts` 檢查）。
    - 星穹鐵道的星空畫在 `body`（最上層是自己畫的靜態 `public/images/starrail-sky.svg`，不加動畫：背景圖一動整頁都要重畫；html 另外給底色，背景才跟著長頁面拉長），彈出視窗用 `sr-dialog` 自己畫星空底。
    - 外框一律用 `core/ui/page-theme.tsx` 的 `PageTheme`：Activity 藏起來的頁面還留在文件裡，`:root:has()` 會比對到它，`PageTheme` 在藏起來時（layout effect 的清除函式）標上 `data-activity-hidden`，換頁時主題不會漏過去；伺服器算繪的 HTML 沒有標記，整頁載入時第一次繪製就是這一頁的底色。
    - 主題 class 只能放在 `PageTheme` 上（視窗、卡片也不行，`architecture.test.ts` 檢查）。
- 樣式檔：全站共用的 token 與元件在 `src/app/globals.css`；模組專用的放在模組的 `web/`，`globals.css` 用 `@import` 照原本的位置引入（Tailwind 編譯時換成檔案內容，結果跟寫在同一個檔案一樣，所以檔案裡不包 `@layer`、不寫 `@reference`，也不從 TS import）：主題頁的調色盤 `theme.css` 與整頁底色 `page-background.css` 在 `@layer` 外面，元件的 `savings.css`、`youtube.css`、`twitch.css`、`starrail.css`、`transit.css`、`weather.css`、`player.css`（YouTube 的播放器）在 `@layer components` 裡、觸控放大的規則前面。
  - 模組的檔只寫自己前綴的 class（`architecture.test.ts` 的 `MODULE_CSS_PREFIXES`：理財 `fin-`、星穹鐵道 `sr-`、Twitch `tw-`、YouTube `yt-`／`player-`／`subtitle-`、交通 `trn-`、天氣 `wx-`；`@keyframes` 不算 class，寫在 `globals.css`）與自己的 `.theme-<id>`，core 的 class 只能接在它們的選擇器裡（例如 `.theme-youtube .switch`），`@theme` 的變數也帶自己的前綴（例如星穹鐵道的金色；變數名稱不要寫進 md 或 TS，Tailwind 掃到會把它輸出到 `:root`）；`globals.css` 裡的模組 class 只剩跟 core 或兩個模組寫在同一條規則裡的（`SHARED_IN_GLOBALS`：固定深色頁的圖示色與不透明導覽列、減少動態裡 Twitch 的浮起、觸控放大的 `yt-pill-sm`／`yt-chip`／`sr-tab`），另外 `:root` 還有理財的 `--fin-income`／`--fin-expense`。
  - 搬樣式時比對前後編譯出來的 CSS 要完全相同。
- 間距與對齊（主題頁也照這套，只換配色）：
  - 距離交給父層的 gap，子元素不加零散的 margin（例外：`details` 的展開內容、絕對定位、對齊用的負邊距）。頁面的區塊之間 `page-stack`（gap-8）；卡片與區段裡、表單的欄位之間 `stack`（gap-4）；欄位是 `field`＋`field-label`（標籤與輸入框 gap-1.5）；一排按鈕 `button-row`（gap-2）。
  - 卡片內距一律 `card`（p-5／sm:p-6）；卡片裡撐滿左右的清單用 `card-list`＋`card-row`（列的左右內距跟卡片一樣，文字對齊卡片內容），只有清單的卡片是 `card p-0`＋`card-row`；卡片裡再小一級的區塊用 `panel`（p-4）。標題放在卡片裡用 `CardHeader`，頁首、區段標題、卡片對齊同一條左邊線；主要頁面都在 AppShell 的外框裡（`app-header.tsx` 的 `SHELL_FRAME`：幾乎滿版的 `max-w-[120rem]`＋`px-4 sm:px-6 lg:px-8`，導覽列與內容共用、左右邊線對齊，超寬螢幕才置中；`app-shell.test.ts` 檢查），登入與註冊共用 `AuthCard`（max-w-md；背景是三團慢慢飄的柔光 `.auth-glow`，使用者選的，只動 transform，減少動態時停住）。
  - 寬螢幕：清單與格線在 xl／2xl 加欄（YouTube 的影片 2→3→4 欄）；表單類的頁面（理財的設定、通知、帳號、管理、翻譯設定）在 xl 改成兩欄或三欄，Twitch 頁的輸入框限寬 `max-w-2xl`，不把輸入框拉到整個畫面寬；Twitch 頁在 2xl 把開台紀錄移到右邊一欄，直播卡片用 auto-fit（人少時撐滿這一欄，不空下一兩欄），首頁「正在直播」只有一兩位時改成橫的卡片；觀看頁的播放器寬度依視窗高度封頂（照 YouTube，播放器大小優先，一行標題與頻道列留在畫面裡），多的寬度給「接下來播放」；劇院模式時播放器撐滿兩欄；理財總覽（`dashboard/layout.ts`）總資產在橫幅裡，「我要…」一排六個，下面在 xl 分兩欄（左邊這個月要做的事、右邊本月收支與每月收支），2xl 拆成三欄；帳戶、投資、每月固定與設定的卡片用同一個 `CARD_GRID` 照寬度加欄，紀錄頁在 xl 旁邊固定放這個月的合計。
    - 排欄（`col-span`、`row-span`）寫在元素自己身上，或把同一欄的卡片包成一個 `page-stack`，不從外框用 `[&>:first-child]`、`[&>:nth-child()]`、`*:first:` 挑第幾個（永遠排第一個的 `PageHeader` 例外；`architecture.test.ts` 檢查）：Server Action 的表單開頭有 React 加的隱藏 input，串流中的 Suspense 也會在原地多一個 `<template>`，第幾個會算錯。
    - 同一個元件在不同地方寬度不同的（首頁卡片外框、理財的這個月要做的事、快捷按鈕、信用卡卡面與帳單紀錄、星穹鐵道角色詳情的右欄）用 `@container`，裡面用容器查詢（例如 `@sm:`、`@md:`、`@3xl:`）依所在的寬度排欄，不用螢幕寬度；Twitch 的直播卡片改用 auto-fit 的格線（見上面）。
  - 高度：按鈕、輸入框、下拉選單、分段選擇、YouTube 的膠囊按鈕（`yt-pill`）與搜尋列都是 44px；下拉選單（`select.input`，`appearance: none`，箭頭是 CSS 畫的，離右邊框跟文字離左邊框一樣遠，使用者覺得原生的太貼右邊）同樣 44px；清單列與工具列裡的次要按鈕（`btn-sm`）、導覽膠囊、YouTube 的篩選膠囊（`yt-chip`）與 `yt-pill-sm`、⋮ 是 36px，觸控裝置一律放大到 44px（`globals.css` 最後的 `pointer: coarse`），太小的元素用透明的偽元素把點擊範圍撐到 44px；只有圖示的按鈕是正方形（`btn-icon`、`icon-button`）；chip 一律 22px。
  - 同一列的卡片用 grid 等寬等高、清單的列一樣高；頭像只用 `Avatar` 的四種大小；圖示與文字垂直置中；金額與數字靠右加 `tabular-nums`，同一欄用固定欄寬對齊。
  - 手機：單欄、左右內距 16px（彈出面板也一樣）、不能橫向捲動（刻意橫捲的導覽列模組按鈕、頭像列、篩選膠囊列、觀看頁的膠囊列除外；導覽列的按鈕不換行，放不下時目前的模組自動捲進畫面，窄螢幕右緣淡出提示還能滑，見 `globals.css` 的 `.nav-scroll`；這些橫向列在電腦上用滑鼠拖，見 `drag-scroll.ts`）。
- 外觀（淺色／深色／跟隨系統）在導覽列的人像選單切換：`createLocalPref`（key `allhub:theme`）存在瀏覽器、跨分頁同步，寫在 `<html data-theme>`（跟隨系統時拿掉）。根 layout `<head>` 的同步腳本（`THEME_INIT_SCRIPT`）在第一次繪製前套用，深色不會先閃一下淺色；`ThemeSync` 補回開發模式 StrictMode 清掉的屬性。深色的樣式一律用 `@variant dark`／`dark:`（`globals.css` 的 `@custom-variant dark`：有 `data-theme` 時以它為準，沒有時跟隨系統），不要直接寫 `prefers-color-scheme`（`theme.test.ts` 檢查）。
- 不用灰色的說明字（使用者要的，全站都是）：使用者需要的狀態用標籤（`StatusChip`、`chip`）或圖示加正常大小的深色文字；說明文字收進標題或欄位標籤旁的 `InfoTip`（i 圓圈，使用者要的，例如新密碼的規則、資料來源、開始設定每一步的說明、理財帳戶的結帳日與起始餘額、提醒的日期；只寫濃縮的一句，40 字以內，不用「。」「；」，`src/__tests__/info-tip-text.test.ts` 檢查；理財表單的 `AmountField`、`DayOfMonthSelect` 用 `tip`）；跟著輸入變的試算（差額、估的股數、預計金額）與輸入時要看的規則（信用卡填負數）照舊寫在欄位下面，但用深色（`text-ink`）；空狀態的說明、`notice`、`<details>` 打開的內容、視窗與選單裡的說明都是深色；很長的內容才用 `<details>`（`disclosure`）或移到 docs；時間、數量、頻道名稱這類資料保留但要夠深（`text-ink-soft`），不用 `text-muted`（只留給輸入框裡的圖示與裝飾的箭頭）。錯誤與提醒照上面回饋的分工（提示視窗與表單的 `FormFeedback`）。
- 不用「·」把好幾件事串成一行（使用者覺得醜，全站都是，`src/__tests__/middle-dot.test.ts` 擋正式程式出現 `·`，測試與 `dev/` 的假資料不算）：標籤加值用 `FactList`，或分成上下兩行、左右兩欄、各自一個 `span` 用 gap 隔開、各自一個標籤，看哪種一眼看懂；不加顏色、圖示或動畫。
- 讀不到外部資料時一律寫「暫時無法讀取」（使用者要的，全站一樣）：需要時前面加主詞（「時刻表暫時無法讀取」「臺北捷運、環狀線暫時無法讀取」），後面不加「稍後再試」；按了按鈕才失敗的錯誤（新增持股、加常用路線）照舊接「請稍後再試」；問題出在使用者自己的 cookie 這類不會自己好的，寫「無法讀取」不加暫時。log、排程的摘要與系統狀態頁的問題不在此限。
- 停用的按鈕全站一個樣子（使用者要的）：`globals.css` 的一條規則（`button`、`btn-*`、`icon-button`、`switch` 的 `:disabled` 與 `[aria-disabled="true"]`：變淡到 0.55、游標是不能按），停用時滑過也不換底色；模組不另外寫停用的樣子（`src/core/ui/__tests__/disabled-look.test.ts` 檢查只有一條）；送出中的 `ActionButton` 與通知開關照樣變淡，只是游標換成等待（`BUSY_CLASS`）。
- 滑過的底色跟著字色（使用者回報過白底白字）：`icon-button`、`btn-ghost`、`card-header-link` 滑過與打開時的底色是字色混透明（`color-mix(in srgb, currentColor 7%, transparent)`），一般地方是淡灰，場景圖的標題列、台鐵與公車卡片這類白字的地方是淡白；不要寫死 `--surface-muted` 這類淺色（`src/core/ui/__tests__/hover-look.test.ts` 檢查）。
- Server Action：先 `requireSession()`（模組的用 `requireModule("<模組 id>")`，id 要跟資料夾一樣；管理用的先 `requireOwner()`），拿到的使用者 id 傳給 service（見〈多人〉）；`"use server"` 檔的每個 export 第一個敘述就是 `await requireSession()`、`await requireModule(…)` 或 `await requireOwner()`，不用登入的只有 `login`、`registerAction`、`logout`，Server Action 一律寫在開頭有 `"use server"` 的檔案、不寫在函式裡（`architecture.test.ts` 檢查）。欄位用 `core/form.ts` 的 `formText`／`formId`／`formFlag` 讀，寫入包在 `runAction()` 裡（錯誤變成表單訊息、log 只記種類，不會跳錯誤畫面；要原樣給使用者看的錯誤丟 `UserError` 或繼承它的類別）；`requireSession()` 與 `redirect()` 放在 `runAction()` 外面，`updateTags` 照〈快取〉放 finally 或成功之後。模組的 `web/actions.ts` 不轉出 `FormState`，元件一律從 `@/core/ui/form-message` import。
- 日期時間顯示一律用 `core/time.ts`，不直接用 `Intl.DateTimeFormat`、`Intl.RelativeTimeFormat` 或 `toLocale*String`（ICU 版本不同時空白字元會變，CI 曾因此失敗；`architecture.test.ts` 檢查）。
- SQL 裡的時間：跟欄位比較（`lt(table.col, date)`）時 drizzle 會自己轉；寫在 `sql\`…\`` 運算式裡或跟它比較時，一律 `${date.toISOString()}::timestamptz`。drizzle 的 postgres-js 不轉 Date 物件，正式環境會丟錯；測試用的 PGlite 自己會轉而查不出來，要檢查送出的參數（`youtube:cleanup` 曾因此整個失敗，見 YouTube 的 `cleanup.integration.test.ts` 的 `dateParams`）。
- README 保持精簡，細節寫在 docs/；新增功能時更新對應的 docs 頁；每個版本更新 `CHANGELOG.md`（見〈部署〉的發版）。
- 還沒做的功能規劃放 `docs/plans/`：一個功能一個檔，開頭寫狀態，列出做法、待決定與上線時要改的文件；做完時把內容搬進對應的文件、刪掉規劃。

## 安全

- `proxy.ts` 只驗 JWT 簽章與期限（不查資料庫，維持 edge 可用）。**Server Action 與讀資料的元件都要呼叫 `requireSession()`**：Server Action 可被直接 POST，改密碼後舊 cookie 的簽章仍有效、被停用的帳號 cookie 也還有效，只有它會比對資料庫的 `session_version` 與 `disabled_at`。停用帳號時 `session_version` 也加一，恢復後停用前的 cookie 不能再用。`(main)/layout.tsx` 的 `SessionGuard` 讓沒讀資料的頁面也會擋；Route Handler 用 `core/api-route.ts` 的 `withSession()`／`withJsonBody()`（底下是 `currentSession()`），沒登入回 401。
  - `currentSession()` 讀 cookie 之前先 `await navigation()`（`next/cache`，速度優化）：開了 `partialPrefetching`，外框裡有讀 cookie 時每個站內連結的預先抓取都要伺服器重算一次、查兩次資料庫；放在 `navigation()` 下面後預先抓取直接用建置時的外框，點進去才查登入。Route Handler 與 Server Action 呼叫時會直接往下走。vitest 的 `next-cache-stub.ts` 有它的替身。
- 瀏覽器快取（速度優化）：`/icons/*` 不用登入，`next.config.ts` 的 `headers()` 給一週；要登入的 `/images/*`、`/illustrations/*` 由 `proxy.ts` 在驗過登入、放行時才加 `private` 一天（`next.config.ts` 的 headers 也會套到導回登入頁的轉址，瀏覽器記住後重新登入圖會壞掉）。檔名沒有雜湊，換圖時換檔名，不然要等效期過。
- 角色：`core_users.role` 是 `owner`／`member`，權限一律讀資料庫（cookie 不帶角色）。管理頁的讀取與 Server Action 都呼叫 `requireOwner()`（不是站長就導回首頁），導覽列的「管理」只是不顯示。
- 模組權限（使用者要的，`core/auth/module-access.ts`）：`core_module_denials` 只記某個人不能用的模組（主鍵是使用者加模組 id），預設全部能用，新模組自動開放；站長一律全部能用、不查這張表，表格裡站長那一列勾選而且不能改。站長在 `/admin` 的表格勾選即存（`setModuleAccessAction`，只檢查模組 id 的格式：core 不能 import 模組清單）；建立邀請連結時先勾要開放的功能（使用者要的，預設都不勾、至少一個，`core_invites.denied_modules` 記沒勾的，舊邀請是空的＝全部能用），註冊時跟建立帳號同一個交易寫進 `core_module_denials`，之後要多開再到表格勾；一般使用者看不到任何權限的文字或入口，沒權限的模組就是不出現。
  - `requireModule(id)`：先 `requireSession()` 再查，不能用時導回首頁、不說原因；Route Handler 用 `canUseModule()` 或 `core/api-route.ts` 的 `withSession()` 的 `module`（`architecture.test.ts` 檢查要帶自己的模組 id），不能用回 403。成員不能用的模組跟登入檢查同一次查詢讀到（`findSessionUser()` 的子查詢，`SessionUser.denied`，速度優化：每個請求與每次輪詢少一次資料庫來回），沒帶的才另外查；不跨請求快取，關掉後下一次請求就生效。
  - 導覽列、首頁模組入口與卡片、通知頁的篩選、提醒方式只列能用的（`usableModules()`）；能用哪些要讀資料庫，所以導覽列與首頁先出現骨架，被關掉的模組不會閃一下。被關掉的模組的舊通知在鈴鐺、未讀數與通知頁也濾掉（`notifications/visible.ts`，資料保留，恢復後照常；「全部標為已讀」也不動藏起來的，`markAllNotificationsRead()` 帶 `hidden`）。
  - 沒權限＝那個模組凍結（同停用帳號）：資料全部保留、追蹤照樣算數；`notify()` 跳過對那個模組沒權限的收件人，用使用者憑證或替他做事的排程（星穹鐵道、理財的自動記帳與除權息、天氣、提醒與倒數）都用 `activeOwnerOf(…, 模組 id)` 略過他；重新加密排程例外。跨模組的檢查在 `src/__tests__/module-access.integration.test.ts`（直接 POST 每個 Server Action、凍結、恢復）。
- 操作紀錄（使用者要的，`core_audit_logs`，`core/audit/index.ts`）：所有人的登入、登出、註冊與 Server Action（`runAction()` 自動記，不用的動作要自己呼叫 `audit()`），記帳號名稱、IP 原文、功能、操作、對象、結果與批次編號（同一次操作寫出的幾列共用，例如註冊的「註冊帳號」與「使用邀請連結」）；站長在 `/admin/logs` 看（`core/admin/audit-page.tsx`，每次直接讀、不走快取，篩選條件在網址上），保留 7 天（`AUDIT_RETENTION_DAYS`，排程 `audit:cleanup`）。
  - 不記密碼、cookie、API Key、邀請碼與記帳的金額：`ActionScope` 的 `target`、`detail` 不能放這些。不存在的帳號不存原文（`UNKNOWN_ACCOUNT`），有人會把密碼打進帳號欄。續翻每批太多不記，只記「開始翻譯」。
  - 登入與註冊失敗誰都能觸發：同一小時同一件事同一個 IP 併成一列算次數（`merge_key` 唯一、`attempts` 加一），一小時最多 200 列（`MERGED_ROWS_PER_HOUR`），超過的全部併進同一列，7 天最多約 3 萬列。
  - `actor_id` 刻意不設外鍵：帳號刪掉後紀錄要留到保留期，所以帳號名稱也存一份（`/terms` 有寫）。寫入在 `after()` 裡，登入的回應時間才不會洩漏帳號存不存在，寫不進去只記 log，不影響使用者的操作。
- 公開頁面只有 `/login`、`/register`、`/terms` 與驗證碼圖片 `/api/auth/captcha`，加到主畫面用的 `/manifest.webmanifest`、`/sw.js`、`public/icons/` 與分頁圖示 `/favicon.ico` 也不用登入（`proxy.ts` 的 matcher 排除，整段比對）；不用登入的 Server Action 只有 `login`、`registerAction`（各自有次數限制與圖形驗證碼）與 `logout`（只刪自己的 cookie），其他都要登入。
- 換人登入：登出、刪除帳號、被導回登入頁都是站內換頁，前一個人的頁面還藏在 Activity 裡（打到一半的密碼、API Key、cookie）。登入與註冊共用的 `AuthCard` 放了 `discard-hidden-pages.tsx`：發現藏起來的 AppShell（`<main data-app-shell>`）就整頁重新載入，換人登入時看不到上一個人的東西。
- 圖形驗證碼（`core/auth/captcha.ts`、`captcha-image.ts`）：5 個不易混淆的字，用內建的筆畫字型畫成扭曲的 `<path>`，SVG 裡不能有 `<text>` 或字元本身。`/api/auth/captcha?for=login|register` 回 SVG（`no-store`）並設 HttpOnly、SameSite=Strict（production 加 Secure）的 cookie，只放 nonce、5 分鐘的到期時間與兩個 HMAC（金鑰從 `SESSION_SECRET` 用 `allhub:captcha` 衍生，跟 IP 雜湊分開）：一個含答案，一個不含答案、只涵蓋用途、nonce 與到期時間；不放驗證碼。Server Action 先用 `takeCaptchaToken()` 讀出並清掉 cookie（每次送出都換一張），再 `verifyCaptcha()`：先驗不含答案的 HMAC（偽造、改過期限或用途的 cookie 在這裡就擋下，不寫資料庫），通過了才用 `claimOnce()` 把 nonce 的 sha256 記在 `core_rate_limits`（每個只能用一次，答錯也用掉，超過 1 天的順便清掉），最後不分大小寫與空白比對答案。登入在檢查密碼前驗證，答錯不算帳號的鎖定次數、只算 IP 的；註冊在蜜罐之後驗證。錯誤一律「驗證碼錯誤，請重新輸入」。
- 只能用邀請註冊：`core_invites` 只存邀請碼（32 bytes 亂數）的 sha256，完整連結只在 `createInviteAction` 的回應裡出現一次（建立下一條時不把上一次的結果送回伺服器）。用掉一次是條件式 update（沒撤銷、沒過期、已用次數小於上限才加一），跟建立帳號在同一個交易裡，資料庫另有 `used_count <= max_uses` 的檢查。註冊表單有蜜罐欄位（`messages.ts` 的 `HONEYPOT_FIELD`）、要勾選同意 `/terms`；邀請有效時才告訴對方帳號已被使用。
- 次數限制：註冊（每個 IP 每小時 10 次）與無效邀請碼（10 次）的計數存在資料庫（`core/auth/attempts.ts`、`core_rate_limits`，serverless 的記憶體不共用），IP 用 `SESSION_SECRET` 做 HMAC 後才存，不存原文。登入依帳號鎖定（`core_users.failed_logins`、`locked_until`：連錯 5 次鎖 15 分鐘，之後 30、60 分鐘），先在資料庫占用一次再驗證密碼；錯誤一律「帳號或密碼錯誤」，鎖定中也一樣。依 IP 的登入限制仍在記憶體（盡力而為）。
- 外部呼叫的端點不走登入、各自驗證：`/api/twitch/eventsub`（HMAC-SHA256）、`/api/youtube/websub`（GET 要帶 callback 上跟頻道綁定的 `k`，訂閱只確認追蹤中頻道；POST 驗 HMAC-SHA1，不符回 204 但忽略）、`/api/cron/<排程>`（`CRON_SECRET`）。新增這類端點要同步改 `proxy.ts` 的 matcher（整段比對，後面接 `(?:/|$)`）。webhook 只在真的寫入時才讓快取失效。
- `/api/notifications` 的 POST 檢查同源（`Origin` 對 `Host`）與 JSON。
- 錯誤訊息可能夾帶憑證或 SQL 參數：對外回應（cron 結果、Server Action 回傳）只放摘要，log 用 `core/errors.ts` 的 `logError()` 只記錯誤種類（`error.name`，DecryptionError 記原因代碼），不記 message。寫進資料庫、會顯示在畫面上的狀態也一樣：Twitch 與 YouTube 的訂閱失敗用各自 lib 的 `subscriptionFailure()` 寫中文摘要（依錯誤種類與狀態碼，逾時是「連線逾時，稍後會自動重試」），不寫原文。
- 防機器人：`/robots.txt`（實作在 `core/robots.ts`，`src/app/robots.ts` 只轉接）對所有爬蟲 `Disallow: /`，根版面的 metadata 帶 `NO_INDEX`（noindex、nofollow）；`robots.txt` 在 `proxy.ts` matcher 的排除清單裡，沒登入的爬蟲才讀得到。登入與註冊次數的 Vercel Firewall 規則（同一條規則用 OR 涵蓋 POST `/login`、POST `/register` 與 `/api/auth/captcha`）與 Attack Mode 寫在 `docs/deploy.md`。
- 手機通知的 `endpoint` 是瀏覽器送來的網址，只收推送服務的網域（`core/push/rules.ts` 的 `isPushEndpoint()`），不然等於讓人指定伺服器去 POST 哪裡；`/api/push` 檢查同源與 JSON。
- 第三方憑證（HoYoLAB cookie、AI API Key）用 `core/crypto` 的 `encryptSecret` 加密後才存；畫面與 log 不出現原文（AI Key 只顯示前 8 碼：讀設定時解密後取，回傳值只有這 8 碼，資料庫不另外存）。新增加密欄位要加進該模組的 `reencrypt` 排程（逐筆換金鑰用 `core/crypto` 的 `reencryptEach()`）。
- 原始碼與部署設定不放任何密碼或密鑰；正式環境的密鑰只存在 Vercel 環境變數與 GitHub Secrets，本機不保存。

## 多人：依使用者的資料與擁有權

- 依使用者的表都有 `user_id`（NOT NULL），外鍵指向 `core_users`、`on delete cascade`（刪除帳號時一起刪）：`core_notifications`、`twitch_follows`、`youtube_follows`、`youtube_settings`、`youtube_saved_videos`、`starrail_accounts`（簽到紀錄與自動兌換試過的兌換碼跟著帳號刪）、`savings_accounts`、`savings_categories`、`savings_transactions`、`savings_recurring`、`savings_holdings`、`savings_card_bills`、`savings_dividend_notices`、`savings_asset_days`（舊的 `savings_asset_snapshots`、`savings_goals`、`savings_entries`、`savings_purposes` 已經刪掉）、`weather_settings`、`reminders_items`、`core_module_denials`、`core_avatar_images`、`core_push_subscriptions`（`core_push_mutes` 跟著手機刪）、`youtube_ai_keys`、`travel_members`、`travel_comments`、`travel_expenses`（`paid_by`）、`travel_expense_shares`、`travel_expense_payers`、`travel_settlements`（`from_user`、`to_user`）、`weather_places`、`transit_routes`；`core_invites.created_by` 也是 cascade。
  - 共用的表：`twitch_streamers`、`twitch_stream_events`、`youtube_channels`、`youtube_videos`、`youtube_translations`（發起人 `requested_by` 是 `on delete set null`，翻譯留給其他人）。
  - 新增依使用者的表照同樣寫，新增 core 以外的連帶刪除不用改 `deleteOwnAccount()`（core 不能 import 模組，連帶刪除只靠外鍵）。
- 使用者 id 一律來自 `requireSession()`（Route Handler 是 `currentSession()`），當 service 函式的第一個參數（重新翻譯、上傳字幕要看角色，傳整個 session）；不從表單、網址或其他地方拿使用者 id。表單或網址送來的資料 id 只決定操作哪一筆。
- 擁有權在 service 的 SQL 裡檢查：收 id 的讀寫一律同時比對 `user_id`（`where id = ? and user_id = ?`），別人的 id 當作不存在（回 null／false／「找不到…，請重新整理頁面」，不另外說「沒有權限」，免得透露那筆資料存在）。頁面的選擇（例如星穹鐵道的 `?account=`）只從自己的清單裡挑。每一類收 id 的 Server Action、Route Handler、頁面都要有 IDOR 測試：用 A 的 session 操作 B 的資料，結果被拒絕或沒有效果（service 的整合測試用 `insertTestUser()` 建兩個人；Server Action 的測試確認傳給 service 的是登入者的 id）。
- 例外：
  - **YouTube 翻譯共用**：同一支影片所有人看同一份；開始翻譯沿用已經有的；續翻用觀看者自己的 API Key（沒有 Key 只能看）、發起時的專有名詞表快照（`youtube_translations.glossary`，null 是舊程式寫的，改用觀看者自己的）；重新翻譯與上傳字幕只有發起人或站長（條件是 `manageableBy()`，寫進同一個 SQL；頁面用 `canManageTranslation()` 決定要不要顯示按鈕），做的人成為新的發起人。
    - 續翻由觀看者自己決定：別人發起、還沒翻完的翻譯，觀看頁不自動用他的 Key 接著翻（「自動即時翻譯」開著也一樣），顯示已翻好的部分與「用我的 API Key 繼續翻譯」，按了（或按開始、重試）才跑續翻迴圈；自己發起的照舊自動接著翻（`web/auto-translate.ts` 的 `shouldAutoContinue()`，頁面傳 `startedByViewer`）。
    - 錯誤分兩類（`continueTranslation` 的 catch）：AiError 的 `bad_output`、`refused`（模型拒絕翻譯）是字幕內容的問題，才把共用那一列標成 failed；`auth`、`quota`、`rate_limit`、`network`、`other` 與非預期的錯誤是觀看者自己的問題，放掉鎖（回 queued）、不寫 error，錯誤只丟給這次呼叫的人（auth 是 `ApiKeySetupError`，畫面附設定頁連結）。
    - 專有名詞表存檔時有上限（`lib/parse.ts` 的 `GLOSSARY_LIMITS`：200 筆、每個詞 50 字、合計 5,000 字，超過丟中文的 `TranslationUserError`）；送給 AI 時 `translateBatch` 只帶這一批與前後文裡出現的詞條（`relevantGlossary()`）。上傳字幕最多 5,000 句。
  - **字幕下載**（`/api/youtube/subtitles/<影片 id>`）不檢查擁有權：翻譯共用，登入的人在觀看頁本來就看得到同一份，下載只是另一種格式。
  - **星穹鐵道的 UID 全站唯一**：別人已經連結的 UID 拒絕（整批不寫入），自己重新連結只更新自己那一列（`starrail_accounts.user_id` 不能是 null）。
  - **旅遊的旅程共用**：`travel_trips` 沒有 `user_id`，權限看 `travel_members`，加入的人都能改行程。擁有權在 service 的 SQL 裡檢查：每個讀寫都經 `service/access.ts` 的 `isMemberOf()` 或 `inMemberTrip()`（鎖住旅程再比對成員），不是成員回 null 或「找不到這趟旅程」，項目 id 也要比對屬於這趟。建立者不存欄位：最早加入的人就是（`managerOf()`），他離開或刪除帳號後自動交給下一位，只有他能移除成員、動群組連結、刪旅程。
- 共用的主播與頻道：追蹤時 upsert 共用的那一列再加自己的追蹤（同一個交易），取消追蹤只刪自己的；最後一位追蹤者取消時才刪主播／頻道並刪掉 EventSub／WebSub 訂閱（交易裡鎖住那一列再數追蹤者）。刪除帳號留下沒人追蹤的，由每天的 `twitch:sync`、`youtube:renew` 刪掉。
- 手動的「同步訂閱」（`syncSubscriptionsFor`）與「續訂」（`renewSubscriptionsFor`）所有人都能按，處理的是全站共用的訂閱；回應只說自己追蹤的數量，不透露全站的主播或頻道數；每人 60 秒冷卻（`takeCooldown()`）。排程用不分使用者的 `syncSubscriptions`、`renewSubscriptions`，回應是全站摘要。開台與新影片通知只送給追蹤、而且通知開著（`*_follows.notify_enabled`）的人；主播表、頻道表沒有通知開關（單人版的舊欄位 v0.1.8 刪掉），畫面用 `data/schema.ts` 的 `FollowedStreamer`／`FollowedChannel`（共用那一列加上自己的 `notifyEnabled`）。
- `notify({ recipients, … })`：收件人是使用者 id 陣列，由各模組決定（Twitch／YouTube 是追蹤而且開著通知的人，星穹鐵道是帳號的擁有者，理財是固定收支、信用卡或持股的擁有者，天氣是開著下雨或警特報通知的人，提醒與倒數是項目的擁有者）；空陣列就不寫，查完之後才刪除帳號的人、被停用的人直接略過。排程寄的提醒同一件事只寄一次：星穹鐵道、天氣與提醒與倒數用 `core/claim.ts` 的 `sendOnce()`／`sendOnceEach()` 先 `claimOnce()` 再寄、寄不出去 `releaseOnce()`，開拓力與理財用條件式 update 認領（`last_stamina_alert_at`、`last_notified_on`、`card_notified_on`；除權息是 `savings_dividend_notices` 的條件式寫入），寄不出去退回。
- **停用＝凍結**：被停用的帳號資料全部保留，追蹤照樣算數（共用的主播與頻道不會被當成沒人追蹤而刪掉，恢復後不用重建訂閱）；只是 `notify()` 不寫通知給他，星穹鐵道的排程（簽到、開拓力與提醒、自動兌換）不處理他的帳號（`listAccounts()` 只取擁有者沒停用的），理財的 `savings:recurring` 也不替他記帳、不寄到期通知，恢復後自動記的補記停用期間的期別（最多 12 期），要確認的照順序列在這個月要做的事，`savings:dividends` 也不寄除權息通知；天氣的 `weather:rain`、`weather:warnings` 收件人也只取沒停用的，提醒與倒數的 `reminders:daily` 不寄也不刪他的項目（恢復後的下一次排程才刪掉過期的）。新增會用使用者憑證的排程也要照這樣略過停用的人；重新加密排程例外，照樣處理所有人（移除舊金鑰前要全部換好）。通知、追蹤與共用的訂閱、理財的自動記帳與除權息通知、天氣的下雨與警特報提醒、提醒與倒數在 `src/__tests__/account-disable.integration.test.ts` 一起檢查；星穹鐵道的排程（簽到、開拓力與提醒、自動兌換）在模組自己的整合測試（`service/accounts`、`reminders`、`auto-redeem`）。
- `user_id` 一律 NOT NULL，新的表也照這樣寫：多人化部署空窗期舊程式寫的、沒有擁有者的列，v0.1.8 的 migration 先刪掉再改成 NOT NULL（見 `docs/deploy.md`）。可以是 null 的只有共用翻譯的發起人 `requested_by`（發起人刪除帳號後）。

## 快取（`src/__tests__/cache-rules.test.ts` 檢查）

- 讀取：各模組 `service/cached.ts`（通知在 `core/notifications/cached.ts`，管理頁在 `core/admin/cached.ts`；登入檢查不快取），函式開頭依序 `"use cache: remote"`、`cacheLife("db")`（外部資料見下一點，profile 都定義在 `next.config.ts`）、`cacheTag(...)`。只給頁面與輪詢 API 用；寫入流程、排程、翻譯鎖要讀最新資料，用原本的 service（service、cron、模組的 `web/actions*.ts` 與 `web/routes/`、core 的寫入流程都不能 import cached.ts）。例外：保留影片的 Server Action 用 `cachedVideoInfo()` 拿觀看頁讀過的 oEmbed 當標題快照（外部資料、只是顯示用的，不是寫入的判斷依據），經 `keepVideo()` 的 `lookup` 交給 service；交通的輪詢 API（`web/routes/live.ts`）用 `cachedRoutes()`、`cachedLive()`，每分鐘都會問，全部讀最新的會用掉資料庫與 TDX 的額度（`cache-rules.test.ts` 的 `ALLOWED_READS` 逐條列出）。
- 一律 `use cache: remote`：Vercel 是 serverless，記憶體快取與 tag 失效跨不了實例。本機與測試自動退回記憶體快取。
- 外部資料（Helix 的頭像、直播與開台時間表、頻道頁的頭像、oEmbed、HoYoLAB 的便箋、遊戲頭像、角色、開拓月曆、活動日曆、終局戰績、躍遷紀錄、證交所與櫃買中心的收盤價與除權息預告、氣象署的預報與警特報、環境部的空氣品質、Open-Meteo 的一週預報、TDX 的車站、時刻表、票價、行車時間與即時資料）**不存資料庫**，只放在 `service/cached.ts` 的快取：
  - 效期依資料變動的頻率：直播狀態 `live`（2 分鐘）、HoYoLAB 戰績類與天氣 `records`（30 分鐘）、即時便箋與天氣警特報 `external`（5 分鐘）、頭像、遊戲封面與 TDX 的票價、行車時間 `avatar`（一天）、收盤價與除權息預告 `quotes`（每小時重讀、最多 6 小時）、TDX 的即時資料 `board`（最多 1 分鐘）、TDX 的時刻表 `timetable`（半天重讀、最多一天）、TDX 的車站與捷運路線 `stations`（一天重讀、最多 30 天）。讀不到（被擋、出錯、資料不公開）時改用短效期 `external`，幾分鐘後再試：成功與失敗各一個 `cacheLife`，寫在讀完之後（收盤價與除權息預告只讀到其中一個來源時也用 `external`）。
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

## 測試與 E2E

- **不對真實外部服務發請求**。單元與整合測試把 fetch 或 lib 換成替身；E2E 一律用 `next dev`＋`npm run mock:external`＋`DEV_EXTERNAL_ORIGIN`。
- fetch 防護：`src/dev/vitest-setup.ts` 把全域 `fetch` 換成只能連 localhost／127.0.0.1 的版本，其他目的地直接丟錯（訊息說明怎麼換成替身）。要回應的測試把 `fakeFetch().impl` 傳給 `fetchImpl`，或 `vi.stubGlobal("fetch", …)`（下一個測試前自動還原成防護版）；`vi.mock(path, { spy: true })` 的函式一定要設定回應，沒設定會呼叫真的實作而被擋下。
- 自動還原：`vitest.config.mts` 開了 `unstubGlobals`，`vi.stubGlobal` 換掉的全域每個測試前自動還原，不用寫 `afterEach(() => vi.unstubAllGlobals())`；換全域一律在測試或 `beforeEach` 裡（寫在檔案最上層或 `beforeAll` 的會在第一個測試前就被還原）。環境變數不自動還原（`unstubEnvs` 不開：很多測試在 `await import()` 被測模組前就設好，要整個檔案都有效）。`vitest-setup.ts` 每個測試前把 `DEV_EXTERNAL_ORIGIN` 清空，本機 shell 設了假伺服器也看到真正的網址；要用假伺服器的測試自己在測試裡設。
- 測試檔一律是 `.test.ts`，放在同資料夾的 `__tests__/` 裡（使用者要的：跟程式分開放），`__tests__/` 裡也只放測試：vitest 只跑 `.test.ts`，`.test.tsx` 這類不會執行（`architecture.test.ts` 檢查）。相對路徑從 `__tests__/` 算，要多一層 `../`。
- **production 模式（`next start`）會忽略 `DEV_EXTERNAL_ORIGIN`**，請求會送到真的服務（之前就因此打到一次真的 Twitch）。`next start` 下只測不會對外連線的流程（登入、沒有持股的理財、通知頁、帳號頁，以及還沒追蹤、沒連結帳號、沒有持股的使用者的首頁）；加主播、加頻道、webhook 補資訊、簽到、即時便箋、翻譯、YouTube 頁的背景字幕檢查、新增持股與有持股的理財頁（證交所與櫃買中心的收盤價與除權息預告）、`youtube:cleanup` 排程（讀追蹤中頻道的 RSS、逐支請求 `/shorts/` 找 Shorts）、`starrail:stamina`（便箋與活動日曆）、`starrail:redeem`（社群的兌換碼清單與兌換）、`weather:rain`（全台的天氣預報）、`weather:warnings`（全台的天氣警特報）、`savings:dividends`（除權息預告），以及有追蹤、連結帳號、持股或選了天氣縣市時的首頁（直播狀態、頻道頭像、即時便箋、遊戲頭像、收盤價、天氣預報、警特報與空氣品質）都會對外，只能用 `next dev`＋mock。
- 改了 CSS（`globals.css` 或模組的 `web/*.css`）畫面卻沒變：停掉 `next dev`、刪 `.next/dev/cache` 再重開（Turbopack 的持久快取偶爾會留著舊的 CSS）。
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

## 各模組注意事項

各模組與 core 幾個功能自己的注意事項放在各自資料夾的 `CLAUDE.md`（使用者要的：拆開來，改到哪裡才讀哪一份，這份才不會每次都整份載入）。Claude Code 讀到那個資料夾裡的檔案時自動載入；改動跨好幾個模組時，先讀相關的幾份。

- core：帳號 `src/core/auth/CLAUDE.md`、通知 `src/core/notifications/CLAUDE.md`、手機通知 `src/core/push/CLAUDE.md`、公告 `src/core/announcements/CLAUDE.md`
- 模組：`src/modules/<id>/CLAUDE.md`（starrail 星穹鐵道與 HoYoLAB、twitch、youtube、weather 天氣、transit 交通、reminders 提醒與倒數、travel 旅遊、savings 理財；每個模組都要有一份，`architecture.test.ts` 檢查）
- 新增模組時一起建它的 `CLAUDE.md`；全站共用的規則仍寫在這一份，不在各模組重複。

## 資料保留

- `core/retention/index.ts` 的 14 天只用在通知類紀錄（刪除用 `core/retention/cleanup.ts` 的 `deleteExpired()`）：`twitch_stream_events`、`starrail_checkin_logs`（各模組的 `cleanup` 排程）與 `core_notifications`（`notifications:cleanup`）。
- `youtube_videos` 不用 14 天：每個人的清單是自己追蹤頻道的最新 20 支（`LIST_LIMIT`，跟 `newestFirst`、一個人的 `listedVideoIds()`、清理用的所有人聯集 `allListedVideoIds()` 一起在 `service/video-list.ts`），`youtube:cleanup`（`service/cleanup.ts`）先對照 RSS、RSS 裡沒有的清單影片再逐支確認，刪掉 Shorts（已經通知過、發布不到 48 小時的先留著，但不算進最新 20 支的名次：`allListedVideoIds()` 的 `exceptVideoIds`，一般影片才不會被它擠出而刪掉），再刪掉不在任何人最新 20 支裡、而且發布超過 48 小時的影片。留 48 小時是為了 hub 在 24 小時通知窗內重送時不會重複通知。
- `youtube_translations` 永久保留：影片被清掉、頻道沒人追蹤而被刪掉時都不刪（翻譯表跟影片表、頻道表沒有外鍵，清理也不碰它），花錢翻好的字幕重看不用再付費。
- `youtube_saved_videos`（保留的影片）永久保留，直到使用者自己移除或刪除帳號：沒有清理排程，影片被清掉、頻道沒人追蹤時都不刪（跟影片表沒有外鍵）；只有清單滿了時先擠掉最舊的自動項目（見 `src/modules/youtube/CLAUDE.md`）。
- 信用卡帳單 `savings_card_bills` 每張卡只留最新 5 張：`savings:recurring` 每天清掉更舊的（`pruneCardBills()`），填帳單時補的那一筆紀錄留著、`card_bill_id` 由外鍵改成 null。
- 除權息通知的寄送紀錄 `savings_dividend_notices`（一個人一檔一個除息日一列）在除息日過了之後由 `savings:dividends` 刪掉。
- 資產走勢每天的投資市值 `savings_asset_days` 只留圖上看得到的 30 天（使用者選的近 30 天）：`savings:trend` 每天清掉更早的，不分使用者（停用的人也清，圖上本來就看不到）。
- 旅遊的旅程 `travel_trips` 回程 7 天後由 `travel:cleanup` 刪掉（使用者要的，`lib/rules.ts` 的 `RETENTION_DAYS`，照台北日期，第 7 天還在），項目、留言、清單與成員跟著外鍵刪；沒有成員的旅程也一起清掉。
- 提醒與倒數 `reminders_items` 不重複的日期過了之後由 `reminders:daily` 刪掉（台北 7 點多，只刪擁有者沒停用的），重複的留到使用者自己刪；卡片在快取外面用今天的台北日期過濾，排程跑之前就不顯示。
- 自動兌換試過的兌換碼 `starrail_redeem_codes` 只記答案不會變的（success、already、expired、invalid），留到移除那個帳號；手動輸入的兌換碼與結果都不存。
- 星穹鐵道提醒的認領在 `core_rate_limits`（scope `starrail:<種類>`，key 是帳號與期別的雜湊），一天後清掉，所以每種提醒的時段都短於一天。天氣的下雨提醒（scope `weather:rain`，key 是使用者 id 與台北日期的雜湊）、警特報（scope `weather:warning`）與提醒與倒數（scope `reminders:due`）也是。
- 操作紀錄 `core_audit_logs` 保留 7 天（`audit:cleanup` 排程，`core/retention/index.ts` 的 `AUDIT_RETENTION_DAYS`）：有 IP 原文，比通知類短；刪除帳號後已經記下的留到期滿。
- 躍遷紀錄不存資料庫，打開頁面時才向 HoYoLAB 讀（見 `src/modules/starrail/CLAUDE.md`）。
- 系統狀態 `core_cron_status`、`core_service_status` 只更新不新增（使用者要的），排程與服務各一列，沒有清理排程；排程的摘要會顯示在站長的頁面上，不寫成員的遊戲暱稱與開拓力（`CronTask` 的註解）。
- 上傳的頭像 `core_avatar_images` 每人一張：換照片或改用範例時刪掉舊的，刪除帳號時跟外鍵刪。交通的常用路線 `transit_routes` 與天氣頁的城市 `weather_places` 留到使用者自己刪除或刪除帳號。
- 其他資料永久保留，刪除帳號時依使用者的資料一起刪除。

## 部署

- 推上 main 時 Vercel 部署與 `db-migrate.yml` 平行執行，舊程式會在新的資料表上跑一小段時間，migration 一律先擴充、之後再收斂：
  - 新欄位可為 null 或有預設值，新表直接加；不刪也不改舊欄位（舊程式明列欄位的 select、insert、upsert 仍要能用；例外是 `youtube_settings.id` 加上 BY DEFAULT 的 identity，舊程式明確給 id 照樣寫得進去；v0.2.8 把 `youtube_settings` 的主鍵從 `id` 換成 `user_id`（使用者要的，分兩版：`id` 欄留著，舊程式的 select、insert 照常，`on conflict ("user_id")` 由主鍵涵蓋））。
  - 既有資料的回填寫在同一個 migration 的 SQL 裡（例如 v0.1.1 把單人版的資料歸給最早建立的站長）。
  - `src/core/db/__tests__/migrations.integration.test.ts`：這一版有回填或舊寫法要顧時，另外寫測試先套到上一版、用舊程式的寫法寫入，再套新的 migration；基準檔之後的每個 migration 自動檢查一開始設 `lock_timeout = 5s`、沒有 drop、rename、alter column（使用者同意的例外逐條列在測試的 `ALLOWED_CONVERGENCE`，多一條少一條都不行，只給還沒併進基準檔的 migration，併進去時一起拿掉），NOT NULL 的新欄位有預設值，新表開了 RLS。
  - migration 不累積（使用者的決定）：資料夾只留基準檔 `0000_baseline`（v0.1.6 以前的 0000 到 0013 壓成的）與還沒併進去的這一版 migration。上一版的 migration 確認套用到正式資料庫後，下一版開始時把它併進基準檔：用 `drizzle-kit generate` 從現在的 schema 重新產生（另外指定輸出資料夾），欄位順序調成跟正式資料庫一樣，再把兩種方式建出來的資料庫逐項比對（表、欄位與順序、預設值、identity、約束、索引、RLS、sequence；刪過欄位的表在正式資料庫的欄位編號有空號，比相對順序，跟著刪掉的 check 也要拿掉），一樣才換掉；journal 的 `when` 等於正式資料庫最後套用的那一個（drizzle 只套時間比最後一筆晚的，正式資料庫會略過基準檔；測試另外模擬這件事）。舊檔留在 git 歷史裡。因此只能從上一版升級，更舊的要先升到上一版。
  - 收斂（刪舊欄位或舊表、把 `user_id` 改成 NOT NULL、刪掉舊索引）要等舊程式不再上線之後的版本，改成 NOT NULL 前先把 null 的列補回或刪掉。drizzle 的查詢會明列 schema 裡的每個欄位，所以刪欄位要分兩版：先從 schema 拿掉（migration 手動去掉 DROP），再下一版才刪。db-migrate 用 GitHub Secrets 的 `MIGRATION_DATABASE_URL`（Session pooler 5432），網站用 `DATABASE_URL`（Transaction pooler 6543）。
    - 例外：v0.1.8 由使用者同意一次做完（`0001_weather_cleanup` 直接刪掉主播表與頻道表的舊 `notify_enabled`、`youtube_settings` 的三個 `*_key_hint`、`savings_accounts.purpose_id` 與 `savings_purposes`、`core_notifications_unread_idx`，`user_id` 先刪掉 null 的列再改成 NOT NULL）。代價：推上 main 後到新版部署完成前（大約一兩分鐘），還在線上的 v0.1.7 讀寫到被刪的欄位會出錯，理財、Twitch、YouTube 的頁面與 webhook 都受影響（Twitch、YouTube 會重送 webhook）；所以推送時避開排程的時段（台北 0 點到 7 點）、不要正在用網站，之後也不能回到 v0.1.7。之後的版本照舊分兩版。
- v0.2.7 從 schema 拿掉的欄位（理財分類的顏色、信用卡的舊截止日、關台紀錄的種類、YouTube 設定表的六個 API Key 與模型欄位、翻譯的舊批次欄位）v0.2.8 的 migration 刪掉了；`youtube_settings` 的主鍵 v0.2.8 換成 `user_id`，舊的 `id` 欄 v0.2.9 刪掉（schema 早就沒有它，drizzle 不會產生，migration 手寫 `DROP COLUMN` 並列進 `ALLOWED_CONVERGENCE`）。v0.2.11 資產走勢改成每天一列（`savings_asset_days`），舊的 `savings_asset_snapshots` 先從 schema 拿掉，v0.2.12 的 migration 手寫 `DROP TABLE` 刪掉（列在 `ALLOWED_CONVERGENCE`；基準檔照正式資料庫保留這張表，snapshot 照 schema 沒有它）。
- 不能回滾、只能往前修：有成員之後不能回到多人化以前的版本（v0.1.0）；v0.1.6 起也不能回到 v0.1.5（舊程式不認得「到期請我確認」，會把薪水、定期定額這類固定收支照原日自動記帳，也看不到持股與帳單）；v0.1.8 起也不能回到 v0.1.7（migration 刪掉了 v0.1.7 的查詢會明列的欄位與表，Instant Rollback 也不要按）；v0.2.2 起也不能回到 v0.2.0（刪掉了 `zh_captions`，回到 v0.2.1 可以）。細節在 `docs/deploy.md` 的〈回滾與部署保護〉與〈之後的部署〉。
- 第一次部署的順序（網頁操作）：Supabase 建專案 → Vercel 匯入並填環境變數 → GitHub Secrets 填 `MIGRATION_DATABASE_URL`、`CRON_SECRET`、`HUB_URL` → 重新部署 → 手動跑 db-migrate → `npm run account create`（依提示貼上 Session pooler 連線字串，第一個帳號是站長）→ 登入 → 在「管理」頁用邀請連結邀請其他人。帳號一定在 migration 之後建立。
- 密鑰正本就是 Vercel 的環境變數與 GitHub Secrets（步驟見 `docs/secrets.md`）；Vercel 的環境變數改完要重新部署才生效。換 `ENCRYPTION_KEY`（都在 Vercel 網頁上）：舊值複製到 `ENCRYPTION_KEY_PREVIOUS` → 設新值 → 重新部署 → 等 reencrypt 排程回報 0 筆、沒有失敗 → 刪掉 `ENCRYPTION_KEY_PREVIOUS` 再重新部署。
- 排程：都寫在 `vercel.json`（UTC；Hobby 每條一天最多一次、只保證在那個小時內執行，每個專案最多 100 條）。
  - `starrail:stamina` 同一個路徑每個 UTC 小時各一條（24 條），大約每小時跑一次；GitHub Actions 的定時排程常漏跑（實際一天只跑 4–5 次、間隔 3–8 小時），不要用，`.github/workflows/cron.yml` 只給手動執行。
  - `audit:cleanup` 每天一條（UTC 20:50＝台北 04:50，刪掉超過 7 天的操作紀錄）。
  - `travel:cleanup` 每天一條（UTC 19:10＝台北 03:10）。
  - `notifications:cleanup` 跟其他每天一次的排程錯開小時（`core/__tests__/cron.test.ts`），開拓力提醒與天氣警特報每個小時都有、不算。
  - `starrail:redeem` 每天一條（UTC 04:00＝台北 12:00；`modules/__tests__/cron.test.ts` 檢查只有一條）。
  - `weather:rain` 每天一條（UTC 22:00＝台北 06:00，只保證在那個小時內；`modules/__tests__/cron.test.ts` 檢查只有一條、在那個小時）。
  - `savings:dividends` 每天一條（UTC 00:00＝台北 08:00，9 點開盤前；同樣檢查只有一條、在那個小時）。
  - `savings:trend` 每天一條（UTC 16:45＝台北 00:45，`savings:recurring` 之後，記前一天的投資市值、清掉 30 天以前的）。
  - `reminders:daily` 每天兩條（UTC 23:00＝台北 07:00、UTC 04:00＝台北 12:00：中午那一次補寄早上沒寄出去的，排程不只一條才會有下一次，不然寄不出去的提醒隔天就被刪掉）。
  - `weather:warnings` 同一個路徑每個 UTC 小時各一條（24 條，共 66 條，`modules/__tests__/cron.test.ts` 也檢查總數在 100 條內）。
  - 排程的 route 沒有設 `maxDuration`，靠 Vercel 的 Fluid compute 預設 300 秒（Hobby）：`youtube:cleanup`（外部請求最多 60 秒）、`starrail:redeem`（約 45 秒）、`weather:rain`、`weather:warnings`（讀全台資料最多等 15 秒）、`savings:dividends`（兩個預告表各最多等 15 秒）都要它開著，關掉時預設只有 10 秒。
  - 新增排程要登記到 `src/modules/cron.ts`、`vercel.json` 與 `docs/architecture.md` 的排程表（`modules/__tests__/cron.test.ts` 檢查登記的排程跟 `vercel.json` 的路徑一一對應，只能手動跑的列在它的 `MANUAL_ONLY`）。
- 發版：`package.json` 的 version 與 `CHANGELOG.md` 一起改。CHANGELOG 新的一版加在最上面（版本與日期），分「新增／改善／修正」，有的才寫；給人看，寫使用者看得到的改變，不寫內部實作。資料庫 migration 寫在那一版的「資料庫」（沒有就寫沒有），升級時要注意的事另外寫進 `docs/deploy.md` 的〈之後的部署〉。
