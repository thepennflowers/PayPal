import { NextRequest, NextResponse } from "next/server";
import { verifyAgenticCommerceRequest } from "@/lib/agent-commerce/auth";
import { updateCart } from "@/lib/agent-commerce/store";

// PUT /api/paypal/v1/merchant-cart/{id}
// Store Sync "update a cart" endpoint — full replacement, not a merge.
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await verifyAgenticCommerceRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ message: auth.message }, { status: auth.status });
  }

  const body = await req.json();
  const cart = await updateCart(params.id, body);
  if (!cart) {
    return NextResponse.json({ message: `Cart ${params.id} not found` }, { status: 404 });
  }
  return NextResponse.json(cart);
}
