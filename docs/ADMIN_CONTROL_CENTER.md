# Super Admin Control Center

## Authority
The `ADMIN` role is treated as global in role middleware and shop authorization. It does not require employee or manager shop assignments. Every mutation remains subject to Zod validation, CSRF, session authentication, transactions and audit logging.

## Implemented APIs
- `GET /api/admin/dashboard`
- `GET/POST /api/admin/branches`
- `PATCH /api/admin/branches/:branchId`
- `POST /api/admin/branches/:branchId/archive`
- `GET/POST/PATCH /api/admin/users`
- `POST /api/admin/users/:userId/revoke-sessions`
- `GET /api/admin/audit-logs`
- `GET/PUT /api/admin/permissions`
- `GET/POST/PATCH /api/admin/suppliers`
- `POST /api/admin/suppliers/:supplierId/archive`
- `GET/POST /api/admin/purchases`
- `POST /api/admin/purchases/:purchaseId/approve|reject`
- `GET/POST /api/admin/expenses`
- `POST /api/admin/expenses/:expenseId/approve`
- `GET/POST /api/admin/payroll`
- `POST /api/admin/payroll/:payrollId/approve|pay`
- `GET /api/admin/search`
- `GET /api/admin/system-health`
- `GET/PUT /api/admin/settings/:key`
- `POST /api/admin/corrections`

## Financial Integrity
Purchases update inventory only after approval. Approved expenses and paid payroll create ledger entries. Financial values use Decimal fields and server-side calculations. Historical records are preserved by status and audit entries rather than silent deletion.

## Known External Limitations
MFA provider configuration, encrypted infrastructure backup restore, external payment reconciliation and real printer hardware remain deployment integrations. They are not simulated as verified production services.
