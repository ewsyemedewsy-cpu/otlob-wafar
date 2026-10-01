const BASE = (Deno.env.get("PAYMOB_BASE_URL") || "https://accept.paymob.com").replace(/\/$/, "");

function asPaymobString(v: unknown) {
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v ?? "");
}

export function verifyTransactionHmac(obj: any, received: string | null) {
  const secret = Deno.env.get("PAYMOB_HMAC_SECRET");
  if (!secret || !received) return false;
  const fields = [
    obj.amount_cents, obj.created_at, obj.currency, obj.error_occured,
    obj.has_parent_transaction, obj.id, obj.integration_id, obj.is_3d_secure,
    obj.is_auth, obj.is_capture, obj.is_refunded, obj.is_standalone_payment,
    obj.is_voided, obj.order?.id, obj.owner, obj.pending,
    obj.source_data?.pan, obj.source_data?.sub_type, obj.source_data?.type,
    obj.success,
  ];
  if (fields.some((v) => v === undefined || v === null)) return false;
  const concat = fields.map(asPaymobString).join("");
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(concat)));
  const hex = [...sig].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (hex.length !== received.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ received.charCodeAt(i);
  return diff === 0;
}

export async function createIntention(payload: Record<string, unknown>) {
  const secret = Deno.env.get("PAYMOB_SECRET_KEY");
  if (!secret) throw new Error("PAYMOB_SECRET_KEY_MISSING");
  const res = await fetch(`${BASE}/v1/intention/`, {
    method: "POST",
    headers: { Authorization: `Token ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`PAYMOB_${res.status}:${text}`);
  return JSON.parse(text);
}

export function checkoutUrl(clientSecret: string) {
  const publicKey = Deno.env.get("PAYMOB_PUBLIC_KEY");
  if (!publicKey) throw new Error("PAYMOB_PUBLIC_KEY_MISSING");
  return `${BASE}/unifiedcheckout/?publicKey=${encodeURIComponent(publicKey)}&clientSecret=${encodeURIComponent(clientSecret)}`;
}
