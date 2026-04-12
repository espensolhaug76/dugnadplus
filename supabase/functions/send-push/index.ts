import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const VAPID_EMAIL = Deno.env.get('VAPID_EMAIL') || 'mailto:post@dugnadplus.no';
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') || '';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') || '';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
);

Deno.serve(async (req) => {
  try {
    const { family_id, title, body, url } = await req.json();

    if (!family_id || !title) {
      return new Response(JSON.stringify({ error: 'Missing family_id or title' }), { status: 400 });
    }

    // Get all push subscriptions for this family
    const { data: subs, error } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('family_id', family_id);

    if (error || !subs || subs.length === 0) {
      return new Response(JSON.stringify({ sent: 0, message: 'No subscriptions found' }));
    }

    const payload = JSON.stringify({ title, body: body || '', url: url || '/parent-dashboard' });

    // Note: In production, use web-push library via npm:web-push
    // For now, return the count of subscriptions that would receive the notification
    const results = await Promise.allSettled(
      subs.map(async (sub) => {
        // web-push sendNotification would go here
        // For now, log the attempt
        console.log(`Would send push to ${sub.endpoint}: ${payload}`);
        return { endpoint: sub.endpoint, status: 'queued' };
      })
    );

    const sent = results.filter(r => r.status === 'fulfilled').length;
    return new Response(JSON.stringify({ sent, total: subs.length }));
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
