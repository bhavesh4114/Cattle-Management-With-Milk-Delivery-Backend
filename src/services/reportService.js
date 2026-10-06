const prisma = require("../config/db");

const generateReport = async (type, startDate, endDate, cowCondition, adminId, isUser = false) => {
  const formatDate = (dateString) => {
    if (!dateString) return "-";
    const d = new Date(dateString);
    return d.toLocaleDateString("en-GB").replace(/\//g, "-");
  };

  if (type === "purchase") {
    // 1. If customer/user, fetch their product trials, subscriptions, and milk orders
    if (isUser) {
      const trials = await prisma.milkTrial.findMany({
        where: {
          userId: adminId,
          OR: [
            { createdAt: { gte: startDate, lte: endDate } },
            { startDate: { gte: startDate, lte: endDate } }
          ]
        },
        include: { product: true },
        orderBy: { createdAt: "desc" }
      });

      const subscriptions = await prisma.milkSubscription.findMany({
        where: {
          userId: adminId,
          OR: [
            { createdAt: { gte: startDate, lte: endDate } },
            { requestedStartDate: { gte: startDate, lte: endDate } },
            { finalStartDate: { gte: startDate, lte: endDate } }
          ]
        },
        include: { product: true },
        orderBy: { createdAt: "desc" }
      });

      const customerOrders = await prisma.customerMilkOrder.findMany({
        where: {
          userId: adminId,
          OR: [
            { createdAt: { gte: startDate, lte: endDate } },
            { deliveryDate: { gte: startDate, lte: endDate } }
          ]
        },
        include: { product: true },
        orderBy: { createdAt: "desc" }
      });

      const rows = [];
      let totalAmount = 0;

      // Trials
      trials.forEach((t) => {
        const s = new Date(t.startDate || t.createdAt);
        const e = new Date(t.endDate || t.startDate || t.createdAt);
        const days = Math.max(1, Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1);
        const price = t.product?.price || 0;
        const total = (t.dailyQuantity || 1) * price * days;
        totalAmount += total;
        const dateStr = formatDate(t.startDate || t.createdAt);
        const itemName = t.product?.name || t.milkType || "Milk";
        const unit = t.product?.unit || (itemName.toLowerCase().includes("milk") ? "L" : "Qty");
        const qtyStr = `${t.dailyQuantity || 1} ${unit}/day${days > 1 ? ` (${days} days)` : ""}`;
        rows.push([
          dateStr,
          itemName,
          qtyStr,
          `₹${total.toFixed(2)}`,
          t.status || "Pending"
        ]);
      });

      // Subscriptions
      subscriptions.forEach((sub) => {
        const s = new Date(sub.finalStartDate || sub.requestedStartDate || sub.createdAt);
        const e = new Date(sub.finalEndDate || sub.requestedEndDate || sub.createdAt);
        const days = sub.totalDays || Math.max(1, Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1);
        const price = sub.pricePerLitre || sub.product?.price || 0;
        const total = sub.totalAmount || ((sub.dailyQuantity || 1) * price * days);
        totalAmount += total;
        const dateStr = formatDate(sub.requestedStartDate || sub.createdAt);
        const itemName = sub.product?.name || sub.milkType || "Subscription";
        const unit = sub.product?.unit || (itemName.toLowerCase().includes("milk") ? "L" : "Qty");
        const qtyStr = `${sub.dailyQuantity || 1} ${unit}/day (${days} days)`;
        rows.push([
          dateStr,
          itemName,
          qtyStr,
          `₹${total.toFixed(2)}`,
          sub.status || "Active"
        ]);
      });

      // Customer milk orders
      customerOrders.forEach((o) => {
        const price = o.product?.price || 60;
        const total = (o.quantity || 1) * price;
        totalAmount += total;
        const dateStr = formatDate(o.deliveryDate || o.createdAt);
        const itemName = o.product?.name || o.milkType || "Milk";
        const unit = o.product?.unit || "L";
        rows.push([
          dateStr,
          itemName,
          `${o.quantity || 1} ${unit}`,
          `₹${total.toFixed(2)}`,
          o.status || "Completed"
        ]);
      });

      return {
        columns: ["Date", "Item", "Quantity", "Amount", "Status"],
        rows,
        totalLabel: "Total Purchases:",
        totalValue: `₹${totalAmount.toFixed(2)}`
      };
    }

    // 2. Default for Admin: Farm purchase orders
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

    // If farm inventory purchases is empty, check customer orders under this admin's farm
    if (rows.length === 0) {
      const trials = await prisma.milkTrial.findMany({
        where: { adminId, OR: [{ createdAt: { gte: startDate, lte: endDate } }, { startDate: { gte: startDate, lte: endDate } }] },
        include: { product: true },
        orderBy: { createdAt: "desc" }
      });
      trials.forEach((t) => {
        const s = new Date(t.startDate || t.createdAt);
        const e = new Date(t.endDate || t.startDate || t.createdAt);
        const days = Math.max(1, Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1);
        const price = t.product?.price || 0;
        const total = (t.dailyQuantity || 1) * price * days;
        totalAmount += total;
        const dateStr = formatDate(t.startDate || t.createdAt);
        const itemName = t.product?.name || t.milkType || "Milk";
        const unit = t.product?.unit || (itemName.toLowerCase().includes("milk") ? "L" : "Qty");
        const qtyStr = `${t.dailyQuantity || 1} ${unit}/day${days > 1 ? ` (${days} days)` : ""}`;
        rows.push([
          dateStr,
          itemName,
          qtyStr,
          `₹${total.toFixed(2)}`,
          t.status || "Pending"
        ]);
      });
    }

    return {
      columns: ["Date", "Item", "Quantity", "Amount"],
      rows,
      totalLabel: "Total Purchases:",
      totalValue: `₹${totalAmount.toFixed(2)}`,
    };
  }

  if (type === "itemwise") {
    if (isUser) {
      const trials = await prisma.milkTrial.findMany({
        where: {
          userId: adminId,
          OR: [
            { createdAt: { gte: startDate, lte: endDate } },
            { startDate: { gte: startDate, lte: endDate } }
          ]
        },
        include: { product: true }
      });

      const subscriptions = await prisma.milkSubscription.findMany({
        where: {
          userId: adminId,
          OR: [
            { createdAt: { gte: startDate, lte: endDate } },
            { requestedStartDate: { gte: startDate, lte: endDate } }
          ]
        },
        include: { product: true }
      });

      const itemMap = {};
      let totalAmount = 0;

      trials.forEach((t) => {
        const name = t.product?.name || t.milkType || "Milk";
        const s = new Date(t.startDate || t.createdAt);
        const e = new Date(t.endDate || t.startDate || t.createdAt);
        const days = Math.max(1, Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1);
        const price = t.product?.price || 0;
        const total = (t.dailyQuantity || 1) * price * days;
        const unit = t.product?.unit || (name.toLowerCase().includes("milk") ? "L" : "Qty");

        if (!itemMap[name]) {
          itemMap[name] = { count: 0, totalQty: 0, amount: 0, unit };
        }
        itemMap[name].count += 1;
        itemMap[name].totalQty += (t.dailyQuantity || 1) * days;
        itemMap[name].amount += total;
        totalAmount += total;
      });

      subscriptions.forEach((sub) => {
        const name = sub.product?.name || sub.milkType || "Milk";
        const s = new Date(sub.finalStartDate || sub.requestedStartDate || sub.createdAt);
        const e = new Date(sub.finalEndDate || sub.requestedEndDate || sub.createdAt);
        const days = sub.totalDays || Math.max(1, Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1);
        const price = sub.pricePerLitre || sub.product?.price || 0;
        const total = sub.totalAmount || ((sub.dailyQuantity || 1) * price * days);
        const unit = sub.product?.unit || (name.toLowerCase().includes("milk") ? "L" : "Qty");

        if (!itemMap[name]) {
          itemMap[name] = { count: 0, totalQty: 0, amount: 0, unit };
        }
        itemMap[name].count += 1;
        itemMap[name].totalQty += (sub.dailyQuantity || 1) * days;
        itemMap[name].amount += total;
        totalAmount += total;
      });

      const rows = [];
      for (const [name, d] of Object.entries(itemMap)) {
        rows.push([
          name,
          `${d.count} ${d.count === 1 ? "order" : "orders"}`,
          `${d.totalQty} ${d.unit}`,
          `₹${d.amount.toFixed(2)}`
        ]);
      }

      return {
        columns: ["Item", "Orders", "Total Quantity", "Amount"],
        rows,
        totalLabel: "Total Amount:",
        totalValue: `₹${totalAmount.toFixed(2)}`
      };
    }
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
