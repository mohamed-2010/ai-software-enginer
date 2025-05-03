// src/components/SubscriptionPlans.tsx
"use client";

import React, { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { stripePlans, StripePlan } from "@/lib/stripe/config";
import { createCheckoutSession } from "@/app/actions/stripeActions";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";

// Load Stripe.js with your public key (ensure this is set in your .env.local)
// NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ""
);

export function SubscriptionPlans() {
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCheckout = async (plan: StripePlan) => {
    setError(null);
    setLoadingPlan(plan.priceId);

    if (!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) {
        setError("Stripe is not configured correctly. Publishable key missing.");
        setLoadingPlan(null);
        return;
    }

    try {
      // 1. Create the checkout session on the server
      const { sessionId, error: sessionError } = await createCheckoutSession(plan.priceId);

      if (sessionError || !sessionId) {
        throw new Error(sessionError || "Failed to create checkout session.");
      }

      // 2. Redirect to Stripe Checkout
      const stripe = await stripePromise;
      if (!stripe) {
        throw new Error("Stripe.js failed to load.");
      }

      const { error: stripeError } = await stripe.redirectToCheckout({ sessionId });

      if (stripeError) {
        // This error is typically displayed by Stripe itself, but log it just in case
        console.error("Stripe redirectToCheckout error:", stripeError);
        setError(`Failed to redirect to checkout: ${stripeError.message}`);
      }
      // If redirection is successful, the user won't see subsequent code here

    } catch (err) {
      console.error("Checkout error:", err);
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <div className="container mx-auto py-8">
      <h2 className="text-2xl font-bold text-center mb-6">Choose Your Plan</h2>
      {error && (
        <div className="mb-4 text-center text-red-600 bg-red-100 p-3 rounded-md">
          {error}
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
        {stripePlans.map((plan) => (
          <Card key={plan.priceId}>
            <CardHeader>
              <CardTitle>{plan.name} Plan</CardTitle>
              <CardDescription>{plan.credits} credits per month</CardDescription> {/* Adjust description based on plan frequency */}
            </CardHeader>
            <CardContent>
              {/* Add more details about the plan if needed */}
              <p>Get access to AI-powered project generation.</p>
            </CardContent>
            <CardFooter>
              <Button
                onClick={() => handleCheckout(plan)}
                disabled={loadingPlan === plan.priceId}
                className="w-full"
              >
                {loadingPlan === plan.priceId ? "Processing..." : `Subscribe ${plan.name}`}
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
      <p className="text-center text-sm text-gray-500 mt-4">
        You will be redirected to Stripe to complete your purchase securely.
      </p>
    </div>
  );
}

