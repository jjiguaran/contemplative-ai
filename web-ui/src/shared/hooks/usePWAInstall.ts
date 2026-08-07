import { useState, useEffect } from 'react';
import { captureEvent } from '../../posthog';

export function usePWAInstall() {
  const [installPrompt, setInstallPrompt] = useState<Event | null>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isInstalled = window.matchMedia('(display-mode: standalone)').matches;

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
      setShowInstallBanner(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = () => {
    if (!installPrompt) return;
    (installPrompt as any).prompt();
    (installPrompt as any).userChoice.then((result: { outcome: string }) => {
      captureEvent('pwa_install', { outcome: result.outcome });
      setShowInstallBanner(false);
      setInstallPrompt(null);
    });
  };

  return {
    installPrompt,
    showInstallBanner,
    isIOS,
    isInstalled,
    setShowInstallBanner,
    handleInstallClick,
  };
}