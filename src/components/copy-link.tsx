"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

export function CopyLink({ url, label = "Copy customer link" }: { url: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          window.prompt("Copy this link:", url);
        }
      }}
    >
      {copied ? "Copied!" : label}
    </Button>
  );
}
