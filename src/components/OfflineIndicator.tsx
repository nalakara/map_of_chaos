import React from 'react';
import { useOnlineStatus } from '../hooks/usePWAInstall';
import { WifiOff } from 'lucide-react';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      id="offline-indicator-banner"
      className="fixed bottom-20 left-4 z-40 flex items-center gap-2 rounded-md bg-zinc-900/90 border border-amber-500/40 px-3 py-1.5 text-xs font-mono text-amber-300 shadow-xl backdrop-blur-md"
    >
      <WifiOff className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
      <span>Offline Mode — All changes cached locally</span>
    </div>
  );
};
