import { createRemoteJWKSet, jwtVerify } from "jose";

// PayPal Store Sync (agentic commerce) endpoints receive a PayPal-issued
// JWT on every request. Access to this program requires merchants to
// apply: https://www.paypal.com/us/business/ai#form — until you've been
// approved and given real credentials, these endpoints stay disabled by
// default so nothing here can be mistaken for a live integration.
//
// See: https://docs.paypal.ai/growth/agentic-commerce/store-sync/your-api/set-up-your-api/orders-v2-integration
//   (section: "Authentication with PayPal-supplied JWTs")

const JWKS_URL = "https://www.paypal.ai/.well-known/jwks.json";
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

export type AuthResult =
  | { ok: true; merchantId: string }
  | { ok: false; status: number; message: string };

export async function verifyAgenticCommerceRequest(
  req: Request
): Promise<AuthResult> {
  if (process.env.PAYPAL_AGENTIC_COMMERCE_ENABLED !== "true") {
    return {
      ok: false,
      status: 501,
      message:
        "Store Sync / agentic commerce is not enabled for this merchant yet. " +
        "Apply at https://www.paypal.com/us/business/ai#form, then set " +
        "PAYPAL_AGENTIC_COMMERCE_ENABLED=true once PayPal issues real credentials.",
    };
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    return { ok: false, status: 401, message: "Missing bearer token" };
  }

  try {
    jwks ??= createRemoteJWKSet(new URL(JWKS_URL));
    const { payload } = await jwtVerify(token, jwks);
    const merchantId = String(payload.merchant_id ?? "");
    if (!merchantId) {
      return { ok: false, status: 401, message: "Token missing merchant_id" };
    }
    return { ok: true, merchantId };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid token";
    return { ok: false, status: 401, message };
  }
}
