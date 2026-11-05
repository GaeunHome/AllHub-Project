"use client";

import { Icon } from "@/core/ui/icon";
import { useToast } from "@/core/ui/toast";

type CopyTripButtonProps = {
  text: string;
  label: string;
  className: string;
  /** 只放圖示 字給報讀器 看板的欄位標題放不下 */
  iconOnly?: boolean;
};

/** 放在選單裡也用得上 結果用提示視窗 CopyButton 的字寫在旁邊 選單收起後看不到 */
export function CopyTripButton({ text, label, className, iconOnly = false }: CopyTripButtonProps) {
  const toast = useToast();
  const copy = () =>
    navigator.clipboard.writeText(text).then(
      () => toast.success("已複製，可以貼到 LINE"),
      () => toast.error("瀏覽器擋下了複製，請確認網址是 https 再試一次"),
    );
  return (
    <button type="button" onClick={copy} data-closes-menu aria-label={iconOnly ? label : undefined} title={iconOnly ? label : undefined} className={className}>
      <Icon name="copy" className="size-4" />
      {!iconOnly && label}
    </button>
  );
}
