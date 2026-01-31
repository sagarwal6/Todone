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
  small: { container: "w-5 h-5", icon: 16 },
  medium: { container: "w-6 h-6", icon: 20 },
  large: { container: "w-8 h-8", icon: 24 },
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
        transition-all duration-200 ease-md-standard
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2
        ${
          checked
            ? "bg-primary text-on-primary"
            : "border-2 border-on-surface-variant hover:border-primary hover:bg-primary/8"
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
