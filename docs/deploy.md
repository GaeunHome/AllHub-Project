# 部署

這頁說明怎麼把 AllHub 部署到 Vercel Hobby 與 Supabase 免費方案、防機器人、管理帳號，以及換成自己的網域。每個密鑰的細節見 [密鑰管理](secrets.md)。

## 部署架構

```text
你的電腦
├─ git push ──────▶ GitHub（AllHub-Project）
│                    ├─ ci.yml：test → lint → build → typecheck
│                    ├─ db-migrate.yml：套用 migration ──Session pooler 5432──▶ Supabase
│                    ├─ cron.yml：每 30 分鐘呼叫 /api/cron/starrail:stamina ──▶ Vercel
│                    └─ 自動部署 ──▶ Vercel（函式在 hnd1 東京）
│                                     ├─ Vercel Cron：每天的排程（vercel.json）
│                                     └─ DATABASE_URL ──Transaction pooler 6543──▶ Supabase（東京）
└─ npm run account（建帳號，依提示貼上連線字串）──Session pooler 5432──▶ Supabase
```

- 網站、資料庫與排程都在雲端執行，部署之後電腦不用開著。
- 密鑰只放在 Vercel 的環境變數與 GitHub Actions Secrets，在網頁上設定，電腦上不保存（見 [密鑰管理](secrets.md)）。

## 事前準備

- Supabase、Vercel 與 GitHub 帳號，三個都要開兩步驟驗證：密鑰的正本放在 Vercel 與 GitHub，資料在 Supabase（步驟見 [防機器人與被攻擊時](#防機器人與被攻擊時)）。
- 電腦上要有 Node.js 24.2 以上，並 clone 這個 repo、執行 `npm install`：產生亂數密鑰與建帳號時會用到。macOS、Linux、Windows 都可以。
- 要用 Twitch 模組的話，還要一個 Twitch 應用程式（見 [模組設定與使用](modules.md#twitch)）。

## 1. Supabase：建專案、取得兩個連線字串

1. 到 [supabase.com](https://supabase.com) 建專案，Region 選 Tokyo（Northeast Asia），記下資料庫密碼。
2. 在專案頁上方按 **Connect**，複製下面兩個連線字串並填入密碼。密碼裡的 `@`、`#`、`?` 等字元要做百分比編碼。

| 連線字串 | 用途 | 填到 |
|---|---|---|
| **Transaction pooler**（port 6543） | Vercel 上的網站用。serverless 會開很多短連線 | Vercel 的 `DATABASE_URL` |
| **Session pooler**（port 5432） | GitHub Actions 跑 migration、在電腦上執行 `npm run account` 時用。GitHub 的機器只有 IPv4，連不到 IPv6 的 Direct connection | GitHub Secrets 的 `MIGRATION_DATABASE_URL`；`npm run account` 提示時貼上 |

## 2. Vercel：匯入 repo、填環境變數

1. 程式碼要放在自己的 GitHub repo。目前的 repo 是 [GaeunHome/AllHub-Project](https://github.com/GaeunHome/AllHub-Project)；要另外部署一份時，先 fork 或建一個新 repo 再 push。
2. 在電腦上產生亂數密鑰（指令見 [密鑰管理 › 產生亂數密鑰](secrets.md#產生亂數密鑰)），會印出五行 `名稱=值`。
3. 到 [vercel.com](https://vercel.com) → Add New → Project → Import 這個 repo。
   - Project Name 填 `allhub-project`，其他保持預設。
   - 展開 **Environment Variables**，把下面這段換成實際的值後整段貼上（每行一個）。上一步印出的五行可以直接貼進去。

     ```text
     DATABASE_URL=postgresql://…（Transaction pooler，6543）
     SESSION_SECRET=…
     ENCRYPTION_KEY=…
     CRON_SECRET=…
     TWITCH_EVENTSUB_SECRET=…
     YOUTUBE_WEBSUB_SECRET=…
     PUBLIC_BASE_URL=https://allhub-project.vercel.app
     TWITCH_CLIENT_ID=…
     TWITCH_CLIENT_SECRET=…
     ```

   - `PUBLIC_BASE_URL` 先填 `https://<Project Name>.vercel.app`。名稱已經被別人用走時網址會不一樣，步驟 4 再確認。
   - 每個值是什麼、常見的錯誤，見 [密鑰管理](secrets.md)。
   - 按 Deploy。
4. 部署完到專案 → **Settings** → **Environment Variables** 檢查：每個變數的 Environments 只勾 **Production**，`ENCRYPTION_KEY` 不要勾 Sensitive（原因見 [密鑰管理 › 填到 Vercel](secrets.md#填到-vercel)）。
5. 函式區域（`hnd1` 東京）與每天的排程都寫在 `vercel.json` 裡，不用到後台設定。

## 3. GitHub Secrets：填三個

到 GitHub repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**：

- `MIGRATION_DATABASE_URL`：Session pooler（5432）的連線字串。
- `CRON_SECRET`：跟 Vercel 的 `CRON_SECRET` 一樣。
- `HUB_URL`：網站網址，跟 `PUBLIC_BASE_URL` 一樣，結尾不要 `/`。

## 4. 重新部署

1. 在 Vercel 的專案頁確認網站的實際網址。跟 `PUBLIC_BASE_URL`、`HUB_URL` 不一樣的話，兩邊都改成實際網址。
2. 到 Vercel → Deployments → 最新的部署 → **Redeploy**。環境變數改過之後，都要重新部署才會生效。

## 5. 建資料表

到 GitHub repo → Actions → **db-migrate** → Run workflow，分支選 main。裝了 GitHub CLI（`gh`）的話，也可以用指令：

```bash
gh workflow run db-migrate.yml --ref main
```

- 確認 **migrate** 這個 job 真的有跑。GitHub Secrets 沒有 `MIGRATION_DATABASE_URL` 時，workflow 只會提示「尚未設定 MIGRATION_DATABASE_URL，略過 migration」，但仍然顯示成功。
- 之後只要 `src/core/db/migrations/` 有變動，推上 main 時就會自動執行。

## 6. 建帳號、登入

**一定要等 db-migrate 跑完再建帳號**，資料表還沒建好時指令會失敗，並提示先套用 migration。

在電腦上的 repo 資料夾執行 `npm run account create`，依提示貼上連線字串：

```bash
npm run account create
```

- **連線字串**：貼 Supabase 的 Session pooler（5432）連線字串，輸入時不會顯示。
- **確認主機**：指令會先印出連到哪個主機，確認是 Supabase 再輸入帳號與密碼。
- **不要寫在指令前面**：不建議用 `DATABASE_URL=… npm run account create` 操作正式資料庫。連線字串含資料庫密碼，寫在指令裡會留在 shell 的歷史紀錄（例如 macOS 的 `~/.zsh_history`、Windows PowerShell 的 PSReadLine 歷史檔）。
- 建好後到網站登入。

## 之後的部署

- 推上 main 就會自動部署。`ci.yml` 在 PR 與 main 上都會跑測試、lint、建置與型別檢查。
- 推上 main 時，Vercel 部署與 db-migrate 是同時進行的。所以 migration 要跟線上還在跑的舊程式相容，例如先加欄位，等程式不再用舊欄位後再刪。
- PR 的 Preview 部署沒有環境變數（密鑰只設在 Production），只用來確認能建置。
- 一般的部署不會讓登入失效。只有換 `SESSION_SECRET`、改密碼或重建資料庫才會。

## 防機器人與被攻擊時

網址是公開的，難免有機器人來掃。網站本身已經做了這些：

- **不讓搜尋引擎收錄**：`/robots.txt` 請所有爬蟲都不要抓（`Disallow: /`），每一頁也帶 `noindex, nofollow`。
- **登入次數限制**：同一個 IP 在 15 分鐘內錯 5 次就鎖 15 分鐘（見 [架構 › 安全](architecture.md#安全)）。計數存在記憶體裡，Vercel 有多個執行個體時只是盡力而為，所以再用 Vercel Firewall 在前面擋一層。

下面是在網頁上的設定，介面用語以 2026 年 10 月的 Vercel 文件為準；畫面跟這裡不一樣時，以連結的官方文件為準。

**1. Vercel Firewall：限制登入的次數**

Hobby（免費）方案每個專案可以建 1 條 rate limiting 規則（[官方說明：WAF Rate Limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting)），拿來限制登入：

1. 到 Vercel → 專案 → 側邊欄的 **Firewall** → 右上角的 **Configure**（有時收在 **⋯** 裡）→ **+ New Rule**（有的介面是 **Add New…** → **Rule**）。
2. 名稱填 `登入次數限制`。
3. 在 **Configure** 的 **If** 加兩個條件（兩個都要成立，用 **AND**）：
   - **Request Path**、**Equals**、`/login`
   - **Method**、**Equals**、`POST`
4. **Then** 選 **Rate Limit**（第一次建立時會跳出 **Rate Limiting Pricing** 的說明，按 **Continue**）：
   - 計算方式用 **Fixed Window**。
   - **Time Window** 填 `60s`，**Request Limit** 填 `10`。
   - 計算依據（key）選 **IP**。
   - 超過時的動作選 **Deny**（預設是回 429）。
5. 按 **Save Rule**，再按右上角的 **Review Changes** → **Publish**。規則立刻生效，不用重新部署。

- 登入表單送出的是 POST `/login`（Server Action），所以這條只擋登入，一般瀏覽不受影響。
- 想先觀察的話，動作可以先選 **Log**，到 Firewall 的總覽看過流量再改成 **Deny**。
- Hobby 方案的 rate limiting 含 1,000,000 次 allowed requests；計數是各區域分開算的。

**2. 被攻擊時：打開 Attack Mode**

Attack Mode（舊名 Attack Challenge Mode，所有方案都免費；[官方說明：Attack Mode](https://vercel.com/docs/vercel-firewall/attack-mode)）打開後，訪客要先通過瀏覽器的驗證才能進入網站。

1. 到 Vercel → 專案 → 側邊欄的 **Firewall** → **Bot Management**。
2. 在 **Attack Mode** 選 **Enable**。攻擊結束後回到同一個地方選 **Disable**。

- Vercel 平常就會自動擋 DDoS，Attack Mode 只在被針對性攻擊時才開，不要一直開著。
- 自己帳號的 Vercel Cron（每天的排程）會自動放行。
- 不在 Vercel 已知機器人名單裡的請求可能會被擋，例如 GitHub Actions 每 30 分鐘呼叫的 `starrail:stamina`、Twitch 的開台通知。關掉之後到 Twitch 頁按「同步訂閱」確認訂閱狀態，需要的話手動補跑排程（見 [架構 › 排程](architecture.md#排程)）。

**3. 三個帳號都開兩步驟驗證**

Vercel 與 GitHub 是密鑰的正本，Supabase 放著資料庫，帳號被盜就等於外洩。

| 帳號 | 在哪裡開 | 官方說明 |
|---|---|---|
| Vercel | [帳號設定的 Authentication](https://vercel.com/account/settings/authentication#two-factor-authentication) → 打開 Two-factor Authentication 的開關 | [Two-factor Authentication](https://vercel.com/docs/two-factor-authentication) |
| GitHub | 右上角頭像 → **Settings** → **Password and authentication** → **Enable two-factor authentication** | [Configuring two-factor authentication](https://docs.github.com/en/authentication/securing-your-account-with-two-factor-authentication-2fa/configuring-two-factor-authentication) |
| Supabase | [帳號設定的 Security](https://supabase.com/dashboard/account/security)，用驗證器 App（TOTP） | [Multi-factor authentication](https://supabase.com/docs/guides/platform/multi-factor-authentication) |

- 設定完會拿到備用碼（recovery codes），存在安全的地方：手機遺失時要靠它登入。

## 帳號管理

```bash
npm run account create          # 建立帳號：依提示輸入帳號與密碼（密碼不顯示、要輸入兩次）
npm run account passwd <帳號>    # 重設密碼；這個帳號在所有裝置上的登入都會失效
npm run account list            # 列出帳號名稱
```

- ⚠️ **連到哪個資料庫**：這個指令不讀 `.env.local`。有環境變數 `DATABASE_URL` 就用它；沒有的話會提示貼上連線字串（輸入時不顯示）。每次都會先印出連到哪個主機，確認後再繼續。
- **操作正式資料庫**：依提示貼上 Supabase 的 Session pooler（5432）連線字串。不要寫在指令前面，以免連同密碼留在 shell 的歷史紀錄。
- **操作本機資料庫**：本機的連線字串沒有機密，可以寫在指令前面：
  - Mac／Linux：`DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/postgres npm run account create`
  - Windows PowerShell：`$env:DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5433/postgres"; npm run account create`
  - PowerShell 這樣設定的值會留在同一個視窗，之後的 `npm run account` 也會用它；用完執行 `Remove-Item Env:DATABASE_URL`。
- **不是互動終端機時**（例如接管線或在腳本裡執行）：沒有 `DATABASE_URL` 會直接報錯，要用上面的寫法先設定環境變數。
- **連不上資料庫時**：會用中文說明原因（主機拒絕連線、找不到主機、密碼錯誤、連線逾時等），並提示檢查連線字串的主機、port 和密碼；訊息不會顯示連線字串或密碼。
- **為什麼沒有網頁註冊**：網址是公開的，開放註冊的話帳號可能被別人先搶走。所以帳號只能在自己電腦上建立，原始碼與部署設定裡都沒有密碼。
- **帳號規則**：3–32 個字元，只能用英文小寫、數字、`_`、`.`、`-`，大寫會存成小寫。
- **密碼規則**：12–256 個字元，只能在提示出現後輸入，不能寫在命令列。
- **在網站上改密碼**：點導覽列右上角的人像圖示 →「帳號設定」（`/account`）。改好後這台裝置保持登入，其他裝置都會被登出。
- **登出**：點人像圖示 →「登出」，手機與電腦都一樣。帳號頁也有「登出這台裝置」。
- 登入狀態會保留 30 天。
- **忘記密碼**：在電腦上用 `npm run account passwd <帳號>` 重設。

## 換成自己的網域

`PUBLIC_BASE_URL` 只用在兩個地方：Twitch EventSub 與 YouTube WebSub 的 callback 網址。通知裡的連結都是站內路徑或外部網站，不受影響。所以換網域要做兩件事：換網址，以及讓兩邊的訂閱改送到新網址。

1. **加網域**：到 Vercel → 專案 → Settings → Domains 加入網域，照指示設定 DNS，等到 `https://新網域` 能正常打開。
   - `PUBLIC_BASE_URL` 要用直接提供網站、不會轉址的主機名稱。例如 apex 會轉到 www 時，就用 www。
   - 原因：callback 與排程都不會跟著轉址。
2. **先移除 Twitch 主播（還在舊網址時做）**：記下追蹤中的主播、頻道與各自的通知開關，然後在 Twitch 頁把主播全部移除。
   - 移除主播時會一併刪掉 Twitch 上的訂閱。
   - 如果先換網址再移除，舊訂閱會留在 Twitch 上，繼續送到仍然能打開的 vercel.app，造成重複的開台通知。
3. **更新網址**：到 Vercel 把 `PUBLIC_BASE_URL` 改成新網址（例如 `https://hub.example.com`），GitHub Secrets 的 `HUB_URL` 也改成同一個網址，然後到 Vercel 按 Redeploy。
4. **在新網址登入**：
   - 登入 cookie 是跟著網域的，所以要重新登入。
   - 各模組的提醒方式（提示音、瀏覽器通知）存在瀏覽器裡，也要在新網址重新設定。
5. **加回 Twitch 主播**：新的訂閱會指向新網址。重新設定通知開關，再按「同步訂閱」確認狀態。
6. **YouTube 頻道**，兩種做法：
   - **不動**：`youtube:renew` 會在租約剩不到 2 天時改用新網址續訂，最慢約 3–4 天全部換好。頻道列表上的到期日更新了，就代表那個頻道換好了。在那之前，舊訂閱仍然送到 vercel.app，所以這段期間不要讓 vercel.app 轉址。
   - **想立刻換**：把頻道移除再加回來。通知開關會變回開啟，要再設定一次。
7. **確認排程**：到 GitHub → Actions → **cron** → Run workflow，確認 log 裡有 `{"results":…}`。如果 `HUB_URL` 是會轉址的網址，這個 workflow 會顯示成功，但排程其實沒有執行。
8. **（選用）轉址舊網域**：確認全部換好之後，才在 Vercel 把 vercel.app 轉址到新網域。
