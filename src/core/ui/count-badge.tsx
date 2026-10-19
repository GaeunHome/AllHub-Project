/**
 * 未讀數的小圓標 0 不顯示 超過 99 寫 99+ 報讀器聽到幾則未讀
 * hidden 給按鈕名稱已經念了數字的地方 例如鈴鐺
 */
export function CountBadge({ count, className, hidden = false }: { count: number; className?: string; hidden?: boolean }) {
  if (count <= 0) return null;
  return (
    <span aria-hidden={hidden || undefined} className={className ? `count-badge ${className}` : "count-badge"}>
      {count > 99 ? "99+" : count}
      {!hidden && <span className="sr-only"> 則未讀</span>}
    </span>
  );
}
