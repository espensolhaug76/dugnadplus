import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../services/supabaseClient';

interface Message {
  id: string;
  sender_family_id: string;
  message: string;
  created_at: string;
}

interface VikarChatProps {
  requestId: string;
  currentUserId: string;
  currentUserName: string;
  otherName: string;
  onClose: () => void;
}

export const VikarChat: React.FC<VikarChatProps> = ({ requestId, currentUserId, currentUserName: _currentUserName, otherName, onClose }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 5000);
    return () => clearInterval(interval);
  }, [requestId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchMessages = async () => {
    const { data } = await supabase
      .from('vikar_messages')
      .select('*')
      .eq('request_id', requestId)
      .order('created_at', { ascending: true });
    if (data) setMessages(data);
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || sending) return;
    setSending(true);
    await supabase.from('vikar_messages').insert({
      request_id: requestId,
      sender_family_id: currentUserId,
      message: newMessage.trim()
    });
    setNewMessage('');
    setSending(false);
    fetchMessages();
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
      <div style={{ width: '450px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', background: 'var(--card-bg, white)', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', background: 'var(--color-primary)', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: '700', fontSize: '16px' }}>💬 Chat med {otherName}</div>
            <div style={{ fontSize: '12px', opacity: 0.8 }}>Vikar-avtale</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'white', fontSize: '20px', cursor: 'pointer' }}>×</button>
        </div>

        {/* Meldinger */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px', minHeight: '300px', background: 'var(--bg-secondary, #f8fafc)' }}>
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '40px 0', fontSize: '14px' }}>
              Ingen meldinger ennå. Si hei! 👋
            </div>
          )}
          {messages.map(msg => {
            const isMine = msg.sender_family_id === currentUserId;
            return (
              <div key={msg.id} style={{ display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '75%', padding: '10px 14px', borderRadius: '12px',
                  background: isMine ? 'var(--color-primary)' : 'var(--card-bg, white)',
                  color: isMine ? 'white' : 'var(--text-primary)',
                  border: isMine ? 'none' : '1px solid var(--border-color)',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                }}>
                  {!isMine && <div style={{ fontSize: '11px', fontWeight: '600', opacity: 0.7, marginBottom: '2px' }}>{otherName}</div>}
                  <div style={{ fontSize: '14px', lineHeight: '1.4' }}>{msg.message}</div>
                  <div style={{ fontSize: '10px', opacity: 0.6, marginTop: '4px', textAlign: 'right' }}>
                    {new Date(msg.created_at).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '8px', background: 'var(--card-bg, white)' }}>
          <input
            className="input"
            value={newMessage}
            onChange={e => setNewMessage(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') sendMessage(); }}
            placeholder="Skriv melding..."
            style={{ flex: 1 }}
            autoFocus
          />
          <button onClick={sendMessage} disabled={sending} className="btn btn-primary" style={{ padding: '10px 20px' }}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
};
