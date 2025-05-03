// src/app/actions/stripeActions.ts
"use server";

import { stripe } from "@/lib/stripe/client";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getServerSession } from "next-auth/next";
import { headers } from "next/headers";
import { findPlanByPriceId } from "@/lib/stripe/config";

interface CreateCheckoutSessionResponse {
  sessionId?: string;
  error?: string;
}

export async function createCheckoutSession(
  priceId: string
): Promise<CreateCheckoutSessionResponse> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id || !session?.user?.email) {
    return { error: "User not authenticated or email missing." };
  }

  const userId = session.user.id;
  const userEmail = session.user.email;

  // Find the plan details based on the priceId
  const plan = findPlanByPriceId(priceId);
  if (!plan) {
    return { error: "Invalid plan selected." };
  }

  // Construct the base URL for success/cancel redirects
  const headersList = headers();
  const protocol = headersList.get("x-forwarded-proto") || "http";
  const host = headersList.get("host") || "localhost:3000"; // Fallback for local dev
  const baseUrl = `${protocol}://${host}`;
  const successUrl = `${baseUrl}/dashboard?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${baseUrl}/dashboard`; // Or a dedicated pricing/cancel page

  try {
    // Check if user already has a Stripe customer ID
    let user = await prisma.user.findUnique({
      where: { id: userId },
      include: { subscription: true },
    });

    let stripeCustomerId = user?.subscription?.stripeCustomerId;

    // If no customer ID, create one in Stripe
    if (!stripeCustomerId) {
      console.log(`Creating Stripe customer for user ${userId} with email ${userEmail}`);
      const customer = await stripe.customers.create({
        email: userEmail,
        name: session.user.name ?? undefined,
        metadata: {
          userId: userId,
        },
      });
      stripeCustomerId = customer.id;
      console.log(`Stripe customer created: ${stripeCustomerId}`);

      // Update user's subscription record (or create if needed)
      if (user?.subscription) {
        await prisma.subscription.update({
          where: { userId: userId },
          data: { stripeCustomerId: stripeCustomerId },
        });
      } else {
        // If user has no subscription record at all, create a basic one
        // This might happen if they skipped a free tier setup
        await prisma.subscription.create({
          data: {
            userId: userId,
            stripeCustomerId: stripeCustomerId,
            planName: "None", // Placeholder until subscription is active
            creditsMonthly: 0,
            status: "incomplete",
          },
        });
      }
    } else {
      console.log(`Using existing Stripe customer ID: ${stripeCustomerId} for user ${userId}`);
    }

    // Create the Stripe Checkout session
    console.log(`Creating Stripe Checkout session for customer ${stripeCustomerId} and price ${priceId}`);
    const checkoutSession = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "subscription",
      customer: stripeCustomerId,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      // Add metadata to link session to user, useful for webhooks
      metadata: {
        userId: userId,
        priceId: priceId,
      },
      // Enable promotion codes if needed
      // allow_promotion_codes: true,
    });

    if (!checkoutSession.id) {
      return { error: "Could not create Stripe Checkout session." };
    }

    console.log(`Stripe Checkout session created: ${checkoutSession.id}`);
    return { sessionId: checkoutSession.id };

  } catch (error) {
    console.error("Error creating Stripe Checkout session:", error);
    return { error: `An unexpected error occurred: ${error instanceof Error ? error.message : String(error)}` };
  }
}

