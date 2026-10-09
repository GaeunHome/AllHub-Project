import { LoginPage } from "@/core/auth/login-page";

export default function Page({ searchParams }: PageProps<"/login">) {
  return <LoginPage searchParams={searchParams} />;
}
