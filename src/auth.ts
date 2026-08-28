const encoder = new TextEncoder();
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const COOKIE = "np_admin";

export function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

function bytesToB64(bytes: ArrayBuffer): string {
  const bin = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function b64ToBytes(value: string): Uint8Array {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const bin = atob(padded + pad);
  return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function timingEqual(a: string, b: string): boolean {
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  if (left.length !== right.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) {
    diff |= left[i] ^ right[i];
  }
  return diff === 0;
}

export async function createSessionCookie(secret: string): Promise<string> {
  const exp = Date.now() + SESSION_TTL_MS;
  const payload = String(exp);
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const value = `${payload}.${bytesToB64(sig)}`;
  return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`;
}

export function clearSessionCookie(): string {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export async function hasValidSession(request: Request, secret: string): Promise<boolean> {
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`));
  if (!match) {
    return false;
  }
  const token = match.slice(COOKIE.length + 1);
  const dot = token.indexOf(".");
  if (dot < 1) {
    return false;
  }
  const payload = token.slice(0, dot);
  const exp = Number(payload);
  if (!Number.isFinite(exp) || exp < Date.now()) {
    return false;
  }
  const key = await hmacKey(secret);
  const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
  const given = b64ToBytes(token.slice(dot + 1));
  if (expected.length !== given.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= expected[i] ^ given[i];
  }
  return diff === 0;
}

export function passwordMatches(given: string, expected: string): boolean {
  return timingEqual(given, expected);
}
