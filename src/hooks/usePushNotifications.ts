import { supabase } from '../services/supabaseClient';

export function usePushNotifications(familyId: string, teamId: string) {
  const isSupported = 'serviceWorker' in navigator && 'PushManager' in window;

  const subscribe = async (): Promise<boolean> => {
    if (!isSupported || !familyId) return false;

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return false;

      const reg = await navigator.serviceWorker.ready;
      const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
      if (!vapidKey) {
        console.warn('VAPID public key not configured');
        return false;
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKey
      });

      const json = sub.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;

      await supabase.from('push_subscriptions').upsert({
        family_id: familyId,
        team_id: teamId || null,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth
      }, { onConflict: 'endpoint' });

      return true;
    } catch (err) {
      console.error('Push subscription failed:', err);
      return false;
    }
  };

  const isSubscribed = async (): Promise<boolean> => {
    if (!isSupported) return false;
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      return !!sub;
    } catch {
      return false;
    }
  };

  return { subscribe, isSubscribed, isSupported };
}

// Helper to send push via Edge Function (called from coordinator code)
export async function sendPushNotification(familyId: string, title: string, body: string, url?: string) {
  try {
    await supabase.functions.invoke('send-push', {
      body: { family_id: familyId, title, body, url: url || '/parent-dashboard' }
    });
  } catch (err) {
    console.error('Failed to send push:', err);
  }
}
