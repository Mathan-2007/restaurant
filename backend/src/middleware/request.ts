import type { RequestHandler } from 'express';
import { randomUUID } from 'node:crypto';

export const requestContext: RequestHandler = (req, res, next) => {
  const requestId = typeof req.headers['x-request-id'] === 'string' ? req.headers['x-request-id'] : randomUUID();
  req.headers['x-request-id'] = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
};
