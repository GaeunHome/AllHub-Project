# 部署

這頁說明怎麼把 AllHub 部署到 Vercel Hobby 與 Supabase 免費方案、升級與回滾、部署保護、防機器人、邀請成員與管理帳號，以及換成自己的網域。每個密鑰的細節見 [密鑰管理](secrets.md)。

## 部署架構

```text
你的電腦
├─ git push ──────▶ GitHub（AllHub-Project）
│                    ├─ ci.yml：test ‖ lint → build → typecheck
│                    ├─ db-migrate.yml：套用 migration ──Session pooler 5432──▶ Supabase
│                    ├─ cron.yml：手動執行排程（Run workflow）──▶ Vercel
│                    └─ 自動部署 ──▶ Vercel（函式在 hnd1 東京）
│                                     ├─ Vercel Cron：vercel.json 的排程（開拓力提醒每小時，其他每天）
│                                     └─ DATABASE_URL ──Transaction pooler 6543──▶ Supabase（東京）
└─ npm run account（建站長帳號，依提示貼上連線字串）──Session pooler 5432──▶ Supabase
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

3. 建議關掉 Supabase 的 Data API：網站用不到它（步驟見 [Supabase 的 Data API 建議關閉](#supabase-的-data-api-建議關閉)）。

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
5. 函式區域（`hnd1` 東京）與所有排程（含每小時的開拓力提醒）都寫在 `vercel.json` 裡，不用到後台設定。順便到 **Settings** → **Functions** 確認 **Fluid Compute** 是開著的（新專案預設開啟）：排程沒有設 `maxDuration`，靠它的預設 300 秒跑完。
6. **Settings** → **Deployment Protection** 維持預設的 Vercel Authentication（Standard Protection），這樣每次部署的專屬網址都要先登入 Vercel 才看得到（原因見 [Deployment Protection 要保持開啟](#deployment-protection-要保持開啟)）。

## 3. GitHub Secrets：填三個

到 GitHub repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**：

- `MIGRATION_DATABASE_URL`：Session pooler（5432）的連線字串。
- `CRON_SECRET`：跟 Vercel 的 `CRON_SECRET` 一樣。
- `HUB_URL`：網站網址，跟 `PUBLIC_BASE_URL` 一樣，結尾不要 `/`。

後兩個只在 Actions 頁面手動執行排程（cron workflow）時用；平常的排程由 Vercel Cron 呼叫。

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
- **第一個帳號就是站長**：只有站長看得到「管理」頁，可以邀請別人（見 [邀請成員](#邀請成員)）。之後再用這個指令建立的帳號都是一般成員。
- 建好後到網站登入。

## 之後的部署

- 推上 main 就會自動部署。`ci.yml` 在 PR 與 main 上都會跑測試、lint、建置與型別檢查。
- 推上 main 時，Vercel 部署與 db-migrate 是同時進行的。所以 migration 要跟線上還在跑的舊程式相容：一律先擴充（新欄位可為 null 或有預設值、新表直接加，不刪也不改舊欄位），等舊程式不再上線之後的版本才收斂（刪舊欄位、改成 NOT NULL）。唯一的例外是 v0.1.8，見下面的〈從 v0.1.7 升級〉。
- PR 的 Preview 部署沒有環境變數（密鑰只設在 Production），只用來確認能建置。
- 一般的部署不會讓登入失效。只有換 `SESSION_SECRET`、改密碼或重建資料庫才會。
- 每一版改了什麼見 [更新紀錄](../CHANGELOG.md)；下面是升級時要注意的事。
- **只能從上一版升級**：`src/core/db/migrations/` 只留基準檔 `0000_baseline`（之前的 migration 合併成的）與這一版的 migration，每一版開始時把上一版的併進基準檔，GitHub 上不會一直累積。基準檔的時間戳記等於正式資料庫最後套用的那一個，db-migrate 會略過它，只套新的。所以正式資料庫要先在上一版：更舊的版本先部署上一版的標籤（例如 `v0.1.6`）跑完 db-migrate 再升級；舊版各自的升級說明在那個標籤的 `docs/deploy.md`。
- **之後可以收斂的欄位**：只在一張卡還沒有帳單時當截止日預設的 `savings_accounts.due_day`（程式只讀不寫）。不用它之後照舊分兩版刪：先從 schema 拿掉（程式不再讀寫，migration 手動去掉 DROP），再下一版才真的刪（刪除要在 `migrations.integration.test.ts` 明列允許）。
- **從 v0.1.7 升級**：這一版的 migration 直接刪掉不再使用的欄位與表（使用者同意的例外，平常要分兩版），推送前先看完這一段。
  - **推送之前**：
    - 要顯示天氣，先在 Vercel 加上 `CWA_API_KEY`（中央氣象署）；空氣品質另外加 `MOENV_API_KEY`（環境部）。兩個都是選填、免費，Environments 只勾 **Production**，申請步驟見 [密鑰管理 › 天氣的授權碼](secrets.md#天氣的授權碼)。推送前填好，這次推送的部署就會帶著它們，不用再重新部署。
    - 到 Vercel 的 **Settings** → **Functions** 確認 **Fluid Compute** 開著：新的排程 `weather:rain` 讀全台預報最多等 15 秒，關掉時排程只有 10 秒。
    - 挑推送的時間：避開台北 0 點到 7 點（每天的排程大多在這段時間），推送當下也不要用網站，等 Vercel 部署與 db-migrate 都完成再用。
  - **db-migrate 套用 `0001_weather_cleanup`**（上一版的 `0001_finance_redesign` 已經併進基準檔），一開始設 `lock_timeout = 5s`，失敗時到 Actions 重跑一次：
    - 新增天氣的表 `weather_settings`（每人選的縣市與早上的下雨通知開關）。
    - 刪掉不再使用的欄位、表與索引：主播表與頻道表單人版的 `notify_enabled`、`youtube_settings` 的 `anthropic_key_hint`／`openai_key_hint`／`gemini_key_hint`（API Key 改成顯示前 8 碼，讀設定時解密後取）、`savings_accounts.purpose_id` 與 `savings_purposes`（用途改成帳戶上的文字）、沒有查詢用到的 `core_notifications_unread_idx`。
    - `core_notifications`、`starrail_accounts`、`youtube_settings` 的 `user_id` 改成 NOT NULL：先刪掉 `user_id` 是 null 的列（多人化部署時舊程式寫的，新程式本來就不讀；刪掉的遊戲帳號的簽到紀錄與兌換碼跟著刪）。
  - **代價**：db-migrate 跑完到新版部署完成之間（大約一兩分鐘），還在線上的 v0.1.7 讀寫到被刪的欄位會出錯：理財、Twitch、YouTube 的頁面顯示錯誤，webhook 也可能失敗（Twitch、YouTube 會重送）。這段時間碰到的排程也會失敗，隔天照常跑（理財的自動記帳會補記）。新版上線後就恢復。
  - **不能回到 v0.1.7**：舊程式的查詢會明列被刪掉的欄位，回去之後理財、Twitch、YouTube 都會出錯。出問題時修好再推，不要用 Instant Rollback（見〈[回滾與部署保護](#回滾與部署保護)〉）。
  - 首頁多一張天氣卡片。多一個排程 `weather:rain`（`vercel.json`，每天台北 06:00 那個小時），部署後 Vercel 自動登記：選了縣市、開著下雨通知的人，早上會下雨時收到「記得帶傘」。沒有 `CWA_API_KEY` 時它什麼都不做。
  - 部署比 migration 先完成時，那一兩分鐘首頁的天氣卡片讀不到新的表會顯示「暫時讀不到」，其他卡片照常。
- **部署的空窗期**：Vercel 部署與 db-migrate 同時進行，有一小段時間（通常一兩分鐘）程式與資料表的版本會對不上。建議部署當下先不要操作網站，兩邊都完成再用。
  - **部署比 migration 先完成**：新程式讀不到新的欄位或表，用到它們的頁面會出錯（改到帳號的表時登入也會失敗一下子），migration 跑完就恢復。
    - **webhook 的通知可能遺失**：這段時間 Twitch 的開台、YouTube 的新影片推送照樣會記下開台紀錄與影片，但新程式要讀的追蹤表還沒建好，通知發不出去，之後也不會補發。部署完成後的開台、新影片照常通知。
  - **migration 比部署先完成**：舊程式照常運作；新增的欄位它不認得，寫入時用預設值。例外是 v0.1.8：被刪掉的欄位舊程式讀寫會出錯（見上面的〈從 v0.1.7 升級〉）。
  - 多人化部署時舊程式留下的欄位與資料，v0.1.8 已經收斂：刪掉主播表、頻道表單人版的 `notify_enabled`，先刪掉 `user_id` 是 null 的列，再把 `user_id` 改成 NOT NULL。

## 回滾與部署保護

### 有成員之後只能往前修，不能回滾到多人化以前的版本

> 其他不能回滾的版本（見〈[之後的部署](#之後的部署)〉）：
>
> - 升級到 v0.1.6 之後不能回到 v0.1.5：舊程式會把「到期請我確認」的固定收支照原日自動記帳。
> - 升級到 v0.1.8 之後不能回到 v0.1.7：v0.1.8 的 migration 刪掉了 v0.1.7 的查詢還會用到的欄位與表，回去之後理財、Twitch、YouTube 都會出錯。Hobby 方案的 Instant Rollback 會回到上一個 production 部署（就是 v0.1.7），不要按。
>
> 下面說的是多人化以前的版本（v0.1.0）。

- 一旦有成員（邀請了別人註冊），就不能把網站還原到 v0.1.0 或任何多人化以前的版本：不論是 Vercel 的 Instant Rollback、Promote 舊的部署，還是重新部署舊的 commit。出問題時修好程式再推上 main。
- 原因：舊程式只有一個使用者，讀資料時不分擁有者、也不認得角色與停用。登入 cookie 的格式沒變，成員手上的 cookie 在舊版照樣有效，登入後看得到、改得到所有人的資料（包括站長的追蹤名單、記帳與 HoYoLAB 帳號），被停用的人也一樣進得去。
- **建議**：升級成功、確認新版正常之後，發第一個邀請之前，先到 Vercel → 專案 → **Deployments**，把多人化以前的 production 部署一個一個點開 → 右上角 **⋯** → **Delete** 刪掉。Hobby 方案的 Instant Rollback 只能回到上一個 production 部署，刪掉之後就不會誤按回到單人版（刪掉的部署 30 天內可以在 Settings → Security → Recently Deleted 救回來）。
- **真的必須回滾時（緊急）**：先讓成員的 cookie 與密碼都失效，再回滾。
  1. 到 Supabase → SQL Editor，二選一：刪除成員帳號（他們的資料會跟著刪除），或保留資料、只讓密碼失效：

     ```sql
     -- 刪除成員帳號
     DELETE FROM core_users WHERE role = 'member';
     -- 或：保留資料，把成員的密碼雜湊改成無效值，誰都登入不了
     UPDATE core_users SET password_hash = 'invalid' WHERE role = 'member';
     ```

  2. 到 Vercel 把 `SESSION_SECRET` 換成新的值（產生方式見 [密鑰管理](secrets.md#產生亂數密鑰)）。用新值建置的部署上線後，所有人的登入 cookie 都會失效，站長也要重新登入。
  3. 再讓舊版上線：環境變數要重新建置才會生效，所以用舊部署的 **Redeploy**（重新建置），不要用 Instant Rollback（它只是把網址切回當時建好的部署，用的還是舊的 `SESSION_SECRET`）。
  4. 修好之後重新部署新版，再用 `npm run account passwd <帳號>` 替保留下來的成員重設密碼。

### Deployment Protection 要保持開啟

- 每一次部署都有自己的專屬網址（`allhub-project-<亂碼>-<帳號>.vercel.app`），舊的部署也一直打得開。沒有保護的話，任何人只要知道網址就能用舊版的程式連到正式資料庫，等於繞過了上面「不能回滾」的限制。
- 到 Vercel → 專案 → **Settings** → **Deployment Protection**（新介面在側邊欄的 **Security** 裡）：**Vercel Authentication** 保持開啟，範圍選 **Standard Protection**（預設值）。這樣每次部署的專屬網址都要先登入 Vercel 才看得到，正式網址（`allhub-project.vercel.app`、自己的網域）照常公開。
- 不要選 **All Deployments**：正式網址也會要求登入，Twitch、YouTube 的推送與排程都會被擋下。
- 確認方法：用無痕視窗打開某個部署的專屬網址，應該會被導到 Vercel 的登入頁。官方說明：[Deployment Protection](https://vercel.com/docs/deployment-protection)。

### Supabase 的 Data API 建議關閉

- 網站用 Postgres 連線字串直接連資料庫，用不到 Supabase 的 Data API（PostgREST）。
- v0.1.4 起每張資料表都開了 RLS、沒有 policy：Data API 開著的話，拿到專案 anon key 的人也一列都讀寫不到。v0.1.3 以前沒有開，拿到 anon key 就能透過 REST 讀寫所有資料表；Supabase 寄來的安全通知「Table publicly accessible」（`rls_disabled_in_public`）說的就是這件事。
- 用不到的入口還是關掉比較好。到 Supabase 的專案 → **Integrations** → **Data API**，二選一：
  - **Overview** 分頁：關掉 **Enable Data API**（建議）。
  - **Settings** 分頁：在 **Exposed schemas** 取消勾選 `public`，按 **Save**。
- 關掉之後網站照常運作（不影響連線字串）。畫面跟這裡不一樣時，以官方說明為準：[Securing your API › Disable the Data API](https://supabase.com/docs/guides/api/securing-your-api#disable-the-data-api)。
- 確認：Supabase 的專案 → **Advisors** → **Security Advisor**，沒有 `rls_disabled_in_public` 就好（升級到 v0.1.4 之後才會消失）。

## 防機器人與被攻擊時

網址是公開的，難免有機器人來掃。網站本身已經做了這些（細節見 [架構 › 安全](architecture.md#安全)）：

- **不讓搜尋引擎收錄**：`/robots.txt` 請所有爬蟲都不要抓（`Disallow: /`），每一頁也帶 `noindex, nofollow`。
- **只能用邀請註冊**：`/register` 沒有有效的邀請碼就不顯示表單，送出時再檢查一次；表單有機器人才會填的隱藏欄位（蜜罐）。
- **註冊次數限制**：同一個 IP 每小時最多送出 10 次註冊、用錯 10 次邀請碼。計數存在資料庫（IP 只存雜湊），多個執行個體也看得到同一個數字。
- **登入次數限制**：同一個 IP 在 15 分鐘內錯 5 次就鎖 15 分鐘（記憶體，多個執行個體時只是盡力而為）；同一個帳號連錯 5 次也會鎖 15 分鐘，之後每 5 次鎖 30、60 分鐘（存在資料庫，換 IP 也一樣）。
- **圖形驗證碼**：登入與註冊都要輸入，每張只能送出一次；偽造或改過的驗證碼 cookie 在寫進資料庫之前就會被擋下。
- 再用 Vercel Firewall 在前面擋一層。

下面是在網頁上的設定，介面用語以 2026 年 10 月的 Vercel 文件為準；畫面跟這裡不一樣時，以連結的官方文件為準。

**1. Vercel Firewall：限制登入、註冊與驗證碼圖片的次數**

Hobby（免費）方案每個專案只能建 1 條 rate limiting 規則（[官方說明：WAF Rate Limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting)），所以用 OR 讓同一條規則同時涵蓋登入、註冊與驗證碼圖片：

1. 到 Vercel → 專案 → 側邊欄的 **Firewall** → 右上角的 **Configure**（有時收在 **⋯** 裡）→ **+ New Rule**（有的介面是 **Add New…** → **Rule**）。已經有舊的「登入次數限制」規則的話，直接編輯它。
2. 名稱填 `登入與註冊次數限制`。
3. 在 **Configure** 的 **If** 依序加五個條件（每加一個條件都要選它跟上一個條件的關係，[官方說明：Custom Rules](https://vercel.com/docs/vercel-firewall/vercel-waf/custom-rules)）：
   - **Request Path**、**Equals**、`/login`
   - **AND**：**Method**、**Equals**、`POST`
   - **OR**：**Request Path**、**Equals**、`/register`
   - **AND**：**Method**、**Equals**、`POST`
   - **OR**：**Request Path**、**Equals**、`/api/auth/captcha`

   OR 會把條件分成三組，組內用 AND，所以意思是「POST `/login`」或「POST `/register`」或「`/api/auth/captcha`」（驗證碼圖片，不限方法）。存好後打開規則確認畫面上是三組。已經有舊的兩組規則的話，在最後加上第三組就好。
4. **Then** 選 **Rate Limit**（第一次建立時會跳出 **Rate Limiting Pricing** 的說明，按 **Continue**）：
   - 計算方式用 **Fixed Window**。
   - **Time Window** 填 `60s`，**Request Limit** 填 `20`。
   - 計算依據（key）選 **IP**。
   - 超過時的動作選 **Deny**（預設是回 429）。
5. 按 **Save Rule**，再按右上角的 **Review Changes** → **Publish**。規則立刻生效，不用重新部署。

- 登入表單送出的是 POST `/login`、註冊表單送出的是 POST `/register?code=…`（都是 Server Action），驗證碼圖片是 GET `/api/auth/captcha?for=login`（或 `register`）。Request Path 不含 `?` 後面的部分，所以都比對得到；一般瀏覽登入頁、註冊頁（GET）不受影響。
- 為什麼也算驗證碼圖片：每載入一張就會簽發新的驗證碼 cookie，機器人大量要圖也會被擋下。
- 次數是三者合計、依 IP 計算：同一個 IP 一分鐘最多 20 次。打開登入或註冊頁、按「換一張」、送出後換新圖都會載入一張驗證碼，所以一般使用者一分鐘大約能送出 9–10 次；搭配驗證碼與帳號鎖定，仍然猜不了密碼。被擋時等一分鐘就會恢復。
- 想先觀察的話，動作可以先選 **Log**，到 Firewall 的總覽看過流量再改成 **Deny**。
- Hobby 方案的 rate limiting 含 1,000,000 次 allowed requests；計數是各區域分開算的。

**2. 被攻擊時：打開 Attack Mode**

Attack Mode（舊名 Attack Challenge Mode，所有方案都免費；[官方說明：Attack Mode](https://vercel.com/docs/vercel-firewall/attack-mode)）打開後，訪客要先通過瀏覽器的驗證才能進入網站。

1. 到 Vercel → 專案 → 側邊欄的 **Firewall** → **Bot Management**。
2. 在 **Attack Mode** 選 **Enable**。攻擊結束後回到同一個地方選 **Disable**。

- Vercel 平常就會自動擋 DDoS，Attack Mode 只在被針對性攻擊時才開，不要一直開著。
- 自己帳號的 Vercel Cron（`vercel.json` 的排程，含每小時的開拓力提醒）會自動放行。
- 不在 Vercel 已知機器人名單裡的請求可能會被擋，例如 Twitch 的開台通知、在 GitHub Actions 手動執行的排程。關掉之後到 Twitch 頁按「同步訂閱」確認訂閱狀態，需要的話手動補跑排程（見 [架構 › 排程](architecture.md#排程)）。

**3. 三個帳號都開兩步驟驗證**

Vercel 與 GitHub 是密鑰的正本，Supabase 放著資料庫，帳號被盜就等於外洩。

| 帳號 | 在哪裡開 | 官方說明 |
|---|---|---|
| Vercel | [帳號設定的 Authentication](https://vercel.com/account/settings/authentication#two-factor-authentication) → 打開 Two-factor Authentication 的開關 | [Two-factor Authentication](https://vercel.com/docs/two-factor-authentication) |
| GitHub | 右上角頭像 → **Settings** → **Password and authentication** → **Enable two-factor authentication** | [Configuring two-factor authentication](https://docs.github.com/en/authentication/securing-your-account-with-two-factor-authentication-2fa/configuring-two-factor-authentication) |
| Supabase | [帳號設定的 Security](https://supabase.com/dashboard/account/security)，用驗證器 App（TOTP） | [Multi-factor authentication](https://supabase.com/docs/guides/platform/multi-factor-authentication) |

- 設定完會拿到備用碼（recovery codes），存在安全的地方：手機遺失時要靠它登入。

## 邀請成員

網站只能用邀請連結註冊。完整的邀請連結只在建立的那一頁看得到（重新整理或離開就沒了），資料庫只存它的雜湊。

1. 用站長帳號登入，點導覽列右上角的人像圖示 →「管理」（`/admin`，只有站長看得到）。
2. 在「邀請連結」選期限（1、7 或 30 天）與可以註冊幾個帳號（1、5 或 10 次），需要的話填備註（只有站長看得到，例如「給小明」），按「建立邀請連結」。
3. 連結顯示在彈出的視窗裡，按「複製連結」，用私訊傳給對方。關掉視窗後還可以按「再看一次連結」（再建一條失敗時，上一條也還在）；重新整理或離開這一頁就沒了，弄丟就再建一個。
4. 對方打開連結，填帳號、密碼（兩次），勾選同意使用聲明（`/terms`），按「建立帳號」後就會直接登入。新帳號一律是一般成員。
5. 回到「管理」頁可以看到新帳號，邀請的「已用」次數也會加一。

- **撤銷**：還有效的邀請可以按「撤銷」，之後就不能再用它註冊；已經註冊的帳號不受影響。清單會列出有效、已用完、已過期與已撤銷的邀請。
- **停用與恢復**：在「使用者」按「停用」等於把帳號凍結：對方會立刻被登出、不能再登入；排程不再用他的 HoYoLAB cookie 簽到、查便箋、發提醒或自動兌換，也不替他自動記固定收支、不寫網站通知給他。他的資料、追蹤名單與共用的訂閱都保留（他追蹤的主播與頻道不會被當成沒人追蹤而刪掉）。按「恢復」就照常運作，但他要重新登入：停用前的登入狀態不會恢復。站長不能停用或刪除自己。
- **解除鎖定**：連錯密碼被暫時鎖定的帳號會顯示「鎖定中，到 HH:mm」，按「解除鎖定」只把失敗次數歸零，不改密碼、也不影響停用狀態。
- **刪除帳號**：在「使用者」按「刪除」（會先確認）。成員也可以在「帳號設定」頁輸入密碼刪除自己的帳號；最後一個未停用的站長不能刪除自己。刪除時，他建立的邀請、網站通知、追蹤名單、保留的影片、加密的 API Key 與 HoYoLAB cookie、理財資料會一起刪除；他發起的翻譯留給其他人，但不再連到他。
- **各自的資料**：每個人的追蹤名單、翻譯設定與 API Key、HoYoLAB 帳號、理財與通知都是分開的，站長在網站上也看不到成員的資料；只有 YouTube 翻譯好的字幕是共用的（見 [模組設定與使用 › 多人使用](modules.md#多人使用)）。

## 帳號管理

```bash
npm run account create          # 建立帳號：第一個是站長，之後的是一般成員；依提示輸入帳號與密碼（密碼不顯示、要輸入兩次）
npm run account passwd <帳號>    # 重設密碼並解除登入鎖定；這個帳號在所有裝置上的登入都會失效
npm run account unlock <帳號>    # 只解除登入鎖定（失敗次數歸零），不改密碼；站長自己被鎖住時用這個
npm run account list            # 列出帳號、角色（站長／成員）與是否停用，用 tab 分隔
```

- ⚠️ **連到哪個資料庫**：這個指令不讀 `.env.local`。有環境變數 `DATABASE_URL` 就用它；沒有的話會提示貼上連線字串（輸入時不顯示）。每次都會先印出連到哪個主機（不會停下來等你確認：`create`、`passwd` 在輸入帳號密碼前可以按 Ctrl-C 取消）。
- **操作正式資料庫**：依提示貼上 Supabase 的 Session pooler（5432）連線字串。不要寫在指令前面，以免連同密碼留在 shell 的歷史紀錄。
- **連線字串不完整時**：缺 port 或資料庫名稱（例如貼上時在主機名稱中間斷行，後半段會被當成帳號）會直接報錯「連線字串不完整，可能複製時中間斷行了」，不會繼續問帳號。重新複製一次，結尾應該是 `:5432/postgres`。
- **操作本機資料庫**：本機的連線字串沒有機密，可以寫在指令前面：
  - Mac／Linux：`DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/postgres npm run account create`
  - Windows PowerShell：`$env:DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5433/postgres"; npm run account create`
  - PowerShell 這樣設定的值會留在同一個視窗，之後的 `npm run account` 也會用它；用完執行 `Remove-Item Env:DATABASE_URL`。
- **不是互動終端機時**（例如接管線或在腳本裡執行）：沒有 `DATABASE_URL` 會直接報錯，要用上面的寫法先設定環境變數。
- **連不上資料庫時**：會用中文說明原因（主機拒絕連線、找不到主機、密碼錯誤、連線逾時等），並提示檢查連線字串的主機、port 和密碼；訊息不會顯示連線字串或密碼。
- **為什麼只能用邀請註冊**：網址是公開的，開放註冊的話會被灌帳號或被搶走帳號名稱。所以第一個帳號在自己電腦上建立，其他人要有站長的邀請連結；原始碼與部署設定裡都沒有密碼。
- **帳號規則**：3–32 個字元，只能用英文小寫、數字、`_`、`.`、`-`，大寫會存成小寫。
- **密碼規則**：12–256 個字元，不能是常見的密碼、不能只是同一小段重複，也不能包含帳號名稱（網站註冊、改密碼與這個指令都一樣）。指令裡的密碼只能在提示出現後輸入，不能寫在命令列。
- **在網站上改密碼或刪除帳號**：點導覽列右上角的人像圖示 →「帳號設定」（`/account`）。改密碼後這台裝置保持登入，其他裝置都會被登出；刪除帳號要再輸入一次密碼並確認。
- **登出**：點人像圖示 →「登出」，手機與電腦都一樣。帳號頁也有「登出這台裝置」。
- 登入狀態會保留 30 天。
- **登入被鎖住**：同一個帳號連錯 5 次會鎖 15 分鐘，之後每連錯 5 次鎖 30、60 分鐘。畫面一律只顯示「帳號或密碼錯誤」（不透露帳號是否存在或被鎖），等時間過了再試。
  - 成員被鎖住：站長在「管理」頁的使用者清單會看到「鎖定中，到 HH:mm」，按「解除鎖定」即可，不會改密碼。
  - 站長自己被鎖住（進不了管理頁）：在電腦上執行 `npm run account unlock <帳號>`，不改密碼；忘記密碼才用 `passwd`。
  - 有人一直故意猜某個帳號時，鎖定會一再出現；可以在 Vercel Firewall 擋掉那個 IP（見 [防機器人與被攻擊時](#防機器人與被攻擊時)）。
- **忘記密碼**：站長在電腦上用 `npm run account passwd <帳號>` 重設；成員請站長幫忙重設。

## 換成自己的網域

`PUBLIC_BASE_URL` 只用在兩個地方：Twitch EventSub 與 YouTube WebSub 的 callback 網址。通知裡的連結都是站內路徑或外部網站，不受影響。所以換網域要做兩件事：換網址，以及讓兩邊的訂閱改送到新網址。

1. **加網域**：到 Vercel → 專案 → Settings → Domains 加入網域，照指示設定 DNS，等到 `https://新網域` 能正常打開。
   - `PUBLIC_BASE_URL` 要用直接提供網站、不會轉址的主機名稱。例如 apex 會轉到 www 時，就用 www。
   - 原因：callback 與排程都不會跟著轉址。
2. **先移除 Twitch 主播（還在舊網址時做）**：請每個人記下自己追蹤的主播、頻道與各自的通知開關，然後在 Twitch 頁把主播全部取消追蹤。
   - 主播的訂閱是共用的：追蹤那位主播的最後一個人取消時，才會一併刪掉 Twitch 上的訂閱。
   - 如果先換網址再移除，舊訂閱會留在 Twitch 上，繼續送到仍然能打開的 vercel.app，造成重複的開台通知。
3. **更新網址**：到 Vercel 把 `PUBLIC_BASE_URL` 改成新網址（例如 `https://hub.example.com`），GitHub Secrets 的 `HUB_URL` 也改成同一個網址，然後到 Vercel 按 Redeploy。
4. **在新網址登入**：
   - 登入 cookie 是跟著網域的，所以要重新登入。
   - 各模組的提醒方式（提示音、瀏覽器通知）存在瀏覽器裡，也要在新網址重新設定。
5. **加回 Twitch 主播**：每個人重新追蹤，新的訂閱會指向新網址。重新設定通知開關，再按「同步訂閱」確認狀態。
6. **YouTube 頻道**，兩種做法：
   - **不動**：`youtube:renew` 會在租約剩不到 2 天時改用新網址續訂，最慢約 3–4 天全部換好。頻道列表上的到期日更新了，就代表那個頻道換好了。在那之前，舊訂閱仍然送到 vercel.app，所以這段期間不要讓 vercel.app 轉址。
   - **想立刻換**：追蹤這個頻道的每個人都取消追蹤再加回來（最後一個人取消時才會取消舊的訂閱）。通知開關會變回開啟，要再設定一次。
7. **確認手動執行排程**：到 GitHub → Actions → **cron** → Run workflow，確認 log 裡有 `{"results":…}`（GitHub Secrets 的 `HUB_URL` 只用在這裡）。如果 `HUB_URL` 是會轉址的網址，這個 workflow 會顯示成功，但排程其實沒有執行。
8. **（選用）轉址舊網域**：確認全部換好之後，才在 Vercel 把 vercel.app 轉址到新網域。
