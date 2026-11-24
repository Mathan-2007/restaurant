import type { RequestHandler } from 'express';
import { timingSafeEqual, createHmac } from 'node:crypto';
import { env } from '../config/env.js';
import { ApiError } from '../utils/api.js';

function sign(value: string) { return createHmac('sha256', env.CSRF_SECRET).update(value).digest('hex'); }

export const csrfProtect: RequestHandler = (req, _res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.path === '/login') return next();
  const token = req.headers['x-csrf-token'];
  const sessionId = req.cookies?.sid;
  if (typeof token !== 'string' || typeof sessionId !== 'string') throw new ApiError(403, 'CSRF validation failed', 'CSRF_REQUIRED');
  const expected = sign(sessionId);
  const actual = Buffer.from(token);
  const expectedBuffer = Buffer.from(expected);
  if (actual.length !== expectedBuffer.length || !timingSafeEqual(actual, expectedBuffer)) throw new ApiError(403, 'CSRF validation failed', 'CSRF_INVALID');
  next();
};

export function createCsrfToken(sessionId: string) { return sign(sessionId); }
