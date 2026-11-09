---
paths:
  - "src/core/db/**"
  - "src/**/data/schema.ts"
  - "vercel.json"
  - "CHANGELOG.md"
  - "package.json"
  - "package-lock.json"
  - ".github/**"
  - "drizzle.config.ts"
  - "src/**/cron.ts"
  - "docs/deploy.md"
---

# 部署、migration 與套件

發版、改資料表或升級套件前，就算沒有讀到上面這些檔，也要先讀這份。

- 套件（使用者要的：全部升到最新、`npm audit` 連開發工具也是 0）：TypeScript 照官方的共存做法，`typescript` 指向 `@typescript/typescript6`（6.0 的 API，給 Next 的建置、typescript-eslint 與 `architecture.test.ts` 解析程式碼，指令是 `tsc6`），`@typescript/native` 是 7.0（`tsc`，型別檢查用），7.x 有 API 後再合成一個；`package.json` 的 `overrides` 把 drizzle-kit 帶的舊 esbuild 與 lint 工具帶的 minimatch 10 換成修過漏洞的版本，上游更新後拿掉；ESLint 10 的外掛（react、import、jsx-a11y）還沒宣告支援，安裝時 npm 會警告 peer，lint 實測正常；`@types/node` 跟網站與 GitHub Actions 的 Node 一樣留在 24。
- 推上 main 時 Vercel 部署與 `db-migrate.yml` 平行執行，舊程式會在新的資料表上跑一小段時間，migration 一律先擴充、之後再收斂：
  - 新欄位可為 null 或有預設值，新表直接加；不刪也不改舊欄位（舊程式明列欄位的 select、insert、upsert 仍要能用；例外是 `youtube_settings.id` 加上 BY DEFAULT 的 identity，舊程式明確給 id 照樣寫得進去；v0.2.8 把 `youtube_settings` 的主鍵從 `id` 換成 `user_id`（使用者要的，分兩版：`id` 欄留著，舊程式的 select、insert 照常，`on conflict ("user_id")` 由主鍵涵蓋））。
  - 既有資料的回填寫在同一個 migration 的 SQL 裡（例如 v0.1.1 把單人版的資料歸給最早建立的站長）。
  - `src/core/db/__tests__/migrations.integration.test.ts`：這一版有回填或舊寫法要顧時，另外寫測試先套到上一版、用舊程式的寫法寫入，再套新的 migration；基準檔之後的每個 migration 自動檢查一開始設 `lock_timeout = 5s`、沒有 drop、rename、alter column（使用者同意的例外逐條列在測試的 `ALLOWED_CONVERGENCE`，多一條少一條都不行，只給還沒併進基準檔的 migration，併進去時一起拿掉），NOT NULL 的新欄位有預設值，新表開了 RLS。
  - migration 不累積（使用者的決定）：資料夾只留基準檔 `0000_baseline`（v0.1.6 以前的 0000 到 0013 壓成的）與還沒併進去的這一版 migration。上一版的 migration 確認套用到正式資料庫後，下一版開始時把它併進基準檔：用 `drizzle-kit generate` 從現在的 schema 重新產生（另外指定輸出資料夾），欄位順序調成跟正式資料庫一樣，再把兩種方式建出來的資料庫逐項比對（表、欄位與順序、預設值、identity、約束、索引、RLS、sequence；刪過欄位的表在正式資料庫的欄位編號有空號，比相對順序，跟著刪掉的 check 也要拿掉），一樣才換掉；journal 的 `when` 等於正式資料庫最後套用的那一個（drizzle 只套時間比最後一筆晚的，正式資料庫會略過基準檔；測試另外模擬這件事）。舊檔留在 git 歷史裡。因此只能從上一版升級，更舊的要先升到上一版。
  - 收斂（刪舊欄位或舊表、把 `user_id` 改成 NOT NULL、刪掉舊索引）要等舊程式不再上線之後的版本，改成 NOT NULL 前先把 null 的列補回或刪掉。drizzle 的查詢會明列 schema 裡的每個欄位，所以刪欄位要分兩版：先從 schema 拿掉（migration 手動去掉 DROP），再下一版才刪。db-migrate 用 GitHub Secrets 的 `MIGRATION_DATABASE_URL`（Session pooler 5432），網站用 `DATABASE_URL`（Transaction pooler 6543）。
    - 例外：v0.1.8 由使用者同意一次做完（`0001_weather_cleanup` 直接刪掉主播表與頻道表的舊 `notify_enabled`、`youtube_settings` 的三個 `*_key_hint`、`savings_accounts.purpose_id` 與 `savings_purposes`、`core_notifications_unread_idx`，`user_id` 先刪掉 null 的列再改成 NOT NULL）。代價：推上 main 後到新版部署完成前（大約一兩分鐘），還在線上的 v0.1.7 讀寫到被刪的欄位會出錯，理財、Twitch、YouTube 的頁面與 webhook 都受影響（Twitch、YouTube 會重送 webhook）；所以推送時避開排程的時段（台北 0 點到 7 點）、不要正在用網站，之後也不能回到 v0.1.7。之後的版本照舊分兩版。
- v0.2.7 從 schema 拿掉的欄位（理財分類的顏色、信用卡的舊截止日、關台紀錄的種類、YouTube 設定表的六個 API Key 與模型欄位、翻譯的舊批次欄位）v0.2.8 的 migration 刪掉了；`youtube_settings` 的主鍵 v0.2.8 換成 `user_id`，舊的 `id` 欄 v0.2.9 刪掉（schema 早就沒有它，drizzle 不會產生，migration 手寫 `DROP COLUMN` 並列進 `ALLOWED_CONVERGENCE`）。v0.2.11 資產走勢改成每天一列（`savings_asset_days`），舊的 `savings_asset_snapshots` 先從 schema 拿掉，v0.2.12 的 migration 手寫 `DROP TABLE` 刪掉，v0.2.13 併進基準檔（基準檔與 snapshot 都沒有這張表了）。
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
