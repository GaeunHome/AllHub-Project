---
paths:
  - "src/**"
  - "next.config.ts"
  - "drizzle.config.ts"
  - "vitest.config.mts"
  - "tsconfig.json"
---

# 架構規則

`src/__tests__/architecture.test.ts` 檢查，改規則時兩邊一起改。

所有程式碼都在 `src/`，根目錄只放設定檔與文件。

- `src/app/`：路由殼。頁面與 layout 只 render 模組 `web/pages/` 或 core 的頁面元件（模組自己的 layout 目前只有交通，放只換網址參數時不用重算的部分）；route handler 只轉接（`export { GET } from …`；排程的 `api/cron/[task]` 例外，把模組的排程清單交給 core 的 `runCron()`）。segment config（例如 `maxDuration`）必須直接寫在這裡。只能用模組的 `info`、`cron`、`web/pages`、`web/routes`；core 只能用頁面元件（`*-page`、`home-page`、`app-shell`、`session-guard`）、route handler（`auth/captcha-route`、`auth/avatar-route`、`notifications/api`、`push/api`）、`cron`、`robots`、`manifest`、`ui/theme`＋`ui/theme-sync`（`architecture.test.ts` 的允許清單，新的入口要加進去；`import type` 不算）。
- `src/core/`：共用基礎，不能 import 模組、模組清單或 `src/app`。
  - `env.ts`：所有環境變數（zod，分組用到才驗證，手機通知的金鑰用 `pushKeys()` 讀，兩把都有才算設定好，順序同 `.env.example`，`env.test.ts` 檢查；`docs/secrets.md` 產生亂數的那行指令也由它實際執行並驗證）；別處不直接讀 `process.env`，例外只有 `NODE_ENV`、`proxy.ts` 的 `SESSION_SECRET`、`drizzle.config.ts` 的 `DATABASE_URL`、`src/dev` 的命令列工具（有 `import.meta.main` 的入口）、假外部服務（`dev/mock-external.mjs`、模組的 `dev/mock.mjs`）的 `MOCK_` 設定（`MOCK_PORT`、`MOCK_AI_MS_PER_LINE`、`MOCK_TDX_PER_MINUTE`），以及測試檔；`import { env } from "node:process"`、整個 `node:process` 與 `const { env } = process` 也算讀環境變數。`architecture.test.ts` 會掃 `src/` 與根目錄的設定檔檢查；新的用法對不上這份清單時，先回報再決定要不要改規則，不要直接放寬。
  - `db/`：postgres-js（4.x，`prepare: false` 配 Supabase pooler；`max_pipeline: 1`：Supavisor 2.10 以前在 transaction mode 收到管線化的查詢不會回應，v0.2.12、v0.2.13 正式站因此時常卡住、按登出沒反應；`query_timeout` 20 秒，連線池不回應時報錯重連，`core/db/__tests__/client.test.ts` 檢查；參數的型別由資料庫決定，時間照 `.claude/rules/code-style.md` 一律傳 ISO 字串）；`Executor` 型別是 `db()` 或交易的 `tx`；`db/schema.ts` 放 core 的表（`core_users`（含可以是 null 的暱稱 `nickname` 與頭像 `avatar`）、`core_avatar_images`（上傳的頭像，每人一張）、`core_invites`、`core_rate_limits`、`core_notifications`、`core_module_denials`（模組權限，只記不能用的）、`core_audit_logs`（操作紀錄）、`core_cron_status` 與 `core_service_status`（系統狀態，只更新不新增）、`core_announcements`（公告）、`core_push_subscriptions` 與 `core_push_mutes`（手機通知））與 `ROLE_LABELS`（角色的中文名稱，網站與 account CLI 共用）。
    - `db/users.ts`：`userAvatar`（查詢裡讀頭像用，從整列取值，新程式比 migration 先上線時欄位還不存在也不會整個查詢失敗）、`activeOwnerOf(table.userId, 模組 id)`（`innerJoin(coreUsers, …)` 只留擁有者沒停用、能用這個模組的列，見 `.claude/rules/multi-user.md` 的停用＝凍結與模組權限）、`canUseModuleSql(模組 id)`（同一個條件的 SQL，`notify()` 也用）、`lockUserRow(executor, userId, mode)`（交易一開始先鎖使用者那一列：`key share` 只擋刪除帳號，`no key update` 連同一個人的其他交易也排隊，先數再新增時用）。
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
  - `audit/index.ts`（操作紀錄，見 `.claude/rules/security.md`；`audit(actor, ...entries)`：回應送出後才寫，同一次呼叫的項目共用一個批次編號；`auditActor()`：動作開始前讀是誰與 IP；`auditLoginFailure()`、`auditMergedFailure()`：外人能無限觸發的失敗合併成一列）。
  - `audit/cron.ts`（`audit:cleanup` 排程）。
  - `status.ts`（系統狀態的資料，使用者要的：只更新不新增，每個排程、每個外部服務固定一列，資料量不會長大，所以不用清理。`recordCronRun()` 由 `runCron()` 統一呼叫；`reportService(服務 id, 問題或 null)` 由模組的 service 呼叫，`trackService()` 包住整段，丟錯時記錯誤種類再丟出去；都寫不進去只記 log，不影響排程與操作。服務 id 是「模組 id:種類」，要在模組的 `info.ts` 宣告 `services`，`architecture.test.ts` 檢查宣告的跟回報的一一對應。同一個平台依功能分開記，例如 `starrail:note`、`starrail:warps`，不然便箋成功會蓋掉躍遷紀錄的錯誤；使用者自己的 cookie 失效不算服務有問題，不回報。快取函式裡不能寫資料庫，只有打開頁面才讀的資料記不到）。
  - `notifications/`（見 `src/core/notifications/CLAUDE.md`）、`cache.ts`（`updateTags()`、`expireTags()`，見 `.claude/rules/cache.md`）。
  - `ui/`：共用的畫面元件，清單在 `.claude/rules/ui.md` 的〈core/ui 的共用元件〉（讀寫畫面時載入），寫畫面前先看有沒有現成的。
- `src/modules/<id>/`：功能模組，彼此獨立（不能 import 其他模組、模組清單或 `src/app`）。
  - 根目錄只有 `info.ts`、`cron.ts` 與這個模組的注意事項 `CLAUDE.md`（每個模組都要有），前兩個分別登記在 `src/modules/index.ts`、`src/modules/cron.ts`；各層都不能 import 根目錄（環境變數用 `@/core/env`，service 裡另外寫死模組 id）。沒有呼叫 `notify()` 的模組在 `info.ts` 設 `notifies: false`，「提醒方式」只列會發通知的模組（`architecture.test.ts` 檢查）。模組 id 就是資料夾名稱：`info.id`、`module:`（`notify`、`runAction`、認領失敗的 log）、`logError` 的 scope、認領與冷卻的 scope（`claimOnce`／`releaseOnce`／`takeCooldown` 的第一個參數、`sendOnce` 這類的 `scope:`，寫成「模組 id:種類」的字串或同一個檔案裡的常數）與 `allhub:<id>:` 的 localStorage key 都要一樣（`architecture.test.ts` 檢查）。只有首頁卡片、沒有自己頁面的模組（提醒與倒數）設 `homeOnly: true`，`href` 填 `/`：導覽列與首頁的模組入口不列出它（`core/module.ts` 的 `pageModules()`），卡片標題列也不放連結。
  - 四層只能往下依賴：`web → service → data → lib`。web 只能 `import type` data，不能用 `@/core/db`，登入檢查一律用 `requireModule("<模組 id>")`（不用 `requireSession`／`requireOwner`），也不直接用會寫資料庫的 `core/notify`、`core/cooldown`、`core/auth/attempts`、`core/claim`、`core/retention/cleanup`（經 service）；service、data、lib 不 import `@/core/auth`（登入，`import type` 除外）與 `next/headers`，使用者 id 由 web 傳進來。
  - `web/`（`pages/`、`components/`、`actions.ts`、`routes/`，樣式是 `web/*.css`，見 `.claude/rules/ui.md` 的樣式檔）、`service/`、`data/schema.ts`、`lib/`、`dev/`：`dev/mock.mjs`（假外部服務，`mock:external` 自動載入）與測試共用的 TS 輔助（例如 `dev/fixtures.ts`）。只有測試檔可以 import 同一個模組的 `dev/`，正式程式不行；`dev/` 的 TS 輔助只 import 同模組的 lib、data（測試要用資料表物件寫入假資料）與 `src/dev`（不碰 service、web、cached.ts）。
- 首頁卡片放在模組的 `web/pages/home-card.tsx`，要提醒的事放在 `web/pages/home-notices.tsx`（回傳 `NoticeItem`，沒有事就是空的；理財是逾期與待填帳單、提醒與倒數是今天與明天、星穹鐵道是 cookie 失效與開拓力到九成，天氣的特報與帶傘留在自己的卡片上），都由 `src/app/(main)/page.tsx` 組合，傳給 core 的 `HomePage` 排版：每一區是 `{ id, card }` 的陣列，core 先依登入者能用的模組過濾（沒有卡片的區塊不留空列），再排版（`notices` 是最上面的「今天要注意」，都沒有事時整條不出現；`top` 在最前面，天氣與提醒與倒數，使用者要的，`lg` 以上 3:2 兩欄、只剩一張時撐滿；`wide` 一張一列、彼此不並排；`half` 平常也是一張一列，超寬螢幕時跟 `compact` 那組各佔半列，那組在旁邊改成上下排、從上緣對齊，不會被拉高；`compact` 兩張一列等寬等高，最後固定是 core 的未讀通知，過濾後是雙數張時兩欄獨佔一整列、單數張時補滿最後一格（core 自己算，旁邊才不會空一格），超寬螢幕在 `half` 旁邊上下排時照樣一欄；排欄寫在 `HomePage` 的各個外框上，core 不 import 模組）；`architecture.test.ts` 檢查每張卡片都組合到首頁。
  - 卡片外框用 `core/ui/home-card.tsx` 的 `HomeCard`（標題列與前往模組頁的連結先出現，內容各自包一層 Suspense 骨架與 `CardErrorBoundary`，慢或出錯都只影響那一張）；內容是 server component，先 `requireModule("<模組 id>")` 再讀模組自己的 `service/cached.ts`（使用者 id 當第一個參數，跟模組頁共用同一份快取），不另外寫一套讀法。
- 資料表只能定義在 `core/db/schema.ts`（`core_` 開頭）或模組的 `data/schema.ts`（`<id>_` 開頭）。每張表都在 `pgTable(...)` 後面加 `.enableRLS()`，不加 policy、不用 FORCE：Supabase 的 Data API 用 anon、authenticated 讀寫 `public` 的表（預設有讀寫權限），開了 RLS 又沒有 policy 就一列都碰不到；網站與 db-migrate 用資料表的擁有者 `postgres` 連線，不受 RLS 限制（`migrations.integration.test.ts` 檢查每張表都開了、沒有 FORCE 與 policy，並模擬 anon 讀寫不到）。Supabase 的安全通知「Table publicly accessible」（`rls_disabled_in_public`）就是 v0.1.3 以前沒開。
- `src/dev/`：命令列工具、假外部服務入口、測試輔助，正式程式不能 import（模組 `dev/` 的測試輔助可以）。測試輔助的清單與用法在 `.claude/rules/testing.md`（讀寫測試時載入）。
  - 命令列工具與 `core/auth/credentials.ts`（含它 import 的 `password-rules.ts`）、`core/db/schema.ts`、`core/errors.ts` 會被純 node 載入：相對路徑寫 `.ts`、不能用 `@/`、型別用 `import type`（`account.test.ts` 實際載入一次確認）。
