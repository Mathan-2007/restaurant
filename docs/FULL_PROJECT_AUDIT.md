# Full Project Audit

## Repository baseline
- React/Vite frontend and Express/Prisma backend exist as separate applications.
- 58 source and configuration files were found in the primary implementation areas.
- MySQL 8.4 migration history contains foundation, CRUD, operations and Super Admin models.

## Critical findings
1. Frontend navigation is state-only in `App.tsx`; direct URLs, browser back/forward and refresh navigation are not preserved.
2. Several state-only feature pages exist even though backend APIs exist.
3. API helpers are duplicated in `App.tsx` and feature pages.
4. Logout CSRF tokens exist only in component memory and are not recovered after refresh.
5. Prisma user, search and nested session responses need strict allowlists; some routes include password-adjacent models indirectly.
6. Existing employee middleware is Manager-only and bypassed by ad-hoc role checks; central permissions are not enforced.
7. Print worker currently marks jobs PRINTED without confirmed printer delivery.
8. Recurrence worker creates a one-occurrence future copy rather than advancing the persisted schedule safely.
9. Admin dashboard financial calculations mix real values with missing cost of goods sold and inventory valuation.
10. Some frontend actions have no mutation behavior.
11. Test suite contains smoke tests but no authenticated MySQL concurrency/browser journeys.
12. PWA static caching exists but offline API policy needs review.
13. Docker frontend/backend configuration has incomplete production migrations and secrets.

## Verified at audit time
- Backend and frontend production builds execute successfully.
- Five-role session authentication and CORS smoke tests exist.
- 22 source tests pass.
- MySQL migrations are applied in the development database.

## Blocked by external environment
- Physical thermal printer delivery cannot be verified without hardware or bridge.
- Payment-provider verification requires merchant credentials and webhooks.
- MFA provider, encrypted backup storage and browser hardware printing require external configuration.
