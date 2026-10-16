/**
 * 細長條 數字另外寫成文字 長條只是畫面
 * 顏色一律中性 超過 100% 畫滿 狀態寫在旁邊的字
 */
export function Meter({ percent, className = "" }: { percent: number; className?: string }) {
  const width = Math.min(100, Math.max(0, percent));
  return (
    <span aria-hidden="true" className={`fin-meter ${className}`}>
      <span style={{ width: `${width}%` }} />
    </span>
  );
}
