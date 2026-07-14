export type EprOrder = {packagingProfileId: string | null; calculatedAt: Date};
export type EprProfile = {id: string; uniqueIdentifier: string; isReusable: boolean; components: Array<{materialCode: string; materialName: string; weightGrams: number; recycledContentPercent: number; postConsumerPercent: number; conaiMaterial: string | null; conaiContributionBand: string | null; packagingType: string | null}>};

export function aggregateEpr(orders: EprOrder[], profiles: EprProfile[]) {
  const byProfile = new Map(profiles.map((profile) => [profile.id, profile]));
  const rows = new Map<string, {materialCode: string; materialName: string; conaiMaterial: string; contributionBand: string; packagingType: string; units: number; grossKg: number; recycledKg: number; postConsumerKg: number; reusableUnits: number}>();
  let unmatchedOrders = 0;
  for (const order of orders) {
    const profile = order.packagingProfileId ? byProfile.get(order.packagingProfileId) : undefined;
    if (!profile) { unmatchedOrders += 1; continue; }
    for (const component of profile.components) {
      const key = [component.materialCode, component.conaiMaterial || "NON_CLASSIFICATO", component.conaiContributionBand || "DA_VERIFICARE", component.packagingType || "SECONDARY_TERTIARY"].join("|");
      const row = rows.get(key) || {materialCode: component.materialCode, materialName: component.materialName, conaiMaterial: component.conaiMaterial || "NON_CLASSIFICATO", contributionBand: component.conaiContributionBand || "DA_VERIFICARE", packagingType: component.packagingType || "SECONDARY_TERTIARY", units: 0, grossKg: 0, recycledKg: 0, postConsumerKg: 0, reusableUnits: 0};
      const kg = component.weightGrams / 1000;
      row.units += 1; row.grossKg += kg; row.recycledKg += kg * component.recycledContentPercent / 100; row.postConsumerKg += kg * component.postConsumerPercent / 100;
      if (profile.isReusable) row.reusableUnits += 1;
      rows.set(key, row);
    }
  }
  return {rows: [...rows.values()].sort((a, b) => a.materialCode.localeCompare(b.materialCode)), unmatchedOrders};
}

const csvCell = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
export function eprCsv(report: ReturnType<typeof aggregateEpr>) {
  const header = ["Codice materiale", "Materiale", "Materiale CONAI", "Fascia contributiva", "Tipologia imballaggio", "Unità", "Peso kg", "Riciclato kg", "Post-consumo kg", "Unità riutilizzabili"];
  const lines = report.rows.map((row) => [row.materialCode, row.materialName, row.conaiMaterial, row.contributionBand, row.packagingType, row.units, row.grossKg.toFixed(6), row.recycledKg.toFixed(6), row.postConsumerKg.toFixed(6), row.reusableUnits].map(csvCell).join(";"));
  return "\uFEFF" + [header.map(csvCell).join(";"), ...lines].join("\r\n");
}
