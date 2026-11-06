"use client";

import { Input } from "@/components/ui";
import { formatAbn, isValidAbn } from "@/lib/au";

const MESSAGE = "That ABN isn't valid. Check the 11 digits (it must pass the ATO check).";

/** ABN field that checks the ATO check digits as you type, so a typo never submits (and never clears the form). */
export function AbnInput({ defaultValue }: { defaultValue: string }) {
  const check = (el: HTMLInputElement) => {
    const digits = el.value.replace(/\s/g, "");
    el.setCustomValidity(digits && !isValidAbn(digits) ? MESSAGE : "");
  };
  return (
    <Input
      name="abn"
      inputMode="numeric"
      defaultValue={defaultValue}
      placeholder="51 824 753 556"
      aria-label="ABN"
      onChange={(e) => check(e.currentTarget)}
      onBlur={(e) => {
        const d = e.currentTarget.value.replace(/\s/g, "");
        if (/^\d{11}$/.test(d)) e.currentTarget.value = formatAbn(d);
        check(e.currentTarget);
      }}
    />
  );
}
