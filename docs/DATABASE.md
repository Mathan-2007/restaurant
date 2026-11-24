# Database

MySQL 8.4 is authoritative for all operational data. Monetary values use DECIMAL(12,2); quantities use DECIMAL(12,3). UTC timestamps are stored in Prisma DateTime fields and the shop timezone is configurable (Asia/Kolkata is the seed default).

## Core Relationships
Roles belong to users; users have employee or manager shop assignments. Shops own tables, menu categories, orders, tasks, inventory, notifications and audit logs. Orders own items, revisions, invoices, payments and kitchen tickets.

## Critical Constraints
Unique order numbers and invoices, unique payment idempotency keys, composite shop/employee assignments, unique menu names per shop and unique table numbers per shop prevent duplicate or cross-shop records.
