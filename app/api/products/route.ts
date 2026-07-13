import { NextResponse } from "next/server";
import { paypal } from "@/lib/paypal";

export async function GET() {
  const products = await paypal.listProducts();
  return NextResponse.json({ products });
}
