"use client";

import React, { forwardRef } from "react";
import { MaterialIcon } from "./MaterialIcon";

type FABSize = "small" | "medium" | "large";
type FABVariant = "primary" | "secondary" | "tertiary" | "surface";

interface FABProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: string;
  size?: FABSize;
  variant?: FABVariant;
  extended?: boolean;
  label?: string;
}

const sizeStyles: Record<FABSize, { container: string; icon: number }> = {
  small: { container: "w-10 h-10", icon: 24 },
  medium: { container: "w-14 h-14", icon: 24 },
  large: { container: "w-24 h-24", icon: 36 },
};

const variantStyles: Record<FABVariant, string> = {
  primary: "bg-primary-container text-on-primary-container",
  secondary: "bg-secondary-container text-on-secondary-container",
  tertiary: "bg-tertiary-container text-on-tertiary-container",
  surface: "bg-surface-container-high text-primary shadow-elevation-3",
};

export const FAB = forwardRef<HTMLButtonElement, FABProps>(
  (
    {
      icon,
      size = "medium",
      variant = "primary",
      extended = false,
      label,
      className = "",
      disabled,
      ...props
    },
    ref
  ) => {
    const { container, icon: iconSize } = sizeStyles[size];

    const baseStyles = `
      inline-flex items-center justify-center
      rounded-lg
      shadow-elevation-3
      hover:shadow-elevation-4
      active:shadow-elevation-3
      transition-all duration-200 ease-md-standard
      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2
      disabled:opacity-38 disabled:cursor-not-allowed disabled:shadow-elevation-0
      state-layer
    `;

    if (extended && label) {
      return (
        <button
          ref={ref}
          disabled={disabled}
          className={`
            ${baseStyles}
            ${variantStyles[variant]}
            h-14 px-4 gap-2
            rounded-lg
            ${className}
          `}
          {...props}
        >
          <MaterialIcon name={icon} size={iconSize} />
          <span className="text-label-large font-medium">{label}</span>
        </button>
      );
    }

    return (
      <button
        ref={ref}
        disabled={disabled}
        className={`
          ${baseStyles}
          ${variantStyles[variant]}
          ${container}
          ${size === "large" ? "rounded-xl" : "rounded-lg"}
          ${className}
        `}
        aria-label={label}
        {...props}
      >
        <MaterialIcon name={icon} size={iconSize} />
      </button>
    );
  }
);

FAB.displayName = "FAB";
