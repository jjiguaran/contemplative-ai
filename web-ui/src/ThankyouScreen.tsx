import React from 'react';

/* ─── Thank-you Screen ──────────────────────────────────────────────── */
interface ThankyouScreenProps {
  visible: boolean;
  onNewSession: () => void;
  installAvailable: boolean;
  isIOS: boolean;
  isInstalled: boolean;
  onInstall: () => void;
}

export default function ThankyouScreen({ visible, onNewSession, installAvailable, isIOS, isInstalled, onInstall }: ThankyouScreenProps) {
  const showInstallCta = !isInstalled && (installAvailable || isIOS);
  return (
    <div className={`feedback-wrap${visible ? ' visible' : ''}`}>
      <div className="feedback-card">
        <div className="thankyou-wrap">
          <span className="thankyou-glyph">✦</span>
          <h2 className="thankyou-title">Gracias</h2>
          <p className="thankyou-sub">Tu experiencia nos ayuda a mejorar.</p>

          {/* Post-session install prompt */}
          {showInstallCta && (
            isIOS ? (
              <p style={{
                fontSize: '11px',
                color: 'rgba(160,148,240,0.55)',
                letterSpacing: '0.04em',
                textAlign: 'center',
                lineHeight: 1.6,
                marginTop: '0.5rem',
                marginBottom: '0.25rem',
              }}>
                📲 Instala la app: toca <strong>Compartir</strong> → <strong>Agregar a pantalla de inicio</strong>
              </p>
            ) : (
              <button
                className="install-thanks-btn"
                onClick={onInstall}
                style={{
                  width: '100%',
                  padding: '11px 0',
                  borderRadius: '30px',
                  border: '0.5px solid rgba(123,111,208,0.45)',
                  background: 'rgba(123,111,208,0.14)',
                  color: 'rgba(200,190,255,0.9)',
                  fontSize: '12px',
                  fontFamily: 'var(--font-ui)',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease-out',
                  marginTop: '0.5rem',
                }}
                onMouseOver={e => {
                  e.currentTarget.style.background = 'rgba(123,111,208,0.26)';
                  e.currentTarget.style.borderColor = 'rgba(123,111,208,0.7)';
                }}
                onMouseOut={e => {
                  e.currentTarget.style.background = 'rgba(123,111,208,0.14)';
                  e.currentTarget.style.borderColor = 'rgba(123,111,208,0.45)';
                }}
              >
                📲 Instalar Bhavana
              </button>
            )
          )}

          <button className="new-session-btn" onClick={onNewSession}>
            Nueva sesión
          </button>
        </div>
      </div>
    </div>
  );
}