import { Suspense } from "react";
import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Connect" };

export default function LoginPage() {
  const defaultUrl = process.env.FIREFLY_URL || "";
  return (
    <Suspense>
      <LoginForm defaultUrl={defaultUrl} />
    </Suspense>
  );
}
