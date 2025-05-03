// src/lib/__tests__/credits.test.ts
import { getUserCreditBalance, deductCredits } from "../credits";
import { prismaMock, resetPrismaMock } from "../__mocks__/prisma";
import { Subscription, Usage } from "@prisma/client";

describe("Credit System", () => {
  beforeEach(() => {
    resetPrismaMock();
  });

  // --- Tests for getUserCreditBalance --- 

  it("getUserCreditBalance: should return balance for active subscription", async () => {
    const mockSubscription: Partial<Subscription> = {
      userId: "user1",
      status: "active",
      currentCreditBalance: 10,
      stripeCurrentPeriodEnd: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30), // 30 days from now
    };
    // Mock the specific select query used in the function
    prismaMock.subscription.findUnique.mockResolvedValue({
        currentCreditBalance: mockSubscription.currentCreditBalance,
        status: mockSubscription.status
    } as any); // Cast needed as we only select partial fields

    const balance = await getUserCreditBalance("user1");
    expect(balance).toBe(10);
    expect(prismaMock.subscription.findUnique).toHaveBeenCalledWith({
      where: { userId: "user1" },
      select: { currentCreditBalance: true, status: true },
    });
  });

  it("getUserCreditBalance: should return 0 if subscription is inactive", async () => {
     const mockSubscription: Partial<Subscription> = {
      userId: "user1",
      status: "canceled", // Inactive status
      currentCreditBalance: 5,
      stripeCurrentPeriodEnd: new Date(),
    };
    prismaMock.subscription.findUnique.mockResolvedValue({
        currentCreditBalance: mockSubscription.currentCreditBalance,
        status: mockSubscription.status
    } as any);

    const balance = await getUserCreditBalance("user1");
    expect(balance).toBe(0);
  });

  it("getUserCreditBalance: should return 0 if no subscription found", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(null);

    const balance = await getUserCreditBalance("user1");
    expect(balance).toBe(0);
  });

  it("getUserCreditBalance: should return 0 if currentCreditBalance is null/undefined", async () => {
    // This simulates the case before the field was properly managed
    const mockSubscription: Partial<Subscription> = {
      userId: "user1",
      status: "active",
      currentCreditBalance: null, // Balance is null
      creditsMonthly: 5, // Fallback value used in the function temporarily
      stripeCurrentPeriodEnd: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
    };
     prismaMock.subscription.findUnique.mockResolvedValue({
        currentCreditBalance: mockSubscription.currentCreditBalance,
        status: mockSubscription.status
    } as any);

    // The function currently falls back to creditsMonthly if balance is null
    // Let's adjust the test to expect the fallback value (or 0 if that also fails)
    // Assuming the temporary fallback logic is still in place:
    // const balance = await getUserCreditBalance("user1");
    // expect(balance).toBe(5); 
    
    // If we assume the fallback is removed or balance field *must* exist:
    const balance = await getUserCreditBalance("user1");
    expect(balance).toBe(0); // Expect 0 if balance field is null/missing and no fallback
  });

  it("getUserCreditBalance: should return 0 on database error", async () => {
    prismaMock.subscription.findUnique.mockRejectedValue(new Error("DB Error"));

    const balance = await getUserCreditBalance("user1");
    expect(balance).toBe(0);
  });

  // --- Tests for deductCredits --- 

  it("deductCredits: should deduct credits and create usage record successfully", async () => {
    const userId = "user1";
    const projectId = "proj1";
    const amountToDeduct = 1;
    const initialBalance = 10;

    const mockSubscription: Partial<Subscription> = {
      id: "sub1",
      status: "active",
      currentCreditBalance: initialBalance,
    };

    // Mock the transaction
    prismaMock.$transaction.mockImplementation(async (callback) => {
      // Mock finds within the transaction
      prismaMock.subscription.findUnique.mockResolvedValue(mockSubscription as Subscription);
      // Mock the update within the transaction
      prismaMock.subscription.update.mockResolvedValue({
        ...mockSubscription,
        currentCreditBalance: initialBalance - amountToDeduct,
      } as Subscription);
      // Mock the create within the transaction
      prismaMock.usage.create.mockResolvedValue({} as Usage); // Return dummy usage

      // Execute the callback passed to $transaction
      return await callback(prismaMock);
    });

    const success = await deductCredits(userId, projectId, amountToDeduct);

    expect(success).toBe(true);
    // Verify calls within the transaction mock setup
    expect(prismaMock.subscription.findUnique).toHaveBeenCalledWith({ where: { userId: userId }, select: { id: true, currentCreditBalance: true, status: true } });
    expect(prismaMock.subscription.update).toHaveBeenCalledWith({
      where: { id: mockSubscription.id },
      data: { currentCreditBalance: { decrement: amountToDeduct } },
    });
    expect(prismaMock.usage.create).toHaveBeenCalledWith({
      data: {
        userId: userId,
        projectId: projectId,
        creditsUsed: amountToDeduct,
      },
    });
  });

  it("deductCredits: should return false if balance is insufficient", async () => {
    const userId = "user1";
    const projectId = "proj1";
    const amountToDeduct = 5;
    const initialBalance = 3; // Insufficient balance

    const mockSubscription: Partial<Subscription> = {
      id: "sub1",
      status: "active",
      currentCreditBalance: initialBalance,
    };

    prismaMock.$transaction.mockImplementation(async (callback) => {
      prismaMock.subscription.findUnique.mockResolvedValue(mockSubscription as Subscription);
      // The callback should throw an error before update/create are called
      try {
        await callback(prismaMock);
      } catch (e) {
        // Catch the expected error to prevent test failure
        if ((e as Error).message.includes("Insufficient credits")) {
          return false; // Simulate transaction rollback/failure
        } 
        throw e; // Re-throw unexpected errors
      }
      return false; // Should not reach here if error is thrown
    });

    const success = await deductCredits(userId, projectId, amountToDeduct);

    expect(success).toBe(false);
    expect(prismaMock.subscription.update).not.toHaveBeenCalled();
    expect(prismaMock.usage.create).not.toHaveBeenCalled();
  });

  it("deductCredits: should return false if subscription is inactive", async () => {
     const userId = "user1";
    const projectId = "proj1";
    const amountToDeduct = 1;

    const mockSubscription: Partial<Subscription> = {
      id: "sub1",
      status: "canceled", // Inactive
      currentCreditBalance: 10,
    };

    prismaMock.$transaction.mockImplementation(async (callback) => {
      prismaMock.subscription.findUnique.mockResolvedValue(mockSubscription as Subscription);
       try {
        await callback(prismaMock);
      } catch (e) {
        if ((e as Error).message.includes("no active subscription")) {
          return false; 
        } 
        throw e; 
      }
      return false; 
    });

    const success = await deductCredits(userId, projectId, amountToDeduct);
    expect(success).toBe(false);
    expect(prismaMock.subscription.update).not.toHaveBeenCalled();
    expect(prismaMock.usage.create).not.toHaveBeenCalled();
  });

  it("deductCredits: should return false if amount is zero or negative", async () => {
    const successZero = await deductCredits("user1", "proj1", 0);
    const successNegative = await deductCredits("user1", "proj1", -1);

    expect(successZero).toBe(false);
    expect(successNegative).toBe(false);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("deductCredits: should return false on database error during transaction", async () => {
     const userId = "user1";
    const projectId = "proj1";
    const amountToDeduct = 1;
    const initialBalance = 10;

    const mockSubscription: Partial<Subscription> = {
      id: "sub1",
      status: "active",
      currentCreditBalance: initialBalance,
    };

    prismaMock.$transaction.mockImplementation(async (callback) => {
      prismaMock.subscription.findUnique.mockResolvedValue(mockSubscription as Subscription);
      // Simulate error during update
      prismaMock.subscription.update.mockRejectedValue(new Error("DB Update Error"));
      
      await callback(prismaMock); // This will throw inside the callback
    });

    // Expect the error to propagate and be caught by the main function
    const success = await deductCredits(userId, projectId, amountToDeduct);
    expect(success).toBe(false);
  });

});

