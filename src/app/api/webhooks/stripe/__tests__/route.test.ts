// src/app/api/webhooks/stripe/__tests__/route.test.ts
import { POST } from "../route";
import { NextRequest } from "next/server";
import { headers } from "next/headers";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe/client"; // Assuming this is the initialized client
import { prismaMock, resetPrismaMock } from "@/lib/__mocks__/prisma";
import { findPlanByPriceId } from "@/lib/stripe/config";

// Mock external dependencies
jest.mock("next/headers", () => ({
  headers: jest.fn(),
}));
jest.mock("@/lib/stripe/client", () => ({
  stripe: {
    webhooks: {
      constructEvent: jest.fn(),
    },
    subscriptions: {
      retrieve: jest.fn(),
    },
    // Add other Stripe methods if needed by handlers
  },
}));
jest.mock("@/lib/stripe/config", () => ({
  findPlanByPriceId: jest.fn(),
}));

// Mock process.env
const OLD_ENV = process.env;

describe("Stripe Webhook Handler (POST)", () => {
  const mockWebhookSecret = "whsec_test_secret";

  beforeEach(() => {
    resetPrismaMock();
    jest.clearAllMocks();
    // Mock headers().get
    (headers as jest.Mock).mockReturnValue({
      get: jest.fn().mockReturnValue("t=123,v1=test_signature"),
    });
    // Set the env variable for the test
    process.env = { ...OLD_ENV, STRIPE_WEBHOOK_SECRET: mockWebhookSecret };
  });

  afterAll(() => {
    process.env = OLD_ENV; // Restore old environment
  });

  // --- Test POST handler logic ---

  it("should return 400 if signature is missing", async () => {
    (headers as jest.Mock).mockReturnValue({ get: jest.fn().mockReturnValue(null) }); // No signature
    const mockRequest = new NextRequest("http://localhost/api/webhooks/stripe", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const response = await POST(mockRequest);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toContain("Missing webhook signature");
  });

  it("should return 400 if webhook secret is not configured", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET; // Remove secret
    const mockRequest = new NextRequest("http://localhost/api/webhooks/stripe", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const response = await POST(mockRequest);
    const json = await response.json();

    expect(response.status).toBe(500); // The code returns 500 for config error
    expect(json.error).toContain("Webhook secret not configured");
  });

  it("should return 400 if signature verification fails", async () => {
    const mockError = new Error("Invalid signature");
    (stripe.webhooks.constructEvent as jest.Mock).mockImplementation(() => {
      throw mockError;
    });

    const mockRequest = new NextRequest("http://localhost/api/webhooks/stripe", {
      method: "POST",
      body: "raw_body_text",
    });

    const response = await POST(mockRequest);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toContain("Webhook error: Invalid signature");
    expect(stripe.webhooks.constructEvent).toHaveBeenCalledWith(
      "raw_body_text",
      "t=123,v1=test_signature",
      mockWebhookSecret
    );
  });

  it("should return 200 and call handler for checkout.session.completed", async () => {
    const mockEvent = {
      id: "evt_test",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test",
          metadata: { userId: "user123" },
          subscription: "sub_test",
          customer: "cus_test",
          // ... other session properties
        } as Stripe.Checkout.Session,
      },
    } as Stripe.Event;

    (stripe.webhooks.constructEvent as jest.Mock).mockReturnValue(mockEvent);

    // Mock dependencies for the handler
    const mockSubscription = { id: "sub_test", items: { data: [{ price: { id: "price_pro_monthly" } }] }, status: "active", current_period_end: Math.floor(Date.now() / 1000) + 30*24*60*60 } as Stripe.Subscription;
    (stripe.subscriptions.retrieve as jest.Mock).mockResolvedValue(mockSubscription);
    const mockPlan = { name: "Pro Monthly", credits: 10 }; // Matched plan
    (findPlanByPriceId as jest.Mock).mockReturnValue(mockPlan);
    prismaMock.subscription.upsert.mockResolvedValue({} as any); // Mock upsert

    const mockRequest = new NextRequest("http://localhost/api/webhooks/stripe", {
      method: "POST",
      body: "raw_body_text",
    });

    const response = await POST(mockRequest);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.received).toBe(true);
    expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith("sub_test");
    expect(findPlanByPriceId).toHaveBeenCalledWith("price_pro_monthly");
    expect(prismaMock.subscription.upsert).toHaveBeenCalledWith(expect.objectContaining({
        where: { userId: "user123" },
        create: expect.objectContaining({ userId: "user123", planName: mockPlan.name, creditsMonthly: mockPlan.credits, currentCreditBalance: mockPlan.credits }),
        update: expect.objectContaining({ planName: mockPlan.name, creditsMonthly: mockPlan.credits, currentCreditBalance: mockPlan.credits }),
    }));
  });

  it("should return 200 and call handler for invoice.payment_succeeded (renewal)", async () => {
    const mockEvent = {
      id: "evt_test_invoice",
      type: "invoice.payment_succeeded",
      data: {
        object: {
          id: "in_test",
          subscription: "sub_test",
          customer: "cus_test",
          billing_reason: "subscription_cycle", // Important for renewal logic
          // ... other invoice properties
        } as Stripe.Invoice,
      },
    } as Stripe.Event;

    (stripe.webhooks.constructEvent as jest.Mock).mockReturnValue(mockEvent);

    // Mock dependencies for the handler
    const mockSubscription = { id: "sub_test", items: { data: [{ price: { id: "price_pro_yearly" } }] }, status: "active", current_period_end: Math.floor(Date.now() / 1000) + 365*24*60*60 } as Stripe.Subscription;
    (stripe.subscriptions.retrieve as jest.Mock).mockResolvedValue(mockSubscription);
    const mockPlan = { name: "Pro Yearly", credits: 120 }; // Matched plan
    (findPlanByPriceId as jest.Mock).mockReturnValue(mockPlan);
    prismaMock.subscription.update.mockResolvedValue({} as any); // Mock update

    const mockRequest = new NextRequest("http://localhost/api/webhooks/stripe", {
      method: "POST",
      body: "raw_body_text",
    });

    const response = await POST(mockRequest);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.received).toBe(true);
    expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith("sub_test");
    expect(findPlanByPriceId).toHaveBeenCalledWith("price_pro_yearly");
    expect(prismaMock.subscription.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { stripeSubscriptionId: "sub_test" },
        data: expect.objectContaining({ currentCreditBalance: mockPlan.credits, status: "active" }), // Check balance reset
    }));
  });

  it("should return 200 and call handler for customer.subscription.deleted", async () => {
     const mockEvent = {
      id: "evt_test_sub_deleted",
      type: "customer.subscription.deleted",
      data: {
        object: {
          id: "sub_test_deleted",
          status: "canceled",
          // ... other subscription properties
        } as Stripe.Subscription,
      },
    } as Stripe.Event;

    (stripe.webhooks.constructEvent as jest.Mock).mockReturnValue(mockEvent);
    prismaMock.subscription.updateMany.mockResolvedValue({ count: 1 }); // Mock updateMany

    const mockRequest = new NextRequest("http://localhost/api/webhooks/stripe", {
      method: "POST",
      body: "raw_body_text",
    });

    const response = await POST(mockRequest);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.received).toBe(true);
    expect(prismaMock.subscription.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { stripeSubscriptionId: "sub_test_deleted" },
        data: expect.objectContaining({ status: "canceled", currentCreditBalance: 0, stripeSubscriptionId: null }), // Check status and balance zeroed
    }));
  });

  it("should return 200 for unhandled event types", async () => {
    const mockEvent = { type: "some.other.event", data: {} } as Stripe.Event;
    (stripe.webhooks.constructEvent as jest.Mock).mockReturnValue(mockEvent);

    const mockRequest = new NextRequest("http://localhost/api/webhooks/stripe", {
      method: "POST",
      body: "raw_body_text",
    });

    const response = await POST(mockRequest);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.received).toBe(true);
    // Ensure no handlers were called
    expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled();
    expect(prismaMock.subscription.upsert).not.toHaveBeenCalled();
    expect(prismaMock.subscription.update).not.toHaveBeenCalled();
    expect(prismaMock.subscription.updateMany).not.toHaveBeenCalled();
  });

  it("should return 500 if a handler throws an error", async () => {
     const mockEvent = {
      id: "evt_test_error",
      type: "checkout.session.completed",
      data: { object: { id: "cs_test_error" } as Stripe.Checkout.Session },
    } as Stripe.Event;

    (stripe.webhooks.constructEvent as jest.Mock).mockReturnValue(mockEvent);
    // Make a handler dependency throw an error
    (stripe.subscriptions.retrieve as jest.Mock).mockRejectedValue(new Error("Stripe API Error"));

    const mockRequest = new NextRequest("http://localhost/api/webhooks/stripe", {
      method: "POST",
      body: "raw_body_text",
    });

    const response = await POST(mockRequest);
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error).toContain("Webhook handler failed: Stripe API Error");
  });

});

