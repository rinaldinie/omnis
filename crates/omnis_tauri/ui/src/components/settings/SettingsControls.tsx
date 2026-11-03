import React from 'react';

export interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  ariaLabel?: string;
  size?: 'sm' | 'md';
}

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  checked,
  onChange,
  disabled = false,
  id,
  ariaLabel,
  size = 'md',
}) => {
  const isSm = size === 'sm';

  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className={`relative inline-flex items-center shrink-0 cursor-pointer rounded-full p-0.5 transition-colors duration-200 ease-in-out focus:outline-hidden disabled:opacity-40 disabled:cursor-not-allowed ${
        isSm ? 'h-4 w-7' : 'h-5 w-9'
      } ${!checked ? 'bg-white/15 hover:bg-white/20' : ''}`}
      style={
        checked
          ? {
              backgroundColor: 'var(--accent-primary)',
              boxShadow: '0 0 10px var(--accent-glow)',
            }
          : undefined
      }
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none inline-block rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ease-in-out ${
          isSm
            ? `h-3 w-3 ${checked ? 'translate-x-3' : 'translate-x-0'}`
            : `h-4 w-4 ${checked ? 'translate-x-4' : 'translate-x-0'}`
        }`}
      />
    </button>
  );
};

export interface SettingGroupProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export const SettingGroup: React.FC<SettingGroupProps> = ({
  title,
  description,
  icon,
  action,
  children,
  className = '',
}) => {
  return (
    <div className={`space-y-2.5 ${className}`}>
      {(title || description || action) && (
        <div className="flex items-center justify-between px-1">
          <div className="space-y-0.5">
            {title && (
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
                {icon && <span style={{ color: 'var(--accent-primary)' }}>{icon}</span>}
                <span>{title}</span>
              </div>
            )}
            {description && (
              <p className="text-[11px] text-slate-400 leading-relaxed max-w-xl">{description}</p>
            )}
          </div>
          {action && <div className="shrink-0 ml-3">{action}</div>}
        </div>
      )}
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] divide-y divide-white/[0.06] overflow-hidden shadow-xs">
        {children}
      </div>
    </div>
  );
};

export interface SettingRowProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  badge?: React.ReactNode;
  children?: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

export const SettingRow: React.FC<SettingRowProps> = ({
  icon,
  title,
  description,
  badge,
  children,
  onClick,
  className = '',
}) => {
  return (
    <div
      onClick={onClick}
      className={`flex items-center justify-between p-3.5 transition-colors ${
        onClick ? 'cursor-pointer hover:bg-white/[0.02]' : ''
      } ${className}`}
    >
      <div className="flex items-center gap-3 min-w-0 pr-4">
        {icon && (
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border border-white/[0.06]"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--accent-primary) 10%, transparent)',
              color: 'var(--accent-primary)',
            }}
          >
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-100">{title}</span>
            {badge}
          </div>
          {description && (
            <div className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">{description}</div>
          )}
        </div>
      </div>
      <div className="shrink-0 flex items-center gap-2.5">{children}</div>
    </div>
  );
};

export interface SettingRadioOptionProps {
  selected: boolean;
  onSelect: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
}

export const SettingRadioOption: React.FC<SettingRadioOptionProps> = ({
  selected,
  onSelect,
  title,
  subtitle,
  icon,
  badge,
}) => {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full flex items-center justify-between p-3 transition-colors text-left group cursor-pointer ${
        selected ? 'bg-white/[0.03]' : 'hover:bg-white/[0.015]'
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-all ${
            selected
              ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/10'
              : 'border-slate-500 group-hover:border-slate-400'
          }`}
          style={selected ? { borderColor: 'var(--accent-primary)' } : undefined}
        >
          {selected && (
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: 'var(--accent-primary)' }}
            />
          )}
        </div>
        {icon && <span className="text-xl shrink-0 leading-none">{icon}</span>}
        <div className="min-w-0">
          <span
            className={`text-xs block truncate ${
              selected ? 'text-white font-semibold' : 'text-slate-300 group-hover:text-white'
            }`}
          >
            {title}
          </span>
          {subtitle && (
            <span className="text-[10px] text-slate-400 block truncate">{subtitle}</span>
          )}
        </div>
      </div>
      {badge && <div className="shrink-0 ml-2">{badge}</div>}
    </button>
  );
};
