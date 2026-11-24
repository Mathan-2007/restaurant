# Deployment

1. Start MySQL 8.4 with `docker compose up -d mysql`.
2. Copy backend `.env.example` to `.env` and replace every secret.
3. Run `npx prisma migrate deploy`.
4. Build and run backend and frontend.
5. Put both behind a TLS reverse proxy and restrict CORS to the public frontend origin.

Never expose MySQL publicly. Never seed production databases or use development credentials. Configure private object/file storage and a real printer bridge outside the browser.
