---
paths:
  - "src/**/service/**"
  - "src/**/data/**"
  - "src/**/web/actions*.ts"
  - "src/**/web/routes/**"
  - "src/core/db/**"
  - "src/core/notify.ts"
  - "src/core/auth/**"
  - "src/__tests__/account-*.ts"
  - "src/__tests__/module-access*.ts"
---

# 多人：依使用者的資料與擁有權

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
