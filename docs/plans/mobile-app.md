# 手機 App 與推播通知（規劃）

> **狀態：還沒開始。** 排在 v0.2.2 之後的版本，動工前先確認〈待決定〉。

## 目標

- 手機上像 App 一樣用：主畫面有圖示，全螢幕開啟。
- 網站關掉也收得到通知，使用者可以自己開關。
- 手機上用起來不卡。

## 決定：做成 PWA，不用 Capacitor

| | PWA | Capacitor |
|---|---|---|
| 網站要改多少 | 加上 manifest 與 Service Worker | 打包進 App 要重寫：靜態匯出不支援 Server Actions、cookie 與 `proxy.ts` |
| 不重寫的做法 | 不需要 | 用 `server.url` 載入線上網站，官方標明不適用於正式環境 |
| 上架 | 不用上架，使用者自己加到主畫面 | App Store 規範 4.2 不收重新包裝的網站；Google Play 要先做 14 天封閉測試 |
| 費用 | 免費 | 上 App Store 或 Ad Hoc 發佈一年 99 美元 |
| 更新 | 部署後所有手機一起更新 | 用 `server.url` 時同樣自動更新，改外殼要重新打包 |

之後要用到瀏覽器做不到的功能（背景定位、NFC），或一定要上架時，再考慮 Capacitor。

## 工作項目

### 1. 裝到手機

- `src/app/manifest.ts`：名稱、圖示、`display: "standalone"`、主題色。
- 圖示放 `public/icons/`：這裡沒登入也讀得到，`public/images/` 要登入，不能放。
- `public/sw.js`：沒登入也要讀得到，`proxy.ts` 的 matcher 要排除它與 manifest。
- 通知設定裡放安裝說明：iPhone 要從分享選單「加入主畫面」。

### 2. 推播通知

**資料表 `core_push_subscriptions`**：一支手機一列，加 `.enableRLS()`。

| 欄位 | 說明 |
|---|---|
| `user_id` | NOT NULL，外鍵 `on delete cascade` |
| `endpoint` | 唯一，推送服務給的網址 |
| `p256dh`、`auth` | 加密推送內容用的金鑰 |
| `disabled_modules` | 只記關掉的模組，預設空的，新模組自動開啟 |
| `created_at` | 建立時間 |

**發送**：加在 `notify()`，所有模組不用各自改。

- 寫完站內通知後，查收件人的訂閱，略過關掉這個模組的，再推送。
- **推送失敗不能丟出錯誤**，只記 log：`sendOnce()` 看到錯誤會放掉認領，同一則通知下次會再寄一次。
- 排程與 webhook 都會呼叫 `notify()`，所以要限制同時發送數量與逾時，不能拖慢它們。
- 推送服務回 404 或 410 時，刪掉那筆訂閱，不重試。
- 用 `web-push` 的 `generateRequestDetails()` 組請求，再經 `externalFetch()` 送出。不用 `sendNotification()`：它直接對外連線，假伺服器接不到。
- 推送內容只放 id、標題、內文與網址。`tag` 用 `allhub-notification-<id>`，跟頁面的系統通知相同，同一則不會跳兩次。

**Service Worker**

- `push` 顯示通知，`notificationclick` 打開通知的網址。
- **只快取 `_next/static` 與圖示**，不快取 HTML 與 `/api/`，換人登入時才不會看到上一個人的資料。
- 頁面的系統通知改走 `registration.showNotification()`，順便解決 Android Chrome 不能用 `new Notification` 的問題。

**訂閱與開關**

- 訂閱、取消與改開關用 Route Handler，規則同 `/api/notifications`：同源、JSON、`currentSession()`。
- 所有寫入同時比對 `endpoint` 與 `user_id`。同一支手機換人登入時，訂閱改成目前的人。
- 「提醒方式」加上「在這支手機開啟通知」的總開關，按下才跟瀏覽器要權限；每個模組多一個手機通知開關。
- 既有的細項開關照舊有效，例如主播與頻道的通知、星穹鐵道的提醒、天氣的下雨與警特報。
- 系統層被擋時用 `permissionNotice()` 提示到手機設定開啟，網站不能自己打開。
- 關掉手機通知時，鈴鐺裡的通知照樣留著。

**帳號安全**

- **登出時要刪掉這支手機的訂閱**：`logout()` 現在只刪 cookie，沒處理的話登出後還會收到前一個人的通知。
- 改密碼時刪掉其他裝置的訂閱，跟舊的登入一起失效。
- 停用與沒有模組權限的人，`notify()` 本來就會略過，不用另外處理。

**環境變數**

- `VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY`，選填，沒設時不顯示手機通知的開關。用 `npx web-push generate-vapid-keys` 產生一次。
- 寄件人用 `PUBLIC_BASE_URL`，不用另外填信箱。
- 公鑰由伺服器傳給頁面，不用 `NEXT_PUBLIC_`：環境變數一律經 `core/env.ts`。
- 換金鑰後所有訂閱都會失效，大家要重新開啟，寫進 `docs/secrets.md`。

### 3. 不會卡

**先量再修，不先猜。**

- 用正式網址，在真的手機上量首頁、理財、YouTube、星穹鐵道與交通，再用 CDP 的 CPU 與網路節流重現。
- 目標是 Core Web Vitals 的良好範圍：LCP 2.5 秒內、INP 200 毫秒內。
- 從最慢的地方開始修。

已知的狀況：

- Vercel 與 Supabase 都在東京，伺服器到資料庫這段已經很近。
- 通知輪詢是前景 10 秒、背景 60 秒，有推播後可以放慢，省電也省流量。

## 待決定

1. **模組開關**：每支手機分開（建議，跟現在的提示音與瀏覽器通知一樣），還是同一個帳號共用。
2. **鎖定畫面的金額**：理財通知寫著名稱與金額，推到手機會出現在鎖定畫面。要照舊顯示，還是手機上藏起來。
3. **訂閱上限**：每人最多幾支手機（建議 5 支，先 `lockUserRow` 再數）。

## 動工前要使用者同意

- 新增套件 `web-push`（Next 官方 PWA 教學用的）。
- 新增資料表 `core_push_subscriptions`。
- 新增兩個環境變數，貼到 Vercel。

## 使用限制

- iPhone 要 iOS 16.4 以上，先加到主畫面，再自己按按鈕允許通知。不用 Apple 開發者帳號。
- Android 用 Chrome 就能開。
- 每支手機要各開一次。
- 通知時間跟著來源：webhook 推進來的很快，排程類只保證在那個小時內。

## 測試

- 單元：模組過濾、推送內容、404 與 410 的處理、推送失敗不丟錯。
- 整合：IDOR、換人登入、登出、改密碼、刪除帳號（`seedEverything` 補一筆）、停用與模組權限。
- E2E：假外部服務加上推送端點，確認送得出去。
- 真實手機：本機環境測不到 iPhone 的真實推播，要用 iPhone 與 Android 各確認一次。

## 上線時一起改

- `docs/modules.md` 的網站通知、`docs/secrets.md`、`docs/deploy.md` 的〈之後的部署〉、`docs/architecture.md`。
- `/terms`：多存訂閱資料，推送會經過 Apple、Google 等瀏覽器廠商的服務。
- `README.md`、`CLAUDE.md`、`CHANGELOG.md`。
- 刪掉這份規劃。

## 參考

- [Next.js 的 PWA 教學](https://nextjs.org/docs/app/guides/progressive-web-apps)（本機：`node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md`）
- [WebKit：iOS 與 iPadOS 的 Web Push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
- [web-push](https://github.com/web-push-libs/web-push)
- [Capacitor 設定文件](https://capacitorjs.com/docs/config)
- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
