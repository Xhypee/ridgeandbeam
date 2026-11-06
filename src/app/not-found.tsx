import { LinkButton } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-semibold">Not found</h1>
      <p className="text-sm text-slate-500">This page doesn&apos;t exist, or the link has expired.</p>
      <LinkButton href="/" variant="secondary">Go home</LinkButton>
    </div>
  );
}
