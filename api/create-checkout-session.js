// /api/create-checkout-session.js
// RvWay - Stripe Checkout Session Creator v2.0
// Creates a Stripe Checkout Session server-side with affiliate and plan metadata.
// Includes CORS handling for browser-based calls from Squarespace.

import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16",
});

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "https://rvways.com";

function setCORSHeaders(res, origin) {
  const allow = origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN;
  res.setHeader("Access-Control-Allow-Origin", allow);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Vary", "Origin");
}

export default async function handler(req, res) {
  const origin = req.headers.origin || "";

  if (req.method === "OPTIONS") {
    setCORSHeaders(res, origin);
    return res.status(204).end();
  }

  setCORSHeaders(res, origin);

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch (e) { body = {}; }
    }
    if (!body || typeof body !== "object") body = {};

    const { email, affiliate, plan } = body;

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return res.status(400).json({ error: "A valid email address is required." });
    }

    const affiliateCode =
      affiliate && typeof affiliate === "string" && affiliate.trim().length > 0
        ? affiliate.trim().toUpperCase()
        : "DIRECT";

    const normalizedPlan = (plan || "").toLowerCase().trim();
    if (normalizedPlan !== "monthly" && normalizedPlan !== "yearly") {
      return res.status(400).json({ error: "plan must be 'monthly' or 'yearly'." });
    }

    const priceId =
      normalizedPlan === "yearly"
        ? process.env.STRIPE_PRICE_YEARLY
        : process.env.STRIPE_PRICE_MONTHLY;

    if (!priceId) {
      console.error("ERR [RvWay] No Stripe price ID configured for plan: " + normalizedPlan);
      return res.status(500).json({ error: "Price configuration error." });
    }

    const clientReferenceId = affiliateCode + "__" + normalizedPlan + "__" + Date.now();

    console.log("LOG [RvWay] Creating checkout session | email=" + email + " | affiliate=" + affiliateCode + " | plan=" + normalizedPlan + " | ref=" + clientReferenceId);

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      customer_email: email,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { affiliate: affiliateCode, plan: normalizedPlan },
      client_reference_id: clientReferenceId,
      success_url: process.env.SUCCESS_URL,
      cancel_url: process.env.CANCEL_URL,
    });

    console.log("OK [RvWay] Session created | session_id=" + session.id);
    return res.status(200).json({ sessionUrl: session.url });

  } catch (err) {
    console.error("ERR [RvWay] create-checkout-session failed:", err.message);
    return res.status(500).json({ error: "Failed to create checkout session." });
  }
}// /api/create-checkout-session.js
// RvWay - Stripe Checkout Session Creator v1.1
// Creates a Stripe Checkout Session server-side with affiliate and plan metadata.
// Replaces Squarespace payment-link redirect flow for clean affiliate tracking.

  import Stripe from "stripe";

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  // Explicitly enable body parser for this route
    export const config = {
        api: {
            bodyParser: true,
      },
    };

    export default async function handler(req, res) {
      if (req.method !== "POST") {
        return res.status(405).json({ error: "Method Not Allowed" });
      }

        try {
            // Safe body parsing - handles raw string or pre-parsed object
            let body = req.body;
        if (!body || typeof body === "string") {
          body = JSON.parse(body || "{}");
        }

        const { email, affiliate, plan } = body;

            // Validate required fields
        if (!email || !plan) {
          return res.status(400).json({ error: "Missing required fields: email and plan are required." });
        }

        if (!["monthly", "yearly"].includes(plan)) {
          return res.status(400).json({ error: "Invalid plan. Must be 'monthly' or 'yearly'." });
        }

            // Select correct Stripe Price ID based on plan
            const priceId = plan === "yearly"
              ? process.env.STRIPE_PRICE_YEARLY
              : process.env.STRIPE_PRICE_MONTHLY;

        if (!priceId) {
          console.error(`ERR [RvWay] No Stripe price ID configured for plan: ${plan}`);
            return res.status(500).json({ error: `No price ID configured for plan: ${plan}` });
            }

                // Sanitize affiliate code
            const affiliateCode = (affiliate && affiliate.trim()) ? affiliate.trim().toUpperCase() : "DIRECT";

                // Build client_reference_id for payout reconciliation
                  // Format: AFFILIATE-PLAN-TIMESTAMP e.g. "PARTNER123-yearly-1743811200000"
              const clientReferenceId = `${affiliateCode}-${plan}-${Date.now()}`;

                  // Create the Stripe Checkout Session
                  const session = await stripe.checkout.sessions.create({
                  payment_method_types: ["card"],
                        mode: "subscription",
                        customer_email: email,
                        line_items: [
                            {
                                price: priceId,
                                quantity: 1,
                    },
                  ],
                        // Metadata - read by webhook for affiliate tracking
                          metadata: {
                              affiliate: affiliateCode,
                              plan: plan,
                    },
                          // Composite ID visible in Stripe Dashboard, webhook payloads, and CSV exports
                          client_reference_id: clientReferenceId,
                    success_url: `${process.env.SUCCESS_URL || "https://app.rvways.com/success"}?session_id={CHECKOUT_SESSION_ID}`,
                          cancel_url: process.env.CANCEL_URL || "https://app.rvways.com/cancel",
                    });

                console.log("LOG [RvWay] Checkout session created:", JSON.stringify({
                            sessionId: session.id,
                            clientReferenceId,
                            email,
                            plan,
                            affiliate: affiliateCode,
                            priceId,
                            sessionUrl: session.url,
                      }, null, 2));

                return res.status(200).json({
                          sessionId: session.id,
                          sessionUrl: session.url,
                    });

                } catch (err) {
                console.error("ERR [RvWay] Error creating checkout session:", err.message, err.stack);
                return res.status(500).json({ error: "Internal Server Error" });
              }
            }
