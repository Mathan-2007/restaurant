# Repair Plan

## Immediate
1. Centralize frontend API, session, CSRF and query cache handling.
2. Add React Router, protected routes and role-aware nested layouts.
3. Replace state navigation and make all navigation items route destinations.
4. Enforce non-admin permission checks from Prisma Permission records.
5. Remove sensitive fields from user/session/search and audit response DTOs.
6. Replace print simulation with explicit adapter contract and PENDING/FAILED states.
7. Repair recurring schedule uniqueness and future-instance generation.
8. Add optimistic locking and scoped idempotency to critical mutations.

## Architecture
- Extract controllers/services/repositories from route files.
- Add explicit validation DTOs and response schemas.
- Add shop ownership helpers for nested resources.
- Add concurrency-safe sequence models for orders, invoices and purchases.

## Frontend
- Add route-level lazy loading.
- Implement reusable data table, dialog, toast and slide controls.
- Add functional forms for branch/user/menu/task/order/payment actions.
- Add mobile More menu and back/forward routing.

## Verification
- Dedicated MySQL test database.
- Authenticated Vitest/Supertest integration suites.
- Playwright role journeys and responsive screenshots.
- Dependency audit and Docker validation.
