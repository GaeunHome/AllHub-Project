import { savingsInfo } from "@/modules/savings/info";
import { SavingsPage } from "@/modules/savings/web/pages/savings-page";

export default function Page() {
  return <SavingsPage info={savingsInfo} />;
}
