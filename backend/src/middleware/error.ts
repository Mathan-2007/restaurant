import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../utils/api.js';
import { logger } from '../config/logger.js';

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: error.flatten() }, requestId: req.headers['x-request-id'] });
    return;
  }
  if (error instanceof ApiError) {
    res.status(error.status).json({ success: false, error: { code: error.code, message: error.message, details: error.details }, requestId: req.headers['x-request-id'] });
    return;
  }
  logger.error({ err: error, requestId: req.headers['x-request-id'] }, 'Unhandled request error');
  res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' }, requestId: req.headers['x-request-id'] });
};
