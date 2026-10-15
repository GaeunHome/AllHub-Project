import { savingsInfo } from "@/modules/savings/info";
import { SettingsPage } from "@/modules/savings/web/pages/settings-page";

export default function Page({ searchParams }: PageProps<"/savings/settings">) {
  return <SettingsPage info={savingsInfo} searchParams={searchParams} />;
}
