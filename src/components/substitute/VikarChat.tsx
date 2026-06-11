import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../services/supabaseClient';

interface Message {
  id: string;
  request_id: string;
  thread_substitute_id: string;
  sender_family_id: string | null;
  sender_substitute_id: string | null;
  message: string;
  created_at: string;
}

interface VikarChatProps {
  /** Request-iden chatten tilhører. */
  requestId: string;
  /** Vikaren tråden er for. Brukes som thread_substitute_id-nøkkel. */
  substituteId: string;
  /** Hvilken rolle den innloggede brukeren har — styrer hvilken
   *  side av tråden meldingene rendres på. */
  myRole: 'family' | 'substitute';
  /** Navn vist øverst i chat-vinduet (motpart). */
  otherName: string;
  onClose: () => void;
}

const POLL_MS = 5000;

export const VikarChat: React.FC<VikarChatProps> = ({
  requestId,
  substituteId,
  myRole,
  otherName,
  onClose,
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void fetchMessages();
    const interval = window.setInterval(fetchMessages, POLL_MS);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId, substituteId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchMessages = async () => {
    const { data, error } = await supabase.rpc('get_vikar_messages', {
      p_request_id: requestId,
      p_substitute_id: substituteId,
    });
    if (error) {
      setLoadError(error.message);
      return;
    }
    setLoadError(null);
    setMessages((data || []) as Message[]);
  };

  const sendMessage = async () => {
    const trimmed = newMessage.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setSendError(null);
    const { error } = await supabase.rpc('send_vikar_message', {
      p_request_id: requestId,
      p_substitute_id: substituteId,
      p_content: trimmed,
    });
    setSending(false);
    if (error) {
      setSendError(error.message);
      return;
    }
    setNewMessage('');
    void fetchMessages();
  };

  const isMine = (msg: Message): boolean => {
    if (myRole === 'family') return msg.sender_family_id !== null;
    return msg.sender_substitute_id !== null;
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px',
      }}
    >
      <div
        style={{
          width: '450px',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--card-bg, white)',
          borderRadius: '16px',
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            background: 'var(--color-primary)',
            color: 'white',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ fontWeight: 700, fontSize: '16px' }}>💬 Chat med {otherName}</div>
            <div style={{ fontSize: '12px', opacity: 0.8 }}>Vikar-avtale</div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'white', fontSize: '20px', cursor: 'pointer' }}
          >
            ×
          </button>
        </div>

        {/* Meldinger */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            minHeight: '300px',
            background: 'var(--bg-secondary, #f8fafc)',
          }}
        >
          {loadError && (
            <div style={{ textAlign: 'center', color: '#991b1b', padding: '12px', fontSize: '13px' }}>
              Klarte ikke laste meldinger: {loadError}
            </div>
          )}
          {!loadError && messages.length === 0 && (
            <div
              style={{
                textAlign: 'center',
                color: 'var(--text-secondary)',
                padding: '40px 0',
                fontSize: '14px',
              }}
            >
              Ingen meldinger ennå. Si hei! 👋
            </div>
          )}
          {messages.map((msg) => {
            const mine = isMine(msg);
            return (
              <div key={msg.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                <div
                  style={{
                    maxWidth: '75%',
                    padding: '10px 14px',
                    borderRadius: '12px',
                    background: mine ? 'var(--color-primary)' : 'var(--card-bg, white)',
                    color: mine ? 'white' : 'var(--text-primary)',
                    border: mine ? 'none' : '1px solid var(--border-color)',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                  }}
                >
                  {!mine && (
                    <div style={{ fontSize: '11px', fontWeight: 600, opacity: 0.7, marginBottom: '2px' }}>
                      {otherName}
                    </div>
                  )}
                  <div style={{ fontSize: '14px', lineHeight: 1.4 }}>{msg.message}</div>
                  <div style={{ fontSize: '10px', opacity: 0.6, marginTop: '4px', textAlign: 'right' }}>
                    {new Date(msg.created_at).toLocaleTimeString('nb-NO', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div
          style={{
            padding: '12px 16px',
            borderTop: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            background: 'var(--card-bg, white)',
          }}
        >
          {sendError && (
            <div style={{ color: '#991b1b', fontSize: '12px' }}>{sendError}</div>
          )}
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              className="input"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void sendMessage();
              }}
              placeholder="Skriv melding..."
              style={{ flex: 1 }}
              autoFocus
            />
            <button
              onClick={sendMessage}
              disabled={sending || newMessage.trim().length === 0}
              className="btn btn-primary"
              style={{ padding: '10px 20px' }}
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
