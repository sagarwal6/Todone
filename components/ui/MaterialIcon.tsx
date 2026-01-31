"use client";

import React from "react";

interface MaterialIconProps {
  name: string;
  size?: "small" | "medium" | "large" | number;
  fill?: boolean;
  weight?: 100 | 200 | 300 | 400 | 500 | 600 | 700;
  grade?: -25 | 0 | 200;
  className?: string;
  "aria-hidden"?: boolean;
}

const sizeMap = {
  small: 20,
  medium: 24,
  large: 48,
};

export function MaterialIcon({
  name,
  size = "medium",
  fill = false,
  weight = 400,
  grade = 0,
  className = "",
  "aria-hidden": ariaHidden = true,
}: MaterialIconProps) {
  const numericSize = typeof size === "number" ? size : sizeMap[size];

  const style: React.CSSProperties = {
    fontFamily: "'Material Symbols Rounded'",
    fontWeight: "normal",
    fontStyle: "normal",
    fontSize: `${numericSize}px`,
    lineHeight: 1,
    letterSpacing: "normal",
    textTransform: "none",
    display: "inline-block",
    whiteSpace: "nowrap",
    wordWrap: "normal",
    direction: "ltr",
    WebkitFontSmoothing: "antialiased",
    textRendering: "optimizeLegibility",
    fontVariationSettings: `'FILL' ${fill ? 1 : 0}, 'wght' ${weight}, 'GRAD' ${grade}, 'opsz' ${numericSize}`,
  };

  return (
    <span
      className={`material-symbols-rounded select-none ${className}`}
      style={style}
      aria-hidden={ariaHidden}
    >
      {name}
    </span>
  );
}
