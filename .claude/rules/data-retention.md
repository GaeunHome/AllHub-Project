---
paths:
  - "src/core/retention/**"
  - "src/**/cleanup*.ts"
  - "src/**/cron.ts"
  - "src/**/data/schema.ts"
  - "src/core/db/schema.ts"
  - "src/core/ui/terms-page.tsx"
  - "src/**/service/maintenance.ts"
---

# 資料保留

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
