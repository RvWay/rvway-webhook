// /lib/rvwayDashboard.js
// RvWay - Dashboard helpers: Premium activation + purchase recording
//
// EXAMPLE PAYLOAD sent to RVWAY_DASHBOARD_URL:
// POST https://your-backend.com/api/record-purchase
// Authorization: Bearer your_dashboard_secret_here
// {
//   "purchase_source": "stripe",
//   "referral_code": "WILLSIZE",
//   "referral_method": "affiliate_link",
//   "plan": "yearly",
//   "email": "john@example.com",
//   "amount_total": 9900,
//   "currency": "usd",
//   "client_reference_id": "WILLSIZE__yearly__1712534400000",
//   "session_id": "cs_live_a1B2c3D4",
//   "premium_activated": true
// }

// Activate Premium (your existing premium API)
export async function activatePremium({ email, plan, sessionId, clientReferenceId }) {
  const url = process.env.PREMIUM_API_URL;
  const apiKey = process.env.PREMIUM_API_KEY;

  if (!url) throw new Error("PREMIUM_API_URL is not set.");

  const payload = { email, is_premium: true };

  console.log("LOG [RvWay] activatePremium -> POST " + url + " email=" + email);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "X-PREMIUM-CODE": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error("Premium API returned " + response.status + ": " + text);
  }

  return await response.json().catch(() => ({}));
}

// Record purchase to RvWay dashboard backend
export async function recordPurchaseToDashboard({
  email,
  affiliate,
  plan,
  amountTotal,
  currency,
  clientReferenceId,
  sessionId,
  premiumActivated,
}) {
  const url = process.env.RVWAY_DASHBOARD_URL;
  const secret = process.env.RVWAY_DASHBOARD_SECRET;

  if (!url) {
    console.warn("WARN [RvWay] RVWAY_DASHBOARD_URL not set - skipping dashboard write");
    return;
  }

  const payload = {
    purchase_source: "stripe",
    referral_code: affiliate,
    referral_method: "affiliate_link",
    plan,
    email,
    amount_total: amountTotal,
    currency,
    client_reference_id: clientReferenceId,
    session_id: sessionId,
    premium_activated: premiumActivated,
  };

  console.log("LOG [RvWay] recordPurchaseToDashboard -> POST " + url);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + secret,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error("Dashboard API returned " + response.status + ": " + text);
  }x

  return await response.json().catch(() => ({}));rvwayDashboard.js
}
