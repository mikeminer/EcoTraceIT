export interface OffsetResult {
  status: "quoted" | "reserved";
  amount: number;
  currency: "EUR";
  externalId?: string;
}

export async function quoteOffset(emissionsKg: number, pricePerKg = 0.30): Promise<OffsetResult> {
  return {
    status: "quoted",
    amount: Math.max(0.01, Math.round(emissionsKg * pricePerKg * 100) / 100),
    currency: "EUR",
  };
}

export async function reserveOffset(orderId: string, emissionsKg: number): Promise<OffsetResult> {
  if (!process.env.OFFSET_API_URL || !process.env.OFFSET_API_KEY) {
    return {...await quoteOffset(emissionsKg), externalId: "sandbox-" + orderId};
  }
  const response = await fetch(process.env.OFFSET_API_URL, {
    method: "POST",
    signal: AbortSignal.timeout(4000),
    headers: {Authorization: "Bearer " + process.env.OFFSET_API_KEY, "Content-Type": "application/json"},
    body: JSON.stringify({reference: orderId, carbon_kg: emissionsKg}),
  });
  if (!response.ok) throw new Error("Offset provider returned " + response.status);
  const data = await response.json() as {id: string; amount: number};
  return {status: "reserved", amount: data.amount, currency: "EUR", externalId: data.id};
}