const request = require('supertest');
const app = require('../server');

describe('Authentication API', () => {
  describe('POST /api/v1/auth/register', () => {
    it('should register a new user successfully', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'test@example.com',
          password: 'securePassword123',
          displayName: 'Test User'
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('message', 'User registered successfully');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('email', 'test@example.com');
      expect(response.body.user).toHaveProperty('displayName', 'Test User');
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body.user).not.toHaveProperty('password');
    });

    it('should return 400 when email is missing', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          password: 'securePassword123'
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Email and password required');
    });

    it('should return 400 when password is missing', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'test2@example.com'
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Email and password required');
    });

    it('should return 409 when user already exists', async () => {
      // Register user first
      await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'duplicate@example.com',
          password: 'password123'
        });

      // Try to register again
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'duplicate@example.com',
          password: 'password456'
        });

      expect(response.status).toBe(409);
      expect(response.body).toHaveProperty('error', 'User already exists');
    });

    it('should use email prefix as displayName if not provided', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'autoname@example.com',
          password: 'password123'
        });

      expect(response.status).toBe(201);
      expect(response.body.user).toHaveProperty('displayName', 'autoname');
    });
  });

  describe('POST /api/v1/auth/login', () => {
    beforeEach(async () => {
      // Register a test user
      await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'logintest@example.com',
          password: 'testPassword123'
        });
    });

    it('should login successfully with valid credentials', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'logintest@example.com',
          password: 'testPassword123'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Login successful');
      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body.user).not.toHaveProperty('password');
    });

    it('should return 401 with invalid email', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'testPassword123'
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Invalid credentials');
    });

    it('should return 401 with invalid password', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'logintest@example.com',
          password: 'wrongPassword'
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Invalid credentials');
    });

    it('should return 400 when email is missing', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          password: 'testPassword123'
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Email and password required');
    });

    it('should return 400 when password is missing', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'logintest@example.com'
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Email and password required');
    });
  });

  describe('POST /api/v1/auth/meta', () => {
    it('should login with Meta account successfully', async () => {
      const response = await request(app)
        .post('/api/v1/auth/meta')
        .send({
          metaAccessToken: 'valid-meta-token',
          metaUserId: 'meta123456'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Meta login successful');
      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body).toHaveProperty('isNewUser');
      expect(response.body.user).toHaveProperty('authProvider', 'meta');
    });

    it('should return 400 when Meta credentials are missing', async () => {
      const response = await request(app)
        .post('/api/v1/auth/meta')
        .send({
          metaAccessToken: 'token'
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Meta credentials required');
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('should logout successfully', async () => {
      const response = await request(app)
        .post('/api/v1/auth/logout')
        .send({
          refreshToken: 'some-refresh-token'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Logged out successfully');
    });

    it('should logout successfully even without refresh token', async () => {
      const response = await request(app)
        .post('/api/v1/auth/logout')
        .send({});

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Logged out successfully');
    });
  });

  describe('POST /api/v1/auth/forgot-password', () => {
    it('should always return success to prevent email enumeration', async () => {
      const response = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({
          email: 'nonexistent@example.com'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'If the email exists, a reset link has been sent');
    });

    it('should return 400 when email is missing', async () => {
      const response = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Email required');
    });
  });
});
