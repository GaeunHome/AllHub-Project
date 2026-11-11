import type { AnnouncementKind } from "../db/schema";

const STAMP_WORDS: Record<AnnouncementKind, string> = { outage: "停機", maintenance: "維護", general: "公告" };

/** 使用者選的站長來信 信紙右上角的印章 只是裝飾 種類另外寫成字 顏色跟著種類 */
export function AnnouncementStamp({ kind }: { kind: AnnouncementKind }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 120 120" className="announcement-stamp">
      <defs>
        <path id="announcement-stamp-ring" d="M60 60m-41 0a41 41 0 1 1 82 0a41 41 0 1 1-82 0" />
      </defs>
      <g fill="none" stroke="currentColor">
        <circle cx="60" cy="60" r="56" strokeWidth="3" />
        <circle cx="60" cy="60" r="50" strokeWidth="1.2" />
        <circle cx="60" cy="60" r="31" strokeWidth="1.2" />
      </g>
      <text fill="currentColor" fontSize="9" fontWeight="700" letterSpacing="1.5">
        <textPath href="#announcement-stamp-ring" textLength="250">
          ALLHUB ★ 站長公告 ★ ALLHUB ★ 站長公告 ★
        </textPath>
      </text>
      <text x="60" y="68" fill="currentColor" fontSize="22" fontWeight="800" textAnchor="middle">
        {STAMP_WORDS[kind]}
      </text>
    </svg>
  );
}
