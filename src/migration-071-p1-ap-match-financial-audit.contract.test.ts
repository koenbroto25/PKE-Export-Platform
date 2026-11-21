import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../migrations/071_p3_financial_audit_and_ap_match_integrity.sql", import.meta.url),
  "utf8",
);

describe("Migration 071 — P1 AP match integrity and P3 financial audit", () => {
  it("enforces one verified goods receipt match per Project/AP invoice", () => {
    expect(migration).toContain("p1_goods_receipt_match_one_verified_per_invoice_uq");
    expect(migration).toContain("CREATE UNIQUE INDEX IF NOT EXISTS");
    expect(migration).toContain("record_type='goods_receipt_match'");
    expect(migration).toContain("status='verified'");
  });

  it("keeps the verified-match lookup private and security-definer scoped", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.pke_ap_has_verified_three_way_match");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path TO 'pg_catalog', 'public'");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.pke_ap_has_verified_three_way_match");
  });

  it("rejects direct AP match metadata writes and direct verification without a verified P1 match", () => {
    expect(migration).toContain("AP verification and three-way match metadata are workflow-managed");
    expect(migration).toContain("AP match/verification requires a verified same-Project PO/GRN/invoice match");
    expect(migration).toContain("BEFORE INSERT OR UPDATE OR DELETE ON public.ap_invoices");
    expect(migration).not.toContain("pg_trigger_depth()");
  });

  it("requires the P1 matched-to-verified transition and rejects direct verified inserts", () => {
    expect(migration).toContain("A goods receipt match must be created as draft and transition through matched before verification");
    expect(migration).toContain("Only a matched goods receipt workflow can transition to verified");
    expect(migration).toContain("OLD.status<>'matched'");
  });

  it("validates same-Project PO, GRN and invoice values against P1 workflow fields", () => {
    for (const field of [
      "purchaseOrderRecordId",
      "warehouseReceiptId",
      "apInvoiceId",
      "matchedQuantity",
      "matchedAmount",
      "unitCode",
      "currencyCode",
    ]) expect(migration).toContain(field);
    expect(migration).toContain("procurement.match.create");
    expect(migration).toContain("PO/GRN/AP invoice quantity or amount three-way match failed");
  });

  it("makes verified match evidence and referenced PO/GRN source values immutable", () => {
    expect(migration).toContain("trg_pke_verified_goods_receipt_match_immutable");
    expect(migration).toContain("trg_pke_verified_match_po_source_guard");
    expect(migration).toContain("trg_pke_verified_match_grn_source_guard");
    expect(migration).toContain("A Purchase Order referenced by a verified three-way match is immutable");
    expect(migration).toContain("A GRN referenced by a verified three-way match is immutable");
  });

  it("captures complete AP and AR before/after snapshots on every material update", () => {
    expect(migration).toContain("AFTER UPDATE ON public.ap_invoices");
    expect(migration).toContain("AFTER UPDATE ON public.ar_invoices");
    expect(migration).toContain("before_snapshot,after_snapshot,metadata,outcome");
    expect(migration).toContain("to_jsonb(OLD)-'updated_at'");
    expect(migration).toContain("changed_fields");
    expect(migration).toContain("ap_invoice.three_way_match_linked");
    expect(migration).toContain("v_permission:='procurement.match.create'");
  });

  it("asserts the required triggers and uniqueness index in migration postconditions", () => {
    expect(migration).toContain("DO $postconditions$");
    expect(migration).toContain("p1_goods_receipt_match_one_verified_per_invoice_uq");
    expect(migration).toContain("trg_pke_ap_invoice_audit");
    expect(migration).toContain("trg_pke_ar_invoice_audit");
  });
});
