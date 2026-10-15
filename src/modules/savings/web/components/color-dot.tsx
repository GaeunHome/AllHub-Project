import type { CSSProperties } from "react";
import type { PaletteColor } from "../../lib/kinds";

/** 色值在 globals.css 的 --fin-blue 這類變數 淺色深色各一組 */
export function ColorDot({ color, className = "size-2.5" }: { color: PaletteColor; className?: string }) {
  return <span aria-hidden="true" className={`inline-block shrink-0 rounded-full ${className}`} style={{ backgroundColor: `var(--fin-${color})` } as CSSProperties} />;
}

/** 把顏色交給子元素的 --fin-color 給圖表與進度條用 */
export const finColor = (color: PaletteColor): CSSProperties => ({ "--fin-color": `var(--fin-${color})` }) as CSSProperties;
