import React from 'react';

/* ─── PWA Install Banner ────────────────────────────────────────────── */
interface InstallBannerProps {
  isInstalled: boolean;
  showInstallBanner: boolean;
  installPrompt: Event | null;
  isIOS: boolean;
  onInstall: () => void;
  onDismissBanner: () => void;
  onDismissIOS: () => void;
}

export default function InstallBanner({
  isInstalled,
  showInstallBanner,
  installPrompt,
  isIOS,
  onInstall,
  onDismissBanner,
  onDismissIOS,
}: InstallBannerProps) {
  if (isInstalled) return null;

  return (
    <>
      {showInstallBanner && (
        <div className="install-banner">
          <span className="install-banner-text">
            Instala Bhavana en tu dispositivo
          </span>
          <button className="install-banner-btn" onClick={onInstall}>
            Instalar
          </button>
          <button
            className="install-banner-close"
            onClick={onDismissBanner}
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>
      )}

      {!showInstallBanner && installPrompt && (
        <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
          <button
            onClick={onInstall}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '11px',
              color: 'rgba(160,148,240,0.45)',
              textDecoration: 'underline',
              textUnderlineOffset: '3px',
              letterSpacing: '0.04em',
              fontFamily: 'var(--font-ui)',
              padding: 0,
              transition: 'color 0.18s',
            }}
            onMouseOver={e => (e.currentTarget.style.color = 'rgba(168,159,232,0.85)')}
            onMouseOut={e => (e.currentTarget.style.color = 'rgba(160,148,240,0.45)')}
          >
            Instalar app
          </button>
        </div>
      )}

      {isIOS && !installPrompt && (
        <div className="install-banner ios-install-banner" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '6px' }}>
          <span className="install-banner-text" style={{ fontWeight: 400 }}>
            Para instalar en iPhone o iPad:
          </span>
          <span className="install-banner-text" style={{ opacity: 0.7 }}>
            Toca <strong>Compartir</strong> (□↑) → <strong>Agregar a pantalla de inicio</strong>
          </span>
          <button
            className="install-banner-close"
            aria-label="Cerrar"
            style={{ alignSelf: 'flex-end', marginTop: '-28px' }}
            onClick={onDismissIOS}
          >
            ✕
          </button>
        </div>
      )}
    </>
  );
}