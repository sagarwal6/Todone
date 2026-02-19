"use client";

import React, { useState, useEffect, useRef } from "react";

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
  small: { container: "w-4 h-4", svgSize: 16 },
  medium: { container: "w-5 h-5", svgSize: 20 },
  large: { container: "w-6 h-6", svgSize: 24 },
};

export function CircularCheckbox({
  checked,
  onChange,
  disabled = false,
  size = "medium",
  className = "",
  "aria-label": ariaLabel = "Toggle completion",
}: CircularCheckboxProps) {
  const { container, svgSize } = sizeMap[size];
  const [isAnimating, setIsAnimating] = useState(false);
  const prevChecked = useRef(checked);

  // Only animate when checked transitions from false to true (user action)
  useEffect(() => {
    if (checked && !prevChecked.current) {
      setIsAnimating(true);
      const timer = setTimeout(() => setIsAnimating(false), 500);
      return () => clearTimeout(timer);
    }
    prevChecked.current = checked;
  }, [checked]);

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`
        relative flex items-center justify-center flex-shrink-0
        min-w-[44px] min-h-[44px]
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inbox-accent focus-visible:ring-offset-2
        ${disabled ? "opacity-38 cursor-not-allowed" : "cursor-pointer"}
        ${isAnimating ? "checkbox-completing" : ""}
        ${className}
      `}
    >
      <span className={`
        ${container}
        rounded-full
        flex items-center justify-center
        ${isAnimating ? "checkbox-circle" : ""}
        ${
          checked
            ? "bg-inbox-success text-white"
            : "border border-[#DADCE0] hover:border-inbox-success/40 hover:bg-inbox-success/5"
        }
      `}>
        {checked && (
          <svg
            width={svgSize * 0.6}
            height={svgSize * 0.6}
            viewBox="0 0 24 24"
            fill="none"
            className={isAnimating ? "checkmark-path" : ""}
          >
            <polyline
              points="4,12 10,18 20,6"
              stroke="white"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={isAnimating ? {
                strokeDasharray: 30,
                strokeDashoffset: 0,
                animation: "checkmarkDraw 200ms ease-out 100ms both",
              } : {
                strokeDasharray: "none",
              }}
            />
          </svg>
        )}
      </span>
    </button>
  );
}
