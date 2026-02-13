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
          placeholder="Add a task..."
          disabled={disabled}
          className="
            w-full px-4 py-3 pr-12
            text-inbox-body text-inbox-text-primary
            bg-inbox-bg-input rounded-lg
            border-0
            focus:outline-none focus:ring-2 focus:ring-inbox-accent focus:ring-offset-0
            focus:bg-inbox-bg-primary
            disabled:opacity-38 disabled:cursor-not-allowed
            transition-all duration-150
            placeholder:text-inbox-text-tertiary
          "
        />
        <button
          onClick={handleSubmit}
          disabled={!value.trim() || disabled}
          className="
            absolute right-2 top-1/2 -translate-y-1/2
            p-2 rounded-full
            text-inbox-text-tertiary
            hover:text-inbox-accent hover:bg-inbox-accent/10
            disabled:opacity-38 disabled:cursor-not-allowed
            transition-colors duration-100
            focus:outline-none focus:ring-2 focus:ring-inbox-accent
          "
          aria-label="Add task"
        >
          <MaterialIcon name="add" size={20} weight={400} />
        </button>
      </div>
    </div>
  );
}
