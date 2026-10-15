import { savingsInfo } from "@/modules/savings/info";
import { RecordsPage } from "@/modules/savings/web/pages/records-page";

export default function Page({ searchParams }: PageProps<"/savings/records">) {
  return <RecordsPage info={savingsInfo} searchParams={searchParams} />;
}
