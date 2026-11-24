import type { Response } from 'express';

export function ok<T>(res: Response, data: T, status = 200) {
  return res.status(status).json({ success: true, data });
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public code = 'REQUEST_FAILED', public details?: unknown) {
    super(message);
  }
}
