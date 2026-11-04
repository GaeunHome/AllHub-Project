import type { ReactNode } from "react";
import { Scene } from "./scene";

type PageBannerProps = {
  image: string;
  icon?: ReactNode;
  title: ReactNode;
  /** 右上角的按鈕 手機上換到標題下一行 */
  actions?: ReactNode;
  /** 排欄寫在橫幅自己身上 */
  className?: string;
  /** 標題下面的內容 例如總資產 */
  children?: ReactNode;
};

/** 有場景圖的頁首 理財 管理 帳號共用 圖永遠在畫面最上面 */
export function PageBanner({ image, icon, title, actions, className, children }: PageBannerProps) {
  return (
    <Scene src={image} eager className={className ? `page-banner ${className}` : "page-banner"}>
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3">
        {icon && <span className="scene-icon size-12 sm:size-14">{icon}</span>}
        <h1 className="min-w-40 flex-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">{title}</h1>
        {actions && <div className="button-row w-full sm:w-auto">{actions}</div>}
      </header>
      {children}
    </Scene>
  );
}
