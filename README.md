# Restaurant Operations Management System

Secure, multi-branch restaurant operations platform for managers, cashiers, waiters and kitchen staff.

## Development

```sh
docker compose up -d mysql
cp backend/.env.example backend/.env
cd backend
npm install
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run dev
```

In a second terminal:

```sh
cd frontend
npm install
cp .env.example .env
npm run dev
```

Frontend: `http://localhost:5173` or the alternate Vite port shown in terminal. Backend: `http://localhost:4000`.

## Development Accounts

Password: `Dev@12345`

- `admin@restaurant.local` reserved account
- `manager1@restaurant.local`
- `cashier1@restaurant.local`
- `waiter1@restaurant.local`
- `kitchen-staff1@restaurant.local`

The seed creates 6 shops and representative staff in development only. Never run seed against production.

## Verification

```sh
cd backend && npm test && npm run build
cd ../frontend && npm run build
```
