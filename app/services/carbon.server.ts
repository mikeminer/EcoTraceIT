export interface CarbonInput {
  weightGrams: number;
  destinationCountry?: string;
  postalCode?: string;
  carrier?: string;
  distanceKm?: number;
}

export interface CarbonResult {
  emissionsKg: number;
  distanceKm: number;
  factorKgPerTonneKm: number;
  method: "formula" | "carbon-interface";
}

const FACTORS: Record<string, number> = {
  bike: 0,
  ev: 0.035,
  standard: 0.105,
  express: 0.18,
  air: 0.602,
};

const COUNTRY_DISTANCE: Record<string, number> = {
  IT: 450, FR: 900, DE: 1050, ES: 1450, AT: 850, BE: 1250, NL: 1350,
  PT: 1900, PL: 1500, CZ: 1200, DK: 1600, SE: 2200, IE: 2100, GR: 1700,
};

const round = (value: number) => Math.round(value * 1000) / 1000;

export function estimateDistance(country = "IT", postalCode = "") {
  if (country.toUpperCase() === "IT" && postalCode) {
    const prefix = Number(postalCode.slice(0, 2));
    if (Number.isFinite(prefix)) return Math.max(80, 180 + Math.abs(prefix - 20) * 14);
  }
  return COUNTRY_DISTANCE[country.toUpperCase()] ?? 1800;
}

export async function calculateCarbon(input: CarbonInput): Promise<CarbonResult> {
  const weightKg = Math.max(0.1, input.weightGrams / 1000);
  const distanceKm = input.distanceKm ?? estimateDistance(input.destinationCountry, input.postalCode);
  const carrier = (input.carrier || "standard").toLowerCase();
  const factor = FACTORS[carrier] ?? FACTORS.standard;
  const apiKey = process.env.CARBON_INTERFACE_API_KEY;

  if (apiKey && process.env.CARBON_API_PROVIDER === "carbon-interface") {
    try {
      const response = await fetch("https://www.carboninterface.com/api/v1/estimates", {
        method: "POST",
        signal: AbortSignal.timeout(2500),
        headers: {Authorization: "Bearer " + apiKey, "Content-Type": "application/json"},
        body: JSON.stringify({
          type: "shipping",
          weight_value: weightKg,
          weight_unit: "kg",
          distance_value: distanceKm,
          distance_unit: "km",
          transport_method: carrier === "air" ? "air" : "truck",
        }),
      });
      if (response.ok) {
        const json = await response.json() as {data?: {attributes?: {carbon_kg?: number}}};
        const kg = json.data?.attributes?.carbon_kg;
        if (typeof kg === "number") {
          return {emissionsKg: round(kg), distanceKm, factorKgPerTonneKm: factor, method: "carbon-interface"};
        }
      }
    } catch (error) {
      console.warn(JSON.stringify({event: "carbon_api_fallback", message: error instanceof Error ? error.message : "unknown"}));
    }
  }

  const transport = (weightKg / 1000) * distanceKm * factor;
  const lastMileAndPackaging = 0.08 + weightKg * 0.025;
  return {
    emissionsKg: round(transport + lastMileAndPackaging),
    distanceKm,
    factorKgPerTonneKm: factor,
    method: "formula",
  };
}