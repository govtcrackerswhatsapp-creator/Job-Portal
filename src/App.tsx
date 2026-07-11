import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Compass, Sparkles, Feather, Heart, LogIn, LogOut, Loader2 } from 'lucide-react';
import Clock from './components/Clock';
import Pomodoro from './components/Pomodoro';
import TodoList from './components/TodoList';
import MoodLogger from './components/MoodLogger';
import { AppProvider, useApp } from './context/AppContext';

const QUOTES = [
  { text: "Simplicity is the ultimate sophistication.", author: "Leonardo da Vinci" },
  { text: "Focus is a matter of deciding what things you're not going to do.", author: "John Carmack" },
  { text: "Be present in all things and thankful for all things.", author: "Maya Angelou" },
  { text: "Quiet minds go on at their own private, peaceful pace.", author: "R.L. Stevenson" },
  { text: "The best way to predict the future is to create it.", author: "Peter Drucker" },
  { text: "Adopt the pace of nature: her secret is patience.", author: "Ralph Waldo Emerson" },
  { text: "Clutter is not just physical. It is also old ideas and toxic habits.", author: "Eleanor Brownn" }
];

function AppContent() {
  const [quote, setQuote] = useState({ text: '', author: '' });
  const { 
    user, 
    authLoading, 
    singularFocus, 
    updateSingularFocus, 
    loginWithGoogle, 
    logout 
  } = useApp();

  const [tempFocus, setTempFocus] = useState(singularFocus);

  // Sync local temp state when singularFocus updates from Firestore
  useEffect(() => {
    setTempFocus(singularFocus);
  }, [singularFocus]);

  useEffect(() => {
    const day = new Date().getDate();
    const index = day % QUOTES.length;
    setQuote(QUOTES[index]);
  }, []);

  const handleFocusBlur = async () => {
    await updateSingularFocus(tempFocus);
  };

  const handleFocusKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    }
  };

  return (
    <div className="min-h-screen bg-stone-100/80 text-stone-800 flex flex-col font-sans selection:bg-stone-200">
      
      {/* Top Header */}
      <header className="border-b border-stone-200/60 bg-white/40 backdrop-blur-md px-6 py-4 sticky top-0 z-10" id="main-header">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Compass className="w-5 h-5 text-stone-600 animate-spin-slow" />
            <h1 className="font-display font-extrabold text-stone-900 tracking-tight text-base sm:text-lg">
              Minimalist Focus Dashboard
            </h1>
          </div>
          
          {/* Authentic Google Authentication Header Controls */}
          <div className="flex items-center gap-4">
            {authLoading ? (
              <div className="flex items-center gap-1.5 text-stone-400 font-mono text-xs">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>syncing...</span>
              </div>
            ) : user ? (
              <div className="flex items-center gap-3 bg-stone-200/40 border border-stone-200 rounded-full pl-2 pr-4 py-1.5 shadow-sm">
                {user.photoURL ? (
                  <img 
                    src={user.photoURL} 
                    alt={user.displayName || 'User'} 
                    referrerPolicy="no-referrer"
                    className="w-6 h-6 rounded-full border border-stone-300"
                  />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-stone-300 flex items-center justify-center text-xs font-mono font-bold text-stone-700">
                    {user.displayName?.charAt(0).toUpperCase() || 'U'}
                  </div>
                )}
                <span className="text-xs font-semibold text-stone-700 truncate max-w-[120px] hidden sm:inline">
                  {user.displayName}
                </span>
                <button
                  onClick={logout}
                  className="text-stone-500 hover:text-stone-900 transition p-1 rounded-full hover:bg-stone-200/80"
                  title="Sign Out"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={loginWithGoogle}
                className="flex items-center gap-2 px-4 py-2 bg-stone-800 hover:bg-stone-900 text-white rounded-full text-xs font-medium transition shadow-sm cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Google Sign In</span>
              </button>
            )}

            <div className="flex items-center gap-1 text-stone-400 font-mono text-[11px] tracking-wider uppercase hidden md:flex border-l border-stone-200/80 pl-4 h-5">
              <Sparkles className="w-3.5 h-3.5 text-stone-400 animate-pulse" />
              <span>Presence Mode</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-grow px-4 py-8 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto space-y-6">
          
          {/* Welcome Announcement Bar & Quote */}
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-stone-50 border border-stone-200 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm"
            id="quote-banner"
          >
            <div className="space-y-1 md:max-w-2xl">
              <span className="text-[10px] font-mono tracking-wider text-stone-400 uppercase flex items-center gap-1">
                <Feather className="w-3 h-3" /> Daily Contemplation
              </span>
              <p className="font-display font-medium text-stone-700 italic text-sm sm:text-base leading-relaxed">
                "{quote.text}"
              </p>
              <p className="text-xs font-mono text-stone-400">— {quote.author}</p>
            </div>

            {/* Custom Singular Focus Input Widget */}
            <div className="bg-white/60 border border-stone-200 p-3 rounded-xl flex-1 md:max-w-xs space-y-1.5 shadow-sm">
              <label className="text-[10px] font-mono tracking-wider text-stone-400 uppercase block">
                Today's One Singular Focus
              </label>
              <input
                type="text"
                value={tempFocus}
                onChange={(e) => setTempFocus(e.target.value)}
                onBlur={handleFocusBlur}
                onKeyDown={handleFocusKeyDown}
                placeholder="What is your most vital objective?"
                maxLength={40}
                className="w-full bg-transparent border-b border-stone-200 focus:border-stone-500 font-sans text-sm text-stone-800 placeholder-stone-400 py-0.5 outline-none transition"
              />
            </div>
          </motion.div>

          {/* Interactive Bento Dashboard Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Left Side: Clock + Pomodoro */}
            <motion.div 
              initial={{ opacity: 0, x: -15 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="space-y-6 flex flex-col"
            >
              <div className="flex-1">
                <Clock />
              </div>
              <div className="flex-1">
                <Pomodoro />
              </div>
            </motion.div>

            {/* Right Side: Agenda + Habits */}
            <motion.div 
              initial={{ opacity: 0, x: 15 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="space-y-6 flex flex-col"
            >
              <div className="flex-1">
                <TodoList />
              </div>
              <div className="flex-1">
                <MoodLogger />
              </div>
            </motion.div>

          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-stone-200/60 py-6 px-4 bg-stone-50/40 text-center" id="main-footer">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono text-stone-400">
          <span>
            &copy; {new Date().getFullYear()} Minimalist Dashboard. {user ? 'Data secured & synced with Cloud Firestore.' : 'Guest Mode: All data persisted locally.'}
          </span>
          <span className="flex items-center gap-1 justify-center">
            Made with <Heart className="w-3 h-3 text-rose-400 fill-current" /> for productive, mindful spaces.
          </span>
        </div>
      </footer>

    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
