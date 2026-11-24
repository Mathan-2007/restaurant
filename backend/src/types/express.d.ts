import type { RoleName } from '@prisma/client';

declare global {
  namespace Express {
    interface ParamsDictionary { [key: string]: string }
    interface Request {
      auth?: { userId: string; role: RoleName; sessionId: string };
    }
  }
}
export {};
