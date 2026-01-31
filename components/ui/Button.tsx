"use client";

import React, { forwardRef } from "react";
import { MaterialIcon } from "./MaterialIcon";

type ButtonVariant = "filled" | "tonal" | "outlined" | "text";
type ButtonSize = "small" | "medium" | "large";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: string;
  iconPosition?: "start" | "end";
  fullWidth?: boolean;
  loading?: boolean;
  children?: React.ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  filled:
    "bg-primary text-on-primary hover:shadow-elevation-1 active:shadow-none",
  tonal:
    "bg-secondary-container text-on-secondary-container hover:bg-opacity-90",
  outlined:
    "border border-outline text-primary bg-transparent hover:bg-primary/8",
  text: "text-primary bg-transparent hover:bg-primary/8",
};

const sizeStyles: Record<ButtonSize, string> = {
  small: "h-8 px-3 text-label-medium gap-1.5",
  medium: "h-10 px-4 text-label-large gap-2",
  large: "h-12 px-6 text-label-large gap-2",
};

const iconSizes: Record<ButtonSize, "small" | "medium"> = {
  small: "small",
  medium: "small",
  large: "medium",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "filled",
      size = "medium",
      icon,
      iconPosition = "start",
      fullWidth = false,
      loading = false,
      disabled,
      className = "",
      children,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    const baseStyles = `
      inline-flex items-center justify-center
      rounded-pill font-medium
      transition-all duration-200 ease-md-standard
      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2
      disabled:opacity-38 disabled:cursor-not-allowed disabled:shadow-none
      relative overflow-hidden state-layer
    `;

    const iconElement = icon && (
      <MaterialIcon name={icon} size={iconSizes[size]} />
    );

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={`
          ${baseStyles}
          ${variantStyles[variant]}
          ${sizeStyles[size]}
          ${fullWidth ? "w-full" : ""}
          ${className}
        `}
        {...props}
      >
        {loading && (
          <MaterialIcon
            name="progress_activity"
            size={iconSizes[size]}
            className="animate-spin"
          />
        )}
        {!loading && iconPosition === "start" && iconElement}
        {children && <span>{children}</span>}
        {!loading && iconPosition === "end" && iconElement}
      </button>
    );
  }
);

Button.displayName = "Button";
