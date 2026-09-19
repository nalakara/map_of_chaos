import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, Share, X } from 'lucide-react';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        id="pwa-install-btn"
        onClick={install}
        className="flex items-center gap-1.5 rounded-md bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 text-xs font-mono text-amber-300 hover:bg-amber-500/20 transition cursor-pointer"
        title="Install Map of Chaos as Progressive Web App"
      >
        <Download className="w-3.5 h-3.5" />
        <span>Install PWA</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          id="pwa-ios-install-btn"
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-1.5 rounded-md bg-slate-800/60 border border-slate-700/60 px-2.5 py-1 text-xs font-mono text-slate-300 hover:bg-slate-800 transition cursor-pointer"
        >
          <Share className="w-3.5 h-3.5" />
          <span>Install on iOS</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
            <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-[#12151c] p-6 shadow-2xl text-slate-200">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <h3 className="text-sm font-semibold tracking-wide text-white uppercase font-mono">Install on iOS</h3>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-slate-400">
                1. Tap the <strong className="text-slate-200">Share</strong> button in the Safari toolbar.<br />
                2. Scroll down and tap <strong className="text-slate-200">Add to Home Screen</strong>.
              </p>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-lg bg-slate-800 py-2 text-xs font-mono text-slate-200 hover:bg-slate-700 transition"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
