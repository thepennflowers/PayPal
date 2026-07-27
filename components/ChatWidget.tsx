"use client";

import { useEffect, useRef, useState } from "react";

type OrderPayload = {
  id: string;
  status: string;
  amount: { currency_code: string; value: string };
  items: { name: string; quantity: number; unit_price: { value: string } }[];
  approveUrl?: string;
  createdAt?: string;
};

// Must match ORDER_EXPIRY_MS in lib/paypal/types.ts (also enforced
// server-side by the capture route).
const ORDER_EXPIRY_MS = 10 * 60 * 1000;

type ChatMessage = { sender: "user" | "agent"; text: string; order?: OrderPayload };

function CheckoutCard({
  order,
  onPaid,
}: {
  order: OrderPayload;
  onPaid: () => void;
}) {
  // idle -> waiting (customer sent to PayPal, polling status)
  //      -> paid (approved + captured) | pending (capture unclear) | expired
  const [phase, setPhase] = useState<
    "idle" | "waiting" | "paid" | "pending" | "expired"
  >(order.status === "COMPLETED" ? "paid" : "idle");
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  // Unpaid orders expire 10 minutes after creation (matches the server's
  // capture guard). Tick once a second to drive the countdown.
  const expiresAt =
    new Date(order.createdAt ?? Date.now()).getTime() + ORDER_EXPIRY_MS;
  const [now, setNow] = useState(() => Date.now());
  const remainingMs = Math.max(0, expiresAt - now);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(tick);
      clearInterval(pollRef.current);
    };
  }, []);

  useEffect(() => {
    if (remainingMs === 0) {
      clearInterval(pollRef.current);
      setPhase((p) => (p === "paid" ? p : "expired"));
    }
  }, [remainingMs]);

  function watchForApproval() {
    if (phase === "paid" || phase === "expired" || pollRef.current) return;
    setPhase("waiting");
    let busy = false;

    pollRef.current = setInterval(async () => {
      if (busy) return;
      busy = true;
      try {
        const res = await fetch(`/api/orders/${order.id}`);
        const data = await res.json();
        if (data.status === "APPROVED" || data.status === "COMPLETED") {
          clearInterval(pollRef.current);
          if (data.status === "COMPLETED") {
            setPhase("paid");
            onPaid();
            return;
          }
          const capRes = await fetch(`/api/orders/${order.id}/capture`, {
            method: "POST",
          });
          const captured = await capRes.json();
          if (captured.status === "COMPLETED") {
            setPhase("paid");
            onPaid();
          } else {
            setPhase(capRes.status === 410 ? "expired" : "pending");
          }
        }
        // no explicit polling timeout needed — the expiry effect above
        // stops polling when the 10-minute window closes
      } catch {
        // transient network error — keep polling
      } finally {
        busy = false;
      }
    }, 3000);
  }

  const countdown = `${Math.floor(remainingMs / 60_000)}:${String(
    Math.floor((remainingMs % 60_000) / 1000)
  ).padStart(2, "0")}`;

  return (
    <div className="mt-2 max-w-[85%] rounded-2xl border border-bloom-100 bg-white shadow-sm p-4 text-left">
      <div className="space-y-1.5">
        {order.items.map((item, i) => (
          <div key={i} className="flex justify-between gap-3 text-[15px]">
            <span className="text-bloom-900">
              {item.name}
              {item.quantity > 1 && (
                <span className="text-bloom-900/50"> × {item.quantity}</span>
              )}
            </span>
            <span className="text-bloom-900/70">
              ${(Number(item.unit_price.value) * item.quantity).toFixed(2)}
            </span>
          </div>
        ))}
      </div>
      <div className="flex justify-between items-baseline border-t border-bloom-100 mt-3 pt-3">
        <div>
          <div className="text-sm text-bloom-900/60">The Penn Flowers</div>
          <div className="text-xs text-bloom-900/40">Subtotal</div>
        </div>
        <div className="text-lg font-semibold text-bloom-900">
          ${order.amount.value}
        </div>
      </div>
      {phase === "paid" ? (
        <div className="mt-3 flex items-center justify-center gap-2 w-full rounded-full bg-leaf-600/10 text-leaf-700 font-medium py-3 text-[15px]">
          ✓ Paid — ${order.amount.value}
        </div>
      ) : phase === "expired" ? (
        <div className="mt-3 flex items-center justify-center gap-2 w-full rounded-full bg-bloom-900/5 text-bloom-900/50 font-medium py-3 text-[15px]">
          Order expired
        </div>
      ) : (
        order.approveUrl && (
          <a
            href={order.approveUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={watchForApproval}
            className="mt-3 flex items-center justify-center gap-1 w-full rounded-full bg-[#0c0c0d] hover:bg-black text-white py-3 text-[15px] transition-transform duration-150 ease-out active:scale-[0.98]"
          >
            Pay with{" "}
            <span className="font-bold italic tracking-tight">PayPal</span>
          </a>
        )
      )}
      <p className="mt-2 text-center text-xs text-bloom-900/40">
        {phase === "waiting" ? (
          <span className="animate-pulse">
            Waiting for approval on PayPal — expires in {countdown}
          </span>
        ) : phase === "pending" ? (
          <>Approved the payment already? Tell the florist and they&apos;ll confirm it.</>
        ) : phase === "expired" ? (
          <>Ask the florist for a fresh order to complete this purchase.</>
        ) : phase === "paid" ? (
          <>
            Order <code>{order.id}</code> · thank you!
          </>
        ) : (
          <>
            Order <code>{order.id}</code> · expires in {countdown}
          </>
        )}
      </p>
    </div>
  );
}

// Must match ORDER_SEPARATOR in app/api/chat/route.ts.
const ORDER_SEPARATOR = "\u001e";

const SUGGESTIONS = [
  "Birthday bouquet under $50",
  "Sympathy flowers for a service",
  "Weekly flower subscription",
];

export function ChatWidget() {
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  const started = chat.length > 0;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [chat, loading]);

  async function handleSend(text?: string) {
    const userText = (text ?? message).trim();
    if (!userText || loading) return;
    const nextChat: ChatMessage[] = [...chat, { sender: "user", text: userText }];
    setChat(nextChat);
    setMessage("");
    setLoading(true);
    console.log("[chat-widget] sending", nextChat.length, "messages");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextChat.map((c) => ({
            role: c.sender === "user" ? "user" : "assistant",
            content: c.text,
          })),
        }),
      });
      console.log("[chat-widget] response status:", res.status, "content-type:", res.headers.get("content-type"));

      // Non-streamed responses (errors, missing API key) come back as JSON.
      if (res.headers.get("content-type")?.includes("application/json")) {
        const data = await res.json();
        console.log("[chat-widget] json response:", data);
        setChat((prev) => [
          ...prev,
          {
            sender: "agent",
            text: data.response ?? data.error ?? "Sorry, something went wrong.",
            order: data.order,
          },
        ]);
        return;
      }

      // Streamed reply: plain text deltas, optionally followed by an
      // ORDER_SEPARATOR byte + JSON order payload (see app/api/chat/route.ts).
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let appended = false;

      const upsertReply = (replyText: string, order?: OrderPayload) => {
        if (!appended) {
          appended = true;
          setChat((prev) => [...prev, { sender: "agent", text: replyText, order }]);
        } else {
          setChat((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            next[next.length - 1] = { ...last, text: replyText, order: order ?? last.order };
            return next;
          });
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const sep = buffer.indexOf(ORDER_SEPARATOR);
        const visible = sep === -1 ? buffer : buffer.slice(0, sep);
        if (visible.trim()) upsertReply(visible);
      }
      buffer += decoder.decode();

      const sep = buffer.indexOf(ORDER_SEPARATOR);
      let order: OrderPayload | undefined;
      if (sep !== -1) {
        try {
          order = JSON.parse(buffer.slice(sep + 1)).order;
        } catch {
          // malformed trailing frame — ignore, text already rendered
        }
      }
      const finalText = (sep === -1 ? buffer : buffer.slice(0, sep)).trim();
      console.log("[chat-widget] stream done, finalText length:", finalText.length, "order:", order);
      upsertReply(
        finalText ||
          (order ? "Here's your order — pay below when ready. 🌸" : "Sorry, I didn't catch that — could you rephrase?"),
        order
      );
    } catch (error) {
      console.error("[chat-widget] request failed:", error);
      setChat((prev) => [
        ...prev,
        { sender: "agent", text: "Sorry, I couldn't reach the server just now." },
      ]);
    } finally {
      console.log("[chat-widget] done, clearing loading state");
      setLoading(false);
      chatInputRef.current?.focus();
    }
  }

  return (
    <div>
      <div
        className={
          "rounded-3xl border border-bloom-100 bg-white shadow-xl shadow-bloom-600/5 flex flex-col overflow-hidden transition-[height] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] " +
          (started ? "h-[65vh] min-h-[480px]" : "h-[168px]")
        }
      >
        {started ? (
          <>
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto px-5 py-5 space-y-3"
            >
              {chat.map((c, i) => (
                <div
                  key={i}
                  className={
                    "chat-bubble-enter " +
                    (c.sender === "user" ? "text-right" : "text-left")
                  }
                >
                  <span
                    className={
                      "inline-block rounded-2xl px-4 py-2.5 max-w-[85%] text-[15px] leading-relaxed whitespace-pre-wrap text-left " +
                      (c.sender === "user"
                        ? "bg-leaf-600 text-white"
                        : "bg-bloom-50 text-bloom-900")
                    }
                  >
                    {c.text}
                  </span>
                  {c.order && (
                    <CheckoutCard
                      order={c.order}
                      onPaid={() =>
                        setChat((prev) => [
                          ...prev,
                          {
                            sender: "agent",
                            text: `Payment received — order ${c.order!.id} is confirmed. Thank you, and enjoy the flowers! 🌸`,
                          },
                        ])
                      }
                    />
                  )}
                </div>
              ))}
              {loading && chat[chat.length - 1]?.sender === "user" && (
                <div className="text-left chat-bubble-enter">
                  <span className="inline-block rounded-2xl px-4 py-2.5 bg-bloom-50 text-bloom-900/50 animate-pulse">
                    Arranging a reply…
                  </span>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-bloom-100 flex gap-2">
              <input
                ref={chatInputRef}
                className="flex-1 rounded-xl border border-bloom-100 px-4 py-3 text-[15px] outline-none focus:border-leaf-600 placeholder:text-bloom-900/35"
                value={message}
                autoFocus
                placeholder="Reply to the florist…"
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) handleSend();
                }}
              />
              <button
                onClick={() => handleSend()}
                disabled={loading}
                aria-label="Send"
                className="rounded-xl bg-leaf-600 hover:bg-leaf-700 text-white text-[15px] font-medium px-5 py-3 transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </>
        ) : (
          <>
            <textarea
              ref={composerRef}
              className="flex-1 resize-none px-5 pt-5 text-[16px] leading-relaxed outline-none placeholder:text-bloom-900/35 bg-transparent"
              value={message}
              autoFocus
              placeholder="Ask our AI florist for the perfect flowers…"
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <div className="flex items-center justify-end px-4 pb-4">
              <button
                onClick={() => handleSend()}
                disabled={!message.trim()}
                aria-label="Send"
                className="h-10 w-10 rounded-full bg-leaf-600 hover:bg-leaf-700 text-white text-lg flex items-center justify-center transition-[background-color,transform,opacity] duration-150 ease-out active:scale-[0.95] disabled:opacity-30"
              >
                ↑
              </button>
            </div>
          </>
        )}
      </div>

      {!started && (
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => handleSend(s)}
              className="rounded-full border border-bloom-900/10 bg-white/50 px-3.5 py-1.5 text-sm text-bloom-900/60 hover:text-bloom-900/90 hover:border-bloom-900/20 transition-colors active:scale-[0.97]"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
