export interface Task {
  id: string;
  text: string;
  completed: boolean;
  createdAt: number;
}

export interface MoodEntry {
  day: string; // "Mon", "Tue", etc.
  level: 'none' | 'low' | 'medium' | 'high';
  note: string;
}

export type TimerMode = 'work' | 'shortBreak' | 'longBreak';
