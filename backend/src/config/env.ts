import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  CSRF_SECRET: z.string().min(32),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  COOKIE_SECURE: z.enum(['true', 'false']).default('false'),
  LOG_LEVEL: z.string().default('info'),
});

export const env = schema.parse(process.env);
