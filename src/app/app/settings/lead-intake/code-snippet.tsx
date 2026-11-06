import { CopyLink } from "@/components/copy-link";

/** Read-only code block with a copy button; scrolls horizontally inside itself on phones. */
export function CodeSnippet({ code, label = "Copy" }: { code: string; label?: string }) {
  return (
    <div className="min-w-0">
      <pre className="max-w-full overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs leading-relaxed text-slate-100"><code>{code}</code></pre>
      <div className="mt-2"><CopyLink url={code} label={label} /></div>
    </div>
  );
}
