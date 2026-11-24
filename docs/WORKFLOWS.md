# Workflows

## Order
DRAFT → SUBMITTED → ACCEPTED → PREPARING → READY → SERVED → AWAITING_PAYMENT → PAID → COMPLETED. CANCELLED is terminal. Payment confirmation is independent from service state.

## Task
SCHEDULED → AVAILABLE → IN_PROGRESS → AWAITING_EVIDENCE or AWAITING_APPROVAL → COMPLETED. Required checklist items and evidence are enforced on the server.

## Payment
PENDING → SUCCEEDED or FAILED; refunds use approval state and never alter paid invoices silently.

## Closing
The manager can close only when unresolved orders are absent. Overrides require a separate audited workflow and mandatory reason.
