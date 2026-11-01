import React from 'react';
import { ActiveNav } from '../types';
import {
  LayoutDashboard,
  Music2,
  Sparkles,
  Layers,
  Bell,
  Settings,
} from 'lucide-react';

interface BottomNavProps {
  activeNav: ActiveNav;
  onNavigate: (nav: ActiveNav) => void;
  pendingRequestsCount?: number;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeNav,
  onNavigate,
  pendingRequestsCount = 0,
}) => {
  const navItems: { id: ActiveNav; label: string; icon: React.ElementType; badge?: number }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'music', label: 'Music', icon: Music2, badge: pendingRequestsCount },
    { id: 'overlay', label: 'Overlay', icon: Sparkles },
    { id: 'scenes', label: 'Scenes', icon: Layers },
    { id: 'alerts', label: 'Alerts', icon: Bell },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <nav
      aria-label="Bottom mobile navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#080c16]/95 backdrop-blur-lg border-t border-slate-800/90 pb-safe"
    >
      <div className="grid grid-cols-6 items-center h-14 px-1 max-w-lg mx-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeNav === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`relative flex flex-col items-center justify-center min-h-[44px] min-w-[44px] py-1 transition-colors rounded-lg ${
                isActive ? 'text-blue-400' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="relative">
                <Icon
                  className={`w-5 h-5 transition-transform ${
                    isActive ? 'scale-110 text-blue-400 stroke-[2.2]' : 'stroke-[1.8]'
                  }`}
                />
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="absolute -top-1 -right-2 px-1 text-[9px] font-bold bg-blue-600 text-white rounded-full leading-tight">
                    {item.badge}
                  </span>
                )}
              </div>
              <span
                className={`text-[10px] tracking-tight mt-0.5 truncate max-w-full ${
                  isActive ? 'font-semibold text-blue-300' : 'font-medium'
                }`}
              >
                {item.label}
              </span>
              {isActive && (
                <span className="absolute bottom-0 w-6 h-0.5 bg-blue-500 rounded-full" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
