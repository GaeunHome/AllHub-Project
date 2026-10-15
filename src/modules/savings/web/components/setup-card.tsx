import Link from "next/link";
import { Icon } from "@/core/ui/icon";
import { CardHeader } from "@/core/ui/page-header";
import { SAVINGS_PATHS } from "../paths";
import { SetupButton } from "./forms/setup-button";

/** 還沒有用途與分類時先建預設的 總覽上還沒有帳戶時順便放新增帳戶 */
export function SetupCard({ withAccountLink = false }: { withAccountLink?: boolean }) {
  return (
    <section aria-labelledby="savings-setup" className="card fin-rise stack">
      <CardHeader id="savings-setup" icon={<Icon name="sparkles" />}>
        第一次使用？
      </CardHeader>
      <p className="text-ink">先建立常用的用途和分類（之後都能改），再新增帳戶。</p>
      <div className="button-row">
        <SetupButton />
        {withAccountLink && (
          <Link href={SAVINGS_PATHS.addAccount} className="btn-secondary">
            <Icon name="plus" className="size-4" />
            新增帳戶
          </Link>
        )}
      </div>
    </section>
  );
}
