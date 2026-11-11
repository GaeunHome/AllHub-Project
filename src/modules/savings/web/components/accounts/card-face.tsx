import { CARD_STYLES, CARD_STYLE_LABELS, type CardStyle } from "../../../lib/kinds";
import { LEGEND_CLASS } from "../forms/fields";

// 卡面只是讓人一眼認出是哪張卡 不放銀行的標誌
// 使用者選的黑卡私人銀行 六種顏色畫成拉絲金屬 底色在 savings.css 的 fin-metal-*

const metal = (style: CardStyle) => `fin-metal-${style}`;

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
    <div data-style={style} className={`fin-face @container relative flex aspect-[1.586] w-full flex-col justify-between gap-2 rounded-xl p-4 @[18rem]:p-5 ${metal(style)}`}>
      <span aria-hidden="true" className="fin-face-shine" />
      <h3 id={nameId} className="relative text-base font-semibold tracking-wide break-words @[18rem]:text-lg">
        {name}
      </h3>
      <span aria-hidden="true" className="fin-chip" />
      <div className="relative flex flex-col gap-0.5 text-xs font-medium @[18rem]:text-sm">
        {lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
    </div>
  );
}

// 六種顏色的對角拼起來 代表照順序配色
const AUTO_SWATCH = "bg-[conic-gradient(from_45deg,#1f3a80_0_60deg,#1a5a48_60deg_120deg,#4a2f88_120deg_180deg,#a5603c_180deg_240deg,#1a1b20_240deg_300deg,#c9ccd3_300deg_360deg)]";

const SWATCH =
  "h-9 w-14 rounded-md ring-1 ring-[var(--line-strong)] transition-shadow peer-checked:ring-2 peer-checked:ring-[var(--focus)] peer-checked:ring-offset-2 peer-checked:ring-offset-[var(--surface-solid)] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-[var(--focus)]";

/** 自動是照信用卡建立的順序配色 選了之後也能改回自動 */
export function CardStyleField({ defaultValue }: { defaultValue: CardStyle | null }) {
  const options = [{ value: "", label: "自動", swatch: AUTO_SWATCH }, ...CARD_STYLES.map((style) => ({ value: style, label: CARD_STYLE_LABELS[style], swatch: metal(style) }))];
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
