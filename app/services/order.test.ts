import {beforeEach, describe, expect, it, vi} from "vitest";

const mocks = vi.hoisted(() => ({
  shopSettingsUpsert: vi.fn(),
  sustainabilityOrderFindUnique: vi.fn(),
  sustainabilityOrderCount: vi.fn(),
  sustainabilityOrderUpsert: vi.fn(),
  sustainabilityOrderUpdate: vi.fn(),
  packagingProfileFindFirst: vi.fn(),
  packagingProfileFindMany: vi.fn(),
  productStatDeleteMany: vi.fn(),
  productStatCreateMany: vi.fn(),
  calculateCarbon: vi.fn(),
  suggestPackaging: vi.fn(),
  selectRightSizedPackaging: vi.fn(),
}));

vi.mock("../db.server", () => ({
  default: {
    shopSettings: {upsert: mocks.shopSettingsUpsert},
    sustainabilityOrder: {
      findUnique: mocks.sustainabilityOrderFindUnique,
      count: mocks.sustainabilityOrderCount,
      upsert: mocks.sustainabilityOrderUpsert,
      update: mocks.sustainabilityOrderUpdate,
    },
    packagingProfile: {
      findFirst: mocks.packagingProfileFindFirst,
      findMany: mocks.packagingProfileFindMany,
    },
    productStat: {
      deleteMany: mocks.productStatDeleteMany,
      createMany: mocks.productStatCreateMany,
    },
  },
}));

vi.mock("./carbon.server", () => ({calculateCarbon: mocks.calculateCarbon}));
vi.mock("./packaging.server", () => ({suggestPackaging: mocks.suggestPackaging}));
vi.mock("./right-sizing.server", () => ({selectRightSizedPackaging: mocks.selectRightSizedPackaging}));
vi.mock("./offset.server", () => ({reserveOffset: vi.fn()}));
vi.mock("./app-events.server", () => ({reportOrderProcessed: vi.fn()}));

import {processOrder} from "./order.server";

describe("processOrder Shopify product lookup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.shopSettingsUpsert.mockResolvedValue({plan: "free", locale: "en"});
    mocks.sustainabilityOrderFindUnique.mockResolvedValue(null);
    mocks.sustainabilityOrderCount.mockResolvedValue(0);
    mocks.sustainabilityOrderUpsert.mockResolvedValue({id: "order-record"});
    mocks.sustainabilityOrderUpdate.mockResolvedValue({id: "order-record"});
    mocks.packagingProfileFindFirst.mockResolvedValue(null);
    mocks.packagingProfileFindMany.mockResolvedValue([]);
    mocks.productStatDeleteMany.mockResolvedValue({count: 0});
    mocks.productStatCreateMany.mockResolvedValue({count: 1});
    mocks.calculateCarbon.mockResolvedValue({emissionsKg: 1.2, distanceKm: 100, method: "local"});
    mocks.suggestPackaging.mockReturnValue({
      code: "BOX-S",
      estimatedSavingsKg: 0.1,
      icon: "♻️",
      labelEn: "Recyclable box",
      labelIt: "Scatola riciclabile",
      material: "paper",
    });
    mocks.selectRightSizedPackaging.mockReturnValue({selected: null, emptySpaceRatio: null});
  });

  it("uses API 2026-07 compatible metafield aliases and keeps dimensional right-sizing", async () => {
    const graphql = vi.fn(async (query: string) => {
      if (query.includes("EcoTraceITProductCategories")) {
        return new Response(JSON.stringify({
          data: {
            nodes: [{
              id: "gid://shopify/Product/123",
              productType: "Beauty",
              category: {fullName: "Beauty & Personal Care"},
              length: {value: "100"},
              width: {value: "50"},
              height: {value: "20"},
            }],
          },
        }));
      }
      return new Response(JSON.stringify({data: {metafieldsSet: {userErrors: []}}}));
    });

    await processOrder("example.myshopify.com", {
      id: 42,
      admin_graphql_api_id: "gid://shopify/Order/42",
      total_weight: 500,
      line_items: [{product_id: 123, title: "Serum", quantity: 1, grams: 500}],
    }, {graphql});

    const productQuery = graphql.mock.calls[0][0];
    expect(productQuery).not.toContain("identifiers:");
    expect(productQuery).toContain('length: metafield(namespace: "$app:ecotraceit", key: "length_mm")');
    expect(productQuery).toContain('width: metafield(namespace: "$app:ecotraceit", key: "width_mm")');
    expect(productQuery).toContain('height: metafield(namespace: "$app:ecotraceit", key: "height_mm")');
    expect(mocks.selectRightSizedPackaging).toHaveBeenCalledWith(
      [{lengthMm: 100, widthMm: 50, heightMm: 20, quantity: 1}],
      [],
    );
    expect(mocks.productStatCreateMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({category: "Beauty & Personal Care"})],
    });
  });
});
