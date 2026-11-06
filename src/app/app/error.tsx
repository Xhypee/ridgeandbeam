"use client";

import { Button } from "@/components/ui";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md rounded-xl bg-white p-6 text-center ring-1 ring-slate-200">
      <h2 className="text-lg font-semibold">Something went wrong</h2>
      <p className="mt-2 text-sm text-slate-600">{error.message || "Please try again."}</p>
      <Button className="mt-4" onClick={reset}>Try again</Button>
    </div>
  );
}
