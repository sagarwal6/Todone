"use client";

import React from "react";
import { MaterialIcon } from "./MaterialIcon";

interface AISuggestionProps {
  children: React.ReactNode;
  icon?: string;
  label?: string;
  className?: string;
}

export function AISuggestion({
  children,
  icon = "auto_awesome",
  label = "AI Suggestion",
  className = "",
}: AISuggestionProps) {
  return (
    <div
      className={`
        relative
        bg-primary-container/30
        border-l-[3px] border-primary
        rounded-r-md
        p-4
        ${className}
      `}
    >
      {label && (
        <div className="flex items-center gap-1.5 mb-2 text-primary">
          <MaterialIcon name={icon} size="small" />
          <span className="text-label-small font-medium">{label}</span>
        </div>
      )}
      <div className="text-body-medium text-on-surface">{children}</div>
    </div>
  );
}
