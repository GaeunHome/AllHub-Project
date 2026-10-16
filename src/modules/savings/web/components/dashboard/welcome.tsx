import Link from "next/link";
import { Icon } from "@/core/ui/icon";
import { SetupCard } from "../setup-card";
import { SAVINGS_PATHS } from "../../paths";

/** 還沒有帳戶時取代整個總覽 第一次使用時先建議建立預設的用途和分類 */
export function WelcomeCard({ firstTime }: { firstTime: boolean }) {
  if (firstTime) return <SetupCard withAccountLink />;
  return (
    <section aria-label="還沒有帳戶" className="card stack">
      <p className="text-ink">還沒有帳戶。新增存款、投資或信用卡帳戶後，這裡會顯示總資產與每月收支。</p>
      <div className="button-row">
        <Link href={SAVINGS_PATHS.addAccount} className="btn-primary">
          <Icon name="plus" className="size-4" />
          新增帳戶
        </Link>
      </div>
    </section>
  );
}
