# 通知（core/notifications）的注意事項

全站的規則在根目錄的 `CLAUDE.md` 與 `.claude/rules/`（讀寫相關的檔案時自動載入），這裡只寫這個部分自己的。

- 模組發通知只能用 `core/notify.ts` 的 `notify()`，每個收件人寫一列 `core_notifications`（`user_id`），不呼叫外部服務；`url` 只收 http(s) 或站內路徑。追蹤的通知開關（`*_follows.notify_enabled`）關掉時照樣記錄，只是不把他列進收件人。鈴鐺、通知頁、輪詢 API、標已讀都只讀寫登入者自己的通知（送來別人的通知 id 沒有效果）；清理不分收件人。
- 首頁的未讀摘要（`home-notifications.tsx`）直接用通知中心的同一份輪詢資料（`useNotificationCenter()`；`loaded` 分辨還在載入與沒有未讀），不另外向伺服器讀；在鈴鐺或首頁標成已讀，兩邊一起更新。
- 輪詢與標已讀用 Route Handler（`/api/notifications`）不用 Server Action：每個分頁一次只送一個 Server Action，會排在觀看頁的翻譯後面。分頁可見時每 10 秒輪詢、背景時 60 秒，切回分頁立刻抓一次；內容沒變時沿用原本的物件（`poller.ts` 的 `keepSameFeed()`），導覽列、鈴鐺與首頁的未讀摘要才不會每 10 秒重畫。新通知要跳卡片、播提示音或跳系統通知在 `announce.ts` 的 `announceFresh()`，`center.tsx` 只管狀態、輪詢與標已讀；純邏輯（`poller.ts`、`alerts.ts`、`chime.ts`…）不依賴 React，各自有測試。
- 提醒偏好依模組分開：每個模組各有提示音與瀏覽器通知兩個開關（`prefs.ts`，localStorage 的 `allhub:notifications:<sound|browser>:<模組 id>`，用 `createLocalPref`，跨分頁同步），預設全開；還沒個別設定的模組沿用舊版全域值（`allhub:notifications:sound`／`browser`，`createLocalPref` 的 `fallback`）。開關在鈴鐺面板（齒輪 →「提醒方式」）與通知頁，兩邊是同一份設定；模組清單由 `src/app` 傳進來（版面 → `AppShell` → 通知中心），core 不 import 模組清單；`notifies: false` 的模組不列出。依模組過濾在 `alerts.ts` 的 `planAlerts()`：兩種都關的模組只算進未讀數（不跳提示卡片），提示音與系統通知只給 `claimAlerts()` 認領到的通知；未讀數一律包含所有模組。任何模組打開瀏覽器通知時，權限還沒決定就跟瀏覽器要（`shouldRequestPermission()`），有會發通知的模組開著但沒權限時顯示提示（`permissionNotice()`；`notifies: false` 的模組沒有開關，它沿用的舊全域值不算，通知頁「提示音」的圖示也一樣，見 `settings.tsx` 的 `alertModules()`）。
- 提示音（`chime.ts`）：只在使用者操作的當下（`navigator.userActivation.isActive`）建立或恢復 AudioContext，`unlockOnGesture()` 一直聽點擊與按鍵到真的解鎖為止；通知進來時聲音還被暫停就不播，不在背景 `resume()`。不然 Chrome 會在主控台警告 AudioContext 不能開始（使用者回報過：只按快捷鍵、手指剛碰到螢幕都不算操作）。
