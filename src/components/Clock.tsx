import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Sun, Moon, Sunset, User } from 'lucide-react';
import { useApp } from '../context/AppContext';

export default function Clock() {
  const [time, setTime] = useState(new Date());
  const { userName, updateUserName } = useApp();
  const [isEditing, setIsEditing] = useState(false);
  const [tempName, setTempName] = useState(userName);

  // Keep tempName in sync when userName changes via auth login
  useEffect(() => {
    setTempName(userName);
  }, [userName]);

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateUserName(tempName);
    setIsEditing(false);
  };

  const hours = time.getHours();
  let greeting = 'Good morning';
  let GreetingIcon = Sun;
  let iconColor = 'text-amber-500';

  if (hours >= 12 && hours < 17) {
    greeting = 'Good afternoon';
    GreetingIcon = Sun;
    iconColor = 'text-amber-600';
  } else if (hours >= 17 && hours < 22) {
    greeting = 'Good evening';
    GreetingIcon = Sunset;
    iconColor = 'text-rose-500';
  } else {
    greeting = 'Good night';
    GreetingIcon = Moon;
    iconColor = 'text-indigo-400';
  }

  // Formatting values
  const formattedTime = time.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  const formattedDate = time.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="bg-stone-50 border border-stone-200 rounded-2xl p-6 sm:p-8 flex flex-col justify-between h-full min-h-[220px]" id="clock-card">
      <div className="flex justify-between items-start">
        <div className="space-y-1">
          <p className="text-stone-400 text-xs font-mono tracking-wider uppercase">Current Space-Time</p>
          <div className="flex items-center gap-2">
            <GreetingIcon className={`${iconColor} w-4 h-4`} />
            <span className="text-stone-500 font-sans text-sm font-medium">{greeting},</span>
          </div>
          
          {isEditing ? (
            <form onSubmit={handleSaveName} className="flex items-center gap-2 mt-1">
              <input
                type="text"
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                autoFocus
                maxLength={20}
                className="bg-transparent border-b border-stone-400 font-display text-2xl font-semibold text-stone-800 outline-none w-36 py-0 px-1 focus:border-stone-800"
              />
              <button
                type="submit"
                className="text-stone-500 hover:text-stone-800 text-xs font-mono bg-stone-200/60 px-2 py-0.5 rounded transition"
              >
                save
              </button>
            </form>
          ) : (
            <div className="flex items-center gap-2 mt-1 group">
              <h2 className="font-display text-2xl font-bold text-stone-800 tracking-tight">
                {userName}
              </h2>
              <button
                onClick={() => {
                  setTempName(userName);
                  setIsEditing(true);
                }}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-stone-400 hover:text-stone-600 p-1"
                title="Edit name"
              >
                <User className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
        
        <span className="text-stone-400 font-mono text-[10px] bg-stone-200/40 px-2.5 py-1 rounded-full border border-stone-200">
          STABLE
        </span>
      </div>

      <div className="mt-6">
        <h1 className="font-display text-4xl sm:text-5xl font-extrabold tracking-tight text-stone-900 font-mono">
          {formattedTime}
        </h1>
        <p className="text-stone-500 text-xs mt-1.5 font-sans font-medium">
          {formattedDate}
        </p>
      </div>
    </div>
  );
}
