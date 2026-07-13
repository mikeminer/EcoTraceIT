import prisma from "../db.server";

export async function getDashboard(shop: string, months = 6) {
  const from = new Date();
  from.setMonth(from.getMonth() - months);
  const orders = await prisma.sustainabilityOrder.findMany({
    where: {shop, calculatedAt: {gte: from}},
    include: {productStats: true},
    orderBy: {calculatedAt: "asc"},
  });
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
  const products = new Map<string, {title: string; emissions: number; quantity: number}>();
  for (const stat of orders.flatMap((order) => order.productStats)) {
    const row = products.get(stat.title) || {title: stat.title, emissions: 0, quantity: 0};
    row.emissions += stat.allocatedEmissionsKg;
    row.quantity += stat.quantity;
    products.set(stat.title, row);
  }
  return {
    totals,
    orderCount: orders.length,
    monthly: [...monthMap.values()],
    products: [...products.values()].sort((a, b) => b.emissions - a.emissions).slice(0, 10),
  };
}