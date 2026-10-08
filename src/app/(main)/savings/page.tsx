import { savingsInfo } from "@/modules/savings/info";
import { SavingsPage } from "@/modules/savings/web/pages/savings-page";

export default function Page({ searchParams }: PageProps<"/savings">) {
  return <SavingsPage info={savingsInfo} searchParams={searchParams} />;
}
