import Link from "next/link";
import { EmptyState } from "@/core/ui/empty-state";
import { Icon } from "@/core/ui/icon";
import { SetupCard } from "../setup-card";
import { SAVINGS_PATHS } from "../../paths";

/** 還沒有帳戶時取代整個總覽 第一次使用時先建議建立預設的用途和分類 */
export function WelcomeCard({ firstTime }: { firstTime: boolean }) {
  if (!firstTime) {
    return (
      <EmptyState
        icon="landmark"
        title="還沒有帳戶"
        hint="新增存款、投資或信用卡帳戶後，這裡會顯示總資產、收支與預算。"
        action={
          <Link href={SAVINGS_PATHS.addAccount} className="btn-primary">
            <Icon name="plus" className="size-4" />
            新增帳戶
          </Link>
        }
      />
    );
  }
  return <SetupCard withAccountLink />;
}
