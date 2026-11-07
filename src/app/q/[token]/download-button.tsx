"use client";

/** Opens the browser print dialog; "Save as PDF" gives the homeowner a signed copy. */
export function DownloadPdfButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex min-h-11 items-center rounded-lg bg-brand-500 px-5 py-2 text-sm font-medium text-white hover:bg-brand-600"
    >
      Download PDF
    </button>
  );
}
