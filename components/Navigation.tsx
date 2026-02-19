'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { MaterialIcon } from './ui/MaterialIcon';

type ViewMode = 'active' | 'completed' | 'someday' | 'insights';

interface NavItem {
  id: ViewMode;
  label: string;
  icon: string;
  iconFilled: string;
  hideCount?: boolean;
}

// Note: Insights is now shown via InsightBriefingCard in the task list, not as a tab
const navItems: NavItem[] = [
  { id: 'active', label: 'Active', icon: 'radio_button_unchecked', iconFilled: 'task_alt' },
  { id: 'completed', label: 'Done', icon: 'check_circle', iconFilled: 'check_circle' },
  { id: 'someday', label: 'Someday', icon: 'schedule', iconFilled: 'schedule' },
];

interface SidebarProps {
  currentView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  counts: Record<ViewMode, number>;
  className?: string;
}

export function Sidebar({ currentView, onViewChange, counts, className = '' }: SidebarProps) {
  return (
    <aside className={`flex flex-col h-full bg-surface-container-low ${className}`}>
      {/* Logo */}
      <div className="p-6">
        <h1 className="text-headline-small font-display text-on-surface flex items-center gap-2">
          <MaterialIcon name="task_alt" size={28} className="text-primary" fill />
          Todone
        </h1>
        <p className="text-body-small text-on-surface-variant mt-1">
          AI-powered task research
        </p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isActive = currentView === item.id;
            const count = counts[item.id];
            const showCount = !item.hideCount && count > 0;

            return (
              <li key={item.id}>
                <button
                  onClick={() => onViewChange(item.id)}
                  className={`
                    w-full flex items-center gap-3 px-4 py-3
                    rounded-pill
                    text-label-large font-medium
                    transition-all duration-200 ease-md-standard
                    ${
                      isActive
                        ? 'bg-primary-container text-on-primary-container'
                        : 'text-on-surface-variant hover:bg-on-surface/8'
                    }
                  `}
                >
                  <MaterialIcon
                    name={isActive ? item.iconFilled : item.icon}
                    size="small"
                    fill={isActive}
                  />
                  <span className="flex-1 text-left">{item.label}</span>
                  {showCount && (
                    <span className={`
                      px-2 py-0.5 text-label-small rounded-pill
                      ${isActive ? 'bg-on-primary-container/20' : 'bg-surface-container-high'}
                    `}>
                      {count}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-outline-variant">
        <p className="text-body-small text-on-surface-variant text-center">
          Powered by Gemini AI
        </p>
      </div>
    </aside>
  );
}

interface BottomNavProps {
  currentView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  counts: Record<ViewMode, number>;
}

export function BottomNav({ currentView, onViewChange, counts }: BottomNavProps) {
  return (
    <nav className="
      fixed bottom-0 left-0 right-0 z-40
      bg-inbox-bg-primary
      border-t border-inbox-divider
      pb-safe-bottom
      shadow-inbox-subtle
    ">
      <ul className="flex justify-around items-center h-16">
        {navItems.map((item) => {
          const isActive = currentView === item.id;
          const count = counts[item.id];
          const showCount = !item.hideCount && count > 0;

          return (
            <li key={item.id} className="flex-1">
              <button
                onClick={() => onViewChange(item.id)}
                className="
                  w-full flex flex-col items-center justify-center
                  py-2 gap-1
                  transition-colors duration-200
                "
              >
                <div className="relative">
                  <div className={`
                    px-4 py-1 rounded-pill
                    transition-all duration-200
                    ${isActive ? 'bg-primary-container' : ''}
                  `}>
                    <MaterialIcon
                      name={isActive ? item.iconFilled : item.icon}
                      size="small"
                      fill={isActive}
                      className={isActive ? 'text-on-primary-container' : 'text-on-surface-variant'}
                    />
                  </div>
                  {showCount && (
                    <span className="
                      absolute -top-1 -right-1
                      min-w-[18px] h-[18px]
                      flex items-center justify-center
                      text-label-small font-medium
                      bg-inbox-accent text-white
                      rounded-full
                      px-1
                    ">
                      {count > 99 ? '99+' : count}
                    </span>
                  )}
                </div>
                <span className={`
                  text-label-small
                  ${isActive ? 'text-on-surface font-medium' : 'text-on-surface-variant'}
                `}>
                  {item.label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

interface MobileHeaderProps {
  currentView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  counts: Record<string, number>;
  briefingDot?: boolean;
  onSignOut?: () => void;
  onDeleteAccount?: () => void;
}

export function MobileHeader({ currentView, onViewChange, counts, briefingDot, onSignOut, onDeleteAccount }: MobileHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isTasksActive = currentView === 'active' || currentView === 'completed' || currentView === 'someday';
  const isBriefingActive = currentView === 'insights';

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  return (
    <header className="
      sticky top-0 z-30
      bg-inbox-bg-primary
      border-b border-inbox-divider
      px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]
    ">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <MaterialIcon name="task_alt" size={20} className="text-inbox-accent mr-1" fill />
          <button
            onClick={() => onViewChange('active')}
            className={`text-lg font-display px-2 py-1 rounded-lg transition-colors
              ${isTasksActive
                ? 'text-inbox-text-primary font-semibold'
                : 'text-inbox-text-tertiary'
              }`}
          >
            Tasks
          </button>
          <button
            onClick={() => onViewChange('insights')}
            className={`text-lg font-display px-2 py-1 rounded-lg transition-colors relative
              ${isBriefingActive
                ? 'text-inbox-text-primary font-semibold'
                : 'text-inbox-text-tertiary'
              }`}
          >
            Briefing
            {briefingDot && !isBriefingActive && (
              <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-inbox-accent" />
            )}
          </button>
        </div>
        {onSignOut && (
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-inbox-caption text-inbox-text-secondary active:bg-inbox-bg-hover transition-colors"
              aria-label="Account menu"
            >
              <MaterialIcon name="more_vert" size={20} weight={300} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 bg-inbox-bg-primary border border-inbox-divider rounded-xl shadow-lg overflow-hidden min-w-[200px] z-50">
                <button
                  onClick={() => { setMenuOpen(false); onSignOut(); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-inbox-text-primary active:bg-inbox-bg-hover transition-colors"
                >
                  <MaterialIcon name="logout" size={18} weight={300} />
                  Sign out
                </button>
                <div className="border-t border-inbox-divider">
                  <button
                    onClick={() => { setMenuOpen(false); onViewChange('completed'); }}
                    className="w-full flex items-center justify-between px-4 py-3 text-sm text-inbox-text-secondary active:bg-inbox-bg-hover transition-colors"
                  >
                    <span className="flex items-center gap-3">
                      <MaterialIcon name="check_circle" size={18} weight={300} />
                      Completed
                    </span>
                    {counts.completed > 0 && (
                      <span className="text-inbox-text-tertiary text-xs">{counts.completed}</span>
                    )}
                  </button>
                  <button
                    onClick={() => { setMenuOpen(false); onViewChange('someday'); }}
                    className="w-full flex items-center justify-between px-4 py-3 text-sm text-inbox-text-secondary active:bg-inbox-bg-hover transition-colors"
                  >
                    <span className="flex items-center gap-3">
                      <MaterialIcon name="schedule" size={18} weight={300} />
                      Someday
                    </span>
                    {counts.someday > 0 && (
                      <span className="text-inbox-text-tertiary text-xs">{counts.someday}</span>
                    )}
                  </button>
                </div>
                <div className="border-t border-inbox-divider">
                  <Link
                    href="/privacy"
                    onClick={() => setMenuOpen(false)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-inbox-text-secondary active:bg-inbox-bg-hover transition-colors"
                  >
                    <MaterialIcon name="policy" size={18} weight={300} />
                    Privacy
                  </Link>
                  <Link
                    href="/terms"
                    onClick={() => setMenuOpen(false)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-inbox-text-secondary active:bg-inbox-bg-hover transition-colors"
                  >
                    <MaterialIcon name="description" size={18} weight={300} />
                    Terms
                  </Link>
                </div>
                {onDeleteAccount && (
                  <button
                    onClick={() => { setMenuOpen(false); onDeleteAccount(); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-500 active:bg-inbox-bg-hover transition-colors border-t border-inbox-divider"
                  >
                    <MaterialIcon name="delete_forever" size={18} weight={300} />
                    Delete account
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}

interface DesktopAccountMenuProps {
  onSignOut: () => void;
  onDeleteAccount: () => void;
  onViewChange?: (view: ViewMode) => void;
  counts?: Record<string, number>;
}

export function DesktopAccountMenu({ onSignOut, onDeleteAccount, onViewChange, counts }: DesktopAccountMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setMenuOpen(!menuOpen)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-inbox-caption text-inbox-text-secondary hover:text-inbox-text-primary hover:bg-inbox-bg-hover transition-colors"
        aria-label="Account menu"
      >
        <MaterialIcon name="more_vert" size={20} weight={300} />
      </button>
      {menuOpen && (
        <div className="absolute right-0 top-full mt-1 bg-inbox-bg-primary border border-inbox-divider rounded-xl shadow-lg overflow-hidden min-w-[200px] z-50">
          <button
            onClick={() => { setMenuOpen(false); onSignOut(); }}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-inbox-text-primary hover:bg-inbox-bg-hover transition-colors"
          >
            <MaterialIcon name="logout" size={18} weight={300} />
            Sign out
          </button>
          {onViewChange && (
            <div className="border-t border-inbox-divider">
              <button
                onClick={() => { setMenuOpen(false); onViewChange('completed'); }}
                className="w-full flex items-center justify-between px-4 py-3 text-sm text-inbox-text-secondary hover:bg-inbox-bg-hover transition-colors"
              >
                <span className="flex items-center gap-3">
                  <MaterialIcon name="check_circle" size={18} weight={300} />
                  Completed
                </span>
                {counts && counts.completed > 0 && (
                  <span className="text-inbox-text-tertiary text-xs">{counts.completed}</span>
                )}
              </button>
              <button
                onClick={() => { setMenuOpen(false); onViewChange('someday'); }}
                className="w-full flex items-center justify-between px-4 py-3 text-sm text-inbox-text-secondary hover:bg-inbox-bg-hover transition-colors"
              >
                <span className="flex items-center gap-3">
                  <MaterialIcon name="schedule" size={18} weight={300} />
                  Someday
                </span>
                {counts && counts.someday > 0 && (
                  <span className="text-inbox-text-tertiary text-xs">{counts.someday}</span>
                )}
              </button>
            </div>
          )}
          <div className="border-t border-inbox-divider">
            <Link
              href="/privacy"
              onClick={() => setMenuOpen(false)}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-inbox-text-secondary hover:bg-inbox-bg-hover transition-colors"
            >
              <MaterialIcon name="policy" size={18} weight={300} />
              Privacy
            </Link>
            <Link
              href="/terms"
              onClick={() => setMenuOpen(false)}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-inbox-text-secondary hover:bg-inbox-bg-hover transition-colors"
            >
              <MaterialIcon name="description" size={18} weight={300} />
              Terms
            </Link>
          </div>
          <button
            onClick={() => { setMenuOpen(false); onDeleteAccount(); }}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-500 hover:bg-inbox-bg-hover transition-colors border-t border-inbox-divider"
          >
            <MaterialIcon name="delete_forever" size={18} weight={300} />
            Delete account
          </button>
        </div>
      )}
    </div>
  );
}

interface DeleteAccountDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  deleting: boolean;
}

export function DeleteAccountDialog({ open, onClose, onConfirm, deleting }: DeleteAccountDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6">
      <div className="bg-inbox-bg-primary rounded-2xl p-6 max-w-sm w-full shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
            <MaterialIcon name="warning" size={20} className="text-red-600" />
          </div>
          <h2 className="text-lg font-medium text-inbox-text-primary">Delete account?</h2>
        </div>
        <p className="text-sm text-inbox-text-secondary mb-6 leading-relaxed">
          This will permanently delete your account and all your data — tasks, messages,
          and Google connection. This action cannot be undone.
        </p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={deleting}
            className="px-4 py-2 rounded-full text-sm font-medium text-inbox-text-primary active:bg-inbox-bg-hover transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="px-4 py-2 rounded-full text-sm font-medium bg-red-600 text-white active:bg-red-700 transition-colors disabled:opacity-50"
          >
            {deleting ? 'Deleting...' : 'Delete my account'}
          </button>
        </div>
      </div>
    </div>
  );
}
