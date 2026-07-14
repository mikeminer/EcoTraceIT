import {describe, expect, it} from "vitest";
import {orderVolumeCm3, selectRightSizedPackaging} from "./right-sizing.server";

describe("right sizing", () => {
  it("considera quantità e buffer protettivo", () => expect(orderVolumeCm3([{quantity: 2, lengthMm: 100, widthMm: 100, heightMm: 100}])).toBe(2300));
  it("sceglie il contenitore più piccolo disponibile", () => {
    const result = selectRightSizedPackaging([{quantity: 1, lengthMm: 100, widthMm: 100, heightMm: 100}], [
      {id: "large", lengthMm: 300, widthMm: 200, heightMm: 100, productVolumeCm3: 0, packagingWeightGrams: 100, isReusable: false},
      {id: "small", lengthMm: 150, widthMm: 100, heightMm: 100, productVolumeCm3: 0, packagingWeightGrams: 50, isReusable: false},
    ]);
    expect(result.selected?.id).toBe("small");
  });
});
