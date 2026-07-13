import { NextRequest, NextResponse } from "next/server";
import { paypal } from "@/lib/paypal";
import { ORDER_EXPIRY_MS } from "@/lib/paypal/types";

// Captures payment for an order the customer has approved on PayPal.
// Called automatically by the chat widget once polling sees APPROVED.
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Enforce the app's 10-minute order expiry: stale orders can't be
    // captured through this route anymore.
    const existing = await paypal.getOrder(params.id);
    if (existing && existing.status !== "COMPLETED") {
      const age = Date.now() - new Date(existing.create_time).getTime();
      if (age > ORDER_EXPIRY_MS) {
        return NextResponse.json(
          { error: "Order expired — please ask the florist for a new one." },
          { status: 410 }
        );
      }
    }

    const order = await paypal.captureOrder(params.id);
    return NextResponse.json({ id: order.id, status: order.status });
  } catch (error) {
    // A concurrent capture (e.g. user also told the florist "I've paid")
    // makes PayPal reject the second attempt — report the real status
    // instead of an error so the UI settles correctly.
    try {
      const order = await paypal.getOrder(params.id);
      if (order) {
        return NextResponse.json({ id: order.id, status: order.status });
      }
    } catch {
      // fall through to the original error
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
