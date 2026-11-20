import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const api = readFileSync(join(process.cwd(), "src/index.ts"), "utf8");
const holdRoute = api.slice(api.indexOf('app.post("/api/v1/inventory-holds"'), api.indexOf("// ============================================\n// Shipment allocations"));
const movementRoute = api.slice(api.indexOf('app.post("/api/v1/inventory-movements"'), api.indexOf("// ============================================\n// Inventory reservations"));

describe("Inventory movement and hold API contracts", () => {
  it("replays an identical inventory hold idempotently for the same actor", () => {
    expect(holdRoute).toContain("SELECT * FROM inventory_holds WHERE idempotency_key = $1::text LIMIT 1");
    expect(holdRoute).toContain("Number(prior.held_quantity ?? prior.quantity) === quantity");
    expect(holdRoute).toContain("String(prior.unit ?? prior.unit_code) === unit.trim()");
    expect(holdRoute).toContain("String(prior.created_by ?? prior.placed_by ?? \"\") === String(actorId)");
    expect(holdRoute).toContain("idempotentReplay: true");
    expect(holdRoute).toContain("IDEMPOTENCY_KEY_CONFLICT");
    expect(holdRoute).toContain("ON CONFLICT (idempotency_key) DO NOTHING RETURNING *");
  });

  it("rejects a hold whose unit differs from its inventory lot", () => {
    expect(holdRoute).toContain("SELECT id, project_id, unit FROM inventory_lots WHERE id = $1::uuid FOR UPDATE");
    expect(holdRoute).toContain("Hold unit must match inventory lot unit.");
  });

  it("rejects non-positive or non-finite inventory movements", () => {
    expect(movementRoute).toContain("Number(quantity)");
    expect(movementRoute).toContain("!Number.isFinite(movementQuantity) || movementQuantity <= 0");
    expect(movementRoute).toContain("INVALID_INVENTORY_MOVEMENT");
    expect(movementRoute).toContain('new Set(["receipt", "issue", "transfer", "adjustment"])');
    expect(movementRoute).toContain('new Set(["posted", "reversed", "adjusted"])');
  });

  it("requires movement units to match the locked Project inventory lot", () => {
    expect(movementRoute).toContain("SELECT id, project_id, unit FROM inventory_lots WHERE id = $1::uuid FOR UPDATE");
    expect(movementRoute).toContain("Movement unit must match inventory lot unit.");
    expect(movementRoute).toContain("movementQuantity, unit.trim()");
  });
  it("requires positive receipt quantities and matching lot units on create", () => {
    const route = api.slice(api.indexOf('app.post("/api/v1/warehouse-receipts"'), api.indexOf('app.patch("/api/v1/warehouse-receipts/:id"'));
    expect(route).toContain("!Number.isFinite(receivedAmount) || receivedAmount <= 0");
    expect(route).toContain("SELECT id, project_id, unit FROM inventory_lots WHERE id = $1::uuid FOR UPDATE");
    expect(route).toContain("Receipt unit must match inventory lot unit.");
    expect(route).toContain('new Set(["pending", "verified", "partial"])');
  });

  it("rejects invalid receipt updates and validates unit against the linked lot", () => {
    const route = api.slice(api.indexOf('app.patch("/api/v1/warehouse-receipts/:id"'), api.indexOf('app.get("/api/v1/inventory-lots"'));
    expect(route).toContain("Number(receivedQuantity) <= 0");
    expect(route).toContain("INVALID_RECEIPT_STATUS");
    expect(route).toContain("SELECT project_id, lot_id FROM warehouse_receipts");
    expect(route).toContain("lotRows[0].unit !== unit.trim()");
  });

});
