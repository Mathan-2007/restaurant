# Mandatory Technology Stack and Development Instructions

This repository is governed by the following permanent specification. These instructions override conflicting technology choices in future implementation prompts.

## Technology Stack

### Frontend

- React.js with TypeScript
- Vite
- Tailwind CSS
- React Router
- TanStack Query for server-state management
- Socket.IO Client for real-time updates
- Lucide React for icons
- PWA support for mobile, tablet, and desktop

### Backend

- Node.js
- Express.js with TypeScript
- REST API architecture
- Socket.IO for real-time communication
- Zod for request validation
- Multer for controlled image uploads
- Pino for structured logging

### Database

- MySQL 8.4 LTS
- Prisma ORM configured with the MySQL provider
- Database migrations and seed scripts
- Foreign keys, indexes, and unique constraints
- ACID transactions for orders, billing, payments, and inventory

Do not use PostgreSQL, MongoDB, Firebase, or Supabase.

## Project Structure

Maintain this modular architecture:

- `frontend/` — React application
- `backend/` — Node.js Express API
- `backend/prisma/` — MySQL schema, migrations, and seed data
- `backend/src/modules/` — Independent business modules
- `backend/src/middleware/` — Authentication, authorization, and validation
- `backend/src/services/` — Business logic
- `backend/src/sockets/` — Real-time communication
- `backend/src/jobs/` — Scheduled tasks and print queues
- `docs/` — Architecture, API, and database documentation
- `tests/` — Automated tests

## Roles and Authorization

Support exactly five roles:

- Admin — Reserved for future implementation; do not build the admin dashboard
- Manager — Can manage multiple assigned shops
- Cashier — Assigned to exactly one shop
- Waiter — Assigned to exactly one shop
- Kitchen Staff — Assigned to exactly one shop

Every shop-specific operation must enforce shop-level authorization on the backend.

Never trust role information, shop IDs, prices, payment amounts, or permissions supplied by the frontend.

A staff member from one shop must never access orders, tasks, menus, notifications, photos, or financial information belonging to another shop.

## Security Requirements

Security is required from the beginning:

- Secure server-side session authentication
- HttpOnly, Secure production cookies with appropriate SameSite settings
- Argon2id password hashing
- CSRF protection
- Role-based and shop-level access control
- Object-level authorization against IDOR and BOLA
- Parameterized database queries
- SQL injection and XSS prevention
- Strict Zod request validation
- Helmet security headers
- Restricted CORS configuration
- Login and API rate limiting
- Secure file upload validation
- Private photo storage with authorized access
- Session expiration and revocation
- Audit logging for sensitive operations
- Environment variables for credentials and secrets
- Idempotency protection against duplicate orders and payments
- Server-side validation of every order, task, and payment state transition

Do not store authentication tokens, passwords, sensitive business data, or authoritative permissions in localStorage or sessionStorage.

## Database Requirements

The normalized MySQL database must support:

- Users
- Roles
- Shops
- Manager shop assignments
- Employee shop assignments
- Shifts
- Task templates
- Task schedules
- Task assignments
- Task groups
- Task checklists
- Task completion records
- Photo evidence
- Menu categories
- Menu items
- Menu availability
- Order-taking schedules
- Restaurant tables
- Orders
- Order items
- Order revisions
- Kitchen tickets
- Print jobs
- Payments
- Invoices
- Inventory
- Food preparation records
- Remaining food records
- Notifications
- Daily opening and closing records
- Audit logs
- Sessions
- Shop settings

Use proper relationships, timestamps, constraints, and indexes. Use DECIMAL for monetary values and never floating-point values for billing calculations. Store timestamps consistently in UTC and display them according to the shop timezone. All operational data must persist in MySQL; do not use hardcoded arrays or browser storage as substitutes for the database.

## UI and UX Requirements

- Modern, clean, mobile-first interface inspired by restaurant ordering usability
- Large touch-friendly controls
- Minimal navigation
- Role-specific dashboards
- Clear status indicators
- Responsive layouts
- Real-time updates
- Skeleton loading states
- Meaningful empty states
- Clear error messages
- Accessible typography
- Minimal unnecessary animations
- Slide-to-confirm for important operations
- Accessible confirmation alternatives for users unable to slide
- Prevent accidental submissions, duplicate requests, and repeated clicks

Use slide-to-confirm for order submission, task completion, payment requests, and other critical actions.

## Performance Requirements

- Database-level pagination, filtering, and searching
- Optimized MySQL indexes
- Database connection pooling
- Lazy-loaded React routes
- Efficient component rendering
- Image compression
- Shop-specific Socket.IO rooms with server-side authorization
- Background processing for print jobs and scheduled tasks
- Automatic reconnection and state synchronization
- Transaction-safe concurrent operations
- Optimized API response sizes
- Never load an entire database table into the frontend

## Business Logic Requirements

Preserve all implemented workflows:

- Dynamic opening and closing tasks
- Individual and group task assignments
- Recurring task templates
- Time-based task schedules
- Optional mandatory photo evidence
- Dine-in and takeaway orders
- Kitchen ticket printing
- Edited-order notifications with distinct sounds
- Order revision history
- Manager-controlled menus and prices
- Cashier billing and payment confirmation
- Remaining-food and inventory tracking
- Real-time shop-specific updates

Keep service completion and payment completion separate. An order must not be marked fully completed until payment is confirmed.

## Development Workflow

For every implementation prompt:

1. Inspect the existing repository.
2. Understand the existing architecture and database schema.
3. Create a short implementation plan.
4. Implement working frontend and backend functionality.
5. Connect functionality to MySQL.
6. Create necessary database migrations.
7. Add realistic development seed data.
8. Test successful and unsuccessful operations.
9. Test unauthorized access and cross-shop data isolation.
10. Fix errors before completing the phase.
11. Update project documentation.
12. Report implemented features, changed files, test results, and remaining issues.

Never replace working functionality with placeholders or mock implementations. Never disable security controls to make a feature work. Do not implement future phases prematurely.

## Final Instruction

Whenever a future prompt mentions PostgreSQL, replace it with an equivalent MySQL-compatible implementation. Use React.js, Node.js, Express.js, and MySQL throughout the project.

Prioritize development in this order:

1. Security
2. Data integrity
3. Functionality
4. Performance
5. User experience
6. Scalability

Do not begin the complete application until explicitly instructed by Prompt 01 or a subsequent implementation prompt. Implement each phase individually.
