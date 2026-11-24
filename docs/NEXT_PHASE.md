# Next Phase Audit

## Feature Classification

### Fully implemented
- Prisma/MySQL foundation and migrations
- Development seed for 6 shops and representative accounts
- Argon2id login, logout, password change, session cookies and CSRF
- Role and shop authorization middleware
- Socket.IO session authentication and shop room authorization
- Manager shop selector and database-backed overview API
- Task assignment creation and checklist completion validation
- Menu item listing, creation and update
- Order creation, revision history, optimistic versioning and status updates
- Kitchen ticket listing, status updates and print-job creation
- Payment request, idempotent payment confirmation and invoice creation
- Inventory listing and transaction-based additions/usages
- Opening/closing safeguards
- Responsive PWA shell and login UI
- Helmet, CORS, request IDs and central error handling

### Partially implemented
- Employee management: read/listing only through seed, no CRUD UI/API
- Menu CRUD: no categories, variants, add-ons, upload, duplication or copy
- Task CRUD: create/list/complete only; no update, cancel, templates or recurrence
- Table management: seed and read only
- Inventory: adjustments but no categories, stock verification or remaining-food workflow
- Kitchen: tickets and status but no item-level readiness, timers or worker retries
- Cashier: no session, split payments, discounts, refunds or settlement reports
- Notifications: database model and some creation, no CRUD center or deep links
- Reports: no database-driven report endpoints or exports
- Shop settings: schema/settings not exposed by CRUD
- Frontend: role dashboard is not backed by all operational pages

### Missing
- Employee shifts, password reset and activity history
- Task templates, recurrence, dependencies and approval/rejection
- Table reservations, waiting queue, transfers and merging
- Advanced order timers, partial serving, cancellation approval and parcel handoff
- Kitchen full-screen mode, sounds, volume and failed-print management
- Cash drawer and daily settlement
- Food preparation targets and discrepancy calculations
- Notification center and unread synchronization
- Sales, employee, kitchen and inventory reports
- CSV/PDF exports
- Complete DnD daily schedule builder
- Photo upload endpoint for task evidence

### Broken or requiring correction
- CORS can exclude alternate Vite ports/hosts
- Pino HTTP middleware type compatibility requires correction
- Backend route parameter typing needs completion
- Dashboard currently contains no fake operational totals; remaining role workflows need real API pages
- Seed reset deletes operational data and needs a safe non-destructive mode and explicit reset guard

### Unnecessary or requiring removal
- Default Vite assets/logos and starter CSS remain in unused assets
- Pino HTTP package wrapper can be removed if custom logging middleware is used
- Placeholder quick-action buttons must become real operations or be removed

## Features to Add
1. Employee CRUD and shift/activity APIs
2. Menu category/item variants/add-ons and reordering APIs
3. Task/template CRUD and approval APIs
4. Table and table-session CRUD
5. Inventory category/item/transaction history APIs
6. Notification center APIs
7. Shop settings CRUD
8. Database reports and exports
9. Photo evidence upload
10. Printer retry worker foundation

## Features to Update
- Menu pricing and availability
- Task completion and assignment reassignment
- Order lifecycle separation
- Kitchen and payment state transitions
- Frontend route structure and role pages

## Code to Delete
- Default Vite assets and starter CSS after references are verified
- Placeholder or duplicated UI components
- Unsafe seed deletion workflow; replace with guarded upsert/seed and explicit reset

## Database Changes
- Employee profile and shift relations may be expanded
- Add active/archive fields to categories, items and tables
- Add task recurrence/dependency fields and approval fields
- Add notification read timestamps and deep links
- Add shop tax/payment settings and printer records
- Add report indexes for dates, status and shop relationships

## Security Improvements
- Session revocation on assignment or role changes
- CSRF on all mutations
- Private evidence middleware
- Audit every create/update/archive/approve/reject action
- Revalidate shop authorization for every object operation
- Replace broad mutable seed cleanup with explicit production guard

## Testing Requirements
- Employee cross-shop role CRUD tests
- Menu and historical-price tests
- Task reassignment/photo/evidence tests
- Table unresolved-order protection tests
- Concurrent payment tests
- Notification authorization tests
- Report pagination and shop filtering tests
- Playwright role navigation tests

## Current Phase Status

Completed in this implementation pass:
- CORS and request logging fixes
- Employee CRUD, shift, password reset and activity foundations
- Manager shop settings CRUD
- Table CRUD and unresolved-order archive protection
- Menu categories, archive, duplicate, variants, add-ons and bulk availability
- Task update, cancellation, duplication and approval/rejection
- Notification center APIs
- Database-backed reports APIs
- Real employee/menu/task navigation views
- Seed reset confirmation guard

Not yet fully implemented:
- Multipart image upload and private evidence viewer
- Recurring visual schedule builder and drag-and-drop
- Full reservation, queue and table merge operations
- Cash drawer, split payments, refunds and settlement UI
- Printer worker and real thermal hardware
- CSV/PDF export endpoints
- Complete Playwright suite

## Final Implementation Status

Completed in the complete application pass:
- Complete role-specific navigation pages for manager, waiter, cashier and kitchen
- Employee, shop, table, menu, task, inventory and report modules
- Reservations, waiting queues and table transfer APIs
- Private task photo evidence upload and authorized viewing
- Food preparation and remaining-food verification
- Cashier sessions, split payments, refund requests and approvals
- Server-generated PDF invoices and CSV sales exports
- Notification center APIs
- Recurring task generation and print/outbox worker foundations
- Frontend PWA and backend builds
- Expanded 13-test security suite

External blockers documented for deployment:
- Physical thermal printer bridge and hardware verification
- Real payment provider credentials and webhook verification
