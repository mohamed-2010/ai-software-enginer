// src/lib/stripe/config.ts

export interface StripePlan {
  name: string; // e.g., "Monthly", "Yearly"
  priceId: string; // Stripe Price ID (use test IDs for development)
  credits: number; // Monthly credits allocated for this plan
}

// Define your subscription plans here
// Replace price IDs with your actual Stripe Price IDs in production
export const stripePlans: StripePlan[] = [
  {
    name: "Monthly",
    priceId: process.env.STRIPE_MONTHLY_PRICE_ID || "price_monthly_test", // Use environment variable or fallback to test ID
    credits: 10, // Example: 10 credits per month
  },
  {
    name: "Yearly",
    priceId: process.env.STRIPE_YEARLY_PRICE_ID || "price_yearly_test", // Use environment variable or fallback to test ID
    credits: 150, // Example: 150 credits per year (equivalent to 12.5/month, slight discount)
  },
  // Add a free plan if needed, though it might not involve Stripe directly
  // {
  //   name: "Free",
  //   priceId: "", // No Stripe price ID for free plan
  //   credits: 1, // Example: 1 credit total or per month
  // },
];

// Helper function to find a plan by its Price ID
export function findPlanByPriceId(priceId: string): StripePlan | undefined {
  return stripePlans.find((plan) => plan.priceId === priceId);
}

// Helper function to find a plan by its Name
export function findPlanByName(name: string): StripePlan | undefined {
  return stripePlans.find((plan) => plan.name.toLowerCase() === name.toLowerCase());
}

