// register-vipps-webhook.ts
// =============================================================
// Engangs-script: registrerer Dugnad+ sitt webhook-endepunkt
// hos Vipps og skriver ut webhook-secret som returneres.
//
// Kjøring (lokalt fra Espens maskin):
//   deno run --allow-net --allow-env scripts/register-vipps-webhook.ts
//
// Krever environment-variabler:
//   VIPPS_CLIENT_ID
//   VIPPS_CLIENT_SECRET
//   VIPPS_SUBSCRIPTION_KEY
//   VIPPS_MSN                   (= 486209 for test)
//   VIPPS_API_BASE_URL          (= https://apitest.vipps.no for test)
//   SUPABASE_PROJECT_REF        (f.eks. "abcdefg" — del av URL)
//
// Etter kjøring: ta secret fra outputet og sett som
// VIPPS_WEBHOOK_SECRET i Supabase Edge Function-secrets, deretter
// re-deploy vipps-webhook funksjonen.
// =============================================================

const required = [
  'VIPPS_CLIENT_ID',
  'VIPPS_CLIENT_SECRET',
  'VIPPS_SUBSCRIPTION_KEY',
  'VIPPS_MSN',
  'VIPPS_API_BASE_URL',
  'SUPABASE_PROJECT_REF',
] as const;

for (const k of required) {
  if (!Deno.env.get(k)) {
    console.error(`❌ Mangler env-variabel: ${k}`);
    Deno.exit(1);
  }
}

const VIPPS_API_BASE_URL = Deno.env.get('VIPPS_API_BASE_URL')!;
const CLIENT_ID = Deno.env.get('VIPPS_CLIENT_ID')!;
const CLIENT_SECRET = Deno.env.get('VIPPS_CLIENT_SECRET')!;
const SUBSCRIPTION_KEY = Deno.env.get('VIPPS_SUBSCRIPTION_KEY')!;
const MSN = Deno.env.get('VIPPS_MSN')!;
const PROJECT_REF = Deno.env.get('SUPABASE_PROJECT_REF')!;

const WEBHOOK_URL = `https://${PROJECT_REF}.functions.supabase.co/vipps-webhook`;

const SYSTEM_HEADERS = {
  'Vipps-System-Name': 'dugnad-plus',
  'Vipps-System-Version': '1.0.0',
  'Vipps-System-Plugin-Name': 'lottery',
  'Vipps-System-Plugin-Version': '1.0.0',
};

console.log('1. Henter access token...');
const tokenResp = await fetch(`${VIPPS_API_BASE_URL}/accesstoken/get`, {
  method: 'POST',
  headers: {
    'client_id': CLIENT_ID,
    'client_secret': CLIENT_SECRET,
    'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY,
    ...SYSTEM_HEADERS,
  },
});
if (!tokenResp.ok) {
  console.error(`❌ Access token feilet: ${tokenResp.status}`);
  console.error(await tokenResp.text());
  Deno.exit(1);
}
const { access_token } = await tokenResp.json();
console.log('   ✓ Access token hentet');

console.log('2. Lister eksisterende webhooks...');
const listResp = await fetch(`${VIPPS_API_BASE_URL}/webhooks/v1/webhooks`, {
  headers: {
    'Authorization': `Bearer ${access_token}`,
    'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY,
    'Merchant-Serial-Number': MSN,
    ...SYSTEM_HEADERS,
  },
});
if (listResp.ok) {
  const list = await listResp.json();
  const existing = (list.webhooks || []).find((w: any) => w.url === WEBHOOK_URL);
  if (existing) {
    console.log(`   ⚠ Webhook for ${WEBHOOK_URL} finnes allerede (id=${existing.id}).`);
    console.log('   Sletter den først for å få ny secret...');
    const delResp = await fetch(`${VIPPS_API_BASE_URL}/webhooks/v1/webhooks/${existing.id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY,
        'Merchant-Serial-Number': MSN,
        ...SYSTEM_HEADERS,
      },
    });
    if (!delResp.ok) {
      console.error(`   ❌ Kunne ikke slette eksisterende webhook: ${delResp.status}`);
      Deno.exit(1);
    }
    console.log('   ✓ Slettet');
  }
}

console.log('3. Registrerer ny webhook...');
const createResp = await fetch(`${VIPPS_API_BASE_URL}/webhooks/v1/webhooks`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${access_token}`,
    'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY,
    'Merchant-Serial-Number': MSN,
    'Content-Type': 'application/json',
    ...SYSTEM_HEADERS,
  },
  body: JSON.stringify({
    url: WEBHOOK_URL,
    events: [
      'epayments.payment.created.v1',
      'epayments.payment.authorized.v1',
      'epayments.payment.captured.v1',
      'epayments.payment.cancelled.v1',
      'epayments.payment.expired.v1',
      'epayments.payment.terminated.v1',
      'epayments.payment.aborted.v1',
      'epayments.payment.refunded.v1',
    ],
  }),
});

if (!createResp.ok) {
  console.error(`❌ Webhook-registrering feilet: ${createResp.status}`);
  console.error(await createResp.text());
  Deno.exit(1);
}

const { id, secret } = await createResp.json();
console.log('\n=============================================================');
console.log('✅ Webhook registrert!');
console.log(`   id:     ${id}`);
console.log(`   url:    ${WEBHOOK_URL}`);
console.log(`   secret: ${secret}`);
console.log('=============================================================');
console.log('\nNESTE STEG:');
console.log('1. Sett VIPPS_WEBHOOK_SECRET = secret (ovenfor) i');
console.log('   Supabase Dashboard → Edge Functions → Secrets');
console.log('2. Re-deploy vipps-webhook:');
console.log('   supabase functions deploy vipps-webhook');
