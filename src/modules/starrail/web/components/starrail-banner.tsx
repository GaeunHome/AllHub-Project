import Image from "next/image";
import type { ModuleInfo } from "@/core/module";
import { PageHeader } from "@/core/ui/page-header";

/** 頁面最上面的官方標誌：它就是標題（alt 當 h1 的文字），不再重複寫一次「星穹鐵道」；直接放在整頁的星空上，行星與軌道環是整頁背景的一部分 */
export function StarrailBanner({ info }: { info: ModuleInfo }) {
  return (
    <PageHeader
      title={
        // 原圖四周留白很多，裁成 3:2 只留字樣與月牙；不經 Vercel 的圖片最佳化
        <Image
          src="/images/starrail-logo.png"
          alt={info.name}
          width={400}
          height={400}
          unoptimized
          loading="eager"
          className="mx-auto block aspect-[3/2] h-auto w-52 object-cover object-[50%_61%] drop-shadow-[0_4px_18px_rgb(56_189_248/0.35)] sm:mx-0 sm:w-64"
        />
      }
    />
  );
}
