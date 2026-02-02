"use client";

import React, { forwardRef } from "react";

type CardVariant = "elevated" | "filled" | "outlined";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  interactive?: boolean;
  selected?: boolean;
  children: React.ReactNode;
}

const variantStyles: Record<CardVariant, string> = {
  elevated: "bg-transparent hover:bg-surface-container/50",
  filled: "bg-surface-container-low/40",
  outlined: "bg-transparent",
};

export const Card = forwardRef<HTMLDivElement, CardProps>(
  (
    {
      variant = "elevated",
      interactive = false,
      selected = false,
      className = "",
      children,
      ...props
    },
    ref
  ) => {
    const baseStyles = `
      rounded-lg px-3 py-3
      transition-colors duration-150 ease-out
    `;

    const interactiveStyles = interactive
      ? "cursor-pointer state-layer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      : "";

    const selectedStyles = selected
      ? "ring-2 ring-primary bg-primary-container/20"
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
