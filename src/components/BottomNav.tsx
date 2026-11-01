import React from 'react';
import { NavigationTab } from '../types';
import {
  LayoutDashboard,
  Tv,
  Layers,
  Radio,
  Music2,
  Menu,
} from 'lucide-react';

interface BottomNavProps {
  activeNav: NavigationTab;
  onNavigate: (nav: NavigationTab) => void;
  onOpenDrawer: () => void;
  pendingRequestsCount?: number;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeNav,
  onNavigate,
  onOpenDrawer,
  pendingRequestsCount = 0,
}) => {
  const quickTabs: {
    id: NavigationTab | 'menu';
    label: string;
    icon: React.ElementType;
    badge?: number;
    action?: () => void;
  }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'studio', label: 'Studio', icon: Tv },
    { id: 'presets', label: 'Preset', icon: Layers },
    { id: 'live_center', label: 'Live', icon: Radio },
    { id: 'music', label: 'Musik', icon: Music2, badge: pendingRequestsCount },
    { id: 'menu', label: 'Menu', icon: Menu, action: onOpenDrawer },
  ];

  return (
    <nav
      aria-label="Navigasi bawah mobile"
      className="xl:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#080c16]/95 backdrop-blur-lg border-t border-slate-800/90 pb-safe"
    >
      <div className="grid grid-cols-6 items-center h-14 px-1 max-w-lg mx-auto">
        {quickTabs.map((item) => {
          const Icon = item.icon;
          const isActive = item.id !== 'menu' && activeNav === item.id;

          return (
            <button
              key={item.id}
              onClick={() => {
                if (item.action) {
                  item.action();
                } else if (item.id !== 'menu') {
                  onNavigate(item.id as NavigationTab);
                }
              }}
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
