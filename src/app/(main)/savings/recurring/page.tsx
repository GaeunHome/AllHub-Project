import { savingsInfo } from "@/modules/savings/info";
import { RecurringPage } from "@/modules/savings/web/pages/recurring-page";

export default function Page({ searchParams }: PageProps<"/savings/recurring">) {
  return <RecurringPage info={savingsInfo} searchParams={searchParams} />;
}
