import { NextRequest, NextResponse } from "next/server";
import { paypal } from "@/lib/paypal";

// Status endpoint the chat widget polls after the customer clicks
// "Pay with PayPal" — CREATED -> APPROVED (customer approved on PayPal)
// -> COMPLETED (payment captured).
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const order = await paypal.getOrder(params.id);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    return NextResponse.json({ id: order.id, status: order.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
