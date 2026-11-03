import { AdminPage } from "@/core/admin/admin-page";
import { modules } from "@/modules";

export default function Page() {
  return <AdminPage modules={modules} />;
}
