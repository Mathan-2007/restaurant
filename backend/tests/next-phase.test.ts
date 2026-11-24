import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';

describe('next-phase security and operation guards', () => {
  it('rejects unauthenticated employee CRUD', async () => {
    const response = await request(app).get('/api/employees/not-a-shop');
    expect(response.status).toBe(401);
  });

  it('rejects unauthenticated table operations', async () => {
    const response = await request(app).post('/api/shops/not-a-shop/tables').send({ number: 'X1', capacity: 2 });
    expect([401, 403]).toContain(response.status);
  });

  it('rejects unauthenticated reservations', async () => {
    const response = await request(app).get('/api/operations/not-a-shop/reservations');
    expect(response.status).toBe(401);
  });

  it('rejects unauthenticated reports', async () => {
    const response = await request(app).get('/api/reports/not-a-shop/sales');
    expect(response.status).toBe(401);
  });

  it('rejects unauthenticated Admin dashboard access', async () => {
    const response = await request(app).get('/api/admin/dashboard');
    expect(response.status).toBe(401);
  });

  it('rejects unauthenticated Admin user management', async () => {
    const response = await request(app).get('/api/admin/users');
    expect(response.status).toBe(401);
  });

  it('keeps health database readiness visible', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body.data.database).toBe('ready');
  });
});
