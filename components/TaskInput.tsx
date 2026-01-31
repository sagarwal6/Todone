'use client';

import { useState, useCallback, KeyboardEvent } from 'react';
import { MaterialIcon } from './ui/MaterialIcon';

interface TaskInputProps {
  onAddTask: (title: string) => void;
  disabled?: boolean;
}

export function TaskInput({ onAddTask, disabled }: TaskInputProps) {
  const [value, setValue] = useState('');

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (trimmed && !disabled) {
      onAddTask(trimmed);
      setValue('');
    }
  }, [value, onAddTask, disabled]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  return (
    <div className="w-full">
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="What needs to be done? (e.g., Book dentist appointment)"
          disabled={disabled}
          className="
            w-full px-4 py-3 pr-12
            text-body-large text-on-surface
            bg-surface-container rounded-sm
            border-0
            focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-surface
            disabled:opacity-38 disabled:cursor-not-allowed
            transition-all duration-200 ease-md-standard
            placeholder:text-on-surface-variant
          "
        />
        <button
          onClick={handleSubmit}
          disabled={!value.trim() || disabled}
          className="
            absolute right-2 top-1/2 -translate-y-1/2
            p-2 rounded-full
            text-on-surface-variant
            hover:text-primary hover:bg-primary/8
            disabled:opacity-38 disabled:cursor-not-allowed
            transition-all duration-200 ease-md-standard
            focus:outline-none focus:ring-2 focus:ring-primary
          "
          aria-label="Add task"
        >
          <MaterialIcon name="add" size="small" />
        </button>
      </div>
      <p className="mt-2 text-body-small text-on-surface-variant">
        Press Enter to add a task. AI will research and provide a briefing.
      </p>
    </div>
  );
}
