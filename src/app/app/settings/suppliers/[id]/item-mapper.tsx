"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui";
import { CALC_KEYS } from "@/lib/calc-keys";
import { mapItem } from "../actions";

export function CalcKeyOptions() {
  return (
    <>
      <option value="">Not mapped</option>
      {CALC_KEYS.map((k) => <option key={k.key} value={k.key}>{k.label} ({k.unit})</option>)}
    </>
  );
}

/** Per-row calc-key picker that saves on change. */
export function ItemKeySelect({ itemId, value }: { itemId: string; value: string | null }) {
  const router = useRouter();
  const [v, setV] = useState(value ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="block">
      <Select
        aria-label="Estimating item"
        value={v}
        disabled={pending}
        className="min-h-10 min-w-44"
        onChange={(e) => {
          const next = e.target.value;
          setV(next);
          start(async () => {
            const r = await mapItem(itemId, next);
            setMsg(r.error ?? null);
            if (!r.error) router.refresh();
          });
        }}
      >
        <CalcKeyOptions />
      </Select>
      {msg && <span role="alert" className="text-xs text-red-700">{msg}</span>}
    </span>
  );
}
