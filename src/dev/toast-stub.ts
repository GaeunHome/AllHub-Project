import type { ReactNode } from "react";
import { createToastApi, type ToastContent } from "@/core/ui/toast-queue";

// 用 vi.mock("@/core/ui/toast", () => import("@/dev/toast-stub")) 換掉
// 跳出的提示照順序記在 toasts vitest-setup.ts 每個測試前清空

export const toasts: ToastContent[] = [];

const api = createToastApi((content) => void toasts.push(content));

export const useToast = () => api;

export function ToastProvider({ children }: { children: ReactNode }) {
  return children;
}
