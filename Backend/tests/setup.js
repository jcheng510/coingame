// Mock Prisma Client for tests
jest.mock('@prisma/client', () => {
  const mockPrismaClient = {
    wallet: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    transaction: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
    },
    redemptionOption: {
      findUnique: jest.fn(),
    },
    redemption: {
      create: jest.fn(),
    },
    dailyStats: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
    $transaction: jest.fn((callback) => {
      // Mock transaction - just execute the callback with mocked tx
      return callback(mockPrismaClient);
    }),
  };

  return {
    PrismaClient: jest.fn(() => mockPrismaClient),
  };
});

// Suppress console.log during tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
};
