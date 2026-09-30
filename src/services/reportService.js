const prisma = require("../config/db");

const generateReport = async (type, startDate, endDate, cowCondition, adminId) => {
  const formatDate = (dateString) => {
    if (!dateString) return "-";
    const d = new Date(dateString);
    return d.toLocaleDateString("en-GB").replace(/\//g, "-");
  };

  if (type === "purchase") {
    const orders = await prisma.order.findMany({
      where: { purchaseDate: { gte: startDate, lte: endDate }, adminId },
      include: { items: true },
      orderBy: { purchaseDate: "asc" },
    });
    const rows = [];
    let totalAmount = 0;
    orders.forEach((order) => {
      order.items.forEach((item) => {
        const rowTotal = item.quantity * item.price;
        totalAmount += rowTotal;
        rows.push([
          formatDate(order.purchaseDate),
          item.itemName,
          `${item.quantity} ${item.unit}`,
          `₹${rowTotal.toFixed(2)}`,
        ]);
      });
    });
    return {
      columns: ["Date", "Item", "Quantity", "Amount"],
      rows,
      totalLabel: "Total Purchases:",
      totalValue: `₹${totalAmount.toFixed(2)}`,
    };
  }

  if (type === "itemwise") {
    const orders = await prisma.order.findMany({
      where: { purchaseDate: { gte: startDate, lte: endDate }, adminId },
      include: { items: true },
    });
    const itemMap = {};
    orders.forEach((order) => {
      order.items.forEach((item) => {
        if (!itemMap[item.itemName]) {
          itemMap[item.itemName] = { orders: new Set(), amount: 0 };
        }
        itemMap[item.itemName].orders.add(order.id);
        itemMap[item.itemName].amount += item.quantity * item.price;
      });
    });
    const rows = [];
    let totalAmount = 0;
    for (const [itemName, data] of Object.entries(itemMap)) {
      totalAmount += data.amount;
      rows.push([itemName, `${data.orders.size} orders`, `₹${data.amount.toFixed(2)}`]);
    }
    return {
      columns: ["Item", "Orders", "Amount"],
      rows,
      totalLabel: "Total Amount:",
      totalValue: `₹${totalAmount.toFixed(2)}`,
    };
  }

  if (type === "milk" || type === "cowmilk") {
    const records = await prisma.milkRecord.findMany({
      where: { recordDate: { gte: startDate, lte: endDate }, ...cowCondition },
      include: { cow: true },
      orderBy: { recordDate: "asc" },
    });
    const rows = [];
    let totalMilk = 0;
    records.forEach((r) => {
      totalMilk += r.totalMilk || 0;
      rows.push([
        r.cow?.name || r.cow?.tagNo,
        formatDate(r.recordDate),
        (r.morningMilk || 0).toFixed(2),
        (r.eveningMilk || 0).toFixed(2),
        (r.totalMilk || 0).toFixed(2),
      ]);
    });
    return {
      columns: ["Cow", "Date", "Morning (L)", "Evening (L)", "Total (L)"],
      rows,
      totalLabel: "Total Production:",
      totalValue: `${totalMilk.toFixed(2)} liters`,
    };
  }

  if (type === "treatment" || type === "cowtreatment") {
    const records = await prisma.treatment.findMany({
      where: { treatedAt: { gte: startDate, lte: endDate }, ...cowCondition },
      include: { cow: true },
      orderBy: { treatedAt: "asc" },
    });
    const rows = [];
    let totalCost = 0;
    records.forEach((r) => {
      totalCost += r.cost || 0;
      rows.push([
        r.cow?.name || r.cow?.tagNo,
        formatDate(r.treatedAt),
        r.diagnosis || "-",
        r.medicine || "-",
        `₹${(r.cost || 0).toFixed(2)}`,
      ]);
    });
    return {
      columns: ["Cow", "Date", "Diagnosis", "Medicine", "Cost"],
      rows,
      totalLabel: "Total Cost:",
      totalValue: `₹${totalCost.toFixed(2)}`,
    };
  }

  throw new Error("Invalid report type");
};

module.exports = {
  generateReport,
};
