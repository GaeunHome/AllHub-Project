import Link from "next/link";
import type { ReactNode } from "react";

// 公開頁面（proxy 不擋）：登入、註冊前就要能讀；不讀資料庫與 cookie，建置時就能算繪好

export function TermsPage() {
  return (
    <main className="flex flex-1 justify-center px-4 py-12">
      <article className="card page-stack w-full max-w-2xl">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">AllHub 使用聲明</h1>
          <p>最後更新：2026 年 10 月</p>
        </header>

        <Section title="一、這是什麼網站">
          <li>AllHub 是站長個人製作、非商業的整合網站，放著 Twitch 開台通知、YouTube 新影片與字幕翻譯、星穹鐵道的便箋與簽到、存錢記帳。</li>
          <li>不收費、不放廣告，也不販售、出租或分享任何人的資料，不拿資料做行銷或分析。</li>
          <li>只能用站長發的邀請連結註冊，提供給站長認識的人使用。</li>
        </Section>

        <Section title="二、會保存哪些資料">
          <li>帳號：帳號名稱、角色（站長或成員）、建立時間，以及被停用時的停用時間；為了防止有人猜密碼，也會記錄登入失敗的次數與暫時鎖定的時間。</li>
          <li>密碼：只存 scrypt 雜湊，任何人（包括站長）都看不到原本的密碼。</li>
          <li>你自己的第三方憑證：AI 服務的 API Key 與 HoYoLAB cookie，加密後才存（見下一節）。</li>
          <li>你設定的內容：追蹤的 Twitch 主播與 YouTube 頻道（追蹤名單）、翻譯設定與專有名詞表、連結的 HoYoLAB 帳號、存錢記帳的項目與紀錄。</li>
          <li>通知與紀錄：網站通知、開台紀錄與簽到紀錄只保留 14 天，之後自動刪除。</li>
          <li>YouTube 影片只留每個人追蹤頻道的最新 20 支：不在任何人清單裡的影片（剛發布兩天內的除外）會自動刪除；翻譯好的字幕不會跟著刪除，永久保留（見第五節）。</li>
          <li>存錢記帳的資料永久保留，直到你刪除。</li>
          <li>
            防濫用紀錄：註冊與邀請碼的嘗試次數依 IP 計算，資料庫裡只存 IP 加上伺服器密鑰的雜湊，看不出原本的 IP。登入與註冊的圖形驗證碼只記下用過的驗證碼代號（nonce）的雜湊，防止同一張圖被重複使用；手動按「同步訂閱」「續訂」的冷卻時間只記帳號 id 的雜湊。超過 1 天的紀錄會在下次有人登入、註冊或按這兩個按鈕時刪除。
          </li>
          <li>你的瀏覽器裡：登入用的 cookie（保留 30 天）、登入與註冊時的驗證碼 cookie（5 分鐘），以及提示音、瀏覽器通知、外觀等偏好設定。</li>
          <li>網站沒有使用任何分析、廣告或追蹤工具。</li>
        </Section>

        <Section title="三、API Key 與 HoYoLAB cookie">
          <li>
            用 AES-256-GCM 加密後存在資料庫，只有伺服器端在呼叫 AI 翻譯、讀取 HoYoLAB 的當下，以及每天的重新加密排程（換加密金鑰時把舊資料改用新金鑰加密）才會解密；畫面上只顯示 API Key 的末 4 碼，log 也不記錄原文。
          </li>
          <li>站長技術上有能力解密並存取它們：伺服器與加密金鑰都由站長管理。站長承諾不會主動查看或使用。</li>
          <li>介意的話，建議使用可以設定用量上限的 API Key；你隨時可以在網站上清除，或到 AI 供應商那邊撤銷。</li>
          <li>AI 翻譯的費用由你自己的 API Key 支付。</li>
        </Section>

        <Section title="四、第三方服務">
          <li>Vercel（網站主機）與 Supabase（資料庫），都在東京：保存與處理上面列出的資料；Vercel 也會留下一般的連線紀錄（包含 IP）。</li>
          <li>YouTube、Twitch：網站會在伺服器端向這些平台查詢頻道、影片、字幕、頭像與開台狀態。</li>
          <li>
            HoYoLAB：網站會在伺服器端用你的 cookie 查詢即時便箋、角色、開拓月曆與終局戰績；排程每天替你簽到、每 30 分鐘查一次開拓力（快滿時提醒）；你輸入的兌換碼會用你的帳號送出兌換。
          </li>
          <li>
            這些向外部服務查到的資料不存進資料庫，只放在伺服器的快取裡：HoYoLAB 的資料最多 30 分鐘（即時便箋最多 5 分鐘），頭像這類很少變的資料最多一天；兌換碼與兌換結果都不保存。
          </li>
          <li>
            AI 供應商（Anthropic 的 Claude、OpenAI、Google 的 Gemini）：翻譯時會把這一批字幕與前後幾句，以及裡面出現的專有名詞送到你選擇的供應商，適用該供應商的條款與隱私權政策。
          </li>
          <li>頭像、影片縮圖等圖片由你的瀏覽器直接從這些平台的 CDN 載入，對方看得到你的 IP 與瀏覽器資訊；觀看頁的播放器是 YouTube 的嵌入播放器。</li>
          <li>HoYoLAB 的讀取、簽到與兌換，以及 YouTube 的字幕讀取都不是官方 API，可能失效或違反服務條款，請自行評估要不要使用。</li>
        </Section>

        <Section title="五、翻譯結果共用">
          <li>同一支影片翻好的字幕會在使用者之間共用：別人打開同一支影片時會直接看到，不用再花一次 API 費用。</li>
          <li>網站會記錄每份翻譯是由哪個帳號發起的。</li>
          <li>接著翻譯時用的是觀看者自己的 API Key，費用由他支付；沒有設定 API Key 的人只能看已經翻好的部分。</li>
          <li>
            別人發起、還沒翻完的翻譯，網站不會自動用你的 API Key 接著翻：會先顯示已經翻好的部分，你按「用我的 API Key 繼續翻譯」才會開始；自己發起的翻譯，觀看頁開著時會自動接著翻。
          </li>
          <li>你的 API Key 出問題（無效、額度用完、請求太頻繁）或連線失敗時，錯誤只顯示給你，不影響共用的翻譯，其他人也看不到。</li>
          <li>只有發起翻譯的人或站長可以重新翻譯或上傳字幕取代；重新翻譯或上傳的人會成為新的發起人。</li>
          <li>發起時的專有名詞表會跟著這份翻譯保存，之後誰接著翻都用同一份，譯名才會一致；刪除帳號後也會留在翻譯裡。</li>
          <li>共用的只有字幕文字、影片資訊與上面的專有名詞表，不包含你的 API Key。</li>
          <li>翻譯好的字幕永久保留：影片從清單裡清掉、頻道沒有人追蹤時都不會刪除。</li>
        </Section>

        {/* 這一節寫的是最終版：這頁跟各模組資料依帳號分開、刪除帳號時連帶刪除一起上線 */}
        <Section title="六、刪除帳號與資料">
          <li>你可以在「帳號設定」頁輸入密碼後刪除自己的帳號，刪除後無法復原。</li>
          <li>刪除帳號時，你的追蹤名單、加密的 API Key 與 HoYoLAB cookie、記帳資料會一起刪除。</li>
          <li>網站通知、HoYoLAB 的簽到紀錄與你建立的邀請連結也會一起刪除。</li>
          <li>已經共用的翻譯字幕會留給其他使用者，但不再連到你的帳號。</li>
          <li>帳號被濫用時，站長可以停用或刪除帳號。</li>
          <li>
            停用等於凍結：停用期間不能登入，排程不會用你的 HoYoLAB cookie 簽到、查便箋或發開拓力提醒，也不會寫網站通知給你（追蹤的主播開台、頻道有新影片都不通知）。
          </li>
          <li>你的資料全部保留，追蹤的主播與頻道的訂閱也照樣保留；恢復後照常運作，但要重新登入（停用前的登入狀態不會恢復）。</li>
        </Section>

        <Section title="七、安全與免責">
          <li>帳號只能用邀請連結註冊；同一個帳號連續輸錯密碼會暫時鎖定。請使用沒有在別的網站用過的密碼。</li>
          <li>這是個人專案，不保證服務不中斷或資料不會遺失；重要的資料（例如記帳）請自己另外備份。</li>
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
