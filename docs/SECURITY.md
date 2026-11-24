# Security

Server-side MySQL sessions use HttpOnly, SameSite cookies and server-side revocation. Passwords use Argon2id. Mutations require a signed CSRF token. Helmet applies security headers, CORS is allowlisted and login is rate limited.

Every shop route validates manager or employee assignment against the backend. Roles are loaded from MySQL, never trusted from browser input. Menu prices and order totals are recalculated from database prices. Payment operations use idempotency keys and transactions.

Private evidence files must remain outside publicly served directories. The seed is blocked in production. Card data, UPI PINs and session credentials are never accepted or logged.
