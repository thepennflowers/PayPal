import { NextRequest, NextResponse } from "next/server";
import { verifyAgenticCommerceRequest } from "@/lib/agent-commerce/auth";
import { checkoutCart } from "@/lib/agent-commerce/store";

// POST /api/paypal/v1/merchant-cart/{id}/checkout
// Store Sync "complete checkout" endpoint — captures the linked PayPal order.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await verifyAgenticCommerceRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ message: auth.message }, { status: auth.status });
  }

  const body = await req.json();
  const cart = await checkoutCart(params.id, body);
  if (!cart) {
    return NextResponse.json({ message: `Cart ${params.id} not found` }, { status: 404 });
  }
  return NextResponse.json(cart);
}
