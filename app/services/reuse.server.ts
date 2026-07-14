import prisma from "../db.server";

export const REUSE_STATUSES = ["AVAILABLE", "IN_CIRCULATION", "RETURN_REQUESTED", "RETURNED", "RETIRED"] as const;
export type ReuseStatus = typeof REUSE_STATUSES[number];
export type ReuseEventType = "SHIP" | "REQUEST_RETURN" | "RECEIVE" | "INSPECT_PASS" | "INSPECT_FAIL" | "RETIRE";

const transitions: Record<ReuseEventType, Partial<Record<ReuseStatus, ReuseStatus>>> = {
  SHIP: {AVAILABLE: "IN_CIRCULATION"},
  REQUEST_RETURN: {IN_CIRCULATION: "RETURN_REQUESTED"},
  RECEIVE: {IN_CIRCULATION: "RETURNED", RETURN_REQUESTED: "RETURNED"},
  INSPECT_PASS: {RETURNED: "AVAILABLE"},
  INSPECT_FAIL: {RETURNED: "RETIRED"},
  RETIRE: {AVAILABLE: "RETIRED", IN_CIRCULATION: "RETIRED", RETURN_REQUESTED: "RETIRED", RETURNED: "RETIRED"},
};

export function nextReuseStatus(current: string, eventType: ReuseEventType) {
  const next = transitions[eventType][current as ReuseStatus];
  if (!next) throw new Error(`Transizione riuso non valida: ${current} -> ${eventType}`);
  return next;
}

export async function registerReusableUnit(shop: string, profileId: string, serialNumber: string) {
  const normalizedSerial = serialNumber.trim();
  if (!/^[A-Za-z0-9._-]{3,80}$/.test(normalizedSerial)) throw new Error("Seriale non valido: usa 3-80 caratteri alfanumerici, punto, trattino o underscore.");
  const profile = await prisma.packagingProfile.findFirst({where: {id: profileId, shop, status: "DECLARED", isReusable: true}});
  if (!profile?.reuseCycles || profile.reuseCycles < 2) throw new Error("Serve un profilo riutilizzabile dichiarato con cicli verificati.");
  return prisma.reusablePackagingUnit.create({data: {shop, profileId, serialNumber: normalizedSerial, maxCycles: profile.reuseCycles}});
}

export async function recordReuseEvent(input: {shop: string; unitId: string; eventType: ReuseEventType; orderGid?: string; carrier?: string; trackingNumber?: string; condition?: string; notes?: string}) {
  return prisma.$transaction(async (tx) => {
    const unit = await tx.reusablePackagingUnit.findFirst({where: {id: input.unitId, shop: input.shop}});
    if (!unit) throw new Error("Unità riutilizzabile non trovata.");
    const status = nextReuseStatus(unit.status, input.eventType);
    if (input.eventType === "RETIRE" && !input.notes?.trim()) throw new Error("Indica il motivo del ritiro dal circuito.");
    if (input.eventType === "SHIP" && unit.cycleCount >= unit.maxCycles) throw new Error("Numero massimo di cicli raggiunto.");
    const now = new Date();
    const cycleCount = input.eventType === "SHIP" ? unit.cycleCount + 1 : unit.cycleCount;
    const update = await tx.reusablePackagingUnit.updateMany({where: {id: unit.id, status: unit.status, cycleCount: unit.cycleCount}, data: {
      status, cycleCount,
      ...(input.eventType === "SHIP" ? {lastOrderGid: input.orderGid, lastCarrier: input.carrier, lastTrackingNumber: input.trackingNumber, lastShippedAt: now} : {}),
      ...(input.eventType === "RECEIVE" ? {lastReturnedAt: now} : {}),
    }});
    if (update.count !== 1) throw new Error("Conflitto di aggiornamento: ricarica lo stato dell'unità.");
    await tx.reuseEvent.create({data: {unitId: unit.id, eventType: input.eventType, orderGid: input.orderGid, carrier: input.carrier, trackingNumber: input.trackingNumber, condition: input.condition, notes: input.notes}});
    return tx.reusablePackagingUnit.findUniqueOrThrow({where: {id: unit.id}});
  });
}
