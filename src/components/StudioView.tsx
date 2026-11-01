import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  StudioElement,
  CanvasOrientation,
  SourceType,
  StreamEventType,
  StreamEvent,
} from '../types';
import { streamEventBus } from '../services/eventBus';
import { soundSynth } from '../services/audioSimulator';
import { songRequestEngine, SongRequestState } from '../services/songRequestEngine';
import {
  Tv,
  Layers,
  Plus,
  Trash2,
  Copy,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Camera,
  MessageSquare,
  Bell,
  Sparkles,
  Undo2,
  Redo2,
  Zap,
  Globe,
  Radio,
  Type,
  Image as ImageIcon,
  Video,
  Volume2,
  TrendingUp,
  Sliders,
  Play,
  Pause,
  FastForward,
  Music,
  Monitor,
  Flame,
  Award,
  ListMusic,
  Check,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';

interface StudioViewProps {
  elements: StudioElement[];
  canvasOrientation: CanvasOrientation;
  onChangeOrientation: (orientation: CanvasOrientation) => void;
  onUpdateElements: (elements: StudioElement[]) => void;
  onSaveAsPreset: () => void;
}

// Active trigger reaction state for canvas animation
interface ActiveElementReaction {
  elementId: string;
  action: 'show' | 'pulse' | 'bounce' | 'text_update';
  textOverride?: string;
  countOverride?: number;
  expiresAt: number;
}

export const StudioView: React.FC<StudioViewProps> = ({
  elements,
  canvasOrientation,
  onChangeOrientation,
  onUpdateElements,
  onSaveAsPreset,
}) => {
  // Selected Element
  const [selectedId, setSelectedId] = useState<string | null>(elements[0]?.id || null);

  // Studio Sub-Sections: 'elements' | 'properties' | 'layers' | 'simulator'
  const [activeSidePanel, setActiveSidePanel] = useState<'properties' | 'elements' | 'layers' | 'simulator'>('properties');

  // Canvas Pan & Zoom
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Multi-Camera Stream Store (elementId -> MediaStream)
  const [activeCameraStreams, setActiveCameraStreams] = useState<Record<string, MediaStream>>({});
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});

  // Screen Capture Stream Store
  const [screenCaptureStream, setScreenCaptureStream] = useState<MediaStream | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);

  // Active Reactions on Canvas (Trigger Engine)
  const [activeReactions, setActiveReactions] = useState<Record<string, ActiveElementReaction>>({});

  // Dynamic Live Simulation Counter States
  const [simulatedLikes, setSimulatedLikes] = useState<number>(1240);
  const [recentChatList, setRecentChatList] = useState<{ id: string; user: string; text: string; badge?: string }[]>([
    { id: 'c1', user: 'DimasGamer', text: 'Keren banget gameplay-nya bang! 🔥', badge: 'VIP' },
    { id: 'c2', user: 'SitiStream', text: 'Gaskeun win streak malam ini!', badge: 'SUB' },
  ]);

  // Song Request Engine State Sync
  const [srState, setSrState] = useState<SongRequestState>(songRequestEngine.getState());

  useEffect(() => {
    return songRequestEngine.subscribe((state) => {
      setSrState(state);
    });
  }, []);

  // History for Undo/Redo
  const [history, setHistory] = useState<StudioElement[][]>([]);
  const [redoStack, setRedoStack] = useState<StudioElement[][]>([]);

  // Drag & Resize tracking
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    isDragging: boolean;
    isResizing: boolean;
    resizeHandle: string | null;
    elementId: string | null;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
  }>({
    isDragging: false,
    isResizing: false,
    resizeHandle: null,
    elementId: null,
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
    origW: 0,
    origH: 0,
  });

  const selectedElement = elements.find((e) => e.id === selectedId) || null;

  // Cleanup camera and screen tracks on unmount
  useEffect(() => {
    return () => {
      Object.values(activeCameraStreams).forEach((stream) => {
        stream.getTracks().forEach((track) => track.stop());
      });
      if (screenCaptureStream) {
        screenCaptureStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [activeCameraStreams, screenCaptureStream]);

  // EVENT-TO-ELEMENT ENGINE: Subscribe to streamEventBus
  useEffect(() => {
    const unsubscribe = streamEventBus.subscribe((event: StreamEvent) => {
      const now = Date.now();

      // Check each element to see if it should react
      elements.forEach((elem) => {
        let isMatch = false;
        let action: 'show' | 'pulse' | 'bounce' | 'text_update' = 'pulse';
        let durationSec = elem.triggerConfig?.durationSec || 5;
        let textOverride: string | undefined = undefined;
        let countOverride: number | undefined = undefined;

        // 1. AUTO TRIGGER LOGIC BY ELEMENT TYPE
        if (elem.type === 'event_alert') {
          // Alert pop-up: Matches gift, donation, or follow
          if (elem.triggerConfig?.eventType) {
            isMatch = elem.triggerConfig.eventType === 'all' || elem.triggerConfig.eventType === event.type;
          } else {
            isMatch = event.type === 'gift' || event.type === 'donation';
          }
          if (isMatch) {
            action = 'bounce';
            textOverride = `${event.username}: ${event.detail}`;
            soundSynth.playAlertChime(event.type === 'gift' ? 'gift' : 'follower');
          }
        } else if (elem.type === 'combo_counter') {
          // Combo counter: Matches gift or like
          if (event.type === 'gift' || event.type === 'like') {
            isMatch = true;
            action = 'pulse';
            soundSynth.playAlertChime('gift');
          }
        } else if (elem.type === 'chat_message') {
          // Live Chat: Matches chat comments
          if (event.type === 'chat') {
            isMatch = true;
            action = 'text_update';
            setRecentChatList((prev) => [
              ...prev.slice(-4),
              { id: `c_${now}`, user: event.username, text: event.detail, badge: 'LIVE' },
            ]);
            soundSynth.playAlertChime('chat_event');
          }
        } else if (elem.type === 'counter' || elem.type === 'live_viewer_counter') {
          // Like or viewer count
          if (event.type === 'like') {
            isMatch = true;
            action = 'pulse';
            setSimulatedLikes((prev) => prev + (event.amount || 1));
            soundSynth.playAlertChime('like');
          }
        } else if (elem.type === 'song_request') {
          // Song Request Widget reacts to song command
          if (event.type === 'chat' && event.detail.startsWith('!play')) {
            isMatch = true;
            action = 'pulse';
          }
        } else if (elem.triggerConfig && elem.triggerConfig.eventType) {
          // Custom explicit trigger configuration on other elements
          if (elem.triggerConfig.eventType === 'all' || elem.triggerConfig.eventType === event.type) {
            isMatch = true;
            action = (elem.triggerConfig.action as any) || 'show';
          }
        }

        if (isMatch) {
          setActiveReactions((prev) => ({
            ...prev,
            [elem.id]: {
              elementId: elem.id,
              action,
              textOverride,
              countOverride,
              expiresAt: now + durationSec * 1000,
            },
          }));
        }
      });
    });

    return () => {
      unsubscribe();
    };
  }, [elements]);

  // Periodic expiration cleaner for active reactions
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setActiveReactions((prev) => {
        let changed = false;
        const next = { ...prev };
        Object.entries(next).forEach(([id, reaction]) => {
          if (reaction.expiresAt <= now) {
            delete next[id];
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }, 500);

    return () => clearInterval(timer);
  }, []);

  // Record undo/redo history
  const commitElements = useCallback(
    (newElements: StudioElement[]) => {
      setHistory((prev) => [...prev.slice(-15), elements]);
      setRedoStack([]);
      onUpdateElements(newElements);
    },
    [elements, onUpdateElements]
  );

  const handleUndo = () => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setRedoStack((prev) => [...prev, elements]);
    setHistory((prev) => prev.slice(0, prev.length - 1));
    onUpdateElements(previous);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setHistory((prev) => [...prev, elements]);
    setRedoStack((prev) => prev.slice(0, prev.length - 1));
    onUpdateElements(next);
  };

  const updateElementField = (id: string, field: keyof StudioElement, value: any) => {
    const updated = elements.map((elem) => {
      if (elem.id === id) {
        return { ...elem, [field]: value };
      }
      return elem;
    });
    commitElements(updated);
  };

  const updateElementProperty = (id: string, key: string, value: any) => {
    const updated = elements.map((elem) => {
      if (elem.id === id) {
        return {
          ...elem,
          properties: {
            ...elem.properties,
            [key]: value,
          },
        };
      }
      return elem;
    });
    commitElements(updated);
  };

  const updateElementTrigger = (id: string, partial: any) => {
    const updated = elements.map((elem) => {
      if (elem.id === id) {
        return {
          ...elem,
          triggerConfig: {
            ...elem.triggerConfig,
            ...partial,
          },
        };
      }
      return elem;
    });
    commitElements(updated);
  };

  // MULTI-CAMERA STREAM CONTROL PER ELEMENT
  const handleToggleCameraForElement = async (elemId: string, requestedFacingMode?: 'user' | 'environment') => {
    const existing = activeCameraStreams[elemId];
    if (existing) {
      // Turn off
      existing.getTracks().forEach((track) => track.stop());
      setActiveCameraStreams((prev) => {
        const next = { ...prev };
        delete next[elemId];
        return next;
      });
      if (videoRefs.current[elemId]) {
        videoRefs.current[elemId]!.srcObject = null;
      }
    } else {
      // Turn on
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          const facing = requestedFacingMode || selectedElement?.properties?.facingMode || 'user';
          const stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: facing,
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          });

          setActiveCameraStreams((prev) => ({
            ...prev,
            [elemId]: stream,
          }));

          if (videoRefs.current[elemId]) {
            videoRefs.current[elemId]!.srcObject = stream;
            videoRefs.current[elemId]!.play().catch(() => {});
          }
        } else {
          alert('Webcam mediaDevices tidak didukung oleh browser ini.');
        }
      } catch (err: any) {
        console.warn('Camera error for element', elemId, err);
        alert('Gagal mengakses kamera: ' + (err.message || 'Izin kamera ditolak'));
      }
    }
  };

  // SCREEN CAPTURE CONTROL
  const handleToggleScreenCapture = async () => {
    if (screenCaptureStream) {
      screenCaptureStream.getTracks().forEach((t) => t.stop());
      setScreenCaptureStream(null);
      if (screenVideoRef.current) {
        screenVideoRef.current.srcObject = null;
      }
    } else {
      try {
        if (navigator.mediaDevices && (navigator.mediaDevices as any).getDisplayMedia) {
          const stream = await (navigator.mediaDevices as any).getDisplayMedia({
            video: { frameRate: { ideal: 60 } },
            audio: true,
          });
          setScreenCaptureStream(stream);
          if (screenVideoRef.current) {
            screenVideoRef.current.srcObject = stream;
            screenVideoRef.current.play().catch(() => {});
          }
          stream.getVideoTracks()[0].onended = () => {
            setScreenCaptureStream(null);
          };
        } else {
          alert('Screen capture getDisplayMedia tidak didukung di perangkat/browser ini.');
        }
      } catch (err: any) {
        console.warn('Screen capture error:', err);
      }
    }
  };

  // Add Element with strictly mapped auto-triggers and defaults
  const handleAddQuickElement = (type: SourceType, defaultName: string) => {
    // Generate guaranteed unique ID
    const uniqueId = `elem_${type}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Set sensible default dimensions & auto-trigger according to element type
    let defaultWidth = 80;
    let defaultHeight = 12;
    let defaultX = 10;
    let defaultY = 20 + (elements.length % 5) * 8;
    let defaultProps: Record<string, any> = {};
    let defaultTrigger: any = undefined;

    switch (type) {
      case 'camera':
        // Count how many cameras already exist
        const cameraCount = elements.filter((e) => e.type === 'camera').length + 1;
        defaultName = `Kamera ${cameraCount} (${cameraCount === 1 ? 'Depan / Facecam' : 'Belakang / Tablecam'})`;
        defaultWidth = 42;
        defaultHeight = 24;
        defaultProps = {
          facingMode: cameraCount === 1 ? 'user' : 'environment',
          borderColor: '#2563EB',
          borderRadius: 14,
          borderWidth: 2,
          aspectFit: 'cover',
        };
        // Cameras never triggered by gift/chat
        defaultTrigger = undefined;
        break;

      case 'screen_capture':
        defaultName = 'Tangkapan Layar (Game)';
        defaultWidth = 92;
        defaultHeight = 52;
        defaultProps = {
          cropMode: 'fit',
          fps: 60,
          borderRadius: 12,
        };
        defaultTrigger = undefined;
        break;

      case 'event_alert':
        defaultName = 'Alert Notifikasi (Gift & Follow)';
        defaultWidth = 86;
        defaultHeight = 14;
        defaultProps = {
          alertTitle: 'GIFT MAWAR EMAS',
          alertMessage: 'mengirim 500 Koin!',
          animationEffect: 'bounce',
          soundEffect: true,
          badgeColor: '#F59E0B',
        };
        // Auto-triggers on Gift
        defaultTrigger = {
          eventType: 'gift',
          action: 'bounce',
          durationSec: 5,
        };
        break;

      case 'chat_message':
        defaultName = 'Kotak Chat Interaktif';
        defaultWidth = 85;
        defaultHeight = 26;
        defaultProps = {
          maxMessages: 4,
          fontSize: 12,
          showBadges: true,
          bgOpacity: 85,
        };
        // Auto-triggers on New Comment
        defaultTrigger = {
          eventType: 'chat',
          action: 'text_update',
          durationSec: 8,
        };
        break;

      case 'combo_counter':
        defaultName = 'Combo Gift Multiplier';
        defaultWidth = 45;
        defaultHeight = 12;
        defaultProps = {
          comboLabel: 'x50 COMBO MAWAR!',
          themeColor: '#EA580C',
        };
        defaultTrigger = {
          eventType: 'gift',
          action: 'pulse',
          durationSec: 4,
        };
        break;

      case 'counter':
      case 'live_viewer_counter':
        defaultName = 'Penghitung Like & Target';
        defaultWidth = 48;
        defaultHeight = 10;
        defaultProps = {
          targetGoal: 5000,
          label: 'Target Like Hari Ini',
        };
        defaultTrigger = {
          eventType: 'like',
          action: 'pulse',
          durationSec: 2,
        };
        break;

      case 'running_text':
        defaultName = 'Running Text (Ticker)';
        defaultWidth = 100;
        defaultHeight = 6;
        defaultProps = {
          text: '🔥 SYNTXRR STREAM: Selamat datang di siaran langsung! Follow & Tap Layar!',
          speed: 4,
          fontSize: 12,
          textColor: '#60A5FA',
          bgColor: '#0B1120',
        };
        // Continuous ticker, no burst trigger
        defaultTrigger = undefined;
        break;

      case 'song_request':
        defaultName = 'Widget Song Request (Now Playing)';
        defaultWidth = 88;
        defaultHeight = 13;
        defaultProps = {
          cardStyle: 'compact',
          showRequester: true,
          showQueueCount: true,
        };
        defaultTrigger = {
          eventType: 'chat',
          action: 'pulse',
          durationSec: 4,
        };
        break;

      case 'image':
      case 'sticker':
        defaultName = 'Logo / Sponsor Banner';
        defaultWidth = 28;
        defaultHeight = 16;
        defaultProps = {
          imageUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=300&auto=format&fit=crop&q=80',
          borderRadius: 8,
        };
        break;

      case 'video':
        defaultName = 'Video Background Loop';
        defaultWidth = 60;
        defaultHeight = 34;
        defaultProps = {
          loop: true,
          muted: true,
          videoUrl: '',
        };
        break;

      case 'text':
      case 'dynamic_text':
      default:
        defaultName = 'Teks Siaran';
        defaultWidth = 60;
        defaultHeight = 8;
        defaultProps = {
          text: 'STREAM TITLE HERE',
          fontSize: 18,
          textColor: '#FFFFFF',
        };
        break;
    }

    const newElem: StudioElement = {
      id: uniqueId,
      name: defaultName,
      type,
      x: defaultX,
      y: defaultY,
      width: defaultWidth,
      height: defaultHeight,
      layer: elements.length + 1,
      visible: true,
      locked: false,
      opacity: 100,
      rotation: 0,
      properties: defaultProps,
      triggerConfig: defaultTrigger,
    };

    commitElements([...elements, newElem]);
    setSelectedId(newElem.id);
    setActiveSidePanel('properties');
  };

  const handleDuplicate = (id: string) => {
    const target = elements.find((e) => e.id === id);
    if (!target) return;
    const clone: StudioElement = {
      ...target,
      id: `elem_${target.type}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: `${target.name} (Salinan)`,
      x: target.x + 3,
      y: target.y + 3,
      layer: elements.length + 1,
    };
    commitElements([...elements, clone]);
    setSelectedId(clone.id);
  };

  const handleDelete = (id: string) => {
    // If camera, stop stream
    if (activeCameraStreams[id]) {
      activeCameraStreams[id].getTracks().forEach((t) => t.stop());
      setActiveCameraStreams((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }

    const updated = elements.filter((e) => e.id !== id);
    commitElements(updated);
    if (selectedId === id) {
      setSelectedId(updated[0]?.id || null);
    }
  };

  const handleMoveLayer = (id: string, direction: 'up' | 'down') => {
    const index = elements.findIndex((e) => e.id === id);
    if (index === -1) return;
    if (direction === 'up' && index === elements.length - 1) return;
    if (direction === 'down' && index === 0) return;

    const newIndex = direction === 'up' ? index + 1 : index - 1;
    const updated = [...elements];
    const temp = updated[index];
    updated[index] = updated[newIndex];
    updated[newIndex] = temp;

    const reordered = updated.map((e, idx) => ({ ...e, layer: idx + 1 }));
    commitElements(reordered);
  };

  // Canvas Drag & Resize Handlers (Preserves Out-of-Bounds Positions)
  const handleElementMouseDown = (e: React.MouseEvent | React.TouchEvent, elem: StudioElement) => {
    if (elem.locked) return;
    e.stopPropagation();
    setSelectedId(elem.id);

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    dragRef.current = {
      isDragging: true,
      isResizing: false,
      resizeHandle: null,
      elementId: elem.id,
      startX: clientX,
      startY: clientY,
      origX: elem.x,
      origY: elem.y,
      origW: elem.width,
      origH: elem.height,
    };

    window.addEventListener('mousemove', handleElementMouseMove);
    window.addEventListener('mouseup', handleElementMouseUp);
    window.addEventListener('touchmove', handleElementTouchMove, { passive: false });
    window.addEventListener('touchend', handleElementMouseUp);
  };

  const handleResizeMouseDown = (e: React.MouseEvent | React.TouchEvent, elem: StudioElement, handle: string) => {
    if (elem.locked) return;
    e.stopPropagation();
    setSelectedId(elem.id);

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    dragRef.current = {
      isDragging: false,
      isResizing: true,
      resizeHandle: handle,
      elementId: elem.id,
      startX: clientX,
      startY: clientY,
      origX: elem.x,
      origY: elem.y,
      origW: elem.width,
      origH: elem.height,
    };

    window.addEventListener('mousemove', handleElementMouseMove);
    window.addEventListener('mouseup', handleElementMouseUp);
    window.addEventListener('touchmove', handleElementTouchMove, { passive: false });
    window.addEventListener('touchend', handleElementMouseUp);
  };

  const handleElementMouseMove = (e: MouseEvent) => {
    if (!canvasRef.current || !dragRef.current.elementId) return;
    const rect = canvasRef.current.getBoundingClientRect();

    if (dragRef.current.isDragging) {
      const deltaX = ((e.clientX - dragRef.current.startX) / rect.width) * 100;
      const deltaY = ((e.clientY - dragRef.current.startY) / rect.height) * 100;

      const newX = Math.round((dragRef.current.origX + deltaX) * 10) / 10;
      const newY = Math.round((dragRef.current.origY + deltaY) * 10) / 10;

      updateElementField(dragRef.current.elementId, 'x', newX);
      updateElementField(dragRef.current.elementId, 'y', newY);
    } else if (dragRef.current.isResizing) {
      const deltaW = ((e.clientX - dragRef.current.startX) / rect.width) * 100;
      const deltaH = ((e.clientY - dragRef.current.startY) / rect.height) * 100;

      const newW = Math.max(5, Math.round((dragRef.current.origW + deltaW) * 10) / 10);
      const newH = Math.max(3, Math.round((dragRef.current.origH + deltaH) * 10) / 10);

      updateElementField(dragRef.current.elementId, 'width', newW);
      updateElementField(dragRef.current.elementId, 'height', newH);
    }
  };

  const handleElementTouchMove = (e: TouchEvent) => {
    if (!canvasRef.current || !dragRef.current.elementId) return;
    e.preventDefault();
    const touch = e.touches[0];
    const rect = canvasRef.current.getBoundingClientRect();

    if (dragRef.current.isDragging) {
      const deltaX = ((touch.clientX - dragRef.current.startX) / rect.width) * 100;
      const deltaY = ((touch.clientY - dragRef.current.startY) / rect.height) * 100;

      const newX = Math.round((dragRef.current.origX + deltaX) * 10) / 10;
      const newY = Math.round((dragRef.current.origY + deltaY) * 10) / 10;

      updateElementField(dragRef.current.elementId, 'x', newX);
      updateElementField(dragRef.current.elementId, 'y', newY);
    } else if (dragRef.current.isResizing) {
      const deltaW = ((touch.clientX - dragRef.current.startX) / rect.width) * 100;
      const deltaH = ((touch.clientY - dragRef.current.startY) / rect.height) * 100;

      const newW = Math.max(5, Math.round((dragRef.current.origW + deltaW) * 10) / 10);
      const newH = Math.max(3, Math.round((dragRef.current.origH + deltaH) * 10) / 10);

      updateElementField(dragRef.current.elementId, 'width', newW);
      updateElementField(dragRef.current.elementId, 'height', newH);
    }
  };

  const handleElementMouseUp = () => {
    dragRef.current.isDragging = false;
    dragRef.current.isResizing = false;
    dragRef.current.elementId = null;
    window.removeEventListener('mousemove', handleElementMouseMove);
    window.removeEventListener('mouseup', handleElementMouseUp);
    window.removeEventListener('touchmove', handleElementTouchMove);
    window.removeEventListener('touchend', handleElementMouseUp);
  };

  // Quick Event Simulators for Preview & Test
  const triggerSimulation = (type: StreamEventType, user: string, detail: string, amount?: number) => {
    streamEventBus.emit({
      id: `sim_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      type,
      username: user,
      detail,
      amount,
      timestamp: Date.now(),
      isSimulation: true,
    });
  };

  // Render Element on Canvas
  const renderElementContent = (elem: StudioElement) => {
    const isCamera = elem.type === 'camera';
    const isScreen = elem.type === 'screen_capture';
    const isCameraActive = !!activeCameraStreams[elem.id];
    const reaction = activeReactions[elem.id];

    // Reaction animation class
    let animClass = '';
    if (reaction) {
      if (reaction.action === 'bounce') animClass = 'animate-bounce ring-4 ring-amber-400 shadow-2xl';
      else if (reaction.action === 'pulse') animClass = 'animate-pulse ring-4 ring-blue-400 shadow-2xl';
      else if (reaction.action === 'show') animClass = 'animate-fadeIn ring-2 ring-emerald-400';
    }

    switch (elem.type) {
      case 'camera':
        return (
          <div
            className={`w-full h-full rounded-xl bg-slate-950 border border-blue-500/40 relative overflow-hidden flex flex-col items-center justify-center transition-all ${animClass}`}
            style={{
              borderColor: elem.properties.borderColor || '#2563EB',
              borderRadius: `${elem.properties.borderRadius || 14}px`,
              borderWidth: `${elem.properties.borderWidth || 2}px`,
            }}
          >
            {isCameraActive ? (
              <video
                ref={(el) => {
                  videoRefs.current[elem.id] = el;
                  if (el && activeCameraStreams[elem.id] && el.srcObject !== activeCameraStreams[elem.id]) {
                    el.srcObject = activeCameraStreams[elem.id];
                    el.play().catch(() => {});
                  }
                }}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-slate-400 p-2 text-center select-none">
                <Camera className="w-6 h-6 text-blue-400 mb-1" />
                <span className="text-[10px] font-bold text-white truncate max-w-full px-1">{elem.name}</span>
                <span className="text-[9px] text-blue-300/80">
                  {elem.properties.facingMode === 'environment' ? 'Kamera Belakang' : 'Kamera Depan'}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleCameraForElement(elem.id, elem.properties.facingMode);
                  }}
                  className="mt-1 px-2 py-0.5 rounded bg-blue-600/80 hover:bg-blue-600 text-white text-[9px] font-semibold"
                >
                  Aktifkan Feed
                </button>
              </div>
            )}
            <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-red-600/90 text-white text-[8px] font-mono font-bold flex items-center gap-1 shadow">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
              {isCameraActive ? 'LIVE CAM' : 'STANDBY'}
            </div>
          </div>
        );

      case 'screen_capture':
        return (
          <div
            className={`w-full h-full rounded-xl bg-slate-950 border border-slate-700 relative overflow-hidden flex flex-col items-center justify-center ${animClass}`}
            style={{ borderRadius: `${elem.properties.borderRadius || 12}px` }}
          >
            {screenCaptureStream ? (
              <video
                ref={(el) => {
                  screenVideoRef.current = el;
                  if (el && screenCaptureStream && el.srcObject !== screenCaptureStream) {
                    el.srcObject = screenCaptureStream;
                    el.play().catch(() => {});
                  }
                }}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-contain bg-black"
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-slate-400 p-3 text-center select-none">
                <Monitor className="w-8 h-8 text-rose-400 mb-1.5" />
                <span className="text-xs font-bold text-white">Tangkapan Layar Android</span>
                <span className="text-[9px] text-slate-400 mt-0.5">MediaProjection 60 FPS</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleScreenCapture();
                  }}
                  className="mt-2 px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-semibold shadow"
                >
                  Mulai Screen Share
                </button>
              </div>
            )}
          </div>
        );

      case 'event_alert':
        return (
          <div
            className={`w-full h-full rounded-xl bg-gradient-to-r from-amber-950/95 via-amber-900/90 to-amber-950/95 border-2 border-amber-500 p-2.5 flex items-center gap-3 shadow-2xl transition-all ${animClass}`}
          >
            <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center text-slate-950 shrink-0 font-bold shadow-md">
              <Sparkles className="w-5 h-5 text-slate-950 animate-spin" />
            </div>
            <div className="text-left min-w-0 flex-1">
              <div className="text-[9px] uppercase tracking-wider font-extrabold text-amber-300">
                {elem.properties.alertTitle || 'GIFT RECEIVED!'}
              </div>
              <div className="text-xs font-black text-white truncate">
                {reaction?.textOverride || '@RizkyKing mengirim Paus Biru (2.150 Koin)!'}
              </div>
            </div>
          </div>
        );

      case 'chat_message':
        return (
          <div
            className={`w-full h-full p-2.5 space-y-1.5 overflow-hidden text-left bg-[#050811]/90 rounded-xl border border-slate-800 transition-all ${animClass}`}
            style={{ backgroundColor: `rgba(5, 8, 17, ${(elem.properties.bgOpacity || 85) / 100})` }}
          >
            {recentChatList.map((chat) => (
              <div key={chat.id} className="flex items-center gap-1.5 text-[11px] leading-tight">
                {elem.properties.showBadges && chat.badge && (
                  <span className="px-1 py-0.2 rounded bg-amber-500/20 text-amber-400 font-bold text-[8px]">
                    {chat.badge}
                  </span>
                )}
                <span className="font-bold text-blue-400">@{chat.user}:</span>
                <span className="text-slate-200 truncate">{chat.text}</span>
              </div>
            ))}
          </div>
        );

      case 'combo_counter':
        return (
          <div
            className={`w-full h-full rounded-xl bg-gradient-to-r from-orange-600 to-red-600 p-2 flex items-center justify-center gap-2 text-white shadow-xl transition-all ${animClass}`}
          >
            <Flame className="w-5 h-5 text-yellow-300 animate-bounce" />
            <span className="text-xs font-black tracking-wider">
              {elem.properties.comboLabel || 'x25 COMBO LOVE!'}
            </span>
          </div>
        );

      case 'counter':
      case 'live_viewer_counter':
        return (
          <div
            className={`w-full h-full rounded-xl bg-slate-950/90 border border-slate-800 p-2 flex items-center justify-between text-xs px-3 transition-all ${animClass}`}
          >
            <div className="flex items-center gap-2 font-bold text-white">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
              <span className="font-mono text-sm">{simulatedLikes.toLocaleString('id-ID')}</span>
            </div>
            <span className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">
              {elem.properties.label || 'Taps / Likes'}
            </span>
          </div>
        );

      case 'running_text':
        return (
          <div
            className="w-full h-full flex items-center overflow-hidden rounded px-2 border border-slate-800"
            style={{ backgroundColor: elem.properties.bgColor || '#0B1120' }}
          >
            <div
              className="whitespace-nowrap animate-marquee text-[11px] font-bold"
              style={{
                color: elem.properties.textColor || '#60A5FA',
                fontSize: `${elem.properties.fontSize || 12}px`,
                animationDuration: `${Math.max(1, 20 - (elem.properties.speed || 4) * 2)}s`,
              }}
            >
              {elem.properties.text || '🔥 SYNTXRR STREAM: Siaran Langsung TikTok & Multi-Platform'}
            </div>
          </div>
        );

      case 'song_request':
        return (
          <div
            className={`w-full h-full p-2.5 rounded-xl bg-[#0e1626]/95 border border-blue-500/50 flex items-center gap-3 text-left transition-all ${animClass}`}
          >
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shrink-0 text-white animate-pulse shadow">
              <Music className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] text-blue-300 font-bold truncate">
                {srState.currentTrack?.title || 'Tidak ada lagu aktif'}
              </div>
              <div className="text-[8px] text-slate-400 truncate flex items-center gap-1.5">
                {elem.properties.showRequester && (
                  <span>Request: @{srState.currentTrack?.requester || 'Streamer'}</span>
                )}
                {elem.properties.showQueueCount && (
                  <span className="px-1 py-0.2 rounded bg-blue-950 text-blue-400 font-mono">
                    Antrean: {srState.queue.length}
                  </span>
                )}
              </div>
            </div>
          </div>
        );

      case 'text':
      case 'dynamic_text':
        return (
          <div
            className={`w-full h-full flex items-center justify-center text-center font-bold px-2 select-none ${animClass}`}
            style={{
              color: elem.properties.textColor || '#FFFFFF',
              fontSize: `${elem.properties.fontSize || 16}px`,
            }}
          >
            {elem.properties.text || elem.name}
          </div>
        );

      case 'image':
      case 'sticker':
        return elem.properties.imageUrl ? (
          <img
            src={elem.properties.imageUrl}
            alt={elem.name}
            className={`w-full h-full object-contain rounded select-none ${animClass}`}
          />
        ) : (
          <div className="w-full h-full rounded bg-blue-950/40 border border-blue-900/50 flex flex-col items-center justify-center text-blue-400">
            <ImageIcon className="w-5 h-5 mb-1" />
            <span className="text-[9px] font-bold">{elem.name}</span>
          </div>
        );

      case 'video':
        return (
          <div className="w-full h-full rounded-xl bg-slate-900 border border-slate-800 flex flex-col items-center justify-center text-indigo-400">
            <Video className="w-6 h-6 mb-1" />
            <span className="text-[9px] font-bold">Video Background Loop</span>
          </div>
        );

      default:
        return (
          <div className="w-full h-full flex items-center justify-center text-slate-300 text-xs font-semibold">
            {elem.name}
          </div>
        );
    }
  };

  // Canvas aspect ratio classes
  const getCanvasAspectClass = () => {
    if (canvasOrientation === '9:16') return 'aspect-[9/16] w-[270px] sm:w-[320px]';
    if (canvasOrientation === '16:9') return 'aspect-video w-full max-w-[580px]';
    return 'aspect-square w-[320px]';
  };

  return (
    <div className="space-y-6 pb-20 md:pb-8">
      {/* Studio Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-blue-400 uppercase">
            <span>Editor Studio SYNTXRR</span>
            <span className="text-slate-500">·</span>
            <span>Compositor &amp; Auto-Trigger Terpadu</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2 mt-0.5">
            <Tv className="w-6 h-6 text-blue-400" />
            Studio Produksi &amp; Overlay
          </h1>
          <p className="text-xs text-slate-400">
            Tata letak video multi-kamera, pemicu event penonton otomatis, dan simulator siaran real-time
          </p>
        </div>

        {/* Canvas Ratio & Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Orientation Selector */}
          <div className="flex items-center p-1 bg-[#0e1626] rounded-xl border border-slate-800 text-xs font-semibold">
            <button
              onClick={() => onChangeOrientation('9:16')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                canvasOrientation === '9:16'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              9:16 Vertikal
            </button>
            <button
              onClick={() => onChangeOrientation('16:9')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                canvasOrientation === '16:9'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              16:9 Horisontal
            </button>
            <button
              onClick={() => onChangeOrientation('1:1')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                canvasOrientation === '1:1'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              1:1 Kotak
            </button>
          </div>

          <button
            onClick={onSaveAsPreset}
            className="min-h-[38px] px-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-md"
          >
            <Sparkles className="w-4 h-4" /> Simpan Preset
          </button>
        </div>
      </div>

      {/* Main Studio Viewport Split (Canvas on Left, Modular Single Panel on Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* SECTION A: INTERACTIVE CANVAS VIEWPORT */}
        <div className="lg:col-span-7 bg-[#0a0f1d] border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-2xl flex flex-col items-center justify-between space-y-4">
          {/* Viewport Toolbar */}
          <div className="w-full flex items-center justify-between text-xs text-slate-400 px-1 border-b border-slate-800/80 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
              <span className="font-bold text-white font-mono">
                Kanvas {canvasOrientation} ({elements.length} Elemen)
              </span>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={handleUndo}
                disabled={history.length === 0}
                className="p-1.5 rounded-lg bg-[#0e1626] border border-slate-800 text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                title="Undo"
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleRedo}
                disabled={redoStack.length === 0}
                className="p-1.5 rounded-lg bg-[#0e1626] border border-slate-800 text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                title="Redo"
              >
                <Redo2 className="w-3.5 h-3.5" />
              </button>

              <div className="h-4 w-px bg-slate-800 mx-1" />

              <button
                onClick={() => setZoomLevel((z) => Math.max(50, z - 10))}
                className="p-1.5 rounded-lg bg-[#0e1626] border border-slate-800 text-slate-300 hover:text-white"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="font-mono text-[11px] px-1 text-slate-300">{zoomLevel}%</span>
              <button
                onClick={() => setZoomLevel((z) => Math.min(180, z + 10))}
                className="p-1.5 rounded-lg bg-[#0e1626] border border-slate-800 text-slate-300 hover:text-white"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  setZoomLevel(100);
                  setPanOffset({ x: 0, y: 0 });
                }}
                className="p-1.5 rounded-lg bg-[#0e1626] border border-slate-800 text-slate-300 hover:text-white ml-1"
                title="Reset Posisi & Zoom"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Interactive Screen Stage Container */}
          <div
            className="w-full overflow-hidden flex items-center justify-center p-2 sm:p-4 bg-[#050811] rounded-xl border border-slate-900 relative min-h-[380px] sm:min-h-[460px] cursor-grab active:cursor-grabbing select-none"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) {
                setIsPanning(true);
                panStartRef.current = { x: e.clientX - panOffset.x, y: e.clientY - panOffset.y };
              }
            }}
            onMouseMove={(e) => {
              if (isPanning) {
                setPanOffset({
                  x: e.clientX - panStartRef.current.x,
                  y: e.clientY - panStartRef.current.y,
                });
              }
            }}
            onMouseUp={() => setIsPanning(false)}
            onMouseLeave={() => setIsPanning(false)}
          >
            {/* The Actual Canvas (Orientation Scaled) */}
            <div
              ref={canvasRef}
              style={{
                transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel / 100})`,
                transformOrigin: 'center center',
              }}
              className={`relative bg-[#020408] border-2 border-slate-800 rounded-2xl shadow-2xl transition-transform duration-75 overflow-hidden ${getCanvasAspectClass()}`}
              onClick={() => setSelectedId(null)}
            >
              {/* Safe-Zone Guide Margins for TikTok / Live Stream */}
              <div className="absolute inset-x-2 top-2 h-7 border border-dashed border-blue-500/30 rounded flex items-center justify-center pointer-events-none">
                <span className="text-[8px] font-mono text-blue-400/50">SAFE ZONE HEADER (STATUS BAR)</span>
              </div>
              <div className="absolute inset-x-2 bottom-2 h-10 border border-dashed border-red-500/30 rounded flex items-center justify-center pointer-events-none">
                <span className="text-[8px] font-mono text-red-400/50">SAFE ZONE FOOTER (CHAT / GIFTS AREA)</span>
              </div>

              {/* Elements Layer Rendering */}
              {elements.map((elem, idx) => {
                if (!elem.visible) return null;
                const isSelected = selectedId === elem.id;

                return (
                  <div
                    key={`${elem.id}_${idx}`}
                    onMouseDown={(e) => handleElementMouseDown(e, elem)}
                    onTouchStart={(e) => handleElementMouseDown(e, elem)}
                    style={{
                      position: 'absolute',
                      left: `${elem.x}%`,
                      top: `${elem.y}%`,
                      width: `${elem.width}%`,
                      height: `${elem.height}%`,
                      zIndex: elem.layer,
                      opacity: elem.opacity / 100,
                      transform: `rotate(${elem.rotation}deg)`,
                    }}
                    className={`group cursor-move transition-shadow ${
                      isSelected
                        ? 'ring-2 ring-blue-500 ring-offset-1 ring-offset-slate-950'
                        : 'hover:ring-1 hover:ring-blue-400/50'
                    }`}
                  >
                    {/* Render Content */}
                    {renderElementContent(elem)}

                    {/* Resize Handle on Selected Element */}
                    {isSelected && !elem.locked && (
                      <div
                        onMouseDown={(e) => handleResizeMouseDown(e, elem, 'bottom-right')}
                        onTouchStart={(e) => handleResizeMouseDown(e, elem, 'bottom-right')}
                        className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 bg-blue-500 border-2 border-white rounded-full cursor-se-resize shadow-md"
                      />
                    )}

                    {/* Selected Badge */}
                    {isSelected && (
                      <div className="absolute -top-4 left-0 px-1.5 py-0.2 bg-blue-600 text-white font-mono text-[8px] rounded uppercase font-bold tracking-wider pointer-events-none">
                        {elem.name}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick Helper Legend */}
          <div className="w-full flex items-center justify-between text-[11px] text-slate-400 px-2">
            <span>💡 Klik &amp; drag elemen untuk reposisi (termasuk keluar batas layar).</span>
            <span className="font-mono text-blue-400">1080p Target</span>
          </div>
        </div>

        {/* RIGHT COLUMN: 4-SECTION MODULAR STUDIO SUITE */}
        <div className="lg:col-span-5 bg-[#0a0f1d] border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-2xl space-y-4">
          {/* Main Module Tabs (Properties, Elements, Layers, Simulator) */}
          <div className="grid grid-cols-4 gap-1 p-1 bg-[#080c16] rounded-xl border border-slate-800 text-xs font-semibold">
            <button
              onClick={() => setActiveSidePanel('properties')}
              className={`py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
                activeSidePanel === 'properties'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Properti</span>
            </button>
            <button
              onClick={() => setActiveSidePanel('elements')}
              className={`py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
                activeSidePanel === 'elements'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Elemen</span>
            </button>
            <button
              onClick={() => setActiveSidePanel('layers')}
              className={`py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
                activeSidePanel === 'layers'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Lapisan</span>
            </button>
            <button
              onClick={() => setActiveSidePanel('simulator')}
              className={`py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
                activeSidePanel === 'simulator'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>Uji Live</span>
            </button>
          </div>

          {/* SECTION B: CONTEXTUAL PROPERTIES PANEL */}
          {activeSidePanel === 'properties' && (
            <div className="space-y-4">
              {selectedElement ? (
                <>
                  {/* Element Header & Quick Actions */}
                  <div className="p-3 bg-[#080c16] rounded-xl border border-slate-800 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-white flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-blue-500" />
                        {selectedElement.name}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                        Tipe: {selectedElement.type} · Layer #{selectedElement.layer}
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => updateElementField(selectedElement.id, 'visible', !selectedElement.visible)}
                        className={`p-1.5 rounded-lg border text-xs ${
                          selectedElement.visible
                            ? 'bg-slate-800 border-slate-700 text-slate-300'
                            : 'bg-red-950/40 border-red-800 text-red-400'
                        }`}
                        title={selectedElement.visible ? 'Sembunyikan' : 'Tampilkan'}
                      >
                        {selectedElement.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => updateElementField(selectedElement.id, 'locked', !selectedElement.locked)}
                        className={`p-1.5 rounded-lg border text-xs ${
                          selectedElement.locked
                            ? 'bg-amber-950/40 border-amber-800 text-amber-400'
                            : 'bg-slate-800 border-slate-700 text-slate-300'
                        }`}
                        title={selectedElement.locked ? 'Buka Kunci' : 'Kunci Posisi'}
                      >
                        {selectedElement.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => handleDuplicate(selectedElement.id)}
                        className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-white"
                        title="Duplikasi Elemen"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(selectedElement.id)}
                        className="p-1.5 rounded-lg bg-rose-950/50 border border-rose-900 text-rose-400 hover:bg-rose-900"
                        title="Hapus Elemen"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Contextual Form Body strictly tailored to Selected Type */}
                  <div className="space-y-4 max-h-[440px] overflow-y-auto pr-1">
                    {/* 1. CAMERA CONTEXTUAL INSPECTOR */}
                    {selectedElement.type === 'camera' && (
                      <div className="p-3.5 rounded-xl bg-[#080c16] border border-blue-900/40 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-blue-400 flex items-center gap-1.5">
                            <Camera className="w-4 h-4" /> Sumber Kamera Siaran
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">Multi-Camera Ready</span>
                        </div>

                        <div>
                          <label className="text-[11px] font-bold text-slate-300">Pilihan Lensa / Arah Kamera</label>
                          <select
                            value={selectedElement.properties.facingMode || 'user'}
                            onChange={(e) => {
                              const facing = e.target.value as 'user' | 'environment';
                              updateElementProperty(selectedElement.id, 'facingMode', facing);
                              // If stream is active, reload with new facing mode
                              if (activeCameraStreams[selectedElement.id]) {
                                handleToggleCameraForElement(selectedElement.id, facing);
                              }
                            }}
                            className="w-full mt-1 px-3 py-2 bg-[#0e1626] border border-slate-800 rounded-lg text-xs text-white"
                          >
                            <option value="user">Kamera Depan (Facecam / Selfie)</option>
                            <option value="environment">Kamera Belakang (Handcam / Meja)</option>
                          </select>
                        </div>

                        <div className="flex items-center justify-between pt-2">
                          <span className="text-xs text-slate-300">Uji Live Feed Kamera:</span>
                          <button
                            onClick={() => handleToggleCameraForElement(selectedElement.id, selectedElement.properties.facingMode)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                              activeCameraStreams[selectedElement.id]
                                ? 'bg-red-600 text-white'
                                : 'bg-blue-600 text-white hover:bg-blue-500'
                            }`}
                          >
                            <Camera className="w-3.5 h-3.5" />
                            {activeCameraStreams[selectedElement.id] ? 'Matikan Kamera' : 'Aktifkan Kamera'}
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-3 pt-2">
                          <div>
                            <label className="text-[11px] font-bold text-slate-300">Warna Border</label>
                            <input
                              type="color"
                              value={selectedElement.properties.borderColor || '#2563EB'}
                              onChange={(e) => updateElementProperty(selectedElement.id, 'borderColor', e.target.value)}
                              className="w-full h-8 mt-1 rounded bg-[#0e1626] border border-slate-800 cursor-pointer"
                            />
                          </div>
                          <div>
                            <label className="text-[11px] font-bold text-slate-300">Radius Sudut (px)</label>
                            <input
                              type="number"
                              value={selectedElement.properties.borderRadius || 14}
                              onChange={(e) => updateElementProperty(selectedElement.id, 'borderRadius', parseInt(e.target.value) || 0)}
                              className="w-full mt-1 px-3 py-1.5 bg-[#0e1626] border border-slate-800 rounded-lg text-xs text-white"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 2. SCREEN CAPTURE INSPECTOR */}
                    {selectedElement.type === 'screen_capture' && (
                      <div className="p-3.5 rounded-xl bg-[#080c16] border border-rose-900/40 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-rose-400 flex items-center gap-1.5">
                            <Monitor className="w-4 h-4" /> Tangkapan Layar HP (Game Capture)
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 leading-relaxed">
                          Menangkap feed game Android atau tampilan layar dengan MediaProjection 60 FPS.
                        </p>
                        <button
                          onClick={handleToggleScreenCapture}
                          className={`w-full py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors ${
                            screenCaptureStream ? 'bg-red-600 text-white' : 'bg-rose-600 text-white hover:bg-rose-500'
                          }`}
                        >
                          <Monitor className="w-4 h-4" />
                          {screenCaptureStream ? 'Hentikan Screen Share' : 'Mulai Screen Share (getDisplayMedia)'}
                        </button>
                      </div>
                    )}

                    {/* 3. EVENT ALERT INSPECTOR (AUTO TRIGGERED BY GIFT/FOLLOW) */}
                    {selectedElement.type === 'event_alert' && (
                      <div className="p-3.5 rounded-xl bg-[#080c16] border border-amber-900/40 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                            <Bell className="w-4 h-4" /> Auto-Trigger: Alert Notifikasi
                          </span>
                          <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold text-[9px]">
                            Auto-Mapped
                          </span>
                        </div>

                        <div>
                          <label className="text-[11px] font-bold text-slate-300">Pemicu Event</label>
                          <select
                            value={selectedElement.triggerConfig?.eventType || 'gift'}
                            onChange={(e) => updateElementTrigger(selectedElement.id, { eventType: e.target.value })}
                            className="w-full mt-1 px-3 py-2 bg-[#0e1626] border border-slate-800 rounded-lg text-xs text-white"
                          >
                            <option value="gift">Gift / Hadiah Penonton (Default)</option>
                            <option value="follow">Follower Baru</option>
                            <option value="donation">Donasi Saweria</option>
                            <option value="all">Semua Event Live</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-[11px] font-bold text-slate-300">Judul Banner Default</label>
                          <input
                            type="text"
                            value={selectedElement.properties.alertTitle || 'GIFT RECEIVED!'}
                            onChange={(e) => updateElementProperty(selectedElement.id, 'alertTitle', e.target.value)}
                            className="w-full mt-1 px-3 py-2 bg-[#0e1626] border border-slate-800 rounded-lg text-xs text-white"
                          />
                        </div>

                        <div>
                          <div className="flex items-center justify-between text-[11px] font-bold text-slate-300">
                            <span>Durasi Muncul (Detik)</span>
                            <span className="font-mono text-amber-400">
                              {selectedElement.triggerConfig?.durationSec || 5}s
                            </span>
                          </div>
                          <input
                            type="range"
                            min="2"
                            max="20"
                            value={selectedElement.triggerConfig?.durationSec || 5}
                            onChange={(e) => updateElementTrigger(selectedElement.id, { durationSec: parseInt(e.target.value) })}
                            className="w-full mt-1 accent-amber-500"
                          />
                        </div>
                      </div>
                    )}

                    {/* 4. CHAT MESSAGE INSPECTOR (AUTO TRIGGERED BY COMMENTS) */}
                    {selectedElement.type === 'chat_message' && (
                      <div className="p-3.5 rounded-xl bg-[#080c16] border border-sky-900/40 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-sky-400 flex items-center gap-1.5">
                            <MessageSquare className="w-4 h-4" /> Auto-Trigger: Live Chatbox
                          </span>
                          <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 font-bold text-[9px]">
                            Live Feed
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-[11px] font-bold text-slate-300">Maks. Pesan Ditampilkan</label>
                            <input
                              type="number"
                              min="2"
                              max="10"
                              value={selectedElement.properties.maxMessages || 4}
                              onChange={(e) => updateElementProperty(selectedElement.id, 'maxMessages', parseInt(e.target.value) || 4)}
                              className="w-full mt-1 px-3 py-2 bg-[#0e1626] border border-slate-800 rounded-lg text-xs text-white"
                            />
                          </div>
                          <div>
                            <label className="text-[11px] font-bold text-slate-300">Opasitas Latar (%)</label>
                            <input
                              type="number"
                              min="10"
                              max="100"
                              value={selectedElement.properties.bgOpacity || 85}
                              onChange={(e) => updateElementProperty(selectedElement.id, 'bgOpacity', parseInt(e.target.value) || 85)}
                              className="w-full mt-1 px-3 py-2 bg-[#0e1626] border border-slate-800 rounded-lg text-xs text-white"
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-1">
                          <span className="text-xs text-slate-300">Tampilkan Lencana VIP / Sub</span>
                          <button
                            onClick={() => updateElementProperty(selectedElement.id, 'showBadges', !selectedElement.properties.showBadges)}
                            className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                              selectedElement.properties.showBadges !== false
                                ? 'bg-sky-600 text-white'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {selectedElement.properties.showBadges !== false ? 'Aktif' : 'Nonaktif'}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* 5. SONG REQUEST WIDGET INSPECTOR (AUTO-LINKED TO BACKGROUND ENGINE) */}
                    {selectedElement.type === 'song_request' && (
                      <div className="p-3.5 rounded-xl bg-[#080c16] border border-purple-900/40 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-purple-400 flex items-center gap-1.5">
                            <ListMusic className="w-4 h-4" /> Song Request Live Display
                          </span>
                          <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-bold text-[9px]">
                            Auto-Engine
                          </span>
                        </div>

                        <p className="text-[11px] text-slate-400">
                          Widget ini secara otomatis menampilkan judul lagu yang sedang diputar di latar belakang via sistem Song Request interaktif.
                        </p>

                        <div className="p-2.5 rounded-lg bg-[#0e1626] border border-slate-800 flex items-center justify-between text-xs">
                          <div className="min-w-0 pr-2">
                            <div className="font-bold text-white truncate">{srState.currentTrack?.title}</div>
                            <div className="text-[10px] text-purple-300">Req: {srState.currentTrack?.requester}</div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => songRequestEngine.togglePlayPause()}
                              className="p-1.5 rounded-lg bg-purple-600 text-white"
                              title={srState.isPlaying ? 'Jeda' : 'Putar'}
                            >
                              {srState.isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              onClick={() => songRequestEngine.skipTrack()}
                              className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
                              title="Skip Lagu"
                            >
                              <FastForward className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-1">
                          <span className="text-xs text-slate-300">Tampilkan Nama Pengirim Request</span>
                          <button
                            onClick={() => updateElementProperty(selectedElement.id, 'showRequester', !selectedElement.properties.showRequester)}
                            className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                              selectedElement.properties.showRequester !== false ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {selectedElement.properties.showRequester !== false ? 'Aktif' : 'Nonaktif'}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* 6. RUNNING TEXT / TICKER INSPECTOR */}
                    {selectedElement.type === 'running_text' && (
                      <div className="p-3.5 rounded-xl bg-[#080c16] border border-slate-800 space-y-3">
                        <span className="text-xs font-bold text-sky-400 flex items-center gap-1.5">
                          <Type className="w-4 h-4" /> Konten Teks Berjalan (Marquee)
                        </span>
                        <div>
                          <label className="text-[11px] font-bold text-slate-300">Teks Siaran</label>
                          <textarea
                            rows={2}
                            value={selectedElement.properties.text || ''}
                            onChange={(e) => updateElementProperty(selectedElement.id, 'text', e.target.value)}
                            className="w-full mt-1 px-3 py-2 bg-[#0e1626] border border-slate-800 rounded-lg text-xs text-white"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-[11px] font-bold text-slate-300">Kecepatan (1-10)</label>
                            <input
                              type="number"
                              min="1"
                              max="10"
                              value={selectedElement.properties.speed || 4}
                              onChange={(e) => updateElementProperty(selectedElement.id, 'speed', parseInt(e.target.value) || 4)}
                              className="w-full mt-1 px-3 py-1.5 bg-[#0e1626] border border-slate-800 rounded-lg text-xs text-white"
                            />
                          </div>
                          <div>
                            <label className="text-[11px] font-bold text-slate-300">Warna Teks</label>
                            <input
                              type="color"
                              value={selectedElement.properties.textColor || '#60A5FA'}
                              onChange={(e) => updateElementProperty(selectedElement.id, 'textColor', e.target.value)}
                              className="w-full h-8 mt-1 rounded bg-[#0e1626] border border-slate-800 cursor-pointer"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 7. LIKE / GOAL COUNTER INSPECTOR */}
                    {(selectedElement.type === 'counter' || selectedElement.type === 'combo_counter' || selectedElement.type === 'live_viewer_counter') && (
                      <div className="p-3.5 rounded-xl bg-[#080c16] border border-emerald-900/40 space-y-3">
                        <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                          <TrendingUp className="w-4 h-4" /> Auto-Trigger: Penghitung Interaksi
                        </span>
                        <div>
                          <label className="text-[11px] font-bold text-slate-300">Label Target</label>
                          <input
                            type="text"
                            value={selectedElement.properties.label || selectedElement.name}
                            onChange={(e) => updateElementProperty(selectedElement.id, 'label', e.target.value)}
                            className="w-full mt-1 px-3 py-2 bg-[#0e1626] border border-slate-800 rounded-lg text-xs text-white"
                          />
                        </div>
                      </div>
                    )}

                    {/* 8. IMAGE / LOGO / VIDEO INSPECTOR */}
                    {(selectedElement.type === 'image' || selectedElement.type === 'sticker') && (
                      <div className="p-3.5 rounded-xl bg-[#080c16] border border-slate-800 space-y-3">
                        <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                          <ImageIcon className="w-4 h-4" /> Sumber Gambar / Watermark
                        </span>
                        <div>
                          <label className="text-[11px] font-bold text-slate-300">URL Gambar (PNG/JPG)</label>
                          <input
                            type="url"
                            value={selectedElement.properties.imageUrl || ''}
                            onChange={(e) => updateElementProperty(selectedElement.id, 'imageUrl', e.target.value)}
                            className="w-full mt-1 px-3 py-2 bg-[#0e1626] border border-slate-800 rounded-lg text-xs text-white"
                          />
                        </div>
                      </div>
                    )}

                    {/* COMMON GEOMETRY & TRANSFORM CONTROLS (TIDY ACCORDION) */}
                    <div className="p-3.5 rounded-xl bg-[#080c16] border border-slate-800 space-y-3">
                      <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                        <span>Geometri &amp; Tata Letak Layar</span>
                        <span className="text-[10px] text-slate-500 font-mono">Bisa di luar kanvas</span>
                      </div>

                      {/* Position & Size */}
                      <div className="grid grid-cols-4 gap-2 text-xs">
                        <div>
                          <span className="text-[10px] text-slate-400">X (%)</span>
                          <input
                            type="number"
                            value={selectedElement.x}
                            onChange={(e) => updateElementField(selectedElement.id, 'x', parseFloat(e.target.value) || 0)}
                            className="w-full mt-0.5 px-2 py-1 bg-[#0e1626] border border-slate-800 rounded text-center font-mono text-white text-xs"
                          />
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400">Y (%)</span>
                          <input
                            type="number"
                            value={selectedElement.y}
                            onChange={(e) => updateElementField(selectedElement.id, 'y', parseFloat(e.target.value) || 0)}
                            className="w-full mt-0.5 px-2 py-1 bg-[#0e1626] border border-slate-800 rounded text-center font-mono text-white text-xs"
                          />
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400">W (%)</span>
                          <input
                            type="number"
                            value={selectedElement.width}
                            min="2"
                            max="100"
                            onChange={(e) => updateElementField(selectedElement.id, 'width', parseFloat(e.target.value) || 10)}
                            className="w-full mt-0.5 px-2 py-1 bg-[#0e1626] border border-slate-800 rounded text-center font-mono text-white text-xs"
                          />
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400">H (%)</span>
                          <input
                            type="number"
                            value={selectedElement.height}
                            min="2"
                            max="100"
                            onChange={(e) => updateElementField(selectedElement.id, 'height', parseFloat(e.target.value) || 5)}
                            className="w-full mt-0.5 px-2 py-1 bg-[#0e1626] border border-slate-800 rounded text-center font-mono text-white text-xs"
                          />
                        </div>
                      </div>

                      {/* Opacity & Rotation */}
                      <div className="grid grid-cols-2 gap-3 pt-1">
                        <div>
                          <div className="flex items-center justify-between text-[10px] text-slate-300">
                            <span>Opasitas</span>
                            <span className="font-mono text-blue-400">{selectedElement.opacity}%</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={selectedElement.opacity}
                            onChange={(e) => updateElementField(selectedElement.id, 'opacity', parseInt(e.target.value))}
                            className="w-full mt-1 accent-blue-500"
                          />
                        </div>
                        <div>
                          <div className="flex items-center justify-between text-[10px] text-slate-300">
                            <span>Rotasi</span>
                            <span className="font-mono text-blue-400">{selectedElement.rotation}°</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="360"
                            value={selectedElement.rotation}
                            onChange={(e) => updateElementField(selectedElement.id, 'rotation', parseInt(e.target.value))}
                            className="w-full mt-1 accent-blue-500"
                          />
                        </div>
                      </div>

                      {/* Layer order buttons */}
                      <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                        <span className="text-[11px] text-slate-400">Urutan Lapisan (Layer #{selectedElement.layer})</span>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleMoveLayer(selectedElement.id, 'up')}
                            className="px-2.5 py-1 rounded bg-[#0e1626] border border-slate-700 text-xs text-slate-300 hover:text-white"
                          >
                            Ke Atas
                          </button>
                          <button
                            onClick={() => handleMoveLayer(selectedElement.id, 'down')}
                            className="px-2.5 py-1 rounded bg-[#0e1626] border border-slate-700 text-xs text-slate-300 hover:text-white"
                          >
                            Ke Bawah
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="p-8 text-center bg-[#080c16] rounded-xl border border-slate-800/80 space-y-2">
                  <Sliders className="w-8 h-8 text-slate-600 mx-auto mb-1" />
                  <p className="text-xs font-semibold text-slate-300">Tidak ada elemen yang dipilih</p>
                  <p className="text-[11px] text-slate-500">
                    Klik salah satu elemen di canvas atau buka tab &quot;Elemen&quot; untuk menambahkan elemen baru.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* SECTION C: ELEMENTS DRAWER / SELECTOR */}
          {activeSidePanel === 'elements' && (
            <div className="space-y-4 max-h-[460px] overflow-y-auto pr-1">
              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Tv className="w-3.5 h-3.5 text-blue-400" />
                  Sumber Tangkapan Video (Multi-Source)
                </h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    onClick={() => handleAddQuickElement('camera', 'Kamera Siaran')}
                    className="p-3 rounded-xl bg-[#080c16] border border-slate-800 hover:border-blue-500 text-left flex flex-col gap-1 transition-all group"
                  >
                    <div className="flex items-center justify-between">
                      <Camera className="w-4 h-4 text-blue-400 group-hover:scale-110 transition-transform" />
                      <span className="px-1.5 py-0.2 bg-blue-500/20 text-blue-300 text-[8px] font-bold rounded">
                        Multi-Cam
                      </span>
                    </div>
                    <span className="font-bold text-white mt-1">Kamera / Facecam</span>
                    <span className="text-[10px] text-slate-400">Kamera depan/belakang smartphone</span>
                  </button>

                  <button
                    onClick={() => handleAddQuickElement('screen_capture', 'Tangkapan Layar (Game)')}
                    className="p-3 rounded-xl bg-[#080c16] border border-slate-800 hover:border-rose-500 text-left flex flex-col gap-1 transition-all group"
                  >
                    <div className="flex items-center justify-between">
                      <Monitor className="w-4 h-4 text-rose-400 group-hover:scale-110 transition-transform" />
                      <span className="px-1.5 py-0.2 bg-rose-500/20 text-rose-300 text-[8px] font-bold rounded">
                        60 FPS
                      </span>
                    </div>
                    <span className="font-bold text-white mt-1">Tangkapan Layar</span>
                    <span className="text-[10px] text-slate-400">MediaProjection screen share</span>
                  </button>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  Elemen Interaksi &amp; Auto-Trigger
                </h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    onClick={() => handleAddQuickElement('event_alert', 'Alert Gift & Follow')}
                    className="p-3 rounded-xl bg-[#080c16] border border-slate-800 hover:border-amber-500 text-left flex flex-col gap-1 transition-all group"
                  >
                    <div className="flex items-center justify-between">
                      <Bell className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
                      <span className="px-1.5 py-0.2 bg-amber-500/20 text-amber-300 text-[8px] font-bold rounded">
                        Auto Gift
                      </span>
                    </div>
                    <span className="font-bold text-white mt-1">Alert Pop-up</span>
                    <span className="text-[10px] text-slate-400">Animasi gift mawar/paus &amp; follow</span>
                  </button>

                  <button
                    onClick={() => handleAddQuickElement('chat_message', 'Live Chatbox')}
                    className="p-3 rounded-xl bg-[#080c16] border border-slate-800 hover:border-sky-500 text-left flex flex-col gap-1 transition-all group"
                  >
                    <div className="flex items-center justify-between">
                      <MessageSquare className="w-4 h-4 text-sky-400 group-hover:scale-110 transition-transform" />
                      <span className="px-1.5 py-0.2 bg-sky-500/20 text-sky-300 text-[8px] font-bold rounded">
                        Auto Chat
                      </span>
                    </div>
                    <span className="font-bold text-white mt-1">Kotak Chat Live</span>
                    <span className="text-[10px] text-slate-400">Komentar penonton dengan badge</span>
                  </button>

                  <button
                    onClick={() => handleAddQuickElement('combo_counter', 'Combo Gift Counter')}
                    className="p-3 rounded-xl bg-[#080c16] border border-slate-800 hover:border-orange-500 text-left flex flex-col gap-1 transition-all group"
                  >
                    <div className="flex items-center justify-between">
                      <Flame className="w-4 h-4 text-orange-400 group-hover:scale-110 transition-transform" />
                      <span className="px-1.5 py-0.2 bg-orange-500/20 text-orange-300 text-[8px] font-bold rounded">
                        Multiplier
                      </span>
                    </div>
                    <span className="font-bold text-white mt-1">Combo Counter</span>
                    <span className="text-[10px] text-slate-400">Multiplier gift berturut-turut</span>
                  </button>

                  <button
                    onClick={() => handleAddQuickElement('counter', 'Penghitung Like')}
                    className="p-3 rounded-xl bg-[#080c16] border border-slate-800 hover:border-emerald-500 text-left flex flex-col gap-1 transition-all group"
                  >
                    <div className="flex items-center justify-between">
                      <TrendingUp className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
                      <span className="px-1.5 py-0.2 bg-emerald-500/20 text-emerald-300 text-[8px] font-bold rounded">
                        Auto Like
                      </span>
                    </div>
                    <span className="font-bold text-white mt-1">Goal / Tap Counter</span>
                    <span className="text-[10px] text-slate-400">Hitungan like &amp; target interaksi</span>
                  </button>

                  <button
                    onClick={() => handleAddQuickElement('song_request', 'Now Playing Song')}
                    className="p-3 rounded-xl bg-[#080c16] border border-slate-800 hover:border-purple-500 text-left flex flex-col gap-1 transition-all group"
                  >
                    <div className="flex items-center justify-between">
                      <ListMusic className="w-4 h-4 text-purple-400 group-hover:scale-110 transition-transform" />
                      <span className="px-1.5 py-0.2 bg-purple-500/20 text-purple-300 text-[8px] font-bold rounded">
                        Auto BGM
                      </span>
                    </div>
                    <span className="font-bold text-white mt-1">Song Request Widget</span>
                    <span className="text-[10px] text-slate-400">Judul lagu chat !play real-time</span>
                  </button>

                  <button
                    onClick={() => handleAddQuickElement('running_text', 'Running Text (Ticker)')}
                    className="p-3 rounded-xl bg-[#080c16] border border-slate-800 hover:border-blue-500 text-left flex flex-col gap-1 transition-all group"
                  >
                    <div className="flex items-center justify-between">
                      <Type className="w-4 h-4 text-blue-400 group-hover:scale-110 transition-transform" />
                      <span className="px-1.5 py-0.2 bg-blue-500/20 text-blue-300 text-[8px] font-bold rounded">
                        Marquee
                      </span>
                    </div>
                    <span className="font-bold text-white mt-1">Teks Berjalan</span>
                    <span className="text-[10px] text-slate-400">Pengumuman &amp; link Saweria</span>
                  </button>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />
                  Grafis Statis &amp; Teks
                </h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    onClick={() => handleAddQuickElement('image', 'Logo Siaran')}
                    className="p-2.5 rounded-xl bg-[#080c16] border border-slate-800 hover:border-emerald-500 text-left flex items-center gap-2"
                  >
                    <ImageIcon className="w-4 h-4 text-emerald-400 shrink-0" />
                    <div>
                      <span className="font-semibold text-white block">Gambar / Logo</span>
                      <span className="text-[9px] text-slate-400">PNG transparan / sponsor</span>
                    </div>
                  </button>

                  <button
                    onClick={() => handleAddQuickElement('text', 'Teks Statis')}
                    className="p-2.5 rounded-xl bg-[#080c16] border border-slate-800 hover:border-blue-500 text-left flex items-center gap-2"
                  >
                    <Type className="w-4 h-4 text-blue-400 shrink-0" />
                    <div>
                      <span className="font-semibold text-white block">Teks Bebas</span>
                      <span className="text-[9px] text-slate-400">Judul &amp; keterangan siaran</span>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* SECTION D: LAYERS LIST */}
          {activeSidePanel === 'layers' && (
            <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
              <div className="flex items-center justify-between text-xs text-slate-400 pb-1">
                <span>Daftar Lapisan Kanvas</span>
                <span className="font-mono text-blue-400">{elements.length} item</span>
              </div>

              {elements.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 bg-[#080c16] rounded-xl border border-slate-800">
                  Tidak ada elemen pada canvas.
                </div>
              ) : (
                elements.map((elem, idx) => {
                  const isSelected = selectedId === elem.id;

                  return (
                    <div
                      key={`${elem.id}_${idx}`}
                      onClick={() => {
                        setSelectedId(elem.id);
                        setActiveSidePanel('properties');
                      }}
                      className={`p-3 rounded-xl border flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-blue-950/60 border-blue-500 shadow-sm'
                          : 'bg-[#080c16] border-slate-800 hover:bg-[#0e1626]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                            isSelected ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {elem.type === 'camera' ? (
                            <Camera className="w-3.5 h-3.5" />
                          ) : elem.type === 'event_alert' ? (
                            <Bell className="w-3.5 h-3.5" />
                          ) : (
                            <Tv className="w-3.5 h-3.5" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white truncate">{elem.name}</div>
                          <div className="text-[10px] text-slate-400">
                            Layer #{elem.layer} · {elem.type}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            updateElementField(elem.id, 'visible', !elem.visible);
                          }}
                          className={`p-1.5 rounded-lg text-slate-400 hover:text-white ${
                            !elem.visible ? 'text-slate-600' : ''
                          }`}
                        >
                          {elem.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            updateElementField(elem.id, 'locked', !elem.locked);
                          }}
                          className={`p-1.5 rounded-lg text-slate-400 hover:text-white ${
                            elem.locked ? 'text-amber-400' : ''
                          }`}
                        >
                          {elem.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* SECTION E: PREVIEW & EVENT SIMULATOR PANEL */}
          {activeSidePanel === 'simulator' && (
            <div className="space-y-4 max-h-[460px] overflow-y-auto pr-1">
              <div className="p-3 rounded-xl bg-blue-950/40 border border-blue-900/60 text-xs text-blue-200 flex items-start gap-2.5">
                <Zap className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <p>
                  Uji respon elemen canvas langsung dengan menekan tombol simulasi di bawah. Event akan disalurkan melalui{' '}
                  <span className="font-mono text-white">streamEventBus</span> dan memicu reaksi visual elemen terkait secara real-time.
                </p>
              </div>

              {/* Event Simulator Grid */}
              <div className="space-y-2">
                <button
                  onClick={() => triggerSimulation('gift', 'RizkyKing', 'mengirim Paus Biru (2.150 Koin)!', 2150)}
                  className="w-full p-3 rounded-xl bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white text-xs font-bold flex items-center justify-between shadow-lg transition-all"
                >
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-yellow-200 animate-spin" />
                    <span>Simulasi Gift (Paus Biru - 2.150 Koin)</span>
                  </div>
                  <span className="text-[10px] bg-black/30 px-2 py-0.5 rounded">Pemicu Alert</span>
                </button>

                <button
                  onClick={() => triggerSimulation('gift', 'Dewi_Cantik', 'mengirim 50x Mawar!', 50)}
                  className="w-full p-3 rounded-xl bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white text-xs font-bold flex items-center justify-between shadow-lg transition-all"
                >
                  <div className="flex items-center gap-2">
                    <Flame className="w-4 h-4 text-yellow-300 animate-bounce" />
                    <span>Simulasi Combo Gift (50x Mawar)</span>
                  </div>
                  <span className="text-[10px] bg-black/30 px-2 py-0.5 rounded">Pemicu Combo</span>
                </button>

                <button
                  onClick={() => triggerSimulation('follow', 'Fajar_Streamer', 'mulai mengikuti siaran!')}
                  className="w-full p-3 rounded-xl bg-[#080c16] border border-blue-800 hover:border-blue-500 text-white text-xs font-bold flex items-center justify-between shadow transition-all"
                >
                  <div className="flex items-center gap-2">
                    <Bell className="w-4 h-4 text-blue-400" />
                    <span>Simulasi Follower Baru (@Fajar_Streamer)</span>
                  </div>
                  <span className="text-[10px] bg-blue-950 px-2 py-0.5 rounded text-blue-300">Follow Event</span>
                </button>

                <button
                  onClick={() => triggerSimulation('like', 'Viewer_Tap', 'mengetuk layar', 10)}
                  className="w-full p-3 rounded-xl bg-[#080c16] border border-emerald-800 hover:border-emerald-500 text-white text-xs font-bold flex items-center justify-between shadow transition-all"
                >
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                    <span>Simulasi Tap Layar / Like (+10 Likes)</span>
                  </div>
                  <span className="text-[10px] bg-emerald-950 px-2 py-0.5 rounded text-emerald-300">Like Event</span>
                </button>

                <button
                  onClick={() => triggerSimulation('chat', 'Budi_Gamer', 'Keren bang, setting overlaynya rapi banget! 🔥')}
                  className="w-full p-3 rounded-xl bg-[#080c16] border border-sky-800 hover:border-sky-500 text-white text-xs font-bold flex items-center justify-between shadow transition-all"
                >
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-sky-400" />
                    <span>Simulasi Komentar Live Chat</span>
                  </div>
                  <span className="text-[10px] bg-sky-950 px-2 py-0.5 rounded text-sky-300">Chat Event</span>
                </button>

                <button
                  onClick={() => {
                    const songs = ['Lofi Midnight Drive', 'Cyberpunk Sakura', 'Neon Rain Beat', 'Tokyo Cafe Chill'];
                    const randomSong = songs[Math.floor(Math.random() * songs.length)];
                    triggerSimulation('chat', 'Rian_Viewer', `!play ${randomSong}`);
                  }}
                  className="w-full p-3 rounded-xl bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-600 hover:to-indigo-600 text-white text-xs font-bold flex items-center justify-between shadow-lg transition-all"
                >
                  <div className="flex items-center gap-2">
                    <Music className="w-4 h-4 text-purple-200" />
                    <span>Simulasi Chat Song Request (!play &lt;lagu&gt;)</span>
                  </div>
                  <span className="text-[10px] bg-black/30 px-2 py-0.5 rounded">Command !play</span>
                </button>
              </div>

              {/* Status Log Box */}
              <div className="p-3 rounded-xl bg-[#080c16] border border-slate-800 text-[11px] space-y-1">
                <div className="font-bold text-slate-300 flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-400" /> Status Event-to-Element Engine:
                </div>
                <div className="text-slate-400 pl-5">
                  Reaksi aktif di canvas: <span className="font-mono text-blue-400 font-bold">{Object.keys(activeReactions).length}</span> elemen sedang bereaksi.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
