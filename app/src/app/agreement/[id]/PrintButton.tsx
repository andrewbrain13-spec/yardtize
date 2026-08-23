"use client";

import { buttonClass } from "@/components/ui";

/**
 * Printing is the point of this page — there is no e-signature yet, so both
 * parties put ink on paper (or save a PDF from the print dialog).
 */
export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className={`${buttonClass()} print:hidden`}>
      Print or save as PDF
    </button>
  );
}
