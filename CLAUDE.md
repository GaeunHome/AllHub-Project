@AGENTS.md

# CLAUDE.md

AllHub Project：個人整合系統。

- 使用者：站長管理，其他人只能用站長的邀請連結註冊；各模組的資料依使用者分開，只有 YouTube 的翻譯與旅遊的旅程共用。
- 技術：Next.js 16 App Router＋TypeScript＋Drizzle＋PostgreSQL＋Tailwind 4，部署到 Vercel Hobby＋Supabase。
- 文件：各模組與 core 幾個功能的注意事項在各自資料夾的 `CLAUDE.md`（見下面的〈規則在哪裡〉）；`README.md`（精簡的專案首頁）、`CHANGELOG.md`（每一版的更新紀錄）與 `docs/`：部署 `deploy.md`、密鑰 `secrets.md`、模組 `modules.md`、架構 `architecture.md`、本機開發 `development.md`、還沒做的規劃 `plans/`。

## 規則在哪裡

使用者要的：要用到時才讀詳細規則，不重複讀、不多用 token。這份只放每次都要知道的事（官方建議一份 CLAUDE.md 在 200 行內）。

- 詳細規則依主題放在 `.claude/rules/`，每份用 `paths` 指定相關的檔案，讀寫到那些檔案時 Claude Code 才自動載入，同一個對話只載入一次。沒碰到那些檔案也要用到時（例如在瀏覽器驗證、發版），先自己讀那一份。
- 各模組與 core 幾個功能的注意事項在各自資料夾的 `CLAUDE.md`，讀寫那個資料夾的檔案時才載入；改動跨好幾個模組時先讀相關的幾份，新增模組時一起建它的 `CLAUDE.md`。全站共用的規則寫在 `.claude/rules/`，不在各模組重複。
- 不要在這份用 `@` 引用規則檔：引用的檔案會跟著一起載入，省不到 token。新的規則寫進對應主題的檔，這份只加一行摘要。

| 檔案 | 內容 | 什麼時候載入 |
|---|---|---|
| `.claude/rules/architecture.md` | `src/` 的分層、core 各檔的用途、模組結構、首頁卡片、資料表 | 讀寫 `src/` 的檔案 |
| `.claude/rules/code-style.md` | 命名、註解、測試寫什麼、對外請求、Server Action、日期與 SQL 的時間 | 讀寫 `src/` 的檔案 |
| `.claude/rules/ui.md` | 彈出視窗、回饋與提示視窗、外部圖片、畫面風格、樣式檔、間距、深色、灰字、停用與滑過、`core/ui` 的共用元件清單 | 讀寫畫面、元件、樣式與 `public/` |
| `.claude/rules/security.md` | 登入、角色與模組權限、操作紀錄、驗證碼、邀請、次數限制、憑證加密 | 讀寫登入、Server Action、Route Handler、管理頁 |
| `.claude/rules/multi-user.md` | 依使用者的表、擁有權與 IDOR、共用的例外、停用＝凍結、通知收件人 | 讀寫 service、data、Server Action |
| `.claude/rules/cache.md` | `use cache: remote`、效期、tag 與誰讓快取失效 | 讀寫快取、service、Server Action、頁面 |
| `.claude/rules/testing.md` | 測試的替身與防護、E2E 的瀏覽器與假伺服器、`src/dev` 的測試輔助清單 | 讀寫測試與 `dev/`；在瀏覽器驗證前先讀 |
| `.claude/rules/data-retention.md` | 每種資料留多久、誰清 | 讀寫清理排程、資料表、使用聲明 |
| `.claude/rules/deploy.md` | 套件、migration 的擴充與收斂、基準檔、排程、發版 | 讀寫資料表、migration、排程與套件；發版前先讀 |
| `src/core/<auth、notifications、push、announcements>/CLAUDE.md`、`src/modules/<id>/CLAUDE.md` | 各自的注意事項（每個模組都要有一份，`architecture.test.ts` 檢查） | 讀寫那個資料夾的檔案 |

## 指令

- 檢查：`npm test`（vitest，整合測試用記憶體 PGlite；`vitest.config.mts` 用 `threads`、固定 `maxWorkers: 4`，機器忙時才不會逾時）、`npm run lint`、`npm run build`、`npm run typecheck`（TypeScript 7 的 `tsc`；要用 build 產生的 `.next/types`，放最後；增量資訊寫在 `.next/cache/tsconfig.tsbuildinfo`，根目錄不會有 `tsconfig.tsbuildinfo`）。
- 套件：全部用最新版、`npm audit` 要是 0；TypeScript 6 與 7 共存、`overrides` 與幾個例外見 `.claude/rules/deploy.md`。
- 改 `core/db/schema.ts` 或模組的 `data/schema.ts` 後：`npm run db:generate`，migration 產生在 `src/core/db/migrations/` 並一起 commit；一個版本最多一個 migration（同一版再改資料表就刪掉這一版的 migration 重新產生），不要從本機對正式資料庫 migrate。
- 本機：`npm run db:local`（PGlite，要設 `DATABASE_POOL_MAX=1`）、`npm run mock:external`（假外部服務，搭配 `DEV_EXTERNAL_ORIGIN=http://127.0.0.1:4010`）。
- 帳號：`npm run account create`（第一個是站長，之後是成員）／`passwd <帳號>`（也會解除登入鎖定）／`unlock <帳號>`（只解除登入鎖定，不改密碼）／`list`（含角色與停用），在 `src/dev/account.ts`，用 node 直接執行（型別剝除）。

## 每次都要守的規則

細節在上面的規則檔；這裡的每一條都是摘要，兩邊不一致時以規則檔為準並修正這裡。

- 回覆、介面文字、註解與測試名稱用繁體中文。
- 架構：程式都在 `src/`，模組 `web → service → data → lib` 只能往下依賴、彼此獨立，core 不 import 模組（`architecture.test.ts`）。
- 不裝新套件、不改資料表結構，除非使用者要求；改資料表照 `deploy.md` 先擴充、之後再收斂。
- 註解只寫為什麼，白話、最多兩行、不用全形標點（`comment-style.test.ts`）。
- 測試只寫答案來自程式以外的；改行為先寫會失敗的測試；不為了通過而刪除或放寬既有測試。
- 使用者 id 一律來自 `requireSession()`／`requireModule()`，收 id 的讀寫同時比對 `user_id`，別人的資料當作不存在。
- 對外請求一律經 `externalFetch()`；日期時間顯示一律用 `core/time.ts`；SQL 裡的時間傳 ISO 字串。
- 測試與 E2E 不對真實外部服務發請求；E2E 用 `next dev`＋假伺服器，驗證完關掉瀏覽器與伺服器、刪掉暫存檔。
- 設計風格先問（使用者要的）：改配色、版面方向、新頁面長什麼樣子之前，先給使用者看方向與選項。
- 畫面：不用灰色的說明字、不用「·」串好幾件事、讀不到外部資料寫「暫時無法讀取」、小標籤越少越好。
- 密鑰只在 Vercel 的環境變數與 GitHub Secrets，原始碼與本機都不放。
- 提交、打標籤、推送都要使用者說了才做。
- README 保持精簡，細節寫在 docs/；新增功能時更新對應的 docs 頁；每個版本更新 `CHANGELOG.md`（見 `.claude/rules/deploy.md` 的發版）。
- 還沒做的功能規劃放 `docs/plans/`：一個功能一個檔，開頭寫狀態，列出做法、待決定與上線時要改的文件；做完時把內容搬進對應的文件、刪掉規劃。
