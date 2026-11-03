"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Flame } from "lucide-react";
import { Button, ErrorBox, Field, Input } from "@/components/ui";

export function LoginForm({ defaultUrl = "" }: { defaultUrl?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: form.get("url"), token: form.get("token") }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? "Could not connect.");
      router.replace(params.get("next") || "/");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-fg shadow-lg">
            <Flame className="size-7" aria-hidden />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Connect to Firefly III</h1>
          <p className="text-sm text-muted">Your token is kept encrypted on the server and never stored in the browser.</p>
        </div>
        <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6">
          {params.get("expired") && <ErrorBox error="Your session expired or the token was revoked. Please reconnect." />}
          <Field label="Firefly III URL" hint="e.g. https://firefly.example.com">
            {(id) => (
              <Input
                id={id}
                name="url"
                type="url"
                inputMode="url"
                autoComplete="url"
                spellCheck={false}
                autoCapitalize="none"
                defaultValue={defaultUrl}
                placeholder="https://firefly.example.com"
                enterKeyHint="next"
                required
              />
            )}
          </Field>
          <Field
            label="Personal Access Token"
            hint={<>Create one in Firefly III → Options → Profile → OAuth → Personal Access Tokens.</>}
          >
            {(id) => (
              <Input
                id={id}
                name="token"
                type="password"
                autoComplete="current-password"
                spellCheck={false}
                enterKeyHint="done"
                required
              />
            )}
          </Field>
          <ErrorBox error={error} />
          <Button type="submit" size="lg" loading={loading}>
            Connect
          </Button>
        </form>
      </div>
    </main>
  );
}
