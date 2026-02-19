'use client';

import { useCallback, useRef } from 'react';

/**
 * Lightweight FLIP animation hook for row collapse when tasks are removed.
 * Captures positions of list items before removal, then animates remaining
 * items to their new positions after the DOM updates.
 */
export function useAnimatedList(containerRef: React.RefObject<HTMLDivElement | null>) {
  const positionsRef = useRef<Map<string, DOMRect>>(new Map());

  const capturePositions = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    positionsRef.current.clear();
    const children = container.querySelectorAll('[data-task-id]');
    children.forEach((child) => {
      const taskId = child.getAttribute('data-task-id');
      if (taskId) {
        positionsRef.current.set(taskId, child.getBoundingClientRect());
      }
    });
  }, [containerRef]);

  const animateChanges = useCallback(() => {
    // Check reduced motion preference
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const container = containerRef.current;
    if (!container) return;

    requestAnimationFrame(() => {
      const children = container.querySelectorAll('[data-task-id]');
      children.forEach((child) => {
        const taskId = child.getAttribute('data-task-id');
        if (!taskId) return;

        const oldRect = positionsRef.current.get(taskId);
        if (!oldRect) return;

        const newRect = child.getBoundingClientRect();
        const deltaY = oldRect.top - newRect.top;

        if (Math.abs(deltaY) > 1) {
          const el = child as HTMLElement;
          el.style.setProperty('--flip-delta-y', `${deltaY}px`);
          el.style.animation = 'none';
          // Force reflow
          el.offsetHeight;
          el.style.animation = 'flipRowCollapse 250ms cubic-bezier(0.2, 0, 0, 1) both';
          el.addEventListener('animationend', () => {
            el.style.animation = '';
            el.style.removeProperty('--flip-delta-y');
          }, { once: true });
        }
      });
    });
  }, [containerRef]);

  return { capturePositions, animateChanges };
}
