import test from 'node:test';
import assert from 'node:assert/strict';
import { AuthService } from '../src/services/auth/auth_service.js';
import { seedNagpurData } from '../src/db/seed_data.js';

test('AuthService registers new donor and generates valid JWT token', async () => {
  await seedNagpurData();

  const registered = await AuthService.register({
    email: 'test.donor.unique@gmail.com',
    password: 'SecurePassword123!',
    full_name: 'Amit Deshmukh',
    role: 'donor',
    city: 'Nagpur'
  });

  assert.ok(registered.user.id);
  assert.equal(registered.user.email, 'test.donor.unique@gmail.com');
  assert.equal(registered.user.role, 'donor');
  assert.ok(registered.token);

  // Verify JWT payload
  const payload = AuthService.verifyToken(registered.token);
  assert.equal(payload.userId, registered.user.id);
  assert.equal(payload.role, 'donor');
});

test('AuthService rejects duplicate email registration', async () => {
  await assert.rejects(
    async () => {
      await AuthService.register({
        email: 'admin@rekart.in',
        password: 'Password123!',
        full_name: 'Duplicate Admin'
      });
    },
    { message: /already exists/i }
  );
});

test('AuthService authenticates valid login and rejects invalid password', async () => {
  // Correct login
  const loginSuccess = await AuthService.login({
    email: 'admin@rekart.in',
    password: 'Rekart@123'
  });
  assert.equal(loginSuccess.user.role, 'admin');
  assert.ok(loginSuccess.token);

  // Bad password
  await assert.rejects(
    async () => {
      await AuthService.login({
        email: 'admin@rekart.in',
        password: 'WrongPassword'
      });
    },
    { message: /invalid email or password/i }
  );
});
