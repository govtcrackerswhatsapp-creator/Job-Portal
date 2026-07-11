import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  auth, 
  signInWithPopup, 
  signOut, 
  googleProvider, 
  onAuthStateChanged, 
  User,
  fetchFirestoreTasks,
  saveFirestoreTask,
  deleteFirestoreTask,
  fetchFirestoreFocusLogs,
  saveFirestoreFocusLog,
  getUserProfile,
  saveUserProfile,
  uploadLocalTasksBatch,
  uploadLocalFocusLogsBatch
} from '../lib/firebase';
import { Task, MoodEntry } from '../types';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface AppContextType {
  user: User | null;
  authLoading: boolean;
  userName: string;
  singularFocus: string;
  tasks: Task[];
  moods: MoodEntry[];
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  updateUserName: (name: string) => Promise<void>;
  updateSingularFocus: (focus: string) => Promise<void>;
  addTask: (text: string) => Promise<void>;
  toggleTask: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  clearCompletedTasks: () => Promise<void>;
  cycleMood: (index: number) => Promise<void>;
  updateMoodNote: (index: number, text: string) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  
  // App States (Local default or fetched from FireStore)
  const [userName, setUserName] = useState(() => localStorage.getItem('dashboard_username') || 'Friend');
  const [singularFocus, setSingularFocus] = useState(() => localStorage.getItem('dashboard_singular_focus') || '');
  const [tasks, setTasks] = useState<Task[]>(() => {
    const savedTasks = localStorage.getItem('dashboard_tasks');
    return savedTasks ? JSON.parse(savedTasks) : [
      { id: '1', text: 'Define the singular main goal for today', completed: false, createdAt: Date.now() },
      { id: '2', text: 'Engage in a deep work focus session', completed: false, createdAt: Date.now() + 1 },
      { id: '3', text: 'Take a brief, screen-free coffee break', completed: true, createdAt: Date.now() + 2 },
    ];
  });
  const [moods, setMoods] = useState<MoodEntry[]>(() => {
    const savedMoods = localStorage.getItem('dashboard_moods_v2');
    return savedMoods ? JSON.parse(savedMoods) : DAYS.map((day) => ({ day, level: 'none', note: '' }));
  });

  // 1. Listen to Auth Changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      
      if (currentUser) {
        // Logged In: Fetch from Firestore
        try {
          // A. Fetch profile
          const profile = await getUserProfile(currentUser.uid);
          if (profile) {
            setUserName(profile.displayName);
            if (profile.singularFocus) {
              setSingularFocus(profile.singularFocus);
            }
          } else {
            // First time login - save initial user profile
            const initialName = currentUser.displayName || 'Friend';
            setUserName(initialName);
            await saveUserProfile(currentUser.uid, {
              displayName: initialName,
              email: currentUser.email || '',
              photoURL: currentUser.photoURL || '',
              singularFocus: singularFocus,
              updatedAt: Date.now()
            });
          }

          // B. Get offline local tasks/logs for potential sync migration
          const localTasksJson = localStorage.getItem('dashboard_tasks');
          const localTasks: Task[] = localTasksJson ? JSON.parse(localTasksJson) : [];
          
          const localMoodsJson = localStorage.getItem('dashboard_moods_v2');
          const localMoods: MoodEntry[] = localMoodsJson ? JSON.parse(localMoodsJson) : [];

          // C. Fetch Firestore tasks
          const cloudTasks = await fetchFirestoreTasks(currentUser.uid);
          if (cloudTasks.length === 0 && localTasks.length > 0) {
            // No tasks in cloud, sync local to cloud
            await uploadLocalTasksBatch(currentUser.uid, localTasks);
            setTasks(localTasks);
          } else {
            // Set tasks from cloud
            setTasks(cloudTasks.map(t => ({ id: t.id, text: t.text, completed: t.completed, createdAt: t.createdAt })));
          }

          // D. Fetch Firestore logs
          const cloudLogs = await fetchFirestoreFocusLogs(currentUser.uid);
          if (cloudLogs.length === 0 && localMoods.length > 0 && localMoods.some(m => m.level !== 'none' || m.note)) {
            // Sync local focus logs to cloud
            await uploadLocalFocusLogsBatch(currentUser.uid, localMoods);
            setMoods(localMoods);
          } else if (cloudLogs.length > 0) {
            // Map day logs
            const mappedMoods = DAYS.map(day => {
              const match = cloudLogs.find(l => l.day === day);
              return {
                day,
                level: match?.level || 'none',
                note: match?.note || ''
              } as MoodEntry;
            });
            setMoods(mappedMoods);
          } else {
            // Initialize default empty structure
            setMoods(DAYS.map(day => ({ day, level: 'none', note: '' })));
          }

        } catch (err) {
          console.error('Error synchronizing database:', err);
        }
      } else {
        // Guest mode / Logged out: fallback to localstorage
        const savedTasks = localStorage.getItem('dashboard_tasks');
        setTasks(savedTasks ? JSON.parse(savedTasks) : [
          { id: '1', text: 'Define the singular main goal for today', completed: false, createdAt: Date.now() },
          { id: '2', text: 'Engage in a deep work focus session', completed: false, createdAt: Date.now() + 1 },
          { id: '3', text: 'Take a brief, screen-free coffee break', completed: true, createdAt: Date.now() + 2 },
        ]);

        const savedMoods = localStorage.getItem('dashboard_moods_v2');
        setMoods(savedMoods ? JSON.parse(savedMoods) : DAYS.map((day) => ({ day, level: 'none', note: '' })));

        setUserName(localStorage.getItem('dashboard_username') || 'Friend');
        setSingularFocus(localStorage.getItem('dashboard_singular_focus') || '');
      }

      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  // Sync to LocalStorage for Guest Mode
  useEffect(() => {
    if (!user && !authLoading) {
      localStorage.setItem('dashboard_tasks', JSON.stringify(tasks));
    }
  }, [tasks, user, authLoading]);

  useEffect(() => {
    if (!user && !authLoading) {
      localStorage.setItem('dashboard_moods_v2', JSON.stringify(moods));
    }
  }, [moods, user, authLoading]);

  // Operations
  const loginWithGoogle = async () => {
    try {
      setAuthLoading(true);
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error('Google Sign In Error:', err);
      setAuthLoading(false);
    }
  };

  const logout = async () => {
    try {
      setAuthLoading(true);
      await signOut(auth);
    } catch (err) {
      console.error('Sign Out Error:', err);
      setAuthLoading(false);
    }
  };

  const updateUserName = async (name: string) => {
    const finalName = name.trim() || 'Friend';
    setUserName(finalName);
    localStorage.setItem('dashboard_username', finalName);

    if (user) {
      await saveUserProfile(user.uid, { displayName: finalName });
    }
  };

  const updateSingularFocus = async (focus: string) => {
    setSingularFocus(focus);
    localStorage.setItem('dashboard_singular_focus', focus);

    if (user) {
      await saveUserProfile(user.uid, { singularFocus: focus });
    }
  };

  const addTask = async (text: string) => {
    const newTask: Task = {
      id: crypto.randomUUID(),
      text,
      completed: false,
      createdAt: Date.now()
    };

    setTasks(prev => [newTask, ...prev]);

    if (user) {
      await saveFirestoreTask(user.uid, newTask);
    }
  };

  const toggleTask = async (id: string) => {
    let updatedTask: Task | undefined;
    
    setTasks(prev => prev.map(task => {
      if (task.id === id) {
        updatedTask = { ...task, completed: !task.completed };
        return updatedTask;
      }
      return task;
    }));

    if (user && updatedTask) {
      await saveFirestoreTask(user.uid, updatedTask);
    }
  };

  const deleteTask = async (id: string) => {
    setTasks(prev => prev.filter(task => task.id !== id));

    if (user) {
      await deleteFirestoreTask(user.uid, id);
    }
  };

  const clearCompletedTasks = async () => {
    const completedIds = tasks.filter(t => t.completed).map(t => t.id);
    setTasks(prev => prev.filter(task => !task.completed));

    if (user) {
      for (const id of completedIds) {
        await deleteFirestoreTask(user.uid, id);
      }
    }
  };

  const cycleMood = async (index: number) => {
    let updatedLog: MoodEntry | undefined;

    setMoods(prev => prev.map((entry, idx) => {
      if (idx === index) {
        let nextLevel: MoodEntry['level'] = 'none';
        if (entry.level === 'none') nextLevel = 'low';
        else if (entry.level === 'low') nextLevel = 'medium';
        else if (entry.level === 'medium') nextLevel = 'high';
        
        updatedLog = { ...entry, level: nextLevel };
        return updatedLog;
      }
      return entry;
    }));

    if (user && updatedLog) {
      await saveFirestoreFocusLog(user.uid, {
        day: updatedLog.day,
        level: updatedLog.level,
        note: updatedLog.note,
        updatedAt: Date.now()
      });
    }
  };

  const updateMoodNote = async (index: number, text: string) => {
    let updatedLog: MoodEntry | undefined;

    setMoods(prev => prev.map((entry, idx) => {
      if (idx === index) {
        updatedLog = { ...entry, note: text };
        return updatedLog;
      }
      return entry;
    }));

    if (user && updatedLog) {
      await saveFirestoreFocusLog(user.uid, {
        day: updatedLog.day,
        level: updatedLog.level,
        note: updatedLog.note,
        updatedAt: Date.now()
      });
    }
  };

  return (
    <AppContext.Provider value={{
      user,
      authLoading,
      userName,
      singularFocus,
      tasks,
      moods,
      loginWithGoogle,
      logout,
      updateUserName,
      updateSingularFocus,
      addTask,
      toggleTask,
      deleteTask,
      clearCompletedTasks,
      cycleMood,
      updateMoodNote
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
