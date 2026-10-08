# 架構

這頁說明程式碼結構、架構規則、排程、資料保留、快取與安全，以及怎麼新增模組。寫程式時要遵守的完整規則與慣例在 [CLAUDE.md](../CLAUDE.md)。

## 程式碼結構

所有程式碼都在 `src/`，根目錄只放設定檔與文件。

```text
src/
├─ app/              Next.js 路由，只轉接到 core 或模組
├─ core/             共用基礎（不依賴任何模組）
│  ├─ auth/          帳號、登入頁、帳號頁、session
│  ├─ db/            資料庫連線、core 的資料表、migrations
│  ├─ notifications/ 通知中心：鈴鐺、提示卡片、通知頁、輪詢 API
│  ├─ ui/            共用元件與圖示
│  └─ env.ts、cron.ts、cache.ts、crypto.ts、notify.ts…
├─ modules/
│  ├─ index.ts       模組清單（導覽列、首頁）
│  ├─ cron.ts        排程清單
│  └─ <id>/          twitch、youtube、starrail、savings
│     ├─ info.ts     名稱、網址、圖示
│     ├─ cron.ts     排程（選填）
│     ├─ web/        頁面、元件、Server Actions、API handler
│     ├─ service/    商業流程與資料庫讀寫
│     ├─ data/       資料表
│     ├─ lib/        純函式、外部 API client
│     └─ dev/        本機假外部服務（選填）
├─ dev/              命令列工具（secrets、account）、假外部服務入口、測試用資料庫與測試輔助
└─ proxy.ts          擋未登入的請求
```

## 架構規則

這些規則由 `src/architecture.test.ts` 自動檢查，`npm test` 時會跑：

- **模組彼此獨立**：模組不能 import 其他模組、模組清單或 `src/app`；`core` 也不能 import 模組。
- **依賴只能往下**：模組內是 `web → service → data → lib`。`web` 只能 `import type` data 的型別，不能直接存取資料庫。
- **`src/app` 只做轉接**：
  - 頁面只 render 模組 `web/pages/` 或 core 的頁面元件。
  - route handler 只轉接，例如 `export { GET } from …`。
- **資料表的位置**：只能定義在 `core/db/schema.ts`（表名以 `core_` 開頭）或模組的 `data/schema.ts`（表名以 `<id>_` 開頭）。
- **環境變數**：都定義在 `core/env.ts`，順序同 `.env.example`；其他地方不直接讀 `process.env`（少數例外列在 CLAUDE.md，也由 `architecture.test.ts` 檢查）。
- **快取寫法**：由 `src/cache-rules.test.ts` 檢查（見下方〈快取〉）。

## 排程

所有排程都是 `GET /api/cron/<排程>`，要帶 `Authorization: Bearer <CRON_SECRET>`。

| 排程 | 做什麼 | 時間（台北） | 由誰呼叫 |
|---|---|---|---|
| `starrail:checkin` | 每日簽到 | 每天 00:10 | Vercel Cron |
| `starrail:stamina` | 開拓力快滿提醒 | 每 30 分鐘 | GitHub Actions `cron.yml` |
| `twitch:cleanup` | 刪除超過 14 天的開台／關台紀錄 | 每天 02:00 | Vercel Cron |
| `youtube:cleanup` | 刪除超過 14 天的新影片紀錄 | 每天 02:20 | Vercel Cron |
| `starrail:cleanup` | 刪除超過 14 天的簽到紀錄 | 每天 02:40 | Vercel Cron |
| `starrail:reencrypt` | HoYoLAB cookie 改用目前的金鑰加密 | 每天 03:00 | Vercel Cron |
| `youtube:reencrypt` | AI API Key 改用目前的金鑰加密 | 每天 03:30 | Vercel Cron |
| `twitch:sync` | 檢查並補建 EventSub 訂閱 | 每天 04:00 | Vercel Cron |
| `youtube:renew` | 續訂快到期的 WebSub 訂閱 | 每天 04:30 | Vercel Cron |
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

- **14 天後清掉**（由上面的 cleanup 排程刪除）：開台／關台紀錄、新影片紀錄、簽到紀錄、網站通知。
- **永久保留**：帳號、追蹤中的主播與頻道、翻譯好的字幕與翻譯設定、連結的 HoYoLAB 帳號、存錢記帳的所有資料。

## 快取

- **快取範圍**：頁面與鈴鐺讀的資料都有快取，在 Vercel 上用的是 Runtime Cache。
- **自動失效**：網站上的修改、webhook 與排程寫入資料時，會讓對應的快取失效。所以重新整理頁面時，通常只查一次資料庫（用來確認登入）。
- **即時便箋**：最多是 5 分鐘前的資料。
- **直接改資料庫**：在 Supabase 後台直接改資料時，快取不會知道。
  - 大約一小時後的下一次讀取才會更新；沒人瀏覽的話，最多一天。
  - **重新部署會立即生效。**
- **費用**：Vercel Hobby 不收費，用量可以在 Vercel 後台的 Observability 查看。
- **寫法規則**：`use cache: remote`、cache tag，以及由誰負責讓快取失效，見 CLAUDE.md〈快取〉。

## 安全

- **登入**：
  - 帳號加密碼登入，密碼用 scrypt 雜湊。
  - 錯誤訊息一律是「帳號或密碼錯誤」，不透露帳號是否存在。
- **次數限制**：
  - 同一個 IP 在 15 分鐘內錯 5 次，就鎖 15 分鐘。
  - 在網站上改密碼也有同樣的限制，以帳號計算。
  - 計數存在記憶體裡，Vercel 有多個執行個體時只是盡力而為。
- **登入狀態**：cookie 保留 30 天。改密碼後，其他裝置的 cookie 會立刻失效。
- **每個操作都再驗證一次**：`proxy.ts` 會擋下未登入的請求，每個 Server Action 與讀資料的元件還會再確認一次登入。
- **不讓搜尋引擎收錄**：`/robots.txt` 全部 Disallow，每一頁帶 `noindex, nofollow`；登入另外可以用 Vercel Firewall 限制次數（見 [部署 › 防機器人與被攻擊時](deploy.md#防機器人與被攻擊時)）。
- **外部服務的端點各自驗證**：
  - Twitch EventSub：驗 HMAC-SHA256 簽章。
  - YouTube WebSub：推送驗 HMAC-SHA1 簽章，訂閱確認要帶跟頻道綁定的驗證碼。
  - 排程：要帶 `CRON_SECRET`。
- **加密欄位**：HoYoLAB cookie 與 AI API Key 用 AES-256-GCM 加密後才存，畫面與 log 都不顯示原文。
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
6. **讀寫資料與通知**：
   - 頁面讀資料用 `service/cached.ts` 的快取函式；寫入時讓對應的 tag 失效（規則見 CLAUDE.md〈快取〉）。
   - 發通知用 `core/notify.ts` 的 `notify()`。
7. **假外部服務**（有的話）：放在 `dev/mock.mjs`，`npm run mock:external` 會自動載入。
8. **Migration**：執行 `npm run db:generate` 產生 migration，跟程式一起 commit。
9. **文件**：在 [模組設定與使用](modules.md) 加上這個模組的說明。
