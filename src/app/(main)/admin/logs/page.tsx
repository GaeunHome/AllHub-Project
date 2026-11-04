import { AuditLogPage } from "@/core/admin/audit-page";
import type { SearchParams } from "@/core/module";
import { modules } from "@/modules";

export default function Page({ searchParams }: { searchParams: SearchParams }) {
  return <AuditLogPage modules={modules} searchParams={searchParams} />;
}
