import Image from "next/image";
import type { ReactNode } from "react";

/** 場景圖只是背景 不帶資訊 alt 留空 畫面最上面的圖常常是 LCP 不延遲載入而且先下載 */
export function SceneImage({ src, eager = false }: { src: string; eager?: boolean }) {
  return (
    <>
      <Image src={src} alt="" fill unoptimized loading={eager ? "eager" : "lazy"} fetchPriority={eager ? "high" : undefined} sizes="100vw" className="scene-image" />
      <span aria-hidden className="scene-scrim" />
    </>
  );
}

type SceneProps = { src: string; eager?: boolean; className?: string; children: ReactNode };

/** 字疊在圖上的區塊 字色固定是白的 不換 CSS 變數 裡面的視窗才不會跟著變白 */
export function Scene({ src, eager, className, children }: SceneProps) {
  return (
    <div className={className ? `scene ${className}` : "scene"}>
      <SceneImage src={src} eager={eager} />
      {children}
    </div>
  );
}
