import 'dotenv/config';
import argon2 from 'argon2';
import { PrismaClient, RoleName, EmployeeStatus, OrderType, OrderStatus, TableStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Seed script cannot run in production');
  if (process.env.SEED_RESET_CONFIRM !== 'YES_RESET_DEVELOPMENT_DATA') throw new Error('Destructive seed reset requires SEED_RESET_CONFIRM=YES_RESET_DEVELOPMENT_DATA');
  await prisma.outboxEvent.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.financialLedgerEntry.deleteMany();
  await prisma.payroll.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.purchaseItem.deleteMany();
  await prisma.purchase.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.restaurantTable.deleteMany();
  await prisma.menuItem.deleteMany();
  await prisma.menuCategory.deleteMany();
  await prisma.inventoryItem.deleteMany();
  await prisma.taskAssignmentMember.deleteMany();
  await prisma.taskAssignment.deleteMany();
  await prisma.employeeShopAssignment.deleteMany();
  await prisma.managerShopAssignment.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  await prisma.shopSettings.deleteMany();
  await prisma.shop.deleteMany();
  await prisma.role.deleteMany();

  const roles = await Promise.all(Object.values(RoleName).map((name) => prisma.role.create({ data: { name } })));
  const roleByName = Object.fromEntries(roles.map((role) => [role.name, role])) as Record<RoleName, typeof roles[number]>;

  const shops = await Promise.all(Array.from({ length: 6 }, (_, i) => prisma.shop.create({
    data: { code: `BR${String(i + 1).padStart(2, '0')}`, name: `Restaurant Branch ${i + 1}`, address: `${100 + i} Market Road`, timezone: 'Asia/Kolkata', isOpen: i < 3, settings: { create: { currency: 'INR', timezone: 'Asia/Kolkata', taxPercent: '5.00' } } },
  })));

  const passwordHash = await argon2.hash('Dev@12345', { type: argon2.argon2id });
  const admin = await prisma.user.create({ data: { email: 'admin@restaurant.local', fullName: 'Reserved Administrator', passwordHash, roleId: roleByName.ADMIN.id, status: EmployeeStatus.ACTIVE } });

  const managers = await Promise.all(Array.from({ length: 2 }, (_, i) => prisma.user.create({ data: { email: `manager${i + 1}@restaurant.local`, fullName: `Branch Manager ${i + 1}`, passwordHash, roleId: roleByName.MANAGER.id } })));
  await prisma.managerShopAssignment.createMany({ data: managers.flatMap((manager, i) => shops.filter((_, shopIndex) => i === 0 ? shopIndex < 3 : shopIndex >= 3).map((shop) => ({ userId: manager.id, shopId: shop.id }))) });

  const usersByRole: Record<string, typeof managers> = {};
  for (const [roleName, count] of [['CASHIER', 12], ['WAITER', 18], ['KITCHEN_STAFF', 18]] as const) {
    const role = roleByName[roleName as RoleName];
    usersByRole[roleName] = await Promise.all(Array.from({ length: count }, (_, i) => prisma.user.create({ data: { email: `${roleName.toLowerCase().replace('_', '-')}${i + 1}@restaurant.local`, fullName: `${roleName.replace('_', ' ')} ${i + 1}`, passwordHash, roleId: role.id } })));
  }

  for (const [roleName, users] of Object.entries(usersByRole)) {
    for (let i = 0; i < users.length; i++) {
      await prisma.employeeShopAssignment.create({ data: { userId: users[i].id, shopId: shops[i % shops.length].id } });
    }
  }

  const categoryNames = ['Starters', 'Soups', 'Rice Bowls', 'Noodles', 'Main Course', 'Biryani', 'Breads', 'Pizza', 'Beverages', 'Desserts', 'Sides', 'Combos'];
  const itemNames = ['Paneer Tikka', 'Chicken 65', 'Veg Spring Roll', 'Chicken Fried Rice', 'Chicken Noodles', 'Gobi Manchurian', 'Butter Chicken', 'Veg Biryani', 'Garlic Naan', 'Masala Dosa'];
  for (const shop of shops) {
    for (let categoryIndex = 0; categoryIndex < categoryNames.length; categoryIndex++) {
      const category = await prisma.menuCategory.create({ data: { shopId: shop.id, name: categoryNames[categoryIndex], sortOrder: categoryIndex } });
      for (let itemIndex = 0; itemIndex < 7; itemIndex++) {
        const name = `${itemNames[(categoryIndex + itemIndex) % itemNames.length]} ${itemIndex + 1}`;
        const price = (149 + categoryIndex * 20 + itemIndex * 25).toFixed(2);
        await prisma.menuItem.create({ data: { categoryId: category.id, name, description: 'Freshly prepared to order', price, soldOut: (categoryIndex + itemIndex) % 29 === 0 } });
      }
    }
    for (let table = 1; table <= 12; table++) {
      await prisma.restaurantTable.create({ data: { shopId: shop.id, number: `T${String(table).padStart(2, '0')}`, capacity: table % 4 + 2, status: TableStatus.AVAILABLE } });
    }
    for (let i = 0; i < 12; i++) {
      await prisma.inventoryItem.create({ data: { shopId: shop.id, name: ['Rice', 'Chicken', 'Paneer', 'Cooking Oil', 'Vegetables'][i % 5] + ` Batch ${i + 1}`, categoryId: (await prisma.inventoryCategory.create({ data: { shopId: shop.id, name: i % 2 ? 'Food' : 'Packaging' } })).id, unit: i % 5 === 3 ? 'LITRES' : i % 5 === 4 ? 'KILOGRAMS' : 'PIECES', quantity: '100.000', minimum: '10.000' } });
    }
  }

  const firstManager = managers[0];
  for (let shopIndex = 0; shopIndex < 3; shopIndex++) {
    const shop = shops[shopIndex];
    await prisma.taskAssignment.create({ data: { shopId: shop.id, title: 'Open shop and verify entrance', description: 'Complete the opening checklist.', completionMode: 'INDIVIDUAL', status: 'AVAILABLE', scheduledStart: new Date(Date.now() - 60 * 60 * 1000), scheduledEnd: new Date(Date.now() + 60 * 60 * 1000), photoRequired: true, requiredPhotoCount: 1, checklists: { create: [{ label: 'Switch on lights', isRequired: true }, { label: 'Check entrance', isRequired: true }] }, members: { create: [{ userId: usersByRole.KITCHEN_STAFF[shopIndex].id, status: 'AVAILABLE' }] } } });
  }

  for (let shopIndex = 0; shopIndex < shops.length; shopIndex++) {
    const shop = shops[shopIndex];
    const waiters = usersByRole.WAITER.filter((_, i) => i % shops.length === shopIndex);
    const kitchen = usersByRole.KITCHEN_STAFF.filter((_, i) => i % shops.length === shopIndex);
    const items = await prisma.menuItem.findMany({ where: { category: { shopId: shop.id } }, take: 8 });
    for (let day = 0; day < 30; day++) {
      for (let orderIndex = 0; orderIndex < 3; orderIndex++) {
        const createdAt = new Date(Date.now() - (29 - day) * 86400000 - orderIndex * 3600000);
        const type = (day + orderIndex) % 3 === 0 ? OrderType.TAKEAWAY : OrderType.DINE_IN;
        const orderNumber = `ORD-${String(shopIndex + 1).padStart(2, '0')}-${String(day * 3 + orderIndex + 1).padStart(5, '0')}`;
        const selected = items.slice(orderIndex % 3, (orderIndex % 3) + 2);
        const subtotal = selected.reduce((sum, item) => sum + Number(item.price) * (orderIndex % 2 + 1), 0);
        const tax = subtotal * 0.05;
        const total = subtotal + tax;
        const status = day === 29 && orderIndex === 0 ? OrderStatus.AWAITING_PAYMENT : OrderStatus.COMPLETED;
        const order = await prisma.order.create({ data: { shopId: shop.id, orderNumber, type, status, createdById: waiters[0]?.id || kitchen[0].id, subtotal: subtotal.toFixed(2), tax: tax.toFixed(2), total: total.toFixed(2), createdAt, items: { create: selected.map((item) => ({ menuItemId: item.id, nameSnapshot: item.name, quantity: orderIndex % 2 + 1, unitPrice: item.price, lineTotal: (Number(item.price) * (orderIndex % 2 + 1)).toFixed(2) })) } } });
        if (status === OrderStatus.COMPLETED) {
          await prisma.invoice.create({ data: { shopId: shop.id, orderId: order.id, invoiceNumber: `INV-${shop.code}-${String(day * 3 + orderIndex + 1).padStart(6, '0')}`, subtotal: subtotal.toFixed(2), tax: tax.toFixed(2), discount: '0.00', total: total.toFixed(2) } });
          await prisma.payment.create({ data: { shopId: shop.id, orderId: order.id, amount: total.toFixed(2), status: 'SUCCEEDED', methodCode: orderIndex % 2 ? 'CASH' : 'UPI', idempotencyKey: `seed-${order.id}`, confirmedById: usersByRole.CASHIER[shopIndex]?.id } });
        }
      }
    }
  }

  for (let month = 0; month < 12; month++) {
    const date = new Date();
    date.setUTCMonth(date.getUTCMonth() - month);
    for (let shopIndex = 0; shopIndex < shops.length; shopIndex++) {
      const shop = shops[shopIndex];
      const supplier = await prisma.supplier.upsert({ where: { code: `SUP-${String(shopIndex + 1).padStart(2, '0')}` }, update: {}, create: { code: `SUP-${String(shopIndex + 1).padStart(2, '0')}`, name: `Branch ${shopIndex + 1} Fresh Supply`, phone: `987654${String(shopIndex).padStart(4, '0')}`, address: 'Development supplier address' } });
      const purchaseTotal = 45000 + month * 650 + shopIndex * 1200;
      await prisma.purchase.create({ data: { purchaseNumber: `PUR-${shop.code}-${String(month + 1).padStart(2, '0')}`, shopId: shop.id, supplierId: supplier.id, purchaseDate: date, subtotal: purchaseTotal.toFixed(2), discount: '500.00', tax: (purchaseTotal * 0.05).toFixed(2), transportCost: '600.00', total: (purchaseTotal - 500 + purchaseTotal * 0.05 + 600).toFixed(2), status: 'APPROVED', paymentStatus: month % 4 === 0 ? 'UNPAID' : 'PAID', purchasedById: managers[shopIndex % managers.length].id, approvedById: managers[shopIndex % managers.length].id, items: { create: [{ name: 'Vegetables and ingredients', quantity: '100.000', unit: 'KG', unitPrice: '450.00', lineTotal: '45000.00' }] } } });
      for (const [category, amount] of [['Rent', 65000], ['Electricity', 12000 + month * 120], ['Water', 2500], ['Gas', 6000], ['Maintenance', 3500 + month * 80], ['Transportation', 4500]]) {
        await prisma.expense.create({ data: { expenseNumber: `EXP-${shop.code}-${month}-${category.replace(' ', '')}`, shopId: shop.id, category, amount: amount.toFixed(2), expenseDate: date, status: 'APPROVED', paymentStatus: 'PAID', recurring: ['Rent', 'Electricity', 'Water', 'Gas'].includes(category), createdById: managers[shopIndex % managers.length].id, approvedById: managers[shopIndex % managers.length].id } });
      }
      await prisma.payroll.upsert({ where: { shopId_userId_periodStart_periodEnd: { shopId: shop.id, userId: managers[shopIndex % managers.length].id, periodStart: date, periodEnd: date } }, update: {}, create: { shopId: shop.id, userId: managers[shopIndex % managers.length].id, periodStart: date, periodEnd: date, baseSalary: '55000.00', overtime: '3000.00', allowance: '2000.00', bonus: month % 3 === 0 ? '5000.00' : '0.00', deduction: '1500.00', netPay: month % 3 === 0 ? '63500.00' : '58500.00', status: 'PAID', paidAt: date } });
    }
  }

  for (const roleName of ['MANAGER', 'CASHIER', 'WAITER', 'KITCHEN_STAFF'] as const) {
    for (const module of ['ORDERS', 'TASKS', 'MENU', 'INVENTORY', 'PAYMENTS', 'KITCHEN', 'USERS', 'REPORTS']) {
      for (const action of ['VIEW', 'CREATE', 'UPDATE', 'APPROVE']) {
        await prisma.permission.upsert({ where: { roleName_module_action: { roleName, module, action } }, update: {}, create: { roleName, module, action, allowed: roleName === 'MANAGER' || action === 'VIEW' } });
      }
    }
  }

  await prisma.auditLog.create({ data: { actorId: admin.id, action: 'SEED_CREATED', resourceType: 'database', resourceId: 'development', afterJson: { shops: 6, managers: 2 } } });
  console.log('Development seed completed');
  console.log('Test password: Dev@12345');
  console.log('Accounts: admin@restaurant.local, manager1@restaurant.local, cashier1@restaurant.local, waiter1@restaurant.local, kitchen-staff1@restaurant.local');
}

main().finally(() => prisma.$disconnect());
