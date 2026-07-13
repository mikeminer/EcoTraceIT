export interface PackagingInput {
  weightGrams: number;
  itemCount: number;
  fragile?: boolean;
  liquid?: boolean;
}

export interface PackagingSuggestion {
  code: string;
  name: string;
  dimensionsCm: [number, number, number];
  material: string;
  recycledContent: number;
  labelIt: string;
  labelEn: string;
  icon: string;
  estimatedSavingsKg: number;
}

export function suggestPackaging(input: PackagingInput): PackagingSuggestion {
  const mailer = input.weightGrams <= 500 && input.itemCount <= 2 && !input.fragile && !input.liquid;
  if (mailer) {
    return {
      code: "RECYCLED_MAILER_S",
      name: "Busta riciclata S",
      dimensionsCm: [25, 18, 4],
      material: "LDPE riciclato 80%",
      recycledContent: 80,
      icon: "♻",
      labelIt: "Raccolta plastica. Verifica le disposizioni del tuo Comune.",
      labelEn: "Plastic collection. Check your local rules.",
      estimatedSavingsKg: 0.12,
    };
  }
  const medium = input.weightGrams > 3000;
  return {
    code: medium ? "FSC_BOX_M" : "FSC_BOX_S",
    name: medium ? "Scatola FSC M" : "Scatola FSC S",
    dimensionsCm: medium ? [40, 30, 20] : [30, 20, 12],
    material: "Cartone FSC riciclato",
    recycledContent: 85,
    icon: "♻",
    labelIt: "PAP 20 – Raccolta carta. Separa nastro e riempitivo. Verifica le disposizioni del tuo Comune.",
    labelEn: "PAP 20 – Paper collection. Separate tape and filling. Check local rules.",
    estimatedSavingsKg: medium ? 0.25 : 0.18,
  };
}