import { createRemoteJWKSet, jwtVerify } from "jose";
import { plaidClient } from "@/lib/plaid";

// Cache Plaid's JWKS for 1 hour
let cachedJWKS: ReturnType<typeof createRemoteJWKSet> | null = null;
let jwksCachedAt = 0;
const JWKS_CACHE_MS = 60 * 60 * 1000; // 1 hour

async function getPlaidJWKS() {
  const now = Date.now();
  if (cachedJWKS && now - jwksCachedAt < JWKS_CACHE_MS) {
    return cachedJWKS;
  }

  // Plaid publishes JWKs at a well-known endpoint
  // We fetch the key_id from the JWT header, then get the key from Plaid
  cachedJWKS = createRemoteJWKSet(
    new URL("https://production.plaid.com/.well-known/jwks.json")
  );
  jwksCachedAt = now;
  return cachedJWKS;
}

/**
 * Verify a Plaid webhook request using their JWT-based verification.
 * Returns true if the webhook is authentic, false otherwise.
 *
 * Plaid sends a `Plaid-Verification` header containing a signed JWT.
 * We verify the JWT signature against Plaid's published JWKs,
 * then check the request body hash matches.
 */
export async function verifyPlaidWebhook(
  body: string,
  plaidVerificationHeader: string | null,
): Promise<boolean> {
  // If no verification header, fall back to shared secret check
  if (!plaidVerificationHeader) {
    return false;
  }

  try {
    const jwks = await getPlaidJWKS();

    // Verify the JWT signature
    const { payload } = await jwtVerify(plaidVerificationHeader, jwks, {
      maxTokenAge: "5 min", // Reject tokens older than 5 minutes
    });

    // Verify body hash matches
    const expectedHash = payload.request_body_sha256 as string;
    if (!expectedHash) return false;

    const encoder = new TextEncoder();
    const data = encoder.encode(body);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashHex = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");

    return hashHex === expectedHash;
  } catch (err) {
    console.error("[plaid-webhook] JWT verification failed:", err);
    return false;
  }
}
