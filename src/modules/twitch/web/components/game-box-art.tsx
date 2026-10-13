import { externalAssetUrl } from "@/core/external-url";
import { ExternalImage } from "@/core/ui/external-image";
import { Icon } from "@/core/ui/icon";

const SIZES = {
  sm: { box: "h-12 w-9", icon: "size-4" },
  lg: { box: "h-20 w-15", icon: "size-5" },
} as const;

/** 遊戲封面（直播卡片用 sm、主播詳情用 lg）；讀不到時放手把圖示，版面一樣大 */
export function GameBoxArt({ url, size }: { url: string | null; size: keyof typeof SIZES }) {
  const { box, icon } = SIZES[size];
  return (
    <ExternalImage
      src={externalAssetUrl(url)}
      alt=""
      width={72}
      height={96}
      className={`${box} shrink-0 rounded bg-surface-muted object-cover`}
      fallback={
        <span aria-hidden className={`grid ${box} shrink-0 place-items-center rounded bg-surface-muted text-brand-ink`}>
          <Icon name="gamepad-2" className={icon} />
        </span>
      }
    />
  );
}
