import type { Product } from "@/lib/paypal/types";

const EMOJI: Record<string, string> = {
  bouquet: "💐",
  sympathy: "🕊️",
};

export function ProductCard({ product }: { product: Product }) {
  return (
    <div className="rounded-2xl border border-bloom-100 bg-white p-4 flex flex-col gap-3 shadow-sm hover:shadow-md transition-shadow">
      <div className="h-32 rounded-xl bg-gradient-to-br from-bloom-100 to-bloom-50 flex items-center justify-center text-5xl">
        {EMOJI[product.category ?? "bouquet"] ?? "🌸"}
      </div>
      <div>
        <h3 className="font-medium text-bloom-900">{product.name}</h3>
        <p className="text-sm text-bloom-900/60 mt-1">{product.description}</p>
      </div>
      <div className="flex items-center justify-between gap-2 mt-auto pt-2">
        <span className="font-semibold text-leaf-700">
          ${product.price.value}
        </span>
        <span className="text-xs text-bloom-900/40 truncate" title={product.id}>
          {product.id}
        </span>
      </div>
    </div>
  );
}
