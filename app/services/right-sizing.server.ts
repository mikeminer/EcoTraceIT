export type ProductDimensions = {quantity: number; lengthMm: number; widthMm: number; heightMm: number};
export type PackagingCandidate = {id: string; lengthMm: number; widthMm: number; heightMm: number; productVolumeCm3: number; packagingWeightGrams: number; isReusable: boolean};

export function orderVolumeCm3(items: ProductDimensions[], protectionFactor = 1.15) {
  const raw = items.reduce((sum, item) => sum + (item.lengthMm * item.widthMm * item.heightMm / 1000) * Math.max(1, item.quantity), 0);
  return Math.round(raw * Math.max(1, protectionFactor) * 100) / 100;
}

export function selectRightSizedPackaging<T extends PackagingCandidate>(items: ProductDimensions[], candidates: T[]) {
  const requiredVolumeCm3 = orderVolumeCm3(items);
  const eligible = candidates.filter((candidate) => candidate.lengthMm * candidate.widthMm * candidate.heightMm / 1000 >= requiredVolumeCm3);
  const selected = eligible.sort((a, b) => (a.lengthMm * a.widthMm * a.heightMm) - (b.lengthMm * b.widthMm * b.heightMm))[0] || null;
  if (!selected) return {selected: null, requiredVolumeCm3, emptySpaceRatio: null};
  const containerVolume = selected.lengthMm * selected.widthMm * selected.heightMm / 1000;
  return {selected, requiredVolumeCm3, emptySpaceRatio: Math.round((1 - requiredVolumeCm3 / containerVolume) * 10000) / 100};
}
