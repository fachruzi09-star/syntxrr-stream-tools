import React from 'react';
import { ActiveNav, OperatingMode, Scene } from '../types';
import { Layers, ShieldAlert, Monitor, Radio } from 'lucide-react';

interface HeaderProps {
  activeNav: ActiveNav;
  operatingMode: OperatingMode;
  activeScene: Scene | null;
  onNavigate: (nav: ActiveNav) => void;
  onOpenModeModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeNav,
  operatingMode,
  activeScene,
  onNavigate,
  onOpenModeModal,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-[#080c16]/95 backdrop-blur-md border-b border-slate-800/80 px-4 py-3 flex items-center justify-between gap-4">
      {/* Zone 1: Single element brand wordmark */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={() => onNavigate('dashboard')}
          className="flex items-center gap-2.5 text-left group"
        >
          <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400 group-hover:bg-blue-600/30 transition-colors">
            <Radio className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <div className="text-sm font-bold tracking-wider text-white flex items-center gap-1.5 leading-none">
              SYNTXRR
              <span className="text-[10px] text-blue-400 font-semibold tracking-normal px-1 py-0.5 rounded bg-blue-950/60 border border-blue-800/50">
                PROTOTYPE
              </span>
            </div>
            <div className="text-[11px] text-slate-400 font-medium tracking-tight mt-0.5">
              Stream Tools
            </div>
          </div>
        </button>
      </div>

      {/* Zone 2: Desktop nav links / mobile context info */}
      <div className="hidden md:flex items-center gap-5 text-xs font-medium text-slate-300">
        <button
          onClick={() => onNavigate('dashboard')}
          className={`hover:text-blue-400 transition-colors whitespace-nowrap ${
            activeNav === 'dashboard' ? 'text-blue-400 font-semibold' : ''
          }`}
        >
          Dashboard
        </button>
        <button
          onClick={() => onNavigate('music')}
          className={`hover:text-blue-400 transition-colors whitespace-nowrap ${
            activeNav === 'music' ? 'text-blue-400 font-semibold' : ''
          }`}
        >
          Music Center
        </button>
        <button
          onClick={() => onNavigate('overlay')}
          className={`hover:text-blue-400 transition-colors whitespace-nowrap ${
            activeNav === 'overlay' ? 'text-blue-400 font-semibold' : ''
          }`}
        >
          Overlay Studio
        </button>
        <button
          onClick={() => onNavigate('scenes')}
          className={`hover:text-blue-400 transition-colors whitespace-nowrap ${
            activeNav === 'scenes' ? 'text-blue-400 font-semibold' : ''
          }`}
        >
          Scene Manager
        </button>
        <button
          onClick={() => onNavigate('alerts')}
          className={`hover:text-blue-400 transition-colors whitespace-nowrap ${
            activeNav === 'alerts' ? 'text-blue-400 font-semibold' : ''
          }`}
        >
          Live Alerts
        </button>
        <button
          onClick={() => onNavigate('settings')}
          className={`hover:text-blue-400 transition-colors whitespace-nowrap ${
            activeNav === 'settings' ? 'text-blue-400 font-semibold' : ''
          }`}
        >
          Settings
        </button>
      </div>

      {/* Zone 3: Connection status & Quick Mode action */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-900/90 border border-slate-800 text-[11px] text-slate-400">
          <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
          <span className="font-medium text-amber-300/90">Not Connected</span>
        </div>

        {activeScene && (
          <button
            onClick={() => onNavigate('scenes')}
            className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#0e1626] border border-blue-900/40 text-[11px] text-blue-300 hover:border-blue-700/60 transition-colors"
          >
            <Layers className="w-3.5 h-3.5 text-blue-400" />
            <span className="truncate max-w-[110px]">{activeScene.name}</span>
          </button>
        )}

        <button
          onClick={onOpenModeModal}
          className="min-h-[38px] px-3 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/50 text-blue-300 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
          title="Switch or preview active operating mode"
        >
          <Monitor className="w-3.5 h-3.5 text-blue-400" />
          <span className="whitespace-nowrap">
            {operatingMode === 'MODE_A_OVERLAY' ? 'Mode A: Overlay' : 'Mode B: Encoder'}
          </span>
        </button>
      </div>
    </header>
  );
};
