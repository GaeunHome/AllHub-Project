import { CARD_STYLES, CARD_STYLE_LABELS, type CardStyle } from "../../../lib/kinds";
import { LEGEND_CLASS } from "../forms/fields";

// 卡面只是讓人一眼認出是哪張卡 不放銀行的標誌
// 漸層的深色那頭在左邊 白字都落在深色上

const FACE_BACKGROUNDS: Record<CardStyle, string> = {
  blue: "from-blue-950 via-blue-800 to-blue-500",
  green: "from-emerald-950 via-emerald-800 to-emerald-500",
  purple: "from-violet-950 via-violet-800 to-violet-500",
  orange: "from-orange-950 via-orange-800 to-orange-500",
  black: "from-neutral-950 via-neutral-800 to-neutral-600",
  silver: "from-zinc-300 via-zinc-200 to-zinc-100 dark:from-zinc-400 dark:via-zinc-300 dark:to-zinc-200",
};

const faceBackground = (style: CardStyle) => `bg-linear-135 ${FACE_BACKGROUNDS[style]}`;
const faceText = (style: CardStyle) => (style === "silver" ? "text-zinc-900" : "text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.3)]");

type CardFaceProps = {
  style: CardStyle;
  name: string;
  /** 卡名的 id 給外層的 aria-labelledby */
  nameId?: string;
  /** 卡面下方的幾行 例如結帳日與扣款帳戶 */
  lines: readonly string[];
};

/**
 * 照實體卡的比例畫 寬度跟著外框 字的大小看卡面本身有多寬
 * 只有裝飾的那一層裁切 字太多換行時卡面會長高 不會被切掉
 */
export function CardFace({ style, name, nameId, lines }: CardFaceProps) {
  return (
    <div className={`@container relative flex aspect-[1.586] w-full flex-col justify-between gap-2 rounded-xl p-4 shadow-sm ring-1 ring-black/10 dark:ring-white/10 ${faceBackground(style)} ${faceText(style)}`}>
      {/* 右上角的反光與兩個淡淡的圓 讓平面的漸層像一張卡 */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
        <span className="absolute inset-0 bg-[radial-gradient(120%_90%_at_100%_0%,rgb(255_255_255/0.28),transparent_55%)]" />
        <span className="absolute -right-12 -bottom-20 size-56 rounded-full bg-white/10" />
        <span className="absolute -right-2 -bottom-28 size-56 rounded-full bg-white/10" />
      </span>
      <h3 id={nameId} className="relative text-base font-semibold break-words @[18rem]:text-lg">
        {name}
      </h3>
      <span aria-hidden="true" className="relative h-6 w-9 rounded-md border border-amber-700/30 bg-linear-135 from-amber-100 via-amber-300 to-amber-500 @[18rem]:h-7 @[18rem]:w-10" />
      <div className="relative flex flex-col gap-0.5 text-xs font-medium @[18rem]:text-sm">
        {lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
    </div>
  );
}

// 六種顏色的對角拼起來 代表照順序配色
const AUTO_SWATCH = "bg-[conic-gradient(from_45deg,#1e40af_0_60deg,#065f46_60deg_120deg,#5b21b6_120deg_180deg,#9a3412_180deg_240deg,#262626_240deg_300deg,#d4d4d8_300deg_360deg)]";

const SWATCH =
  "h-9 w-14 rounded-md ring-1 ring-black/10 transition-shadow peer-checked:ring-2 peer-checked:ring-[var(--brand)] peer-checked:ring-offset-2 peer-checked:ring-offset-[var(--surface-solid)] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-[var(--focus)] dark:ring-white/15";

/** 自動是照信用卡建立的順序配色 選了之後也能改回自動 */
export function CardStyleField({ defaultValue }: { defaultValue: CardStyle | null }) {
  const options = [{ value: "", label: "自動", swatch: AUTO_SWATCH }, ...CARD_STYLES.map((style) => ({ value: style, label: CARD_STYLE_LABELS[style], swatch: faceBackground(style) }))];
  return (
    <fieldset className="field min-w-0">
      <legend className={LEGEND_CLASS}>卡面顏色</legend>
      <div className="flex flex-wrap gap-x-3 gap-y-2">
        {options.map((option) => (
          <label key={option.value} className="flex min-w-14 cursor-pointer flex-col items-center gap-1.5 py-1 text-xs font-medium text-ink-soft has-[:checked]:font-semibold has-[:checked]:text-ink">
            <input type="radio" name="cardStyle" value={option.value} defaultChecked={(defaultValue ?? "") === option.value} className="peer sr-only" />
            <span aria-hidden="true" className={`${SWATCH} ${option.swatch}`} />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
