import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';

interface SmsCredits {
  id: string;
  team_id: string;
  credits_remaining: number;
  credits_used: number;
  auto_reminder_enabled: boolean;
  auto_reminder_days_before: number;
}

interface SmsLogEntry {
  id: string;
  sent_at: string;
  recipient_name: string;
  recipient_phone: string;
  type: string;
  status: string;
}

const SMS_PACKAGES = [
  { name: '50 SMS', count: 50, price: '29 kr', perSms: '0,58 kr/sms' },
  { name: '200 SMS', count: 200, price: '89 kr', perSms: '0,45 kr/sms', recommended: true },
  { name: '500 SMS', count: 500, price: '199 kr', perSms: '0,40 kr/sms' },
];

export const SmsSettingsPage: React.FC = () => {
  const [credits, setCredits] = useState<SmsCredits | null>(null);
  const [smsLog, setSmsLog] = useState<SmsLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoReminderEnabled, setAutoReminderEnabled] = useState(false);
  const [reminderDaysBefore, setReminderDaysBefore] = useState(2);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const teamId = localStorage.getItem('dugnad_active_team_filter');
      if (!teamId) { setLoading(false); return; }

      // Hent SMS-kreditter
      const { data: creditsData } = await supabase
        .from('sms_credits')
        .select('*')
        .eq('team_id', teamId)
        .maybeSingle();

      if (creditsData) {
        setCredits(creditsData);
        setAutoReminderEnabled(creditsData.auto_reminder_enabled || false);
        setReminderDaysBefore(creditsData.auto_reminder_days_before || 2);
      } else {
        setCredits(null);
        setAutoReminderEnabled(false);
        setReminderDaysBefore(2);
      }

      // Hent SMS-logg
      const { data: logData } = await supabase
        .from('sms_log')
        .select('*')
        .eq('team_id', teamId)
        .order('sent_at', { ascending: false })
        .limit(50);

      if (logData) setSmsLog(logData);
    } catch (err) {
      console.error('Feil ved lasting av SMS-data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleBuyPackage = (pkg: typeof SMS_PACKAGES[0]) => {
    alert('Betaling kommer snart — kontakt oss for å aktivere.');
  };

  const handleToggleAutoReminder = async (enabled: boolean) => {
    setAutoReminderEnabled(enabled);
    const teamId = localStorage.getItem('dugnad_active_team_filter');
    if (!teamId) return;

    const { data } = await supabase
      .from('sms_credits')
      .upsert(
        { team_id: teamId, auto_reminder_enabled: enabled },
        { onConflict: 'team_id' }
      )
      .select()
      .maybeSingle();

    if (data) setCredits(data);
  };

  const handleDaysBeforeChange = async (days: number) => {
    setReminderDaysBefore(days);
    const teamId = localStorage.getItem('dugnad_active_team_filter');
    if (!teamId) return;

    const { data } = await supabase
      .from('sms_credits')
      .upsert(
        { team_id: teamId, auto_reminder_days_before: days },
        { onConflict: 'team_id' }
      )
      .select()
      .maybeSingle();

    if (data) setCredits(data);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const maskPhone = (phone: string) => {
    if (!phone || phone.length < 4) return phone || '';
    return '****' + phone.slice(-4);
  };

  const getTypeBadge = (type: string) => {
    if (type === 'reminder') {
      return { label: 'Påminnelse', bg: '#e6f0e8', color: '#2d6a4f' };
    }
    if (type === 'unconfirmed') {
      return { label: 'Ubekreftet', bg: '#fff8e6', color: '#854f0b' };
    }
    return { label: type, bg: '#f5f5f5', color: '#4a5e50' };
  };

  if (loading) {
    return (
      <>
        <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '300px' }}>
          <div style={{ fontSize: '14px', color: '#6b7f70' }}>Laster...</div>
        </div>
      </>
    );
  }

  return (
    <>
      <div style={{ padding: '20px 24px 40px', maxWidth: '900px', margin: '0 auto' }}>
        {/* Tilbake-knapp */}
        <button
          onClick={() => window.location.href = '/coordinator-dashboard'}
          style={{ background: 'none', border: 'none', color: '#6b7f70', fontSize: '12px', cursor: 'pointer', padding: 0, marginBottom: '16px' }}
        >
          ← Tilbake til dashbordet
        </button>

        {/* Header */}
        <div style={{
          background: '#1e3a2f',
          borderRadius: '10px',
          padding: '14px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
        }}>
          <div>
            <div style={{ fontSize: '14px', fontWeight: '500', color: '#fff' }}>📱 SMS-varsler</div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginTop: '2px' }}>
              Send påminnelser og purringer til foreldre
            </div>
          </div>
        </div>

        {/* Kreditter-kort */}
        <div style={{
          background: '#e6f0e8',
          borderRadius: '10px',
          padding: '16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
        }}>
          <div>
            <div style={{ fontSize: '24px', fontWeight: '500', color: '#2d6a4f' }}>
              {credits?.credits_remaining ?? 0}
            </div>
            <div style={{ fontSize: '12px', color: '#4a5e50' }}>kreditter igjen</div>
            <div style={{ fontSize: '11px', color: '#6b7f70', marginTop: '2px' }}>
              {credits?.credits_used ?? 0} brukt denne sesongen
            </div>
          </div>
          <button
            onClick={() => document.getElementById('buy-packages')?.scrollIntoView({ behavior: 'smooth' })}
            style={{
              background: '#2d6a4f',
              color: '#fff',
              borderRadius: '8px',
              padding: '8px 16px',
              fontSize: '13px',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Kjøp mer
          </button>
        </div>

        {/* Kjøp pakker */}
        <div id="buy-packages" style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '11px', fontWeight: '600', color: '#4a5e50', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
            Kjøp SMS-pakker
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
            {SMS_PACKAGES.map((pkg) => (
              <div
                key={pkg.name}
                onClick={() => handleBuyPackage(pkg)}
                style={{
                  position: 'relative',
                  background: '#fff',
                  border: '0.5px solid #e8e0d0',
                  borderRadius: '10px',
                  padding: '14px',
                  textAlign: 'center',
                  cursor: 'pointer',
                }}
              >
                {pkg.recommended && (
                  <div style={{
                    position: 'absolute',
                    top: '8px',
                    right: '8px',
                    background: '#7ec8a0',
                    color: '#1e3a2f',
                    fontSize: '10px',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontWeight: '600',
                  }}>
                    Anbefalt
                  </div>
                )}
                <div style={{ fontSize: '15px', fontWeight: '500', color: '#1a2e1f', marginBottom: '4px' }}>
                  {pkg.name}
                </div>
                <div style={{ fontSize: '20px', fontWeight: '500', color: '#2d6a4f', marginBottom: '4px' }}>
                  {pkg.price}
                </div>
                <div style={{ fontSize: '10px', color: '#6b7f70' }}>
                  {pkg.perSms}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Automatisk påminnelse */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '11px', fontWeight: '600', color: '#4a5e50', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
            Automatisk påminnelse
          </div>
          <div style={{ background: '#fff', border: '0.5px solid #e8e0d0', borderRadius: '10px', padding: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: autoReminderEnabled ? '12px' : '0' }}>
              <div style={{ fontSize: '13px', color: '#1a2e1f' }}>
                Send automatisk påminnelse før vakter
              </div>
              <div
                onClick={() => handleToggleAutoReminder(!autoReminderEnabled)}
                style={{
                  width: '44px',
                  height: '24px',
                  borderRadius: '12px',
                  background: autoReminderEnabled ? '#2d6a4f' : '#ccc',
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'background 0.2s',
                  flexShrink: 0,
                }}
              >
                <div style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  background: '#fff',
                  position: 'absolute',
                  top: '2px',
                  left: autoReminderEnabled ? '22px' : '2px',
                  transition: 'left 0.2s',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                }} />
              </div>
            </div>
            {autoReminderEnabled && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', color: '#4a5e50' }}>Dager før:</span>
                <select
                  value={reminderDaysBefore}
                  onChange={(e) => handleDaysBeforeChange(Number(e.target.value))}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '6px',
                    border: '0.5px solid #e8e0d0',
                    fontSize: '12px',
                    color: '#1a2e1f',
                    background: '#faf8f4',
                  }}
                >
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                </select>
              </div>
            )}
          </div>
        </div>

        {/* SMS-logg */}
        <div>
          <div style={{ fontSize: '11px', fontWeight: '600', color: '#4a5e50', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
            SMS-logg
          </div>
          <div style={{ background: '#fff', border: '0.5px solid #e8e0d0', borderRadius: '10px', overflow: 'hidden' }}>
            {smsLog.length === 0 ? (
              <div style={{ fontSize: '12px', color: '#6b7f70', padding: '24px', textAlign: 'center' }}>
                Ingen SMS sendt ennå
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '0.5px solid #e8e0d0' }}>
                    <th style={{ fontSize: '11px', color: '#4a5e50', textTransform: 'uppercase', fontWeight: '600', padding: '10px 14px', textAlign: 'left' }}>Dato</th>
                    <th style={{ fontSize: '11px', color: '#4a5e50', textTransform: 'uppercase', fontWeight: '600', padding: '10px 14px', textAlign: 'left' }}>Mottaker</th>
                    <th style={{ fontSize: '11px', color: '#4a5e50', textTransform: 'uppercase', fontWeight: '600', padding: '10px 14px', textAlign: 'left' }}>Type</th>
                    <th style={{ fontSize: '11px', color: '#4a5e50', textTransform: 'uppercase', fontWeight: '600', padding: '10px 14px', textAlign: 'left' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {smsLog.map((entry) => {
                    const badge = getTypeBadge(entry.type);
                    return (
                      <tr key={entry.id} style={{ borderBottom: '0.5px solid #e8e0d0' }}>
                        <td style={{ fontSize: '12px', color: '#1a2e1f', padding: '10px 14px' }}>
                          {formatDate(entry.sent_at)}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ fontSize: '12px', color: '#1a2e1f' }}>{entry.recipient_name}</div>
                          <div style={{ fontSize: '11px', color: '#6b7f70' }}>{maskPhone(entry.recipient_phone)}</div>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{
                            background: badge.bg,
                            color: badge.color,
                            fontSize: '10px',
                            fontWeight: '600',
                            padding: '2px 8px',
                            borderRadius: '10px',
                          }}>
                            {badge.label}
                          </span>
                        </td>
                        <td style={{ fontSize: '12px', color: '#4a5e50', padding: '10px 14px' }}>
                          {entry.status}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </>
  );
};
