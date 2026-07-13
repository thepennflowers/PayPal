import { NextRequest, NextResponse } from "next/server";
import { verifyAgenticCommerceRequest } from "@/lib/agent-commerce/auth";
import { createCart } from "@/lib/agent-commerce/store";

// POST /api/paypal/v1/merchant-cart
// Store Sync "create a cart" endpoint. See lib/agent-commerce/auth.ts —
// disabled (501) until PAYPAL_AGENTIC_COMMERCE_ENABLED=true, which
// requires PayPal's agentic-commerce approval:
// https://www.paypal.com/us/business/ai#form
export async function POST(req: NextRequest) {
  const auth = await verifyAgenticCommerceRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ message: auth.message }, { status: auth.status });
  }

  const body = await req.json();
  const cart = await createCart(body);
  return NextResponse.json(cart, { status: 201 });
}
