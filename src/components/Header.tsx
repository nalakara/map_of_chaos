import React from 'react';
import { ViewMode } from '../types';
import { PWAInstallButton } from './PWAInstallButton';
import { Map as MapIcon, Inbox, Compass, EyeOff, RotateCcw } from 'lucide-react';

interface HeaderProps {
  currentView: ViewMode;
  onSelectView: (view: ViewMode) => void;
  inboxCount: number;
  erasedCount: number;
  onResetToDemo: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentView,
  onSelectView,
  inboxCount,
  erasedCount,
  onResetToDemo,
}) => {
  return (
    <header
      id="app-header"
      className="h-14 border-b border-slate-800/80 bg-[#0c0e12]/90 backdrop-blur-md px-4 flex items-center justify-between z-30 shrink-0 select-none"
    >
      {/* Brand & User identity */}
      <div className="flex items-center gap-3">
        <div
          onClick={() => onSelectView('map')}
          className="cursor-pointer group flex items-center gap-2.5"
        >
          <div className="w-6 h-6 rounded-full border border-amber-500/40 bg-amber-500/10 flex items-center justify-center group-hover:border-amber-400 transition">
            <div className="w-2 h-2 rounded-full bg-amber-400" />
          </div>
          <div>
            <span className="font-serif text-sm tracking-widest uppercase font-bold text-white group-hover:text-amber-200 transition">
              Map of Chaos
            </span>
            <span className="hidden md:inline ml-2 text-[10px] font-mono text-slate-500 uppercase tracking-wider">
              / Yudhan's World
            </span>
          </div>
        </div>
      </div>

      {/* Primary Navigation Tabs */}
      <nav className="flex items-center gap-1 bg-[#121620] p-1 rounded-lg border border-slate-800/80">
        <button
          id="nav-tab-map"
          onClick={() => onSelectView('map')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-mono transition cursor-pointer ${
            currentView === 'map'
              ? 'bg-amber-500 text-black font-semibold shadow-xs'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <MapIcon className="w-3.5 h-3.5" />
          <span>MAP</span>
        </button>

        <button
          id="nav-tab-inbox"
          onClick={() => onSelectView('inbox')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-mono transition cursor-pointer ${
            currentView === 'inbox'
              ? 'bg-amber-500 text-black font-semibold shadow-xs'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Inbox className="w-3.5 h-3.5" />
          <span>INBOX</span>
          {inboxCount > 0 && (
            <span
              className={`px-1 rounded-full text-[9px] ${
                currentView === 'inbox' ? 'bg-black/20 text-black' : 'bg-slate-800 text-slate-300'
              }`}
            >
              {inboxCount}
            </span>
          )}
        </button>

        <button
          id="nav-tab-wander"
          onClick={() => onSelectView('wander')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-mono transition cursor-pointer ${
            currentView === 'wander'
              ? 'bg-amber-500 text-black font-semibold shadow-xs'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Compass className="w-3.5 h-3.5" />
          <span>WANDER</span>
        </button>

        <button
          id="nav-tab-erased"
          onClick={() => onSelectView('erased')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-mono transition cursor-pointer ${
            currentView === 'erased'
              ? 'bg-amber-500 text-black font-semibold shadow-xs'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <EyeOff className="w-3.5 h-3.5" />
          <span>ERASED</span>
          {erasedCount > 0 && (
            <span
              className={`px-1 rounded-full text-[9px] ${
                currentView === 'erased' ? 'bg-black/20 text-black' : 'bg-slate-800 text-slate-300'
              }`}
            >
              {erasedCount}
            </span>
          )}
        </button>
      </nav>

      {/* Right controls: PWA Install + Demo Reset */}
      <div className="flex items-center gap-2">
        <PWAInstallButton />

        <button
          id="reset-demo-btn"
          onClick={onResetToDemo}
          className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-mono text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition cursor-pointer"
          title="Reset back to prototype sample data"
        >
          <RotateCcw className="w-3 h-3" />
          <span className="hidden sm:inline">Reset Demo</span>
        </button>
      </div>
    </header>
  );
};
