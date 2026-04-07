// /lib/googleSheets.js
// RvWay - Google Sheets Transaction Logger
// Appends one transaction row per purchase to a Google Sheet.
//
// Sheet column order (Row 1 must have these exact headers):
// Timestamp | Email | Affiliate | Plan | Amount (cents) | Currency |
// Client Reference ID | Session ID | Purchase Source | Referral Method | Premium Activated
//
// EXAMPLE ROW WRITTEN:
// ["2026-04-08T02:00:00.000Z","john@example.com","WILLSIZE","yearly",9900,"usd",
//  "WILLSIZE__yearly__1712534400000","cs_live_a1B2c3","stripe","affiliate_link",true]

import { google } from "googleapis";

function getAuth() {
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  return new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

export async function appendTransactionToSheet({
  email,
  affiliate,
  plan,
  amountTotal,
  currency,
  clientReferenceId,
  sessionId,
  premiumActivated,
}) {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) {
    console.warn("WARN [RvWay] GOOGLE_SHEET_ID not set - skipping Sheets log");
    return;
  }

  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const timestamp = new Date().toISOString();

  const row = [
    timestamp,
    email,
    affiliate,
    plan,
    amountTotal,
    currency,
    clientReferenceId,
    sessionId,
    "stripe",
    "affiliate_link",
    premiumActivated,
  ];

  console.log("LOG [RvWay] Appending Sheets row for session_id=" + sessionId);

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: "Sheet1!A:K",
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] },
  });
}
