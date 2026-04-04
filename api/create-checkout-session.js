// /api/create-checkout-session.js
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
