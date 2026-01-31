"use client";

import React, { useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { MaterialIcon } from "./MaterialIcon";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  variant?: "dialog" | "bottom-sheet" | "full-screen";
  showCloseButton?: boolean;
  closeOnBackdrop?: boolean;
  className?: string;
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  variant = "dialog",
  showCloseButton = true,
  closeOnBackdrop = true,
  className = "",
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      document.body.style.overflow = "hidden";
      modalRef.current?.focus();
    } else {
      document.body.style.overflow = "";
      previousFocusRef.current?.focus();
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (closeOnBackdrop && e.target === e.currentTarget) {
        onClose();
      }
    },
    [closeOnBackdrop, onClose]
  );

  if (!isOpen) return null;

  const variantStyles = {
    dialog: `
      max-w-lg w-[calc(100%-32px)] mx-auto my-auto
      rounded-xl
      bg-surface-container-high
      shadow-elevation-3
      animate-scale-in
    `,
    "bottom-sheet": `
      w-full max-h-[90vh]
      rounded-t-xl
      bg-surface-container-high
      shadow-elevation-3
      animate-slide-in-bottom
      mt-auto
      pb-safe-bottom
    `,
    "full-screen": `
      w-full h-full
      bg-surface
      animate-fade-in
    `,
  };

  const content = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center backdrop"
      onClick={handleBackdropClick}
      aria-modal="true"
      role="dialog"
    >
      <div
        ref={modalRef}
        className={`
          flex flex-col
          overflow-hidden
          ${variantStyles[variant]}
          ${className}
        `}
        tabIndex={-1}
      >
        {/* Header */}
        {(title || showCloseButton) && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant">
            {title && (
              <h2 className="text-headline-small font-display text-on-surface">
                {title}
              </h2>
            )}
            {showCloseButton && (
              <button
                onClick={onClose}
                className="
                  p-2 -m-2
                  rounded-full
                  text-on-surface-variant
                  hover:bg-on-surface/8
                  transition-colors duration-200
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary
                "
                aria-label="Close"
              >
                <MaterialIcon name="close" size={24} />
              </button>
            )}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>

        {/* Drag handle for bottom sheet */}
        {variant === "bottom-sheet" && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-8 h-1 bg-on-surface-variant/40 rounded-full" />
        )}
      </div>
    </div>
  );

  // Render in portal
  if (typeof window !== "undefined") {
    return createPortal(content, document.body);
  }

  return null;
}

interface BottomSheetProps extends Omit<ModalProps, "variant"> {}

export function BottomSheet(props: BottomSheetProps) {
  return <Modal {...props} variant="bottom-sheet" />;
}
