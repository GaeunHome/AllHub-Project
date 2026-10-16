import { savingsInfo } from "@/modules/savings/info";
import { AccountsPage } from "@/modules/savings/web/pages/accounts-page";

export default function Page({ searchParams }: PageProps<"/savings/accounts">) {
  return <AccountsPage info={savingsInfo} searchParams={searchParams} />;
}
