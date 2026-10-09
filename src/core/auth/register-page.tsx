import { headers } from "next/headers";
import Link from "next/link";
import { after, connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { logError } from "../errors";
import { formatTaipeiDateTime } from "../time";
import { Icon } from "../ui/icon";
import { Skeleton } from "../ui/skeleton";
import { currentSession } from ".";
import { AuthCard } from "./auth-card";
import { logout } from "./actions";
import { INVITE_FAILURES, checkAttempts, clientKey, recordAttempt } from "./attempts";
import { findUsableInvite } from "./invites";
import { clientIp } from "./rate-limit";
import { captchaImageUrl } from "./messages";
import { RegisterForm } from "./register-form";
import { INVITE_INVALID_MESSAGE } from "./registration";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** 公開頁面（proxy 不擋）：只有帶著有效邀請碼才顯示表單，送出時 registerAction 會再檢查一次 */
export function RegisterPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <AuthCard title="加入 AllHub" subtitle="用站長給你的邀請連結建立帳號">
      <Suspense fallback={<RegisterSkeleton />}>
        <RegisterGate searchParams={searchParams} />
      </Suspense>
      <p className="text-center leading-relaxed">
        已經有帳號了？
        <Link href="/login" className="link">
          登入
        </Link>
        <span aria-hidden> · </span>
        <Link href="/terms" className="link">
          使用聲明
        </Link>
      </p>
    </AuthCard>
  );
}

export async function RegisterGate({ searchParams }: { searchParams: SearchParams }) {
  const [params, request] = await Promise.all([searchParams, headers()]);
  // 已登入的人送出註冊會換掉目前的登入，先請他登出
  const session = await currentSession();
  if (session) return <SignedInNotice username={session.username} />;

  const code = typeof params.code === "string" ? params.code : "";
  if (!code) return <Notice icon="info">需要站長的邀請連結才能註冊。拿到連結後直接打開就好；網站不開放自行註冊。</Notice>;

  // 預先抓取與預先算繪時停在這裡：不查邀請、不記失敗次數，只有真正打開連結的請求才算一次
  await connection();
  const check = await checkInvite(code, clientKey(clientIp(request.get("x-forwarded-for"))), new Date());
  switch (check.kind) {
    case "blocked":
      return <Notice icon="circle-alert">嘗試次數太多，請 {Math.ceil(check.retryAfterMs / 60_000)} 分鐘後再試</Notice>;
    case "invalid":
      return <Notice icon="circle-alert">{INVITE_INVALID_MESSAGE}</Notice>;
    case "unavailable":
      return <Notice icon="circle-alert">暫時無法檢查邀請連結，請稍後再試</Notice>;
    case "usable":
      return <RegisterForm code={code} expiresAt={formatTaipeiDateTime(check.expiresAt)} captchaSrc={captchaImageUrl("register")} />;
  }
}

type InviteCheck = { kind: "blocked"; retryAfterMs: number } | { kind: "invalid" } | { kind: "unavailable" } | { kind: "usable"; expiresAt: Date };

async function checkInvite(code: string, key: string, now: Date): Promise<InviteCheck> {
  try {
    const gate = await checkAttempts(INVITE_FAILURES, key, now);
    if (!gate.allowed) return { kind: "blocked", retryAfterMs: gate.retryAfterMs };
    const invite = await findUsableInvite(code, now);
    if (invite) return { kind: "usable", expiresAt: invite.expiresAt };
    // 回應不必等寫入；記下失敗次數，猜邀請碼的人很快就會被擋下
    after(() => recordInviteFailure(key, now));
    return { kind: "invalid" };
  } catch (error) {
    // 錯誤訊息可能帶著查詢參數（邀請碼的雜湊），log 只記錯誤種類
    logError("auth", "檢查邀請連結時發生錯誤", error);
    return { kind: "unavailable" };
  }
}

async function recordInviteFailure(key: string, now: Date): Promise<void> {
  try {
    await recordAttempt(INVITE_FAILURES, key, now);
  } catch (error) {
    logError("auth", "記錄邀請碼失敗次數時發生錯誤", error);
  }
}

function Notice({ icon, children }: { icon: "info" | "circle-alert"; children: ReactNode }) {
  return (
    <p role="status" className="notice">
      <Icon name={icon} />
      <span>{children}</span>
    </p>
  );
}

function SignedInNotice({ username }: { username: string }) {
  return (
    <div className="stack">
      <Notice icon="info">
        目前已用 <strong>{username}</strong> 登入。要用邀請連結註冊新帳號，請先登出，或改用另一個瀏覽器打開連結。
      </Notice>
      <div className="button-row">
        <form action={logout}>
          <button className="btn-secondary">
            <Icon name="log-out" className="size-4" />
            登出
          </button>
        </form>
        <Link href="/" className="btn-ghost">
          回首頁
        </Link>
      </div>
    </div>
  );
}

function RegisterSkeleton() {
  return (
    <div role="status" aria-busy="true" className="stack">
      <span className="sr-only">載入中…</span>
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-11 rounded-lg" />
      ))}
    </div>
  );
}
