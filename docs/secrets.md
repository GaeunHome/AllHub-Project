# 密鑰管理

這頁說明每個密鑰是什麼、去哪裡拿、要貼到哪裡，以及更換的步驟與影響。第一次部署的完整流程見 [部署](deploy.md)。

- **電腦上不保存任何部署密鑰**：正式環境的值只放在 Vercel 的環境變數與 GitHub Secrets，全部在網頁上設定，Mac 與 Windows 都一樣。
- **三個帳號都要開兩步驟驗證**：Vercel 與 GitHub 是密鑰的正本，Supabase 放著資料庫，帳號被盜等於外洩（步驟見 [部署 › 防機器人與被攻擊時](deploy.md#防機器人與被攻擊時)）。
- **本機開發**：設定在 `.env.local`，說明見 `.env.example`。

## 產生亂數密鑰

在終端機執行下面這一行。macOS／Linux 的 zsh、bash 與 Windows PowerShell 都能直接貼上：

```bash
node -e "for(const[n,f]of[['SESSION_SECRET','base64'],['ENCRYPTION_KEY','base64'],['CRON_SECRET','hex'],['TWITCH_EVENTSUB_SECRET','hex'],['YOUTUBE_WEBSUB_SECRET','hex']])console.log(n+'='+require('crypto').randomBytes(32).toString(f))"
```

- **輸出**：五行 `名稱=值`，可以整段貼進 Vercel。每次執行都是新的值。
- **格式**：`SESSION_SECRET` 與 `ENCRYPTION_KEY` 是 32 bytes 的 base64（44 個字元），其他三個是 64 個 hex 字元，都符合網站的檢查。
- **貼完就關掉**：值貼到 Vercel（`CRON_SECRET` 還要貼到 GitHub Secrets）之後，關掉終端機視窗或清除畫面，不用另外存檔。

## 每個值是什麼、貼到哪裡

| 名稱 | 是什麼、去哪裡拿 | 貼到哪裡 |
|---|---|---|
| `DATABASE_URL` | Supabase → **Connect** → **Transaction pooler**（port 6543）的連線字串，填入資料庫密碼 | Vercel |
| `MIGRATION_DATABASE_URL` | Supabase → **Connect** → **Session pooler**（port 5432）的連線字串 | GitHub Secrets（db-migrate 用）；`npm run account` 提示輸入連線字串時也貼這個 |
| `SESSION_SECRET` | 登入 cookie 的簽章密鑰；也用來替註冊次數限制的 IP 雜湊加料，並衍生圖形驗證碼的 HMAC 金鑰。用上面的指令產生 | Vercel |
| `ENCRYPTION_KEY` | 加密 HoYoLAB cookie 與 AI API Key 的金鑰，用上面的指令產生 | Vercel（不要勾 Sensitive，見下方） |
| `ENCRYPTION_KEY_PREVIOUS` | 選填，只在更換 `ENCRYPTION_KEY` 的期間放舊金鑰，多把用逗號分隔 | Vercel（平常不用建立） |
| `CRON_SECRET` | 排程端點的密鑰，用上面的指令產生 | Vercel 與 GitHub Secrets（兩邊要一樣） |
| `PUBLIC_BASE_URL` | 網站網址，例如 `https://allhub-project.vercel.app` | Vercel；GitHub Secrets 的 `HUB_URL` 填同一個網址 |
| `TWITCH_CLIENT_ID`、`TWITCH_CLIENT_SECRET` | Twitch 開發者後台（見 [模組設定與使用](modules.md#twitch)） | Vercel |
| `TWITCH_EVENTSUB_SECRET`、`YOUTUBE_WEBSUB_SECRET` | 兩個 webhook 的簽章密鑰，用上面的指令產生 | Vercel |
| AI API Key、HoYoLAB cookie | 在網站上填，加密後存在資料庫，不是環境變數 | — |

## 填到 Vercel

- **在哪裡填**：匯入專案時展開 **Environment Variables**，可以把整段 `名稱=值`（每行一個）一次貼上。之後要新增或修改，到專案 → **Settings** → **Environment Variables**。
- **只給 Production**：每個變數的 Environments 只勾 **Production**。PR 的 Preview 部署不需要密鑰，只用來確認能建置。匯入時一次貼上的變數，匯入後也到這裡確認一次。
- **Sensitive**：勾了 Sensitive 的變數存好之後，連自己都看不到原文。
  - `ENCRYPTION_KEY` 建議**不要**勾：換金鑰時要把舊值複製到 `ENCRYPTION_KEY_PREVIOUS`，看不到舊值就沒辦法搬，已加密的資料會解不開。
  - 其他的可以勾：忘了也能從原服務重新取得（連線字串、Twitch），或換一組新的（見 [其他密鑰換新](#其他密鑰換新)）。
- **要重新部署才生效**：改完到 **Deployments** → 最新的部署 → **Redeploy**。

## 填到 GitHub Secrets

到 GitHub repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**，填這三個：

| 名稱 | 值 | 用途 |
|---|---|---|
| `MIGRATION_DATABASE_URL` | Session pooler（5432）的連線字串 | db-migrate 套用 migration |
| `CRON_SECRET` | 跟 Vercel 的 `CRON_SECRET` 一樣 | cron workflow 每 30 分鐘呼叫 `starrail:stamina` |
| `HUB_URL` | 網站網址，就是 `PUBLIC_BASE_URL` 的值 | cron workflow 要呼叫的網址 |

GitHub Secrets 存好後也看不到原文，要改就整個重新填。

## 常見錯誤

- **兩個連線字串放反**：`DATABASE_URL` 要用 Transaction pooler（6543），`MIGRATION_DATABASE_URL` 要用 Session pooler（5432）。
- **用了 Direct connection**：主機是 `db.<專案>.supabase.co` 的是 Direct connection（IPv6）。GitHub Actions 只有 IPv4 連不到，`MIGRATION_DATABASE_URL` 要改用 Session pooler。
- **連線字串格式不對**：要用 `postgresql://` 開頭。密碼裡的 `@`、`#`、`?`、`/`、`:`、`$` 等特殊字元要先做百分比編碼，例如 `@` 寫成 `%40`。
- **混進奇怪的字元**：這些值都只有英數與半形符號。出現全形符號、中文，或前後多了空白、換行，多半是複製時多帶了東西。
- **`PUBLIC_BASE_URL` 的寫法**：要用 `https://` 開頭，結尾不要 `/`。GitHub 的 `HUB_URL` 也一樣。
- **長度不對**：網站用到時會檢查，不符合會報錯（訊息只列名稱與原因，不含值）。用上面的指令產生的值都符合：
  - `SESSION_SECRET` 至少 32 個字元。
  - `ENCRYPTION_KEY` 必須是 32 bytes 的 base64（44 個字元）；`ENCRYPTION_KEY_PREVIOUS` 的每一把也一樣。
  - `CRON_SECRET` 至少 16 個字元，Vercel 與 GitHub 要一樣。
  - `TWITCH_EVENTSUB_SECRET` 10–100 個字元（Twitch 的規定）。
  - `YOUTUBE_WEBSUB_SECRET` 16–199 個字元（WebSub 的規定）。
- **改了沒生效**：Vercel 的環境變數要重新部署才會生效。

## 更換 `ENCRYPTION_KEY`

HoYoLAB cookie 與 AI API Key 是用 `ENCRYPTION_KEY` 加密的。密文會記下是用哪一把金鑰加密，所以換金鑰時，舊資料不會馬上失效。

1. **保留舊金鑰**：在 Vercel 的 Environment Variables 把目前 `ENCRYPTION_KEY` 的值複製到 `ENCRYPTION_KEY_PREVIOUS`（沒有就新增）。
   - `ENCRYPTION_KEY_PREVIOUS` 原本就有值的話，把這把加在最前面，用逗號分隔。
   - 看不到舊值（例如勾了 Sensitive）就沒辦法保留，換了之後要重新連結 HoYoLAB 帳號、重新填 API Key。
2. **設新金鑰**：把 `ENCRYPTION_KEY` 改成新的值（用 [上面的指令](#產生亂數密鑰) 產生，取 `ENCRYPTION_KEY=` 後面那一段）。
3. **重新部署**：之後新存的資料會用新金鑰加密，舊資料靠 `ENCRYPTION_KEY_PREVIOUS` 照常解開。
4. **把舊資料改用新金鑰加密**：等每天的 `starrail:reencrypt` 與 `youtube:reencrypt`，或手動執行：到 GitHub repo → **Actions** → **cron** → **Run workflow**，task 分別填 `starrail:reencrypt` 與 `youtube:reencrypt`，在 log 看回應。
5. **確認換好**：再手動執行一次這兩個排程。符合下面任一種，就代表兩邊都換好了：
   - 回應是「…重新加密 0 筆」與「…重新加密 0 把」，而且沒有「失敗」。
   - 回應是「沒有連結的帳號」或「沒有設定 API Key」。
6. **移除舊金鑰**：到 Vercel 刪掉 `ENCRYPTION_KEY_PREVIOUS`，再重新部署。

**出現「N 筆失敗」或「N 把失敗」時**：

- 原因：那幾筆用的金鑰已經不在 `ENCRYPTION_KEY` 與 `ENCRYPTION_KEY_PREVIOUS` 裡了。
- 處理：把那把金鑰加回 `ENCRYPTION_KEY_PREVIOUS`（其他還要用的舊金鑰也要保留，用逗號分隔），重新部署，再跑一次重新加密。
- 找不回那把金鑰的話，就重新連結 HoYoLAB 帳號、重新填 API Key。

**換了金鑰卻沒有 `ENCRYPTION_KEY_PREVIOUS` 時**：舊資料會解不開，畫面上會提示。把舊金鑰放回去並重新部署就能恢復。

## 其他密鑰換新

- **怎麼換**：用 [上面的指令](#產生亂數密鑰) 產生新值，到 Vercel 改掉（`CRON_SECRET` 也要改 GitHub Secrets）；從外部服務取得的，先在原服務換新，再貼到 Vercel。
- **換完之後**：重新部署。

| 密鑰 | 換新的影響 |
|---|---|
| `SESSION_SECRET` | 所有裝置都要重新登入，註冊與邀請碼的嘗試次數也會重新計算；正在填的登入、註冊表單上的驗證碼也會失效，按「換一張」或重新整理頁面就好。懷疑 cookie 外洩時換這個；只想登出其他裝置的話，改密碼就好 |
| `CRON_SECRET` | GitHub Secrets 的 `CRON_SECRET` 也要改成同一個值。兩邊都換好、Vercel 重新部署完成之前，GitHub 呼叫的 `starrail:stamina` 會被拒絕（401），需要的話手動補跑 |
| `TWITCH_EVENTSUB_SECRET` | Twitch 上既有的訂閱一直用建立時的舊密鑰簽章（訂閱建立後不能改），換掉之後送來的開台、關台通知都會被網站拒絕；Twitch 那邊仍顯示正常，「同步訂閱」看不出問題。要用新密鑰重建訂閱，步驟見下方〈[換 `TWITCH_EVENTSUB_SECRET`](#換-twitch_eventsub_secret)〉 |
| `YOUTUBE_WEBSUB_SECRET` | 舊訂閱的推送會被忽略。要等 `youtube:renew` 在租約剩不到 2 天時用新密鑰續訂才會恢復，最多約 3–4 天。想立刻恢復的話，在重新部署後請追蹤這個頻道的每個人都取消追蹤（最後一個人取消時才會取消舊的訂閱），再重新追蹤 |
| 資料庫密碼 | 在 Supabase 改密碼後，Vercel 的 `DATABASE_URL` 與 GitHub Secrets 的 `MIGRATION_DATABASE_URL` 都要換新 |
| `TWITCH_CLIENT_SECRET` | 在 Twitch 後台產生新的再貼到 Vercel，不影響既有訂閱 |

把主播或頻道移除再加回時，通知開關會變回開啟；過去的紀錄不受影響。

### 換 `TWITCH_EVENTSUB_SECRET`

主播的訂閱是共用的（同一位主播只訂閱一次），目前也沒有「重建所有訂閱」的工具，所以要讓舊訂閱被刪掉、再用新密鑰建立：

1. **換密鑰**：產生新值，改掉 Vercel 的 `TWITCH_EVENTSUB_SECRET`，重新部署。
2. **大家都取消追蹤**：請每個人（包括站長）到 Twitch 頁把主播全部取消追蹤。最後一個追蹤者取消時，網站才會刪掉 Twitch 上的舊訂閱；只要還有一個人追蹤，舊訂閱就會留著。站長在網站上看不到成員追蹤了誰，所以要每個人都做。
3. **再重新追蹤**：確認大家都取消之後，再各自重新追蹤。第一個追蹤的人會用新密鑰建立訂閱，其他人沿用。
4. **收尾**：重新設定通知開關（會變回開啟），再按一次「同步訂閱」確認狀態是「正常」。

影響：

- 從重新部署到重建訂閱之前，這些主播的開台通知都會遺失（簽章對不上，被網站拒絕）；開台紀錄也不會記下。過去的紀錄不受影響。
- 有人沒有取消追蹤的主播，舊訂閱會一直留著、通知一直被拒絕。Twitch 在通知失敗太多次後會停用這個訂閱（狀態變成 `notification_failures_exceeded`），之後每天的 `twitch:sync` 會用新密鑰重建；但 Twitch 沒有公開要失敗幾次，通知又只在開台、關台時才送，可能要好幾次直播才會發生，不要只靠這個。

## 從舊版升級

用過舊版的話，可以在「鑰匙圈存取」刪除服務名稱是 `allhub` 的項目，現在的版本不會再讀取它們。
