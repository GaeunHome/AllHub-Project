import { Suspense } from "react";
import { SessionGuard } from "@/core/auth/session-guard";
import { AppShell } from "@/core/ui/app-shell";
import { modules } from "@/modules";

export default function MainLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      {/* 改密碼後舊 cookie 的簽章仍有效 proxy 擋不住 每頁都在這裡查一次資料庫 */}
      <Suspense fallback={null}>
        <SessionGuard />
      </Suspense>
      <AppShell modules={modules}>{children}</AppShell>
    </div>
  );
}
