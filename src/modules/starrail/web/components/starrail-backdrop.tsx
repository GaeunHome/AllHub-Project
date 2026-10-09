// 原創的星空背景（不用官方美術圖）：星點、金色與白色的細軌道環、一段星軌列車的軌道；inline SVG，沒有圖片檔
// 星點位置固定寫死：每次算繪都一樣，伺服器與瀏覽器的結果才不會對不上

/** [x, y, 半徑, 不透明度]；每四顆有一顆會微微閃爍（只在沒要求減少動態時） */
const STARS: [number, number, number, number][] = [
  [42, 60, 1.4, 0.9], [118, 210, 1, 0.6], [196, 92, 1.6, 0.8], [260, 330, 0.9, 0.5], [318, 40, 1.2, 0.7], [388, 168, 1.8, 0.9],
  [452, 276, 1, 0.55], [520, 64, 1.3, 0.75], [588, 210, 0.9, 0.5], [646, 118, 1.5, 0.85], [712, 300, 1, 0.6], [770, 36, 1.2, 0.7],
  [836, 190, 0.9, 0.5], [904, 300, 1.4, 0.8], [962, 82, 1, 0.6], [1030, 240, 1.7, 0.9], [1096, 140, 1, 0.55], [1160, 48, 1.3, 0.75],
  [70, 470, 1.1, 0.6], [150, 610, 1.5, 0.85], [236, 520, 0.9, 0.5], [302, 760, 1.2, 0.7], [380, 470, 1, 0.55], [444, 690, 1.6, 0.85],
  [530, 560, 0.9, 0.5], [598, 820, 1.2, 0.7], [664, 500, 1, 0.6], [728, 700, 1.5, 0.8], [802, 610, 0.9, 0.5], [866, 860, 1.3, 0.75],
  [930, 520, 1, 0.6], [1004, 720, 1.6, 0.85], [1072, 600, 0.9, 0.5], [1140, 800, 1.2, 0.7], [1180, 420, 1, 0.55], [24, 860, 1.3, 0.7],
];

export function StarrailBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden sm:rounded-2xl">
      {/* 固定在上方 900px：頁面很長時不會跟著拉大，軌道線維持細細的 */}
      <svg className="absolute inset-x-0 top-0 h-[56rem] w-full" viewBox="0 0 1200 900" preserveAspectRatio="xMidYMin slice" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="sr-rail" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#e6c27a" stopOpacity="0" />
            <stop offset="0.45" stopColor="#e6c27a" stopOpacity="0.5" />
            <stop offset="1" stopColor="#e6c27a" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="sr-planet" cx="35%" cy="30%" r="70%">
            <stop offset="0" stopColor="#c7d2fe" stopOpacity="0.55" />
            <stop offset="0.55" stopColor="#4c3fa0" stopOpacity="0.35" />
            <stop offset="1" stopColor="#1e1b4b" stopOpacity="0" />
          </radialGradient>
        </defs>
        {/* 右上的行星與兩道軌道環 */}
        <g fill="none">
          <ellipse cx="1010" cy="130" rx="430" ry="118" transform="rotate(-13 1010 130)" stroke="#e6c27a" strokeOpacity="0.2" strokeWidth="1" />
          <ellipse cx="1010" cy="130" rx="300" ry="78" transform="rotate(-13 1010 130)" stroke="#c7d2fe" strokeOpacity="0.16" strokeWidth="1" strokeDasharray="2 7" />
          <circle cx="1010" cy="130" r="54" fill="url(#sr-planet)" />
          <circle cx="1281" cy="68" r="3" fill="#e6c27a" fillOpacity="0.7" />
        </g>
        {/* 左下的白色軌道環 */}
        <ellipse cx="150" cy="830" rx="380" ry="92" transform="rotate(7 150 830)" fill="none" stroke="#c7d2fe" strokeOpacity="0.12" strokeWidth="1" />
        {/* 星軌列車的軌道：兩條鐵軌，中間用很短的虛線畫出枕木 */}
        <g fill="none">
          <path d="M -60 652 Q 600 430 1260 572" stroke="#e6c27a" strokeOpacity="0.16" strokeWidth="24" strokeDasharray="1.5 15" />
          <path d="M -60 640 Q 600 418 1260 560" stroke="url(#sr-rail)" strokeWidth="1.2" />
          <path d="M -60 664 Q 600 442 1260 584" stroke="url(#sr-rail)" strokeWidth="1.2" />
        </g>
        <g fill="#ffffff">
          {STARS.map(([x, y, r, opacity], i) => (
            <circle key={i} cx={x} cy={y} r={r} fillOpacity={opacity} className={i % 4 === 0 ? "sr-twinkle" : undefined} />
          ))}
        </g>
      </svg>
    </div>
  );
}
