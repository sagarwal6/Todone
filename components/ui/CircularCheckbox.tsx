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

const sizeMap = {
  small: { container: "w-4 h-4", icon: 12 },
  medium: { container: "w-5 h-5", icon: 14 },
  large: { container: "w-6 h-6", icon: 18 },
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
        flex items-center justify-center
        transition-all duration-150 ease-out
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2
        ${
          checked
            ? "bg-primary text-on-primary"
            : "border border-outline/30 hover:border-primary/60 hover:bg-primary/5"
        }
        ${disabled ? "opacity-38 cursor-not-allowed" : "cursor-pointer"}
        ${className}
      `}
    >
      {checked && (
        <MaterialIcon
          name="check"
          size={icon}
          weight={500}
          className="animate-scale-in"
        />
      )}
    </button>
  );
}
