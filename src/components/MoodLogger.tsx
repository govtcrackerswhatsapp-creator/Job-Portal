import React, { useState } from 'react';
import { Sparkles, MessageSquare } from 'lucide-react';
import { MoodEntry } from '../types';
import { useApp } from '../context/AppContext';

export default function MoodLogger() {
  const { moods, cycleMood, updateMoodNote } = useApp();
  const [activeDayIndex, setActiveDayIndex] = useState(0);

  const handleCycleMood = async (index: number) => {
    await cycleMood(index);
    setActiveDayIndex(index);
  };

  const handleNoteChange = async (text: string) => {
    await updateMoodNote(activeDayIndex, text);
  };

  const getMoodStyles = (level: MoodEntry['level']) => {
    switch (level) {
      case 'low':
        return 'bg-amber-100 border-amber-300 hover:border-amber-400 text-amber-700';
      case 'medium':
        return 'bg-amber-500 border-amber-600 hover:border-amber-700 text-white';
      case 'high':
        return 'bg-stone-800 border-stone-900 hover:bg-stone-900 text-stone-100';
      default:
        return 'bg-transparent border-stone-200 hover:border-stone-400 text-stone-400';
    }
  };

  const activeEntry = moods[activeDayIndex] || { day: 'Today', level: 'none', note: '' };

  return (
    <div className="bg-stone-50 border border-stone-200 rounded-2xl p-6 flex flex-col justify-between h-full min-h-[290px]" id="mood-card">
      <div className="space-y-4">
        {/* Header */}
        <div className="space-y-1">
          <p className="text-stone-400 text-xs font-mono tracking-wider uppercase">Energy & Focus Tracker</p>
          <div className="flex items-center gap-1.5 text-stone-700">
            <Sparkles className="w-4 h-4 text-stone-500" />
            <h3 className="font-display font-bold text-lg tracking-tight">Focus Cadence</h3>
          </div>
        </div>

        {/* 7-Day Cycle Layout */}
        <div className="flex justify-between items-center gap-1.5 py-1">
          {moods.map((entry, idx) => (
            <div key={entry.day} className="flex flex-col items-center gap-1.5 flex-1">
              <span className="text-[10px] font-mono font-medium text-stone-400">{entry.day}</span>
              <button
                onClick={() => handleCycleMood(idx)}
                className={`w-9 h-9 rounded-full border flex items-center justify-center transition-all cursor-pointer font-sans text-[11px] font-medium select-none ${getMoodStyles(
                  entry.level
                )} ${activeDayIndex === idx ? 'ring-2 ring-stone-400 ring-offset-2' : ''}`}
                title="Click to cycle focus level"
              >
                {entry.level === 'none' ? '○' : entry.level === 'low' ? 'Low' : entry.level === 'medium' ? 'Med' : 'High'}
              </button>
            </div>
          ))}
        </div>

        {/* Reflection Note for selected day */}
        <div className="space-y-2 mt-2 bg-stone-200/25 border border-stone-200/60 p-3.5 rounded-xl">
          <div className="flex items-center gap-2 text-stone-600 text-xs font-mono">
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Reflections for {activeEntry.day}:</span>
          </div>
          <input
            type="text"
            value={activeEntry.note}
            onChange={(e) => handleNoteChange(e.target.value)}
            placeholder="How did you focus today? Write a brief reflection..."
            className="w-full bg-transparent border-none text-xs text-stone-700 outline-none placeholder-stone-400 p-0"
            maxLength={60}
          />
        </div>
      </div>

      <div className="flex justify-between items-center mt-4 text-[10px] text-stone-400 font-mono">
        <span>Click day to log, then select to write note.</span>
      </div>
    </div>
  );
}
