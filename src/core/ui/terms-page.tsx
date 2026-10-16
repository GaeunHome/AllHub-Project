import Link from "next/link";
import type { ReactNode } from "react";

// 公開頁面 proxy 不擋 登入註冊前就要能讀 不讀資料庫與 cookie 建置時就能算繪好

export function TermsPage() {
  return (
    <main className="flex flex-1 justify-center px-4 py-12">
      <article className="card page-stack w-full max-w-2xl">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">AllHub 使用聲明</h1>
          <p>最後更新：2026 年 10 月</p>
        </header>

        <Section title="一、這是什麼網站">
          <li>AllHub 是站長個人製作的非商業網站，整合 Twitch 開台通知、YouTube 新影片與字幕翻譯、星穹鐵道便箋與簽到、理財記帳。</li>
          <li>不收費、不放廣告，不販售、出租或分享任何人的資料，也不拿資料做行銷或分析。</li>
          <li>只能用站長的邀請連結註冊，只提供給站長認識的人使用。</li>
        </Section>

        <Section title="二、會保存哪些資料">
          <li>帳號：帳號名稱、角色（站長或成員）、建立時間、停用時間，以及登入失敗次數與暫時鎖定時間（防止有人猜密碼）。</li>
          <li>密碼：只存 scrypt 雜湊，任何人（包括站長）都看不到原本的密碼。</li>
          <li>第三方憑證：你的 AI 服務 API Key 與 HoYoLAB cookie，加密後才存（見第三節）。</li>
          <li>你設定的內容：追蹤名單（Twitch 主播、YouTube 頻道）、翻譯設定與專有名詞表、保留的 YouTube 影片、連結的 HoYoLAB 帳號、理財的帳戶、持股與紀錄。</li>
          <li>理財的帳戶只存你取的名稱與金額，不存帳號、卡號；持股只存代號、股數與成本。</li>
          <SubList intro="保存多久：">
            <li>網站通知、開台紀錄、簽到紀錄：14 天後自動刪除</li>
            <li>YouTube 影片：只留每個人追蹤頻道的最新 20 支，其餘的在發布兩天後刪除；Shorts 確認後就刪除（已發過通知的留到發布兩天後）</li>
            <li>翻譯好的字幕：永久保留（見第五節）</li>
            <li>保留的影片清單：每人最多 15 部，留到你自己移除；按過翻譯的影片會自動加入，滿了先移除最舊的自動加入項目，你手動保留的不會被移除</li>
            <li>理財：永久保留，直到你刪除</li>
          </SubList>
          <li>
            防濫用紀錄：註冊與邀請碼的嘗試次數、用過的驗證碼、手動同步與續訂的冷卻時間；IP、驗證碼代號（nonce）與帳號 id 都只存雜湊，看不出原本的值。超過 1 天的紀錄會在下次有人登入、註冊或按同步、續訂時刪除。
          </li>
          <li>星穹鐵道的提醒發過了沒：只存遊戲帳號編號與日期的雜湊，避免同一件事提醒兩次，跟上一條一樣超過 1 天就刪除。</li>
          <li>你的瀏覽器裡：登入 cookie（30 天）、驗證碼 cookie（5 分鐘），以及提示音、通知、外觀、YouTube 播放器與理財畫面的偏好設定。</li>
          <li>網站沒有使用任何分析、廣告或追蹤工具。</li>
        </Section>

        <Section title="三、API Key 與 HoYoLAB cookie">
          <li>用 AES-256-GCM 加密後存在資料庫，只有伺服器在呼叫 AI 翻譯、讀取 HoYoLAB 與每天的重新加密排程時才會解密；畫面上只顯示 API Key 的末 4 碼，log 也不記錄原文。</li>
          <li>站長技術上能解密：伺服器與加密金鑰都由站長管理，站長承諾不會主動查看或使用。</li>
          <li>介意的話，建議用可以設定用量上限的 API Key；你隨時可以在網站上清除，或到 AI 供應商撤銷。</li>
          <li>AI 翻譯的費用由你自己的 API Key 支付。</li>
        </Section>

        <Section title="四、第三方服務">
          <li>Vercel（網站主機）與 Supabase（資料庫），都在東京：保存與處理上面的資料；Vercel 也會留下一般的連線紀錄（含 IP）。</li>
          <li>YouTube、Twitch：伺服器會向它們查詢頻道、影片、字幕、頭像與開台狀態；每天的排程會讀追蹤中 YouTube 頻道的 RSS，RSS 裡沒有的影片再逐支確認，找出 Shorts 刪掉。</li>
          <li>HoYoLAB：伺服器用你的 cookie 查詢即時便箋、遊戲頭像、角色、開拓月曆、活動日曆與終局戰績，每天替你簽到。</li>
          <li>大約每小時查一次便箋：開拓力快滿、每日實訓或每週內容沒做完、終局挑戰快結束還沒拿滿時提醒你（傍晚會查活動日曆）。</li>
          <li>每日、每週與終局提醒可以在帳號設定關掉；開拓力的提醒看你設的門檻。</li>
          <li>你輸入的兌換碼會用你的帳號送出；打開「自動兌換新的兌換碼」的帳號，每天也會把還沒試過的新兌換碼用那個帳號送出。</li>
          <li>hoyo-codes（社群整理的兌換碼清單）：有人打開自動兌換時，伺服器每天向它讀一次有效的兌換碼，不會送出你的任何資料。</li>
          <li>證交所與櫃買中心：有人記了持股時，伺服器讀它們公開的每日收盤價來算市值，不會送出你的任何資料。</li>
          {/* 只列真的只放快取的資料 效期照 next.config.ts 的 cacheLife expire
              追蹤 連結與保留時存下的平台資料另外列出 不能說成都不存 */}
          <SubList intro="只放在伺服器快取、不存資料庫的外部資料（最多保留多久）：">
            <li>HoYoLAB 即時便箋：5 分鐘</li>
            <li>HoYoLAB 角色、開拓月曆、活動日曆、終局戰績：30 分鐘</li>
            <li>直播觀看人數與預覽圖：2 分鐘</li>
            <li>頭像、遊戲封面、影片資訊：一天</li>
            <li>證交所與櫃買中心的每日收盤價：6 小時</li>
          </SubList>
          <li>你輸入的兌換碼與結果不保存；自動兌換會記下每個遊戲帳號試過哪些兌換碼（社群公開的碼）與結果，避免重複送出。</li>
          <SubList intro="會存進資料庫的平台資料（保存多久見第二節）：">
            <li>Twitch：主播名稱、追蹤時的頭像網址、是否直播中、開台紀錄（直播標題與分類）</li>
            <li>YouTube：頻道名稱與追蹤時的頭像網址；影片標題、發布時間、有無中文字幕；保留影片的標題與頻道名稱；共用的翻譯</li>
            <li>星穹鐵道：帳號 UID、暱稱、伺服器、開拓等級、HoYoLAB 帳號 id、簽到紀錄、自動兌換試過的兌換碼</li>
            <li>網站通知：開台、新影片、簽到與自動兌換的結果、開拓力與每日、每週、終局挑戰的提醒、理財的到期與卡費提醒</li>
          </SubList>
          <li>AI 供應商（Anthropic 的 Claude、OpenAI、Google 的 Gemini）：翻譯時把這一批字幕、前後幾句與用到的專有名詞送到你選的供應商，適用對方的條款與隱私權政策。</li>
          <li>頭像、影片縮圖等圖片由你的瀏覽器直接從平台的 CDN 載入，對方看得到你的 IP 與瀏覽器資訊；觀看頁使用 YouTube 的嵌入播放器。</li>
          <li>非官方做法：HoYoLAB 的讀取、簽到與兌換，以及 YouTube 的字幕讀取、頻道頭像與 Shorts 判斷，都不是官方 API，可能失效或違反服務條款，請自行評估要不要使用。</li>
        </Section>

        <Section title="五、翻譯結果共用">
          <li>同一支影片的翻譯所有人共用：別人打開同一支影片會直接看到，不用再付一次 API 費用。</li>
          <li>網站會記錄每份翻譯是由哪個帳號發起的。</li>
          <li>接著翻譯用的是觀看者自己的 API Key，費用由他支付；沒設定 API Key 的人只能看已翻好的部分。</li>
          <li>別人發起、還沒翻完的翻譯不會自動用你的 API Key 接著翻，要你按「用我的 API Key 繼續翻譯」才會開始；自己發起的會在觀看頁開著時自動接著翻。</li>
          <li>你的 API Key 出問題（無效、額度用完、請求太頻繁）或連線失敗時，錯誤只顯示給你，不影響共用的翻譯。</li>
          <li>只有發起人或站長能重新翻譯或上傳字幕取代，做的人會成為新的發起人。</li>
          <li>發起時的專有名詞表會跟著翻譯保存，之後接著翻都用同一份，譯名才會一致；刪除帳號後也會留在翻譯裡。</li>
          <li>共用的只有字幕、影片資訊與專有名詞表，不包含你的 API Key。</li>
          <li>翻譯好的字幕永久保留，影片被清掉或頻道沒人追蹤時也不刪除。</li>
        </Section>

        {/* 這節寫的是最終版 這頁跟資料依帳號分開與刪帳號連帶刪除一起上線 */}
        <Section title="六、刪除帳號與資料">
          <li>你可以在「帳號設定」頁輸入密碼刪除自己的帳號，刪除後無法復原。</li>
          <li>刪除帳號時，追蹤名單、保留的影片清單、加密的 API Key 與 HoYoLAB cookie、理財資料、網站通知、簽到紀錄與你建立的邀請連結都會一起刪除。</li>
          <li>共用的翻譯字幕會留給其他使用者，但不再連到你的帳號。</li>
          <li>帳號被濫用時，站長可以停用或刪除帳號。</li>
          <li>停用等於凍結：不能登入，排程不會用你的 HoYoLAB cookie 簽到、查便箋、發提醒或自動兌換，不會自動記固定收支，也不會寫網站通知給你。</li>
          <li>停用期間資料與訂閱都保留；恢復後照常運作，但要重新登入。</li>
        </Section>

        <Section title="七、安全與免責">
          <li>只能用邀請連結註冊；同一個帳號連續輸錯密碼會暫時鎖定。請用沒在別的網站用過的密碼。</li>
          <li>這是個人專案，不保證服務不中斷或資料不遺失；重要的資料（例如記帳）請自己另外備份。</li>
          <li>站長可能調整功能、停止服務或修改這份聲明，重要的修改會在網站上公告。</li>
        </Section>

        <Section title="八、聯絡方式">
          <li>有任何問題，或想刪除資料，請直接聯絡邀請你加入的站長。</li>
        </Section>

        <p>
          <Link href="/login" className="link">
            回登入頁
          </Link>
        </p>
      </article>
    </main>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="stack">
      <h2 className="text-lg font-semibold">{title}</h2>
      <ul className="flex list-disc flex-col gap-2 pl-5 leading-relaxed">{children}</ul>
    </section>
  );
}

/** 一條裡再分項 寫成一長句很難讀 li 本身不能是 flex 否則項目符號會不見 */
function SubList({ intro, children }: { intro: string; children: ReactNode }) {
  return (
    <li>
      <div className="flex flex-col gap-1.5">
        <span>{intro}</span>
        <ul className="flex list-[circle] flex-col gap-1 pl-5">{children}</ul>
      </div>
    </li>
  );
}
