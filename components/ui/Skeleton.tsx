"use client";

import React from "react";

interface SkeletonProps {
  variant?: "text" | "circular" | "rectangular" | "rounded";
  width?: string | number;
  height?: string | number;
  className?: string;
  lines?: number;
}

export function Skeleton({
  variant = "text",
  width,
  height,
  className = "",
  lines = 1,
}: SkeletonProps) {
  const baseStyles = "skeleton-shimmer";

  const variantStyles = {
    text: "h-4 rounded-xs",
    circular: "rounded-full",
    rectangular: "rounded-none",
    rounded: "rounded-md",
  };

  const style: React.CSSProperties = {
    width: width ?? (variant === "circular" ? height : "100%"),
    height:
      height ?? (variant === "text" ? undefined : variant === "circular" ? width : "100px"),
  };

  if (variant === "text" && lines > 1) {
    return (
      <div className={`flex flex-col gap-2 ${className}`}>
        {Array.from({ length: lines }).map((_, index) => (
          <div
            key={index}
            className={`${baseStyles} ${variantStyles.text}`}
            style={{
              width: index === lines - 1 ? "75%" : "100%",
              height: "1rem",
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={`${baseStyles} ${variantStyles[variant]} ${className}`}
      style={style}
    />
  );
}

interface ResearchSkeletonProps {
  className?: string;
}

export function ResearchSkeleton({ className = "" }: ResearchSkeletonProps) {
  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header skeleton */}
      <div className="flex items-center gap-3">
        <Skeleton variant="circular" width={40} height={40} />
        <div className="flex-1">
          <Skeleton width="60%" height={16} className="mb-2" />
          <Skeleton width="40%" height={12} />
        </div>
      </div>

      {/* Content skeleton */}
      <div className="space-y-3">
        <Skeleton variant="text" lines={3} />
      </div>

      {/* Quick info skeleton */}
      <div className="flex gap-2">
        <Skeleton variant="rounded" width={80} height={32} />
        <Skeleton variant="rounded" width={100} height={32} />
        <Skeleton variant="rounded" width={60} height={32} />
      </div>

      {/* Actions skeleton */}
      <div className="flex gap-2">
        <Skeleton variant="rounded" width={120} height={40} />
        <Skeleton variant="rounded" width={120} height={40} />
      </div>
    </div>
  );
}

interface TaskCardSkeletonProps {
  className?: string;
}

export function TaskCardSkeleton({ className = "" }: TaskCardSkeletonProps) {
  return (
    <div
      className={`bg-surface rounded-md p-4 shadow-elevation-1 ${className}`}
    >
      <div className="flex items-start gap-3">
        <Skeleton variant="circular" width={24} height={24} />
        <div className="flex-1">
          <Skeleton width="70%" height={20} className="mb-2" />
          <Skeleton width="50%" height={14} />
        </div>
      </div>
    </div>
  );
}
