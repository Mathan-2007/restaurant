import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';

describe('API security smoke tests', () => {
  it('returns database health', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body.data.database).toBe('ready');
  });

  it('rejects unauthenticated shop access', async () => {
    const response = await request(app).get('/api/shops');
    expect(response.status).toBe(401);
  });

  it('rejects unauthenticated task access', async () => {
    const response = await request(app).get('/api/tasks/shop-id');
    expect(response.status).toBe(401);
  });

  it('rejects invalid login credentials', async () => {
    const response = await request(app).post('/api/auth/login').send({ email: 'invalid@restaurant.local', password: 'InvalidPass123!' });
    expect(response.status).toBe(401);
  });
});
