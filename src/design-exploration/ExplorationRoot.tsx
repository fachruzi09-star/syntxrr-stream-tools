import React, { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Sparkles } from 'lucide-react';
import App from '../App';
import { ExplorationApp } from './ExplorationApp';

type RootSurface = 'exploration' | 'production';

export const ExplorationRoot: React.FC = () => {
  const isNative = Capacitor.isNativePlatform();

  const [surface, setSurface] = useState<RootSurface>(() => {
    if (isNative) return 'production';
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('view') === 'production') return 'production';
    }
    return 'exploration';
  });

  if (isNative || surface === 'production') {
    return (
      <>
        <App />
        {!isNative && (
          <button
            type="button"
            onClick={() => setSurface('exploration')}
            className="fixed bottom-4 right-4 z-[9999] px-3 py-2 text-xs font-semibold inline-flex items-center gap-1.5 shadow-lg"
            style={{
              backgroundColor: '#111622',
              color: '#FACC15',
              border: '1px solid #334057',
              borderRadius: '10px',
            }}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Design Exploration (A–D)</span>
          </button>
        )}
      </>
    );
  }

  return <ExplorationApp onOpenProductionApp={() => setSurface('production')} />;
};
