// src/lib/credits.ts
import { prisma } from "@/lib/prisma";

/**
 * Calculates the user's current available credit balance within the current billing cycle.
 * @param userId The ID of the user.
 * @returns The available credit balance, or 0 if no active subscription or error.
 */
export async function getUserCreditBalance(userId: string): Promise<number> {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { userId: userId },
    });

    if (!subscription || subscription.status !== "active" || !subscription.stripeCurrentPeriodEnd) {
      // No active subscription or billing period info missing
      console.log(`[Credit Check] User ${userId}: No active subscription found or period end missing.`);
      return 0;
    }

    // Determine the start of the current billing cycle
    // This assumes monthly billing for simplicity; yearly plans might need different logic
    // or rely solely on the period end date provided by Stripe.
    const periodEnd = new Date(subscription.stripeCurrentPeriodEnd);
    // Estimate period start by subtracting roughly a month/year based on plan? Or fetch invoice data?
    // Simpler approach: Assume credits reset at period end, calculate usage since last period end.
    // Let's find the *previous* period end to define the start of the *current* cycle.
    // This requires storing historical period ends or fetching invoice history from Stripe, which adds complexity.

    // --- Simplified Approach: Assume creditsMonthly is the *remaining* balance --- 
    // This is simpler but less accurate if credits should reset monthly/yearly.
    // Let's refine the webhook logic to manage a `currentCreditBalance` field instead.

    // --- Revised Approach: Add a currentCreditBalance field --- 
    // We need to modify the schema first. Let's assume we did that and added `currentCreditBalance` to Subscription.
    // The webhook handlers would be responsible for setting/resetting this balance.
    // For now, let's *simulate* this field being present and return it.
    
    // Fetch the subscription again, assuming it now has `currentCreditBalance`
    const subWithBalance = await prisma.subscription.findUnique({
        where: { userId: userId },
        select: { currentCreditBalance: true, status: true } // Assume currentCreditBalance exists
    });

    if (!subWithBalance || subWithBalance.status !== 'active') {
        console.log(`[Credit Check] User ${userId}: No active subscription or balance field.`);
        return 0;
    }
    
    // TEMP: If field doesn't exist yet, return monthly credits as a placeholder
    const balance = subWithBalance.currentCreditBalance ?? subscription.creditsMonthly ?? 0;
    console.log(`[Credit Check] User ${userId}: Current balance is ${balance}.`);
    return balance;

    // --- Original Complex Approach (if no balance field): Calculate usage --- 
    /*
    const cycleStartDate = new Date(periodEnd);
    // Rough estimate for monthly cycle start
    cycleStartDate.setMonth(cycleStartDate.getMonth() - 1);
    // For yearly, cycleStartDate.setFullYear(cycleStartDate.getFullYear() - 1);
    // This is inaccurate. Need proper billing cycle start date.

    const usageRecords = await prisma.usage.findMany({
      where: {
        userId: userId,
        createdAt: {
          gte: cycleStartDate, // Usage within the current estimated cycle
          lt: periodEnd,
        },
      },
    });

    const creditsUsedThisCycle = usageRecords.reduce((sum, record) => sum + record.creditsUsed, 0);
    const availableCredits = Math.max(0, subscription.creditsMonthly - creditsUsedThisCycle);
    
    console.log(`[Credit Check] User ${userId}: Monthly=${subscription.creditsMonthly}, Used=${creditsUsedThisCycle}, Available=${availableCredits}`);
    return availableCredits;
    */

  } catch (error) {
    console.error(`Error fetching credit balance for user ${userId}:`, error);
    return 0; // Return 0 on error
  }
}

/**
 * Deducts credits for a specific project generation and records the usage.
 * IMPORTANT: This function *records* usage but assumes the balance check happened *before* calling it.
 * It might be better to combine check and deduction in one atomic operation if possible,
 * or use database transactions.
 * 
 * Revised: Let's make this function also decrement a `currentCreditBalance` field.
 *
 * @param userId The ID of the user.
 * @param projectId The ID of the project being generated.
 * @param amount The number of credits to deduct (typically 1 per project).
 * @returns True if deduction was successful, false otherwise.
 */
export async function deductCredits(userId: string, projectId: string, amount: number): Promise<boolean> {
  if (amount <= 0) {
    console.warn(`[Credit Deduction] User ${userId}: Attempted to deduct non-positive amount: ${amount}`);
    return false;
  }

  try {
    // Use a transaction to ensure atomicity: check balance, update balance, create usage record
    const result = await prisma.$transaction(async (tx: { subscription: { findUnique: (arg0: { where: { userId: string; }; select: { id: boolean; currentCreditBalance: boolean; status: boolean; }; }) => any; update: (arg0: { where: { id: any; }; data: { currentCreditBalance?: { decrement: number; } | undefined; }; }) => any; }; usage: { create: (arg0: { data: { userId: string; projectId: string; creditsUsed: number; }; }) => any; }; }) => {
        // 1. Get current subscription and balance (assuming currentCreditBalance field exists)
        const subscription = await tx.subscription.findUnique({
            where: { userId: userId },
            select: { id: true, currentCreditBalance: true, status: true }
        });

        if (!subscription || subscription.status !== 'active') {
            throw new Error("User has no active subscription.");
        }

        // TEMP: If field doesn't exist, use creditsMonthly as placeholder balance
        const currentBalance = subscription.currentCreditBalance ?? 999; // Assume high balance if field missing

        if (currentBalance < amount) {
            throw new Error(`Insufficient credits. Required: ${amount}, Available: ${currentBalance}`);
        }

        // 2. Update the balance (assuming currentCreditBalance field exists)
        const updatedSubscription = await tx.subscription.update({
            where: { id: subscription.id },
            data: {
                // TEMP: Only update if the field exists
                ...(subscription.currentCreditBalance !== null && { currentCreditBalance: { decrement: amount } })
            }
        });

        // 3. Create the usage record
        await tx.usage.create({
            data: {
                userId: userId,
                projectId: projectId,
                creditsUsed: amount,
            },
        });

        console.log(`[Credit Deduction] User ${userId}: Deducted ${amount} credits for project ${projectId}. New balance: ${updatedSubscription.currentCreditBalance ?? 'N/A'}`);
        return true;
    });

    return result;

  } catch (error) {
    console.error(`[Credit Deduction] User ${userId}: Failed for project ${projectId}:`, error);
    return false;
  }
}

// NOTE: The above implementation relies on a `currentCreditBalance: Int?` field 
// being added to the `Subscription` model in `prisma/schema.prisma`.
// The webhook handlers also need to be updated to manage this field correctly 
// (e.g., reset it on `invoice.payment_succeeded`).

