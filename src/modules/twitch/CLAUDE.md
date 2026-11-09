# Twitch（twitch）的注意事項

全站的規則在根目錄的 `CLAUDE.md` 與 `.claude/rules/`（讀寫相關的檔案時自動載入），這裡只寫這個部分自己的。

- 追蹤每人一份（`twitch_follows`），主播與 EventSub 訂閱共用；頁面、直播預覽、側欄與開台紀錄只列自己追蹤的主播。開台紀錄只留開台（使用者的決定）：關台只把 `is_live` 從 true 改成 false（條件式 update，真的改了才讓 `twitch:streamers` 失效），不寫紀錄列、不通知；`twitch_stream_events.type` v0.2.8 刪掉了，以前留下的關台列在 v0.2.7 的 migration 刪掉了。站內與 Twitch 的網址、`normalizeLogin()`（帳號、@帳號或頻道網址）在 `lib/urls.ts`；訂閱失敗寫進狀態的開頭是 `lib/subscriptions.ts` 的 `SUBSCRIPTION_FAILED`。
- 開台時間表（使用者要的「清單＋詳情」，`lib/schedule.ts`、`web/components/stream-schedule.tsx`）：Helix 的 `schedule` 一次一位主播（`cachedSchedule()`，大家共用，讀到的 `schedule`、讀不到 `external`；使用者同意的：以前最多 30 分鐘，隔一陣子沒開時每位離線的主播都要各問一次，現在 15 分鐘後背景重讀，隔很久才打開時先給最多 6 小時前的），主播沒有設定時 Twitch 回 404，當成沒有排、不算讀不到；取消的（`canceled_until`）與休假期間的不列。追蹤的頻道清單裡離線的主播把「離線」換成下次開台（今天、明天、一週內寫星期、再遠寫日期，`nextStartText()`），主播詳情的右欄列出接下來最多 5 次與休假（`SchedulePanel`，沒設定憑證時不放）。格式照 Twitch 的 Scheduling Broadcasts 指南，**尚未用真實的主播驗證**。
- 畫面用的 Helix（`users` 頭像與離線橫幅、`streams` 直播狀態與預覽圖、`games` 封面）一次查多位主播；快取函式先用 `core/env.ts` 的 `hasTwitchEnv()` 判斷，沒設定憑證或出錯都回 null，畫面退回資料庫存的頭像與 `is_live`，不顯示錯誤。直播中 = EventSub 寫的 `is_live` 或 Helix 查得到直播（剛開台時 Helix 常常還查不到）。
- 直播預覽圖：卡片用 640x360（`previewUrl`），主播詳情的大面板用 1920x1080（`largePreviewUrl`：面板在 1080p 螢幕上約 1460px 寬、2 倍螢幕要約 2000 像素，直播本身多半是 1080p），打開詳情才載入；假服務照網址要的大小回應。
- 加主播與手動同步前先看 `missingTwitchEnv()`：缺 `TWITCH_CLIENT_ID`／`SECRET` 回「尚未設定 Twitch 應用程式：請到 Vercel 的環境變數加上…」，缺其他的列出名稱，不讓使用者只看到「加入主播失敗（詳見伺服器 log）」。
- `TWITCH_CLIENT_ID`／`SECRET` 在 `env.ts` 先去掉前後空白（天氣的兩個授權碼也是；其他的不去，`proxy.ts` 原樣讀 `SESSION_SECRET`）。換 token 被拒時 Twitch 的回應看得出是哪個值錯：Client ID 不存在回 400 `invalid client`、Secret 錯回 403 `invalid client secret`；`lib/api.ts` 的 `TOKEN_REJECTIONS` 把這兩種換成說明要改哪個環境變數的訊息（`TwitchApiError` 的 message，加主播與同步訂閱直接顯示），其他錯誤照舊。
