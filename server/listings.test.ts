import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

// Capture mock handles so each test can assert calls.
const dbMocks = vi.hoisted(() => ({
  getListings: vi.fn(),
  getListingById: vi.fn(),
  createListing: vi.fn(),
  addListingPhoto: vi.fn(),
  updateListingStatus: vi.fn(),
  updateListing: vi.fn(),
  deleteListingPhotos: vi.fn(),
  deleteListing: vi.fn(),
  createAuditLog: vi.fn().mockResolvedValue(undefined),
}));

const storageMocks = vi.hoisted(() => ({
  storagePut: vi.fn().mockResolvedValue({
    key: "listings/1/1/mock.jpg",
    url: "https://storage.test/listings/1/1/mock.jpg",
  }),
}));

vi.mock("./db", () => dbMocks);
vi.mock("./storage", () => storageMocks);

// Import AFTER mocks are registered.
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

// Tiny base64-encoded PNG-ish payload; the mocked storagePut doesn't inspect it.
const FAKE_IMAGE_B64 = Buffer.from("fake-image-bytes").toString("base64");

beforeEach(() => {
  for (const fn of Object.values(dbMocks)) fn.mockReset();
  dbMocks.createAuditLog.mockResolvedValue(undefined);
  storageMocks.storagePut.mockReset();
  storageMocks.storagePut.mockResolvedValue({
    key: "listings/1/1/mock.jpg",
    url: "https://storage.test/listings/1/1/mock.jpg",
  });
});

describe("listings.list", () => {
  it("returns active listings from the db helper", async () => {
    dbMocks.getListings.mockResolvedValueOnce([
      {
        id: 42,
        title: "Blue couch",
        price: "150.00",
        status: "active",
        photos: [],
      },
    ]);

    const caller = appRouter.createCaller(makeCtx(1));
    const result = await caller.listings.list();

    expect(dbMocks.getListings).toHaveBeenCalledWith({
      category: undefined,
      search: undefined,
      sellerId: undefined,
      status: "active",
    });
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Blue couch");
  });

  it("passes the category filter through", async () => {
    dbMocks.getListings.mockResolvedValueOnce([]);
    const caller = appRouter.createCaller(makeCtx(1));
    await caller.listings.list({ category: "coins" });
    expect(dbMocks.getListings).toHaveBeenCalledWith(
      expect.objectContaining({ category: "coins", status: "active" }),
    );
  });
});

describe("listings.create", () => {
  it("uploads each photo and inserts photo rows in order", async () => {
    dbMocks.createListing.mockResolvedValueOnce({ id: 101 });
    dbMocks.addListingPhoto.mockResolvedValue({ id: 1 });
    storageMocks.storagePut
      .mockResolvedValueOnce({ key: "k0", url: "u0" })
      .mockResolvedValueOnce({ key: "k1", url: "u1" });

    const caller = appRouter.createCaller(makeCtx(7));
    const result = await caller.listings.create({
      title: "Vintage coin set",
      price: 49.99,
      isFirmOnPrice: true,
      category: "coins",
      subcategory: "US Coins",
      condition: "good",
      description: "Rare 1920s set",
      locationLabel: "Seattle, WA",
      photos: [
        { fileData: FAKE_IMAGE_B64, mimeType: "image/jpeg", fileName: "a.jpg" },
        { fileData: FAKE_IMAGE_B64, mimeType: "image/png", fileName: "b.png" },
      ],
    });

    expect(result).toEqual({ id: 101 });
    expect(dbMocks.createListing).toHaveBeenCalledTimes(1);
    const createArg = dbMocks.createListing.mock.calls[0][0];
    expect(createArg).toMatchObject({
      sellerId: 7,
      title: "Vintage coin set",
      price: "49.99",
      isFirmOnPrice: true,
      category: "coins",
      subcategory: "US Coins",
      condition: "good",
      status: "active",
    });

    expect(storageMocks.storagePut).toHaveBeenCalledTimes(2);
    expect(dbMocks.addListingPhoto).toHaveBeenCalledTimes(2);
    expect(dbMocks.addListingPhoto.mock.calls[0][0]).toMatchObject({
      listingId: 101,
      position: 0,
      fileUrl: "u0",
    });
    expect(dbMocks.addListingPhoto.mock.calls[1][0]).toMatchObject({
      listingId: 101,
      position: 1,
      fileUrl: "u1",
    });
  });

  it("rejects unsupported mime types before creating the listing", async () => {
    const caller = appRouter.createCaller(makeCtx(7));

    await expect(
      caller.listings.create({
        title: "A thing",
        price: 10,
        isFirmOnPrice: false,
        category: "other",
        condition: "good",
        photos: [
          { fileData: FAKE_IMAGE_B64, mimeType: "application/pdf" },
        ],
      }),
    ).rejects.toThrow(/Unsupported image type/);

    expect(dbMocks.createListing).not.toHaveBeenCalled();
    expect(storageMocks.storagePut).not.toHaveBeenCalled();
  });
});

describe("listings.updateStatus", () => {
  it("allows the seller to mark their own listing sold", async () => {
    dbMocks.getListingById.mockResolvedValueOnce({
      id: 5,
      sellerId: 7,
      status: "active",
      photos: [],
    });

    const caller = appRouter.createCaller(makeCtx(7));
    const result = await caller.listings.updateStatus({ id: 5, status: "sold" });

    expect(result).toEqual({ success: true });
    expect(dbMocks.updateListingStatus).toHaveBeenCalledWith(5, "sold");
  });

  it("rejects other users (non-admin)", async () => {
    dbMocks.getListingById.mockResolvedValueOnce({
      id: 5,
      sellerId: 7,
      status: "active",
      photos: [],
    });

    const caller = appRouter.createCaller(makeCtx(99));
    await expect(
      caller.listings.updateStatus({ id: 5, status: "sold" }),
    ).rejects.toThrow(/Not your listing/);
    expect(dbMocks.updateListingStatus).not.toHaveBeenCalled();
  });

  it("allows admins to update any listing", async () => {
    dbMocks.getListingById.mockResolvedValueOnce({
      id: 5,
      sellerId: 7,
      status: "active",
      photos: [],
    });

    const caller = appRouter.createCaller(makeCtx(1, "admin"));
    await caller.listings.updateStatus({ id: 5, status: "removed" });
    expect(dbMocks.updateListingStatus).toHaveBeenCalledWith(5, "removed");
  });

  it("404s when the listing does not exist", async () => {
    dbMocks.getListingById.mockResolvedValueOnce(null);
    const caller = appRouter.createCaller(makeCtx(7));
    await expect(
      caller.listings.updateStatus({ id: 999, status: "sold" }),
    ).rejects.toThrow(/Listing not found/);
  });
});

describe("listings.update", () => {
  it("patches scalar fields and skips photo replacement when no photo input", async () => {
    dbMocks.getListingById.mockResolvedValueOnce({
      id: 5,
      sellerId: 7,
      photos: [],
    });

    const caller = appRouter.createCaller(makeCtx(7));
    await caller.listings.update({
      id: 5,
      title: "New title",
      price: 99,
    });

    expect(dbMocks.updateListing).toHaveBeenCalledWith(5, {
      title: "New title",
      price: "99.00",
    });
    expect(dbMocks.deleteListingPhotos).not.toHaveBeenCalled();
    expect(dbMocks.addListingPhoto).not.toHaveBeenCalled();
  });

  it("replaces photos: keeps selected existing ones and appends new uploads", async () => {
    dbMocks.getListingById.mockResolvedValueOnce({
      id: 5,
      sellerId: 7,
      photos: [
        { id: 101, fileUrl: "u101", fileKey: "k101", position: 0 },
        { id: 102, fileUrl: "u102", fileKey: "k102", position: 1 },
        { id: 103, fileUrl: "u103", fileKey: "k103", position: 2 },
      ],
    });
    storageMocks.storagePut.mockResolvedValueOnce({ key: "knew", url: "unew" });

    const caller = appRouter.createCaller(makeCtx(7));
    await caller.listings.update({
      id: 5,
      existingPhotoIds: [103, 101], // keep 103 first, then 101
      newPhotos: [
        { fileData: FAKE_IMAGE_B64, mimeType: "image/jpeg" },
      ],
    });

    expect(dbMocks.deleteListingPhotos).toHaveBeenCalledWith(5);
    expect(dbMocks.addListingPhoto).toHaveBeenCalledTimes(3);
    // Position 0: kept photo 103
    expect(dbMocks.addListingPhoto.mock.calls[0][0]).toMatchObject({
      listingId: 5, position: 0, fileKey: "k103", fileUrl: "u103",
    });
    // Position 1: kept photo 101
    expect(dbMocks.addListingPhoto.mock.calls[1][0]).toMatchObject({
      listingId: 5, position: 1, fileKey: "k101", fileUrl: "u101",
    });
    // Position 2: newly uploaded (fileKey is generated internally; assert shape + url)
    const appendedArg = dbMocks.addListingPhoto.mock.calls[2][0];
    expect(appendedArg).toMatchObject({
      listingId: 5, position: 2, fileUrl: "unew",
    });
    expect(appendedArg.fileKey).toMatch(/^listings\/7\/5\/.*\.jpeg$/);
  });

  it("rejects photo replacement that would leave zero photos", async () => {
    dbMocks.getListingById.mockResolvedValueOnce({
      id: 5,
      sellerId: 7,
      photos: [{ id: 101, fileUrl: "u", fileKey: "k", position: 0 }],
    });

    const caller = appRouter.createCaller(makeCtx(7));
    await expect(
      caller.listings.update({
        id: 5,
        existingPhotoIds: [],
        newPhotos: [],
      }),
    ).rejects.toThrow(/at least one photo/);
    expect(dbMocks.deleteListingPhotos).not.toHaveBeenCalled();
  });

  it("rejects non-owners", async () => {
    dbMocks.getListingById.mockResolvedValueOnce({
      id: 5,
      sellerId: 7,
      photos: [],
    });
    const caller = appRouter.createCaller(makeCtx(99));
    await expect(
      caller.listings.update({ id: 5, title: "hax" }),
    ).rejects.toThrow(/Not your listing/);
    expect(dbMocks.updateListing).not.toHaveBeenCalled();
  });
});

describe("listings.delete", () => {
  it("deletes when the caller is the seller", async () => {
    dbMocks.getListingById.mockResolvedValueOnce({
      id: 5,
      sellerId: 7,
      photos: [],
    });

    const caller = appRouter.createCaller(makeCtx(7));
    const result = await caller.listings.delete({ id: 5 });
    expect(result).toEqual({ success: true });
    expect(dbMocks.deleteListing).toHaveBeenCalledWith(5);
  });

  it("rejects non-owners", async () => {
    dbMocks.getListingById.mockResolvedValueOnce({
      id: 5,
      sellerId: 7,
      photos: [],
    });
    const caller = appRouter.createCaller(makeCtx(99));
    await expect(caller.listings.delete({ id: 5 })).rejects.toThrow(/Not your listing/);
    expect(dbMocks.deleteListing).not.toHaveBeenCalled();
  });
});
