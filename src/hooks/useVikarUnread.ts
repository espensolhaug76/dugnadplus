import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { supabase } from '../services/supabaseClient';

// useVikarUnread — ulest-badge for vikar-chat.
//
// Poller get_unread_counts() (migration 20260612_chat_reads_05) hvert
// 60. sekund. RPCen returnerer én rad per tråd med uleste meldinger
// fra motparten, uavhengig av om caller er familie eller vikar —
// rollen avledes server-side fra auth.uid().
//
// Trådidentitet = (request_id, thread_substitute_id). Bruk threadKey()
// for oppslag, og kall refresh() når en chat lukkes slik at badgen
// forsvinner uten å vente på neste poll.
//
// Bruk:
//   const unread = useVikarUnread(!!currentSubstituteId);
//   const n = unread.counts.get(threadKey(requestId, substituteId)) || 0;

const POLL_MS = 60_000;

export const threadKey = (requestId: string, substituteId: string) =>
  `${requestId}:${substituteId}`;

export interface VikarUnreadState {
  /** threadKey(requestId, substituteId) → antall uleste. */
  counts: Map<string, number>;
  /** Hent på nytt umiddelbart (f.eks. når en chat lukkes). */
  refresh: () => Promise<void>;
}

export const useVikarUnread = (enabled: boolean): VikarUnreadState => {
  const [counts, setCounts] = useState<Map<string, number>>(new Map());

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_unread_counts');
    if (error) {
      // Badge er ikke kritisk funksjonalitet — ikke forstyrr brukeren.
      console.warn('get_unread_counts feilet:', error.message);
      return;
    }
    const next = new Map<string, number>();
    for (const row of (data || []) as Array<{ request_id: string; thread_substitute_id: string; unread_count: number }>) {
      next.set(threadKey(row.request_id, row.thread_substitute_id), row.unread_count);
    }
    setCounts(next);
  }, []);

  useEffect(() => {
    // enabled gates til rollen (familie/vikar) er kjent — RPCen kaster
    // exception for brukere uten familie- eller vikar-tilknytning.
    if (!enabled) return;
    void refresh();
    const interval = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(interval);
  }, [enabled, refresh]);

  return { counts, refresh };
};

/** Lite rødt badge-tall til chat-knapper. Rendrer ingenting ved 0. */
export const unreadBadgeStyle: CSSProperties = {
  background: '#dc2626',
  color: '#fff',
  borderRadius: '10px',
  fontSize: '11px',
  fontWeight: 700,
  padding: '1px 6px',
  marginLeft: '6px',
  display: 'inline-block',
  minWidth: '18px',
  textAlign: 'center',
};
