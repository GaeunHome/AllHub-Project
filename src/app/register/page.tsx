import { RegisterPage } from "@/core/auth/register-page";

export default function Page({ searchParams }: PageProps<"/register">) {
  return <RegisterPage searchParams={searchParams} />;
}
