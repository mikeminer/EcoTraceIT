import prisma from "../db.server";

export async function getDashboard(shop: string, months = 6) {
  const from = new Date();
  from.setMonth(from.getMonth() - months);
  const [orders, productGroups, categoryGroups] = await Promise.all([
    prisma.sustainabilityOrder.findMany({
      where: {shop, calculatedAt: {gte: from}},
      select: {
        emissionsKg: true,
        savingsKg: true,
        offsetAmount: true,
        calculatedAt: true,
      },
      orderBy: {calculatedAt: "asc"},
    }),
    prisma.productStat.groupBy({
      by: ["title"],
      where: {order: {shop, calculatedAt: {gte: from}}},
      _sum: {allocatedEmissionsKg: true, quantity: true},
      orderBy: {_sum: {allocatedEmissionsKg: "desc"}},
      take: 10,
    }),
    prisma.productStat.groupBy({
      by: ["category"],
      where: {order: {shop, calculatedAt: {gte: from}}},
      _sum: {allocatedEmissionsKg: true, quantity: true},
      orderBy: {_sum: {allocatedEmissionsKg: "desc"}},
      take: 10,
    }),
  ]);
  const totals = orders.reduce(
    (sum, order) => ({
      emissions: sum.emissions + order.emissionsKg,
      savings: sum.savings + order.savingsKg,
      offsets: sum.offsets + order.offsetAmount,
    }),
    {emissions: 0, savings: 0, offsets: 0},
  );
  const monthMap = new Map<string, {month: string; emissions: number; savings: number; orders: number}>();
  for (const order of orders) {
    const key = order.calculatedAt.toISOString().slice(0, 7);
    const row = monthMap.get(key) || {month: key, emissions: 0, savings: 0, orders: 0};
    row.emissions += order.emissionsKg;
    row.savings += order.savingsKg;
    row.orders += 1;
    monthMap.set(key, row);
  }
  return {
    totals,
    orderCount: orders.length,
    monthly: [...monthMap.values()],
    products: productGroups.map((group) => ({
      title: group.title,
      emissions: group._sum.allocatedEmissionsKg || 0,
      quantity: group._sum.quantity || 0,
    })),
    categories: categoryGroups.map((group) => ({
      category: group.category || "Non categorizzato",
      emissions: group._sum.allocatedEmissionsKg || 0,
      quantity: group._sum.quantity || 0,
    })),
  };
}
