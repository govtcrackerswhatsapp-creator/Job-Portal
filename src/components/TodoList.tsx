import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Check, Trash2, ListTodo } from 'lucide-react';
import { useApp } from '../context/AppContext';

export default function TodoList() {
  const { tasks, addTask, toggleTask, deleteTask, clearCompletedTasks } = useApp();
  const [input, setInput] = useState('');

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;

    await addTask(trimmed);
    setInput('');
  };

  const completedCount = tasks.filter((t) => t.completed).length;

  return (
    <div className="bg-stone-50 border border-stone-200 rounded-2xl p-6 flex flex-col justify-between h-full min-h-[420px]" id="todo-card">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div className="space-y-1">
            <p className="text-stone-400 text-xs font-mono tracking-wider uppercase">Active Objectives</p>
            <div className="flex items-center gap-1.5 text-stone-700">
              <ListTodo className="w-4 h-4 text-stone-500" />
              <h3 className="font-display font-bold text-lg tracking-tight">Today's Agenda</h3>
            </div>
          </div>
          <span className="font-mono text-xs text-stone-500 bg-stone-200/50 px-2 py-1 rounded">
            {completedCount}/{tasks.length}
          </span>
        </div>

        {/* Add Input Form */}
        <form onSubmit={handleAddTask} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Add new objective..."
            maxLength={100}
            className="flex-1 bg-stone-200/40 hover:bg-stone-200/60 focus:bg-white focus:ring-1 focus:ring-stone-400 border border-stone-200 rounded-xl px-4 py-2.5 text-sm font-sans text-stone-800 placeholder-stone-400 outline-none transition"
          />
          <button
            type="submit"
            className="bg-stone-800 hover:bg-stone-900 text-white rounded-xl p-3 flex items-center justify-center transition shadow-sm"
          >
            <Plus className="w-4 h-4" />
          </button>
        </form>

        {/* Task List container */}
        <div className="max-h-[220px] overflow-y-auto pr-1 space-y-2 mt-2 scrollbar-thin">
          <AnimatePresence initial={false}>
            {tasks.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="py-12 text-center text-stone-400 text-sm italic"
              >
                Your workspace is perfectly clear.
              </motion.div>
            ) : (
              tasks.map((task) => (
                <motion.div
                  key={task.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  className="flex items-center justify-between p-3 bg-white border border-stone-200/80 rounded-xl hover:border-stone-300 transition shadow-sm group"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0 mr-2">
                    <button
                      type="button"
                      onClick={() => toggleTask(task.id)}
                      className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all shrink-0 ${
                        task.completed
                          ? 'bg-stone-800 border-stone-800 text-white'
                          : 'border-stone-300 hover:border-stone-600 bg-transparent'
                      }`}
                    >
                      {task.completed && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </button>
                    <span
                      onClick={() => toggleTask(task.id)}
                      className={`text-sm cursor-pointer select-none truncate font-sans ${
                        task.completed
                          ? 'line-through text-stone-400 decoration-stone-300'
                          : 'text-stone-700'
                      }`}
                    >
                      {task.text}
                    </span>
                  </div>

                  <button
                    onClick={() => deleteTask(task.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-stone-400 hover:text-rose-500 rounded transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Footer controls */}
      {completedCount > 0 && (
        <div className="flex justify-end pt-4 border-t border-stone-200/40">
          <button
            onClick={clearCompletedTasks}
            className="text-stone-400 hover:text-stone-600 text-xs font-mono transition-colors"
          >
            Clear completed
          </button>
        </div>
      )}
    </div>
  );
}
