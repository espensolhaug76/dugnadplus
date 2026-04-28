import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Footer } from '../common/Footer';

const COLORS = {
  bg: '#faf8f4',
  text: '#1a2e1f',
  border: '#e8e0d0',
  muted: '#6b7f70',
  link: '#2d6a4f',
};

const FONT_SERIF = '"DM Serif Display", serif';
const FONT_SANS = '"DM Sans", sans-serif';

interface LegalLayoutProps {
  source: string;
}

export const LegalLayout: React.FC<LegalLayoutProps> = ({ source }) => {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: COLORS.bg,
        fontFamily: FONT_SANS,
        color: COLORS.text,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <header
        style={{
          padding: '20px 24px',
          borderBottom: `0.5px solid ${COLORS.border}`,
          textAlign: 'center',
        }}
      >
        <a
          href="/"
          style={{
            fontFamily: FONT_SERIF,
            fontSize: 22,
            color: COLORS.text,
            textDecoration: 'none',
          }}
        >
          Dugnad<span style={{ color: '#7ec8a0' }}>+</span>
        </a>
      </header>

      <main
        style={{
          flex: 1,
          maxWidth: 760,
          width: '100%',
          margin: '0 auto',
          padding: '32px 24px 48px',
          lineHeight: 1.6,
          fontSize: 15,
        }}
      >
        <article className="legal-prose">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{source}</ReactMarkdown>
        </article>
      </main>

      <Footer />

      <style>{`
        .legal-prose h2 {
          font-family: ${FONT_SERIF};
          font-size: 28px;
          font-weight: 500;
          margin: 0 0 16px;
          color: ${COLORS.text};
        }
        .legal-prose h3 {
          font-family: ${FONT_SERIF};
          font-size: 19px;
          font-weight: 500;
          margin: 28px 0 8px;
          color: ${COLORS.text};
        }
        .legal-prose p {
          margin: 0 0 14px;
        }
        .legal-prose ul, .legal-prose ol {
          margin: 0 0 14px;
          padding-left: 22px;
        }
        .legal-prose li {
          margin: 4px 0;
        }
        .legal-prose a {
          color: ${COLORS.link};
          text-decoration: underline;
        }
        .legal-prose strong {
          font-weight: 600;
        }
        .legal-prose em {
          color: ${COLORS.muted};
          font-style: italic;
        }
        .legal-prose table {
          width: 100%;
          border-collapse: collapse;
          margin: 0 0 14px;
          font-size: 14px;
        }
        .legal-prose th, .legal-prose td {
          border: 1px solid ${COLORS.border};
          padding: 8px 10px;
          text-align: left;
        }
        .legal-prose th {
          background: #f0ece4;
          font-weight: 600;
        }
        .legal-prose hr {
          border: none;
          border-top: 0.5px solid ${COLORS.border};
          margin: 24px 0;
        }
      `}</style>
    </div>
  );
};
