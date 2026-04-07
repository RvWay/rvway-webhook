// /api/stripe-webhook.js
// RvWay - Stripe Webhook Handler v3.0
// Handles: checkout.session.completed, customer.subscription.created,
//          customer.subscription.deleted, invoice.paid

import Stripe from "stripe";
import { appendTransactionToSheet } from "../lib/googleSheets.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Disable Vercel body parser - required for Stripe signature verification
export const config = {
  api: {
    bodyParser: false,
  },
};

// Helper: Read raw body from request stream
async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// Main handler
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  let event;

  try {
    const rawBody = await getRawBody(req);
    const signature = req.headers["stripe-signature"];

    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("ERR [RvWay] Webhook signature verification failed:", err.message);
    return res.status(400).json({ error: `Webhook signature error: ${err.message}` });
  }

  try {
    switch (event.type) {

      case "checkout.session.completed":
        // affiliate and plan metadata are only available on this event
        await handleCheckoutCompleted(event.data.object);
        break;

      case "customer.subscription.created":
        // affiliate/plan NOT available here - already captured at checkout
        await handleSubscriptionCreated(event.data.object);
        break;

      case "customer.subscription.deleted":
        // Use to revoke premium access
        await handleSubscriptionDeleted(event.data.object);
        break;

      case "invoice.paid":
        // Fires on initial charge and every renewal
        await handleInvoicePaid(event.data.object);
        break;

      default:
        console.log(`INFO [RvWay] Unhandled event type: ${event.type}`);
    }

    return res.status(200).json({ received: true });

  } catch (err) {
    console.error("ERR [RvWay] Error processing webhook event:", err.message, err.stack);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

// EVENT HANDLER: checkout.session.completed
// This is the ONLY event that carries affiliate and plan metadata.
// affiliate = session.metadata.affiliate (set by /api/create-checkout-session)
// plan      = session.metadata.plan      (set by /api/create-checkout-session)
async function handleCheckoutCompleted(session) {
  const email       = session?.customer_details?.email || session?.customer_email || null;
  const affiliate   = session?.metadata?.affiliate || "DIRECT";
  const plan        = session?.metadata?.plan || "unknown";
  const amountTotal = session?.amount_total ? (session.amount_total / 100).toFixed(2) : "0.00";
  const currency    = session?.currency?.toUpperCase() || "USD";
  const sessionId   = session?.id || "unknown";
  const clientRef   = session?.client_reference_id || null;
  const customerId  = session?.customer || null;

  if (!email) {
    console.error("ERR [RvWay] checkout.session.completed - no email found. Session ID:", sessionId);
    throw new Error("No email found in checkout session");
  }

  const transactionLog = {
    event: "checkout.session.completed",
    timestamp: new Date().toISOString(),
    sessionId,
    clientReferenceId: clientRef,
    customerId,
    email,
    plan,
    affiliate,
    amountTotal: `${amountTotal} ${currency}`,
    premiumActivated: false,
  };

  console.log("LOG [RvWay] New checkout transaction:", JSON.stringify(transactionLog, null, 2));

  const premiumResponse = await fetch(process.env.PREMIUM_API_URL, {
    method: "POST",
    headers: {
      "X-PREMIUM-CODE": process.env.PREMIUM_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, is_premium: true }),
  });

  if (!premiumResponse.ok) {
    const errorBody = await premiumResponse.text();
    console.error("ERR [RvWay] Premium activation FAILED:", {
      status: premiumResponse.status,
      body: errorBody,
      email,
      sessionId,
    });
    throw new Error(`Premium API responded with ${premiumResponse.status}: ${errorBody}`);
  }

  transactionLog.premiumActivated = true;
  console.log("OK [RvWay] Premium activated successfully:", JSON.stringify(transactionLog, null, 2));

  // Log to Google Sheets (non-blocking - failure does not affect premium activation)
  await appendTransactionToSheet({
    email,
    affiliate,
    plan,
    amountTotal,
    currency,
    clientReferenceId: clientRef,
    sessionId,
    premiumActivated: true,
  });
}

// EVENT HANDLER: customer.subscription.created
// Fires when a subscription is first created (may be before first payment).
// affiliate/plan metadata are NOT on the subscription object.
// They were already captured at checkout.session.completed.
async function handleSubscriptionCreated(subscription) {
  const subscriptionId = subscription?.id || "unknown";
  const customerId     = subscription?.customer || "unknown";
  const status         = subscription?.status || "unknown";
  const planId         = subscription?.items?.data?.[0]?.price?.id || "unknown";
  const interval       = subscription?.items?.data?.[0]?.price?.recurring?.interval || "unknown";

  console.log("LOG [RvWay] Subscription created:", JSON.stringify({
    event: "customer.subscription.created",
    timestamp: new Date().toISOString(),
    subscriptionId,
    customerId,
    status,
    planId,
    interval,
    note: "affiliate/plan not available here - captured at checkout.session.completed",
  }, null, 2));
}

// EVENT HANDLER: customer.subscription.deleted
// Fires when a subscription is cancelled or expires.
// Logs the event. Revocation code is ready to uncomment.
async function handleSubscriptionDeleted(subscription) {
  const subscriptionId = subscription?.id || "unknown";
  const customerId     = subscription?.customer || "unknown";
  const status         = subscription?.status || "unknown";

  console.log("LOG [RvWay] Subscription deleted:", JSON.stringify({
    event: "customer.subscription.deleted",
    timestamp: new Date().toISOString(),
    subscriptionId,
    customerId,
    status,
  }, null, 2));

  // REVOCATION: Uncomment when your premium API supports is_premium: false
  // const customer = await stripe.customers.retrieve(customerId);
  // const email = customer.email;
  // if (email) {
  //   await fetch(process.env.PREMIUM_API_URL, {
  //     method: "POST",
  //     headers: { "X-PREMIUM-CODE": process.env.PREMIUM_API_KEY, "Content-Type": "application/json" },
  //     body: JSON.stringify({ email, is_premium: false }),
  //   });
  //   console.log("OK [RvWay] Premium revoked for:", email);
  // }
}

// EVENT HANDLER: invoice.paid
// Fires on every successful charge - initial purchase and all renewals.
// billingReason === "subscription_cycle" = renewal payment.
async function handleInvoicePaid(invoice) {
  const invoiceId      = invoice?.id || "unknown";
  const customerId     = invoice?.customer || "unknown";
  const customerEmail  = invoice?.customer_email || null;
  const amountPaid     = invoice?.amount_paid ? (invoice.amount_paid / 100).toFixed(2) : "0.00";
  const currency       = invoice?.currency?.toUpperCase() || "USD";
  const subscriptionId = invoice?.subscription || null;
  const billingReason  = invoice?.billing_reason || "unknown";

  console.log("LOG [RvWay] Invoice paid:", JSON.stringify({
    event: "invoice.paid",
    timestamp: new Date().toISOString(),
    invoiceId,
    customerId,
    customerEmail,
    subscriptionId,
    billingReason,
    amountPaid: `${amountPaid} ${currency}`,
  }, null, 2));

  // RENEWAL SAFETY NET: Uncomment to re-confirm premium on each renewal
  // if (customerEmail && billingReason === "subscription_cycle") {
  //   await fetch(process.env.PREMIUM_API_URL, {
  //     method: "POST",
  //     headers: { "X-PREMIUM-CODE": process.env.PREMIUM_API_KEY, "Content-Type": "application/json" },
  //     body: JSON.stringify({ email: customerEmail, is_premium: true }),
  //   });
  //   console.log("OK [RvWay] Premium renewal confirmed for:", customerEmail);
  // }
}
