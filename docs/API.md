# API

All mutation endpoints require a session cookie and `X-CSRF-Token`. Successful responses use `{ success: true, data }`; errors use `{ success: false, error, requestId }`.

- `GET /health`
- `POST /api/auth/login`, `/logout`, `/password`
- `GET /api/auth/me`
- `GET /api/shops`, `/api/shops/:shopId/dashboard`, `/api/shops/:shopId/tables`
- `GET /api/menu/:shopId`; manager `POST/PATCH /api/menu/:shopId/items...`
- `GET/POST /api/tasks/:shopId`; `POST /api/tasks/:shopId/:taskId/complete`
- `GET/POST /api/orders/:shopId`; `PATCH /api/orders/:shopId/:orderId`; `POST /api/orders/:shopId/:orderId/status`
- `GET /api/kitchen/:shopId/tickets`; `POST .../status` and `/print`
- `POST /api/payments/:shopId/:orderId/request|pay`; `GET /api/payments/:shopId/invoices`
- `GET /api/inventory/:shopId`; adjustment and shop open/close endpoints

Order and payment creation require an `Idempotency-Key` header.
