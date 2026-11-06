// Taxable payments annual report (TPAR) working file. Pure helpers.
// Source: research_notes/.../insurance_payments_warranties.md §4 (ATO TPAR, building and construction):
// businesses primarily in building and construction that pay contractors for building and construction
// services report those payments for the financial year (1 July – 30 June) by 28 August. Employee wages
// are excluded; where an invoice covers labour and materials, the total is reported.

export type FinancialYear = { start: string; end: string; label: string; dueDate: string; startYear: number };

/** The Australian financial year containing `iso` (YYYY-MM-DD), or starting in `startYear`. */
export function financialYear(iso: string): FinancialYear {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  return fyFromStart(m >= 7 ? y : y - 1);
}
export function fyFromStart(startYear: number): FinancialYear {
  return {
    startYear,
    start: `${startYear}-07-01`,
    end: `${startYear + 1}-06-30`,
    label: `${startYear}–${String((startYear + 1) % 100).padStart(2, "0")}`,
    dueDate: `${startYear + 1}-08-28`,
  };
}

export type TparCost = { id: string; amount: number | string; incurred_on: string; vendor: string | null; source: string; source_id: string | null; category: string };
export type TparCrew = { id: string; name: string; abn: string | null; gst_registered: boolean; phone: string | null; is_subcontractor?: boolean };
export type TparRow = {
  key: string;
  crewId: string | null;
  name: string;
  abn: string | null;
  phone: string | null;
  gstRegistered: boolean;
  payments: number;
  /** As recorded on job costs (ex GST). */
  amountExGst: number;
  gst: number;
  /** Gross amount paid including GST — what the TPAR reports. */
  gross: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Contractor payments for the TPAR: crew-pay job costs (linked to the crew) and labour job costs whose
 * vendor matches a crew. Labour costs from vendors that aren't set up as crews are included too, without
 * an ABN, so nothing is silently left out. Job cost amounts are recorded excluding GST.
 */
export function buildTpar(costs: TparCost[], crews: TparCrew[], fy: FinancialYear): TparRow[] {
  const byId = new Map(crews.map((c) => [c.id, c]));
  const byName = new Map(crews.map((c) => [c.name.trim().toLowerCase(), c]));
  const rows = new Map<string, TparRow>();
  for (const k of costs) {
    if (k.incurred_on < fy.start || k.incurred_on > fy.end) continue;
    const isCrewPay = k.source === "crew_pay";
    if (!isCrewPay && k.category !== "labor") continue;
    const crew = (isCrewPay && k.source_id ? byId.get(k.source_id) : undefined) ?? (k.vendor ? byName.get(k.vendor.trim().toLowerCase()) : undefined);
    if (crew && crew.is_subcontractor === false) continue; // employees' wages aren't reported
    const name = crew?.name ?? k.vendor?.trim() ?? "";
    if (!name) continue;
    const key = crew ? `crew:${crew.id}` : `vendor:${name.toLowerCase()}`;
    const row = rows.get(key) ?? { key, crewId: crew?.id ?? null, name, abn: crew?.abn ?? null, phone: crew?.phone ?? null, gstRegistered: crew?.gst_registered ?? false, payments: 0, amountExGst: 0, gst: 0, gross: 0 };
    row.payments++;
    row.amountExGst = r2(row.amountExGst + Number(k.amount));
    rows.set(key, row);
  }
  for (const r of rows.values()) {
    r.gst = r.gstRegistered ? r2(r.amountExGst * 0.1) : 0;
    r.gross = r2(r.amountExGst + r.gst);
  }
  return [...rows.values()].filter((r) => r.amountExGst !== 0).sort((a, b) => a.name.localeCompare(b.name));
}

function cell(v: unknown) {
  if (v === null || v === undefined) return "";
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // spreadsheet formula injection guard
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const TPAR_COLUMNS = ["Payee name", "Payee ABN", "Payee phone", "Gross amount paid (inc GST)", "GST", "Tax withheld", "Number of payments", "Financial year", "Note"];

export function tparCsv(rows: TparRow[], fy: FinancialYear): string {
  const lines = [TPAR_COLUMNS.join(",")];
  for (const r of rows) {
    lines.push(
      [r.name, r.abn ?? "", r.phone ?? "", r.gross.toFixed(2), r.gst.toFixed(2), "0.00", r.payments, fy.label, r.abn ? "" : "ABN missing — add it before lodging"]
        .map(cell)
        .join(","),
    );
  }
  return "﻿" + lines.join("\r\n") + "\r\n";
}
