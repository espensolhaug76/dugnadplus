// Felles helpers for Vipps ePayment-integrasjon.
// Brukes av: vipps-initiate-payment, vipps-webhook (auto-capture),
// vipps-poll-status, vipps-validate-merchant.

const VIPPS_API_BASE_URL = Deno.env.get('VIPPS_API_BASE_URL') || 'https://apitest.vipps.no';
const VIPPS_CLIENT_ID = Deno.env.get('VIPPS_CLIENT_ID') || '';
const VIPPS_CLIENT_SECRET = Deno.env.get('VIPPS_CLIENT_SECRET') || '';
const VIPPS_SUBSCRIPTION_KEY = Deno.env.get('VIPPS_SUBSCRIPTION_KEY') || '';

export const VIPPS_SYSTEM_HEADERS = {
  'Vipps-System-Name': 'dugnad-plus',
  'Vipps-System-Version': '1.0.0',
  'Vipps-System-Plugin-Name': 'lottery',
  'Vipps-System-Plugin-Version': '1.0.0',
};

// Token-cache i modul-scope. Edge Function-instansen kan re-bruke
// samme cache mellom invokasjoner så lenge den lever (typisk ~15 min).
let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getVippsAccessToken(): Promise<string> {
  const now = Date.now();
  // Re-bruk hvis vi har > 5 min igjen.
  if (cachedToken && cachedToken.expiresAt > now + 5 * 60 * 1000) {
    return cachedToken.token;
  }

  const url = `${VIPPS_API_BASE_URL}/accesstoken/get`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'client_id': VIPPS_CLIENT_ID,
      'client_secret': VIPPS_CLIENT_SECRET,
      'Ocp-Apim-Subscription-Key': VIPPS_SUBSCRIPTION_KEY,
      ...VIPPS_SYSTEM_HEADERS,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Vipps access token failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  // Vipps returnerer expires_in som antall sekunder (typisk 3600).
  const expiresInMs = (Number(data.expires_in) || 3600) * 1000;
  cachedToken = {
    token: data.access_token,
    expiresAt: now + expiresInMs,
  };
  return data.access_token;
}

export interface VippsFetchOptions {
  msn: string;                 // Merchant-Serial-Number
  idempotencyKey?: string;     // for capture/refund/cancel
  body?: unknown;
}

// Felles fetch mot Vipps med retry på 401 (token utløpt).
// Returnerer { status, data, headers }.
export async function vippsFetch(
  path: string,
  method: 'GET' | 'POST',
  opts: VippsFetchOptions
): Promise<{ status: number; data: any; ok: boolean }> {
  const url = `${VIPPS_API_BASE_URL}${path}`;
  let token = await getVippsAccessToken();

  const buildHeaders = (t: string): HeadersInit => {
    const h: Record<string, string> = {
      'Authorization': `Bearer ${t}`,
      'Ocp-Apim-Subscription-Key': VIPPS_SUBSCRIPTION_KEY,
      'Merchant-Serial-Number': opts.msn,
      'Content-Type': 'application/json',
      ...VIPPS_SYSTEM_HEADERS,
    };
    if (opts.idempotencyKey) {
      h['Idempotency-Key'] = opts.idempotencyKey;
    }
    return h;
  };

  const doFetch = async (t: string) => {
    const init: RequestInit = {
      method,
      headers: buildHeaders(t),
    };
    if (opts.body !== undefined && method !== 'GET') {
      init.body = JSON.stringify(opts.body);
    }
    return fetch(url, init);
  };

  let response = await doFetch(token);

  // 401: token kan være utløpt mellom getAccessToken() og kallet.
  // Tving fresh token og prøv én gang til.
  if (response.status === 401) {
    cachedToken = null;
    token = await getVippsAccessToken();
    response = await doFetch(token);
  }

  let data: any = null;
  const text = await response.text();
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }

  // Logg uten secrets
  console.log(`[vippsFetch] ${method} ${path} → ${response.status}`);

  return {
    status: response.status,
    data,
    ok: response.ok,
  };
}

// Standard CORS-headers for alle Edge Functions som kalles fra frontend.
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export function corsResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

export function handleOptions(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
