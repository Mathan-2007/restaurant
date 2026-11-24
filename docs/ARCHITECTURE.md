# Architecture

The platform is a modular monorepo with a React/PWA frontend and Express/TypeScript REST backend. Prisma is the MySQL data access layer. Socket.IO provides authorized shop-specific realtime events. Outbox events and idempotency records provide reliable state synchronization.

## Runtime
- Frontend: Vite, React, TanStack Query
- Backend: Express, Zod, Pino, Socket.IO
- Database: MySQL 8.4 through Prisma
- Security: Argon2id, HttpOnly sessions, CSRF, Helmet, CORS

## Components
Frontend route features, common UI, API service and PWA cache assets. Backend modules are separated into auth, shops, menu, tasks, orders, kitchen, payments and inventory. Cross-cutting middleware validates sessions, roles and shop assignments.
