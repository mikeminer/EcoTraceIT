import {beforeEach, describe, expect, it, vi} from "vitest";

const db = vi.hoisted(() => ({
  sustainabilityOrder: {findMany: vi.fn()},
  productStat: {groupBy: vi.fn()},
}));

vi.mock("../db.server", () => ({default: db}));

import {getDashboard} from "./analytics.server";

describe("dashboard analytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads only order summary fields and aggregates product data in the database", async () => {
    db.sustainabilityOrder.findMany.mockResolvedValue([
      {emissionsKg: 1.2, savingsKg: 0.2, offsetAmount: 0.1, calculatedAt: new Date("2026-06-10T00:00:00Z")},
      {emissionsKg: 0.8, savingsKg: 0.1, offsetAmount: 0, calculatedAt: new Date("2026-06-20T00:00:00Z")},
    ]);
    db.productStat.groupBy
      .mockResolvedValueOnce([{title: "Scatola", _sum: {allocatedEmissionsKg: 1.5, quantity: 3}}])
      .mockResolvedValueOnce([{category: null, _sum: {allocatedEmissionsKg: 1.5, quantity: 3}}]);

    const dashboard = await getDashboard("example.myshopify.com");

    expect(db.sustainabilityOrder.findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: {emissionsKg: true, savingsKg: true, offsetAmount: true, calculatedAt: true},
    }));
    expect(db.productStat.groupBy).toHaveBeenCalledTimes(2);
    expect(dashboard).toMatchObject({
      totals: {emissions: 2, savings: 0.30000000000000004, offsets: 0.1},
      orderCount: 2,
      monthly: [{month: "2026-06", emissions: 2, savings: 0.30000000000000004, orders: 2}],
      products: [{title: "Scatola", emissions: 1.5, quantity: 3}],
      categories: [{category: "Non categorizzato", emissions: 1.5, quantity: 3}],
    });
  });
});
