"use client";

import React, { forwardRef } from "react";

type CardVariant = "elevated" | "filled" | "outlined" | "flat";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  interactive?: boolean;
  selected?: boolean;
  children: React.ReactNode;
}

// Inbox-style card variants - minimal chrome, content-focused
const variantStyles: Record<CardVariant, string> = {
  // Flat row - Inbox default: transparent, hover reveals background
  flat: "bg-transparent hover:bg-inbox-bg-hover",
  // Elevated - for panels/modals with subtle shadow
  elevated: "bg-inbox-bg-primary shadow-inbox-subtle",
  // Filled - subtle background container
  filled: "bg-inbox-bg-input",
  // Outlined - minimal border
  outlined: "bg-transparent border border-inbox-divider",
};

export const Card = forwardRef<HTMLDivElement, CardProps>(
  (
    {
      variant = "flat",
      interactive = false,
      selected = false,
      className = "",
      children,
      ...props
    },
    ref
  ) => {
    // Inbox-style base: minimal padding, quick transitions
    const baseStyles = `
      px-3 py-3
      transition-colors duration-100 ease-out
    `;

    const interactiveStyles = interactive
      ? "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inbox-accent"
      : "";

    // Inbox-style selection - light blue background
    const selectedStyles = selected
      ? "bg-inbox-bg-selected hover:bg-inbox-bg-selected"
      : "";

    return (
      <div
        ref={ref}
        className={`
          ${baseStyles}
          ${variantStyles[variant]}
          ${interactiveStyles}
          ${selectedStyles}
          ${className}
        `}
        tabIndex={interactive ? 0 : undefined}
        role={interactive ? "button" : undefined}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = "Card";
