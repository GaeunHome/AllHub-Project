# 手機通知（core/push）的注意事項

全站的規則（架構、慣例、安全、多人、快取、測試、資料保留、部署）在根目錄的 `CLAUDE.md`，這裡只寫這個部分自己的；文中的〈多人〉〈快取〉這類章節都在根目錄那份。

- 手機通知（使用者要的，`core/push/`，加到主畫面＋推播）：做成 PWA，不用 Capacitor，`src/app/manifest.ts`、`public/sw.js`、`public/icons/app/`（`flower-2` 放在主色上；瀏覽器分頁的圖示是同一朵花的 `src/app/favicon.ico`，32、16、48px，不用 `icon.*` 這類檔：網址要登入，登入頁看不到，`src/__tests__/favicon.test.ts` 檢查）。沒設 `VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY` 時通知頁不顯示手機通知，其他功能照常。
  - 發送：`notify()` 寫完站內通知後呼叫 `push/send.ts` 的 `pushToPhones()`，模組不用各自改，停用與沒權限的人在寫入時就濾掉了。用 `web-push` 的 `generateRequestDetails()` 組請求再經 `externalFetch()`（假服務才接得到），同時 4 個、每個最多等 5 秒，內容用 VAPID 與手機的金鑰加密，推送服務看不到。推送服務回 404、410 就刪掉那支手機。**不能丟錯**：`sendOnce()` 看到錯誤會放掉認領，站內通知會重寄一次；log 不記網址，網址等於這支手機的憑證。
  - 鎖定畫面（使用者要的）：`notify()` 的 `push` 是手機上顯示的文字，理財的通知一律是「理財有一件事要處理」（`service/notices.ts` 的 `LOCK_SCREEN_PUSH`），鈴鐺裡照舊有金額與名稱。新的通知有金額這類內容時也要給。
  - 訂閱：`/api/push`（POST 訂閱、PATCH 模組開關、DELETE 取消，同源、JSON、`currentSession()`）。使用者 id 來自 session，寫入同時比對 `endpoint` 與 `user_id`；同一支手機換人登入時改成目前的人，前一個人的開關不留著；每人最多 5 支（`PUSH_DEVICE_LIMIT`），超過換掉最舊的，弄丟的手機才不會卡住新手機。`endpoint` 是瀏覽器送來的網址，伺服器會照著 POST，所以只收推送服務的網域（`push/rules.ts` 的 `isPushEndpoint()`，擋掉內部位址）。
  - 開關：每支手機分開，只記關掉的模組（`core_push_mutes`），存在伺服器，手機關著也要知道哪些不用送。畫面在通知頁（`push-settings.tsx`），打開時會再送一次訂閱，改過密碼被刪掉的自己補回來。iPhone 要先加到主畫面，畫面照 `pushSupport()` 寫下一步。
  - 登出與改密碼：`account-menu.tsx` 登出前先關掉這支手機（`leaveThisPhone()`，最多等 3 秒，失敗不擋登出）；改密碼時刪掉其他手機（`removeOtherSubscriptions()`，表單帶這支手機的 `pushEndpoint`）。
  - Service Worker 只處理推播，不快取也不接 fetch，換人登入時才不會看到上一個人的資料；tag 跟頁面的系統通知一樣是 `allhub-notification-<id>`，同一則不會跳兩次；只有開啟手機通知時才註冊。**真實手機還沒驗證**：本機環境測不到 iPhone 與 Android 的推送服務。
