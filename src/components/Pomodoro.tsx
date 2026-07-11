import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Pause, RotateCcw, Coffee, Brain, ChevronUp, ChevronDown } from 'lucide-react';
import { TimerMode } from '../types';

export default function Pomodoro() {
  const [mode, setMode] = useState<TimerMode>('work');
  const [workTime, setWorkTime] = useState(25);
  const [shortBreak, setShortBreak] = useState(5);
  const [longBreak, setLongBreak] = useState(15);
  
  const [secondsLeft, setSecondsLeft] = useState(workTime * 60);
  const [isActive, setIsActive] = useState(false);
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Sync timer length when mode or setting changes
  useEffect(() => {
    if (!isActive) {
      if (mode === 'work') setSecondsLeft(workTime * 60);
      else if (mode === 'shortBreak') setSecondsLeft(shortBreak * 60);
      else if (mode === 'longBreak') setSecondsLeft(longBreak * 60);
    }
  }, [mode, workTime, shortBreak, longBreak]);

  // Audio Tone Generator (using native Web Audio API)
  const playAlertTone = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      
      // Warm chime first note
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      gain1.gain.setValueAtTime(0, ctx.currentTime);
      gain1.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.05);
      gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start();
      osc1.stop(ctx.currentTime + 0.4);

      // Warm chime second note shortly after
      setTimeout(() => {
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(659.25, ctx.currentTime); // E5
        gain2.gain.setValueAtTime(0, ctx.currentTime);
        gain2.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.05);
        gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start();
        osc2.stop(ctx.currentTime + 0.4);
      }, 150);

    } catch (e) {
      console.warn('Audio Context block or unsupported:', e);
    }
  };

  useEffect(() => {
    if (isActive) {
      timerRef.current = setInterval(() => {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            setIsActive(false);
            if (timerRef.current) clearInterval(timerRef.current);
            playAlertTone();
            // Automatically switch modes
            if (mode === 'work') {
              setMode('shortBreak');
            } else {
              setMode('work');
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive, mode]);

  const toggleTimer = () => {
    setIsActive(!isActive);
  };

  const resetTimer = () => {
    setIsActive(false);
    if (mode === 'work') setSecondsLeft(workTime * 60);
    else if (mode === 'shortBreak') setSecondsLeft(shortBreak * 60);
    else if (mode === 'longBreak') setSecondsLeft(longBreak * 60);
  };

  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Calculate current mode's initial minutes for percentage progress
  const getCurrentModeDuration = () => {
    if (mode === 'work') return workTime * 60;
    if (mode === 'shortBreak') return shortBreak * 60;
    return longBreak * 60;
  };

  const totalDuration = getCurrentModeDuration();
  const progressPercent = totalDuration > 0 ? ((totalDuration - secondsLeft) / totalDuration) * 100 : 0;

  const adjustMinutes = (type: 'work' | 'short' | 'long', amount: number) => {
    if (isActive) return; // Prevent adjusting while active
    if (type === 'work') {
      setWorkTime((prev) => Math.max(1, Math.min(60, prev + amount)));
    } else if (type === 'short') {
      setShortBreak((prev) => Math.max(1, Math.min(30, prev + amount)));
    } else if (type === 'long') {
      setLongBreak((prev) => Math.max(1, Math.min(45, prev + amount)));
    }
  };

  return (
    <div className="bg-stone-50 border border-stone-200 rounded-2xl p-6 flex flex-col justify-between h-full min-h-[360px]" id="pomodoro-card">
      <div className="space-y-1">
        <p className="text-stone-400 text-xs font-mono tracking-wider uppercase">Focus Engine</p>
        
        {/* Mode Selector Tabs */}
        <div className="grid grid-cols-3 gap-1 bg-stone-200/50 p-1 rounded-xl text-xs mt-3">
          <button
            onClick={() => { setIsActive(false); setMode('work'); }}
            className={`py-1.5 rounded-lg flex items-center justify-center gap-1 font-medium transition ${
              mode === 'work' ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            <Brain className="w-3.5 h-3.5" />
            <span>Focus</span>
          </button>
          <button
            onClick={() => { setIsActive(false); setMode('shortBreak'); }}
            className={`py-1.5 rounded-lg flex items-center justify-center gap-1 font-medium transition ${
              mode === 'shortBreak' ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            <Coffee className="w-3.5 h-3.5" />
            <span>Short</span>
          </button>
          <button
            onClick={() => { setIsActive(false); setMode('longBreak'); }}
            className={`py-1.5 rounded-lg flex items-center justify-center gap-1 font-medium transition ${
              mode === 'longBreak' ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            <Coffee className="w-3.5 h-3.5" />
            <span>Long</span>
          </button>
        </div>
      </div>

      {/* Large Digital Countdown & Progress Bar */}
      <div className="my-6 text-center space-y-4">
        <div className="relative inline-flex items-center justify-center">
          <span className="font-mono text-5xl sm:text-6xl font-bold tracking-tight text-stone-800 tabular-nums">
            {formatTime(secondsLeft)}
          </span>
        </div>

        {/* Dynamic Progress Line */}
        <div className="w-full bg-stone-200 h-1 rounded-full overflow-hidden">
          <motion.div
            className="bg-stone-800 h-full rounded-full"
            initial={{ width: '0%' }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ ease: 'linear', duration: 0.2 }}
          />
        </div>
      </div>

      {/* Control Buttons */}
      <div className="flex items-center justify-center gap-4">
        <button
          onClick={resetTimer}
          className="p-3 rounded-full bg-stone-200/50 hover:bg-stone-200 text-stone-600 hover:text-stone-800 transition"
          title="Reset timer"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
        
        <button
          onClick={toggleTimer}
          className={`flex items-center gap-2 px-6 py-3 rounded-full font-medium transition shadow-sm ${
            isActive 
              ? 'bg-rose-100 hover:bg-rose-200 text-rose-700' 
              : 'bg-stone-800 hover:bg-stone-900 text-white'
          }`}
        >
          {isActive ? (
            <>
              <Pause className="w-4 h-4 fill-current" />
              <span>Pause</span>
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-current" />
              <span>Start</span>
            </>
          )}
        </button>
      </div>

      {/* Subtle Adjustment Section */}
      <div className="border-t border-stone-200/60 pt-4 mt-4">
        <div className="flex justify-between text-[11px] text-stone-400 font-mono tracking-wider uppercase">
          <span>Settings</span>
          <span>(Min)</span>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
          <div className="flex flex-col items-center justify-between p-1.5 bg-stone-200/25 rounded-xl">
            <span className="text-stone-500 font-medium font-sans">Focus</span>
            <div className="flex items-center gap-1 mt-1">
              <button 
                onClick={() => adjustMinutes('work', -1)} 
                disabled={isActive}
                className="p-1 hover:bg-stone-200 rounded disabled:opacity-30"
              >
                <ChevronDown className="w-3 h-3 text-stone-600" />
              </button>
              <span className="font-mono font-semibold text-stone-700 w-5 text-center">{workTime}</span>
              <button 
                onClick={() => adjustMinutes('work', 1)} 
                disabled={isActive}
                className="p-1 hover:bg-stone-200 rounded disabled:opacity-30"
              >
                <ChevronUp className="w-3 h-3 text-stone-600" />
              </button>
            </div>
          </div>

          <div className="flex flex-col items-center justify-between p-1.5 bg-stone-200/25 rounded-xl">
            <span className="text-stone-500 font-medium font-sans">Short</span>
            <div className="flex items-center gap-1 mt-1">
              <button 
                onClick={() => adjustMinutes('short', -1)} 
                disabled={isActive}
                className="p-1 hover:bg-stone-200 rounded disabled:opacity-30"
              >
                <ChevronDown className="w-3 h-3 text-stone-600" />
              </button>
              <span className="font-mono font-semibold text-stone-700 w-5 text-center">{shortBreak}</span>
              <button 
                onClick={() => adjustMinutes('short', 1)} 
                disabled={isActive}
                className="p-1 hover:bg-stone-200 rounded disabled:opacity-30"
              >
                <ChevronUp className="w-3 h-3 text-stone-600" />
              </button>
            </div>
          </div>

          <div className="flex flex-col items-center justify-between p-1.5 bg-stone-200/25 rounded-xl">
            <span className="text-stone-500 font-medium font-sans">Long</span>
            <div className="flex items-center gap-1 mt-1">
              <button 
                onClick={() => adjustMinutes('long', -1)} 
                disabled={isActive}
                className="p-1 hover:bg-stone-200 rounded disabled:opacity-30"
              >
                <ChevronDown className="w-3 h-3 text-stone-600" />
              </button>
              <span className="font-mono font-semibold text-stone-700 w-5 text-center">{longBreak}</span>
              <button 
                onClick={() => adjustMinutes('long', 1)} 
                disabled={isActive}
                className="p-1 hover:bg-stone-200 rounded disabled:opacity-30"
              >
                <ChevronUp className="w-3 h-3 text-stone-600" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
