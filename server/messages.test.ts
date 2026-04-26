import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const dbMocks = vi.hoisted(() => ({
  // listings (only ones the messages router touches)
  getListingById: vi.fn(),
  // messages
  getOrCreateListingThread: vi.fn(),
  getListingThreadById: vi.fn(),
  getListingThreadsForUser: vi.fn(),
  addListingMessage: vi.fn(),
  getListingMessages: vi.fn(),
  markListingThreadRead: vi.fn(),
  getUnreadListingMessageCount: vi.fn(),
  // pulled in by audit log helper which the router doesn't call here, but
  // the import graph touches it.
  createAuditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./db", () => dbMocks);
vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ key: "k", url: "u" }),
}));

const { appRouter } = await import("./routers");

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function makeCtx(userId: number, role: AuthenticatedUser["role"] = "user"): TrpcContext {
  const user: AuthenticatedUser = {
    id: userId,
    openId: `user-${userId}`,
    email: `u${userId}@example.com`,
    name: `User ${userId}`,
    loginMethod: "manus",
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

beforeEach(() => {
  for (const fn of Object.values(dbMocks)) fn.mockReset();
  dbMocks.createAuditLog.mockResolvedValue(undefined);
});

describe("messages.startThread", () => {
  it("creates or returns an existing thread between buyer and seller", async () => {
    dbMocks.getListingById.mockResolvedValueOnce({
      id: 10, sellerId: 7, photos: [],
    });
    dbMocks.getOrCreateListingThread.mockResolvedValueOnce({ id: 555 });

    const caller = appRouter.createCaller(makeCtx(99));
    const result = await caller.messages.startThread({ listingId: 10 });

    expect(result).toEqual({ id: 555 });
    expect(dbMocks.getOrCreateListingThread).toHaveBeenCalledWith({
      listingId: 10,
      buyerId: 99,
      sellerId: 7,
    });
  });

  it("rejects messaging your own listing", async () => {
    dbMocks.getListingById.mockResolvedValueOnce({
      id: 10, sellerId: 7, photos: [],
    });
    const caller = appRouter.createCaller(makeCtx(7));
    await expect(
      caller.messages.startThread({ listingId: 10 }),
    ).rejects.toThrow(/can't message yourself/);
    expect(dbMocks.getOrCreateListingThread).not.toHaveBeenCalled();
  });

  it("404s when the listing doesn't exist", async () => {
    dbMocks.getListingById.mockResolvedValueOnce(null);
    const caller = appRouter.createCaller(makeCtx(99));
    await expect(
      caller.messages.startThread({ listingId: 9999 }),
    ).rejects.toThrow(/Listing not found/);
  });
});

describe("messages.thread", () => {
  it("returns the thread + messages for the buyer", async () => {
    dbMocks.getListingThreadById.mockResolvedValueOnce({
      id: 1, listingId: 10, buyerId: 99, sellerId: 7,
    });
    dbMocks.getListingById.mockResolvedValueOnce({
      id: 10, sellerId: 7, title: "Coin", photos: [],
    });
    dbMocks.getListingMessages.mockResolvedValueOnce([
      { id: 1, threadId: 1, senderId: 99, body: "Hi", readAt: null, createdAt: new Date() },
    ]);

    const caller = appRouter.createCaller(makeCtx(99));
    const t = await caller.messages.thread({ id: 1 });

    expect(t.role).toBe("buyer");
    expect(t.messages).toHaveLength(1);
    expect(t.listing?.title).toBe("Coin");
  });

  it("returns role='seller' for the seller", async () => {
    dbMocks.getListingThreadById.mockResolvedValueOnce({
      id: 1, listingId: 10, buyerId: 99, sellerId: 7,
    });
    dbMocks.getListingById.mockResolvedValueOnce({
      id: 10, sellerId: 7, title: "Coin", photos: [],
    });
    dbMocks.getListingMessages.mockResolvedValueOnce([]);

    const caller = appRouter.createCaller(makeCtx(7));
    const t = await caller.messages.thread({ id: 1 });
    expect(t.role).toBe("seller");
  });

  it("forbids users who are neither buyer nor seller", async () => {
    dbMocks.getListingThreadById.mockResolvedValueOnce({
      id: 1, listingId: 10, buyerId: 99, sellerId: 7,
    });
    const caller = appRouter.createCaller(makeCtx(123));
    await expect(caller.messages.thread({ id: 1 })).rejects.toThrow(/Not your thread/);
  });

  it("admins can read any thread", async () => {
    dbMocks.getListingThreadById.mockResolvedValueOnce({
      id: 1, listingId: 10, buyerId: 99, sellerId: 7,
    });
    dbMocks.getListingById.mockResolvedValueOnce({
      id: 10, sellerId: 7, photos: [],
    });
    dbMocks.getListingMessages.mockResolvedValueOnce([]);

    const caller = appRouter.createCaller(makeCtx(1, "admin"));
    const t = await caller.messages.thread({ id: 1 });
    expect(t.id).toBe(1);
  });
});

describe("messages.send", () => {
  it("inserts a message under the caller's id", async () => {
    dbMocks.getListingThreadById.mockResolvedValueOnce({
      id: 1, listingId: 10, buyerId: 99, sellerId: 7,
    });
    dbMocks.addListingMessage.mockResolvedValueOnce({ id: 42 });

    const caller = appRouter.createCaller(makeCtx(99));
    const result = await caller.messages.send({
      threadId: 1,
      body: "Is it still available?",
    });

    expect(result).toEqual({ id: 42 });
    expect(dbMocks.addListingMessage).toHaveBeenCalledWith({
      threadId: 1,
      senderId: 99,
      body: "Is it still available?",
    });
  });

  it("rejects empty messages (after trim)", async () => {
    const caller = appRouter.createCaller(makeCtx(99));
    await expect(
      caller.messages.send({ threadId: 1, body: "   " }),
    ).rejects.toThrow();
    expect(dbMocks.addListingMessage).not.toHaveBeenCalled();
  });

  it("forbids non-participants", async () => {
    dbMocks.getListingThreadById.mockResolvedValueOnce({
      id: 1, listingId: 10, buyerId: 99, sellerId: 7,
    });
    const caller = appRouter.createCaller(makeCtx(123));
    await expect(
      caller.messages.send({ threadId: 1, body: "hi" }),
    ).rejects.toThrow(/Not your thread/);
    expect(dbMocks.addListingMessage).not.toHaveBeenCalled();
  });
});

describe("messages.markRead", () => {
  it("marks the thread read for the caller", async () => {
    dbMocks.getListingThreadById.mockResolvedValueOnce({
      id: 1, listingId: 10, buyerId: 99, sellerId: 7,
    });

    const caller = appRouter.createCaller(makeCtx(99));
    const result = await caller.messages.markRead({ threadId: 1 });

    expect(result).toEqual({ success: true });
    expect(dbMocks.markListingThreadRead).toHaveBeenCalledWith(1, 99);
  });

  it("forbids non-participants", async () => {
    dbMocks.getListingThreadById.mockResolvedValueOnce({
      id: 1, listingId: 10, buyerId: 99, sellerId: 7,
    });
    const caller = appRouter.createCaller(makeCtx(123));
    await expect(
      caller.messages.markRead({ threadId: 1 }),
    ).rejects.toThrow(/Not your thread/);
    expect(dbMocks.markListingThreadRead).not.toHaveBeenCalled();
  });
});

describe("messages.inbox / unreadCount", () => {
  it("forwards to the db helpers scoped to the caller", async () => {
    dbMocks.getListingThreadsForUser.mockResolvedValueOnce([]);
    dbMocks.getUnreadListingMessageCount.mockResolvedValueOnce(3);

    const caller = appRouter.createCaller(makeCtx(99));
    expect(await caller.messages.inbox()).toEqual([]);
    expect(dbMocks.getListingThreadsForUser).toHaveBeenCalledWith(99);
    expect(await caller.messages.unreadCount()).toBe(3);
    expect(dbMocks.getUnreadListingMessageCount).toHaveBeenCalledWith(99);
  });
});
