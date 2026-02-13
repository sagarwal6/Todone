"use client";

import React from "react";
import { MaterialIcon } from "./MaterialIcon";

interface CircularCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: "small" | "medium" | "large";
  className?: string;
  "aria-label"?: string;
}

// Inbox-style sizing - refined smaller sizes with thin borders
const sizeMap = {
  small: { container: "w-4 h-4", icon: 10 },
  medium: { container: "w-5 h-5", icon: 12 },
  large: { container: "w-6 h-6", icon: 14 },
};

export function CircularCheckbox({
  checked,
  onChange,
  disabled = false,
  size = "medium",
  className = "",
  "aria-label": ariaLabel = "Toggle completion",
}: CircularCheckboxProps) {
  const { container, icon } = sizeMap[size];

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`
        ${container}
        rounded-full
        flex items-center justify-center flex-shrink-0
        transition-all duration-150 ease-out
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inbox-accent focus-visible:ring-offset-2
        ${
          checked
            ? "bg-inbox-accent text-inbox-text-inverse"
            : "border border-[#DADCE0] hover:border-[#9AA0A6] hover:bg-inbox-accent/5"
        }
        ${disabled ? "opacity-38 cursor-not-allowed" : "cursor-pointer"}
        ${className}
      `}
    >
      {checked && (
        <MaterialIcon
          name="check"
          size={icon}
          weight={400}
          className="animate-scale-in text-white"
        />
      )}
    </button>
  );
}
