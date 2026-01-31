'use client';

import { MaterialIcon } from './ui/MaterialIcon';

type ViewMode = 'active' | 'completed' | 'archived';

interface NavItem {
  id: ViewMode;
  label: string;
  icon: string;
  iconFilled: string;
}

const navItems: NavItem[] = [
  { id: 'active', label: 'Active', icon: 'radio_button_unchecked', iconFilled: 'task_alt' },
  { id: 'completed', label: 'Completed', icon: 'check_circle', iconFilled: 'check_circle' },
  { id: 'archived', label: 'Archived', icon: 'inventory_2', iconFilled: 'inventory_2' },
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
                  {count > 0 && (
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
      bg-surface-container
      border-t border-outline-variant
      pb-safe-bottom
      shadow-elevation-2
    ">
      <ul className="flex justify-around items-center h-16">
        {navItems.map((item) => {
          const isActive = currentView === item.id;
          const count = counts[item.id];

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
                  {count > 0 && (
                    <span className="
                      absolute -top-1 -right-1
                      min-w-[18px] h-[18px]
                      flex items-center justify-center
                      text-label-small font-medium
                      bg-error text-on-error
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
  title?: string;
}

export function MobileHeader({ title = 'Todone' }: MobileHeaderProps) {
  return (
    <header className="
      sticky top-0 z-30
      bg-surface
      border-b border-outline-variant
      px-4 py-3
      pt-safe-top
    ">
      <h1 className="text-title-large font-display text-on-surface flex items-center gap-2">
        <MaterialIcon name="task_alt" size={24} className="text-primary" fill />
        {title}
      </h1>
    </header>
  );
}
