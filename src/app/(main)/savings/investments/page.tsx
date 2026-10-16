import { savingsInfo } from "@/modules/savings/info";
import { InvestmentsPage } from "@/modules/savings/web/pages/investments-page";

export default function Page({ searchParams }: PageProps<"/savings/investments">) {
  return <InvestmentsPage info={savingsInfo} searchParams={searchParams} />;
}
