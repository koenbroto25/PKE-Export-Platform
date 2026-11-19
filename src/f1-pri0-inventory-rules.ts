export type ActiveReservationStatus = "active" | "partially_fulfilled";
export type ShipmentAllocationStatus = "draft" | "allocated" | "partially_loaded" | "loaded" | "cancelled" | "reversed";

export interface AllocationCapacityInput {
  projectId: string;
  shipmentProjectId: string;
  lotProjectId: string;
  reservationProjectId: string;
  reservationLotId: string;
  lotId: string;
  reservationShipmentId: string | null;
  shipmentId: string;
  reservationStatus: string;
  reservationQuantity: number;
  existingReservationAllocations: number;
  shipmentQuantity: number;
  existingShipmentAllocations: number;
  allocationQuantity: number;
  unitMatches: boolean;
}

export type RuleResult = { ok: true } | { ok: false; code: string };

export function validateAllocationCapacity(input: AllocationCapacityInput): RuleResult {
  if (![input.reservationQuantity, input.existingReservationAllocations, input.shipmentQuantity,
    input.existingShipmentAllocations, input.allocationQuantity].every(Number.isFinite) ||
    input.allocationQuantity <= 0 || input.existingReservationAllocations < 0 ||
    input.existingShipmentAllocations < 0) {
    return { ok: false, code: "INVALID_ALLOCATION_QUANTITY" };
  }
  if (input.projectId !== input.shipmentProjectId || input.projectId !== input.lotProjectId ||
      input.projectId !== input.reservationProjectId) {
    return { ok: false, code: "PROJECT_SCOPE_MISMATCH" };
  }
  if (input.reservationLotId !== input.lotId ||
      (input.reservationShipmentId !== null && input.reservationShipmentId !== input.shipmentId)) {
    return { ok: false, code: "RESERVATION_SCOPE_MISMATCH" };
  }
  if (input.reservationStatus !== "active" && input.reservationStatus !== "partially_fulfilled") {
    return { ok: false, code: "RESERVATION_NOT_ACTIVE" };
  }
  if (!input.unitMatches) return { ok: false, code: "UNIT_MISMATCH" };

  // Allocated quantity remains reserved until the allocation is cancelled/reversed.
  // Do not subtract fulfilled_quantity again: loaded allocations are already included
  // in existingReservationAllocations, so doing both would double-count consumption.
  if (input.existingReservationAllocations + input.allocationQuantity > input.reservationQuantity) {
    return { ok: false, code: "RESERVATION_QUANTITY_EXCEEDED" };
  }
  if (input.existingShipmentAllocations + input.allocationQuantity > input.shipmentQuantity) {
    return { ok: false, code: "SHIPMENT_QUANTITY_EXCEEDED" };
  }
  return { ok: true };
}

export interface AllocationTransitionInput {
  currentStatus: ShipmentAllocationStatus;
  nextStatus?: ShipmentAllocationStatus;
  currentLoadedQuantity: number;
  nextLoadedQuantity?: number;
  allocatedQuantity: number;
  reversalReason?: string;
}

export function validateAllocationTransition(input: AllocationTransitionInput): RuleResult {
  const currentLoaded = Number(input.currentLoadedQuantity);
  const nextLoaded = input.nextLoadedQuantity === undefined ? currentLoaded : Number(input.nextLoadedQuantity);
  const allocated = Number(input.allocatedQuantity);
  if (![currentLoaded, nextLoaded, allocated].every(Number.isFinite) ||
      allocated <= 0 || currentLoaded < 0 || currentLoaded > allocated ||
      nextLoaded < 0 || nextLoaded > allocated) {
    return { ok: false, code: "INVALID_LOADED_QUANTITY" };
  }
  if (!input.nextStatus && input.nextLoadedQuantity === undefined) {
    return { ok: false, code: "NO_ALLOCATION_CHANGE" };
  }
  if (input.nextLoadedQuantity !== undefined && input.nextStatus === undefined &&
      input.currentStatus !== "partially_loaded") {
    return { ok: false, code: "STATUS_REQUIRED_FOR_LOADING" };
  }

  const nextStatus = input.nextStatus ?? input.currentStatus;
  const allowed: Record<ShipmentAllocationStatus, readonly ShipmentAllocationStatus[]> = {
    draft: ["allocated", "cancelled"],
    allocated: ["partially_loaded", "loaded", "cancelled"],
    partially_loaded: ["partially_loaded", "loaded", "reversed"],
    loaded: ["reversed"],
    cancelled: [],
    reversed: [],
  };
  if (nextStatus !== input.currentStatus && !allowed[input.currentStatus].includes(nextStatus)) {
    return { ok: false, code: "INVALID_ALLOCATION_TRANSITION" };
  }

  if (nextStatus === "allocated" && nextLoaded !== 0) return { ok: false, code: "INVALID_ALLOCATION_TRANSITION" };
  if (nextStatus === "cancelled" && nextLoaded !== 0) return { ok: false, code: "INVALID_ALLOCATION_TRANSITION" };
  if (nextStatus === "partially_loaded" && !(nextLoaded > 0 && nextLoaded < allocated)) {
    return { ok: false, code: "INVALID_ALLOCATION_TRANSITION" };
  }
  if (nextStatus === "loaded" && nextLoaded !== allocated) return { ok: false, code: "INVALID_ALLOCATION_TRANSITION" };
  if (nextStatus === "reversed") {
    if (nextLoaded !== currentLoaded) return { ok: false, code: "INVALID_ALLOCATION_TRANSITION" };
    if (typeof input.reversalReason !== "string" || input.reversalReason.trim().length < 3) {
      return { ok: false, code: "REVERSAL_REASON_REQUIRED" };
    }
  }
  if (input.currentStatus === "loaded" && nextLoaded !== currentLoaded) {
    return { ok: false, code: "INVALID_ALLOCATION_TRANSITION" };
  }
  return { ok: true };
}
