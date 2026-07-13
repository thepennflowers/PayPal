import { NextRequest, NextResponse } from "next/server";
import { paypal } from "@/lib/paypal";

// Minimal REST helper the frontend (or a script) can use to create an
// order outside of the chat flow, e.g. from a "Buy now" button.
export async function POST(req: NextRequest) {
  const { items, currency } = await req.json();
  const order = await paypal.createOrder(items, currency);
  return NextResponse.json(order, { status: 201 });
}
