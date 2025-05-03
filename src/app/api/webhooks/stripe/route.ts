// src/app/api/webhooks/stripe/route.ts
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe/client";
import { prisma } from "@/lib/prisma";
import { findPlanByPriceId } from "@/lib/stripe/config";

// Ensure the Stripe webhook secret is set in environment variables
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

export async function POST(req: NextRequest) {
  if (!stripeWebhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET is not set.");
    return NextResponse.json({ error: "Webhook secret not configured." }, { status: 500 });
  }

  const body = await req.text();
  const signature = headers().get("stripe-signature");

  if (!signature) {
    console.error("Missing stripe-signature header.");
    return NextResponse.json({ error: "Missing webhook signature." }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, stripeWebhookSecret);
    console.log(`Received Stripe webhook event: ${event.type}`);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error(`Webhook signature verification failed: ${errorMessage}`);
    return NextResponse.json({ error: `Webhook error: ${errorMessage}` }, { status: 400 });
  }

  // Handle the specific event types
  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case "invoice.payment_succeeded":
        await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;

      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    // Return a 200 response to acknowledge receipt of the event
    return NextResponse.json({ received: true });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown processing error";
    console.error(`Error processing webhook ${event.type}:`, error);
    // Return 500 to indicate a server error, Stripe will retry
    return NextResponse.json({ error: `Webhook handler failed: ${errorMessage}` }, { status: 500 });
  }
}

// --- Handler Functions ---

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  console.log(`Handling checkout.session.completed for session: ${session.id}`);
  const userId = session.metadata?.userId;
  const stripeSubscriptionId = session.subscription;
  const stripeCustomerId = typeof session.customer === "string" ? session.customer : session.customer?.id;

  if (!userId || !stripeSubscriptionId || !stripeCustomerId) {
    console.error("Missing metadata (userId) or subscription/customer ID in checkout session.", session.metadata);
    return;
  }

  const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId as string);
  const priceId = subscription.items.data[0]?.price.id;
  const plan = findPlanByPriceId(priceId);

  if (!plan) {
    console.error(`Could not find plan details for price ID: ${priceId}`);
    return;
  }

  console.log(`Updating subscription for user ${userId}. Plan: ${plan.name}, Stripe Sub ID: ${subscription.id}`);

  // Update or create the user's subscription record
  await prisma.subscription.upsert({
    where: { userId: userId },
    update: {
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: stripeCustomerId,
      stripePriceId: priceId,
      planName: plan.name,
      creditsMonthly: plan.credits, // Store the plan's base credits
      currentCreditBalance: plan.credits, // Set initial balance
      status: subscription.status,
      stripeCurrentPeriodEnd: new Date(subscription.current_period_end * 1000),
    },
    create: {
      userId: userId,
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: stripeCustomerId,
      stripePriceId: priceId,
      planName: plan.name,
      creditsMonthly: plan.credits,
      currentCreditBalance: plan.credits, // Set initial balance
      status: subscription.status,
      stripeCurrentPeriodEnd: new Date(subscription.current_period_end * 1000),
    },
  });

  console.log(`User ${userId} subscription updated/created successfully. Balance set to ${plan.credits}.`);
}

async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  console.log(`Handling invoice.payment_succeeded for invoice: ${invoice.id}`);
  const stripeSubscriptionId = invoice.subscription;
  const stripeCustomerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;

  if (!stripeSubscriptionId || !stripeCustomerId || invoice.billing_reason !== "subscription_cycle") {
    console.log(`Ignoring invoice ${invoice.id}. Reason: ${invoice.billing_reason}, SubID: ${stripeSubscriptionId}`);
    return;
  }

  const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId as string);
  const priceId = subscription.items.data[0]?.price.id;
  const plan = findPlanByPriceId(priceId);

  if (!plan) {
    console.error(`Could not find plan details for price ID: ${priceId} during invoice processing.`);
    return;
  }

  console.log(`Processing renewal for subscription ${subscription.id}. Plan: ${plan.name}`);

  // Update subscription: reset credits to plan's monthly allocation and update period end
  await prisma.subscription.update({
    where: { stripeSubscriptionId: subscription.id },
    data: {
      currentCreditBalance: plan.credits, // Reset balance to plan's allocation
      status: subscription.status,
      stripeCurrentPeriodEnd: new Date(subscription.current_period_end * 1000),
    },
  });

  console.log(`Subscription ${subscription.id} renewed. Balance reset to ${plan.credits}.`);
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  console.log(`Handling customer.subscription.updated for subscription: ${subscription.id}`);
  const stripeSubscriptionId = subscription.id;
  const priceId = subscription.items.data[0]?.price.id;
  const plan = findPlanByPriceId(priceId);

  const dbSubscription = await prisma.subscription.findUnique({
      where: { stripeSubscriptionId: stripeSubscriptionId },
      select: { userId: true, stripePriceId: true } // Select fields needed
  });

  if (!dbSubscription) {
      console.error(`Subscription ${stripeSubscriptionId} not found in database during update.`);
      return;
  }

  let updateData: any = {
    status: subscription.status,
    stripePriceId: priceId,
    stripeCurrentPeriodEnd: new Date(subscription.current_period_end * 1000),
  };

  if (plan) {
    updateData.planName = plan.name;
    updateData.creditsMonthly = plan.credits; // Update base credits from plan
    // If the plan changed, reset the current balance to the new plan's credits
    if (dbSubscription.stripePriceId !== priceId) {
        console.log(`Plan changed for subscription ${subscription.id}. New plan: ${plan.name}. Resetting balance.`);
        updateData.currentCreditBalance = plan.credits;
    }
  } else {
      console.warn(`Plan details not found for price ID: ${priceId} during subscription update.`);
  }

  // Handle specific statuses
  if (subscription.cancel_at_period_end) {
      console.log(`Subscription ${subscription.id} scheduled for cancellation at period end.`);
      updateData.status = "active_until_period_end";
  } else if (subscription.status === "canceled") {
      console.log(`Subscription ${subscription.id} was canceled.`);
      updateData.status = "canceled";
      updateData.currentCreditBalance = 0; // Zero out balance on cancellation
  } else if (subscription.status === "incomplete_expired" || subscription.status === "past_due" || subscription.status === "unpaid") {
      console.log(`Subscription ${subscription.id} has payment issue: ${subscription.status}. Setting balance to 0.`);
      updateData.currentCreditBalance = 0; // Zero out balance on payment failure
  }

  await prisma.subscription.update({
    where: { stripeSubscriptionId: stripeSubscriptionId },
    data: updateData,
  });

  console.log(`Subscription ${subscription.id} status updated to ${updateData.status}. Balance: ${updateData.currentCreditBalance ?? 'unchanged'}`);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  console.log(`Handling customer.subscription.deleted for subscription: ${subscription.id}`);
  const stripeSubscriptionId = subscription.id;

  try {
    // Use updateMany in case the unique constraint was somehow removed or record deleted
    const result = await prisma.subscription.updateMany({
      where: { stripeSubscriptionId: stripeSubscriptionId },
      data: {
        status: "canceled",
        stripePriceId: null,
        currentCreditBalance: 0,
        stripeSubscriptionId: null, // Clear Stripe ID to prevent future conflicts?
        stripeCurrentPeriodEnd: null,
      },
    });
    if (result.count > 0) {
        console.log(`Subscription ${stripeSubscriptionId} marked as canceled in database. Records updated: ${result.count}`);
    } else {
        console.warn(`Subscription ${stripeSubscriptionId} not found in DB during deletion handling or already updated.`);
    }
  } catch (error) {
      console.error(`Error marking subscription ${stripeSubscriptionId} as canceled:`, error);
      // Don't re-throw to avoid Stripe retries for potentially non-recoverable DB issues
  }
}

