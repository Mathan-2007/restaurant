import type { RoleName } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      auth?: { userId: string; role: RoleName; sessionId: string };
      params: Record<string, string>;
    }
  }
}
export {};
