import Image from "next/image";
import { paypal } from "@/lib/paypal";
import { ProductCard } from "@/components/ProductCard";
import { ChatWidget } from "@/components/ChatWidget";

// Catalog comes from PayPal at request time in live mode — never
// prerender/cache this page with stale (or empty) data.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const products = await paypal.listProducts();
  const plans = await paypal.listSubscriptionPlans();

  return (
    <>
      {/* Hero: the AI florist is the storefront's front door */}
      <section
        id="florist"
        className="bg-gradient-to-b from-bloom-100 via-bloom-50 to-[#fffbf7] border-b border-bloom-100/60"
      >
        <div className="max-w-3xl mx-auto px-6 pt-24 pb-24 text-center">
          <h1 className="text-4xl md:text-5xl font-semibold text-bloom-900 tracking-tight text-balance">
            Fresh flowers, ordered your way
          </h1>
          <p className="text-bloom-900/60 mt-4 text-lg">
            Order bouquets and subscriptions by chatting with our AI florist
          </p>
          <div className="mt-10 max-w-2xl mx-auto text-left">
            <ChatWidget />
          </div>
        </div>
      </section>

      {/* Catalog */}
      <div className="max-w-5xl mx-auto px-6 py-12">
        <h2 id="bouquets" className="text-xl font-medium text-bloom-900 mb-4 scroll-mt-24">
          Bouquets
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>

        <h2
          id="subscriptions"
          className="text-xl font-medium text-bloom-900 mb-4 scroll-mt-24"
        >
          Subscriptions
        </h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className="rounded-2xl border border-leaf-600/20 bg-white overflow-hidden flex"
            >
              {plan.image_url && (
                <div className="relative w-28 shrink-0 self-stretch">
                  <Image
                    src={plan.image_url}
                    alt={plan.name}
                    fill
                    sizes="112px"
                    className="object-cover"
                  />
                </div>
              )}
              <div className="p-4 flex flex-col justify-center">
                <h3 className="font-medium text-bloom-900">{plan.name}</h3>
                <p className="text-sm text-bloom-900/60 mt-1">
                  {plan.description}
                </p>
                <p className="text-leaf-700 font-semibold mt-2">
                  ${plan.price.value} / {plan.billing_cycle.toLowerCase()}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
