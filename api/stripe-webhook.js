// /api/stripe-webhook.js
// RvWay - Stripe Webhook Handler v2.1
// Handles: checkout.session.completed
// Structured for easy addition of future subscription lifecycle events

import Stripe from "stripe";

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
                                                                                                          await handleCheckoutCompleted(event.data.object);
                                                                                                                  break;
                                                                                                                  
                                                                                                                        // case "customer.subscription.updated":
                                                                                                                              //   await handleSubscriptionUpdated(event.data.object);
                                                                                                                                    //   break;
                                                                                                                                    
                                                                                                                                          // case "customer.subscription.deleted":
                                                                                                                                                //   await handleSubscriptionDeleted(event.data.object);
                                                                                                                                                      //   break;
                                                                                                                                                      
                                                                                                                                                            // case "invoice.payment_failed":
                                                                                                                                                                  //   await handlePaymentFailed(event.data.object);
                                                                                                                                                                        //   break;
                                                                                                                                                                        
                                                                                                                                                                              default:
                                                                                                                                                                                      console.log(`INFO [RvWay] Unhandled event type received: ${event.type}`);
                                                                                                                                                                                          }
                                                                                                                                                                                          
                                                                                                                                                                                              return res.status(200).json({ received: true });
                                                                                                                                                                                              
                                                                                                                                                                                                } catch (err) {
                                                                                                                                                                                                    console.error("ERR [RvWay] Error processing webhook event:", err.message, err.stack);
                                                                                                                                                                                                        return res.status(500).json({ error: "Internal Server Error" });
                                                                                                                                                                                                          }
                                                                                                                                                                                                          }
                                                                                                                                                                                                          
                                                                                                                                                                                                          // EVENT HANDLER: checkout.session.completed
                                                                                                                                                                                                          async function handleCheckoutCompleted(session) {
                                                                                                                                                                                                          
                                                                                                                                                                                                            const email       = session?.customer_details?.email || session?.customer_email || null;
                                                                                                                                                                                                              const affiliate   = session?.metadata?.affiliate || "DIRECT";
                                                                                                                                                                                                                const plan        = session?.metadata?.plan || "unknown";
                                                                                                                                                                                                                  const amountTotal = session?.amount_total ? (session.amount_total / 100).toFixed(2) : "0.00";
                                                                                                                                                                                                                    const currency    = session?.currency?.toUpperCase() || "USD";
                                                                                                                                                                                                                      const sessionId   = session?.id || "unknown";
                                                                                                                                                                                                                        const clientRef   = session?.client_reference_id || null;
                                                                                                                                                                                                                        
                                                                                                                                                                                                                          if (!email) {
                                                                                                                                                                                                                              console.error("ERR [RvWay] checkout.session.completed - no email found. Session ID:", sessionId);
                                                                                                                                                                                                                                  throw new Error("No email found in checkout session");
                                                                                                                                                                                                                                    }
                                                                                                                                                                                                                                    
                                                                                                                                                                                                                                      const transactionLog = {
                                                                                                                                                                                                                                          event: "checkout.session.completed",
                                                                                                                                                                                                                                              timestamp: new Date().toISOString(),
                                                                                                                                                                                                                                                  sessionId,
                                                                                                                                                                                                                                                      clientReferenceId: clientRef,
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
                                                                                                                                                                                                                                                                                                            body: JSON.stringify({
                                                                                                                                                                                                                                                                                                                  email: email,
                                                                                                                                                                                                                                                                                                                        is_premium: true,
                                                                                                                                                                                                                                                                                                                            }),
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
                                                                                                                                                                                                                                                                                                                                                                              }
