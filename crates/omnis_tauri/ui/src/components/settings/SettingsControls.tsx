import React from "react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

export interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  ariaLabel?: string;
  size?: "sm" | "md";
}

/** Backwards-compatible wrapper around the Radix-backed Switch primitive. */
export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  checked,
  onChange,
  disabled = false,
  id,
  ariaLabel,
  size = "md",
}) => {
  return (
    <Switch
      id={id}
      checked={checked}
      onCheckedChange={onChange}
      onClick={(e) => e.stopPropagation()}
      disabled={disabled}
      aria-label={ariaLabel}
      size={size}
    />
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
  className = "",
}) => {
  return (
    <div className={`space-y-2.5 ${className}`}>
      {(title || description || action) && (
        <div className="flex items-center justify-between px-1">
          <div className="space-y-0.5">
            {title && (
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
                {icon && (
                  <span style={{ color: "var(--accent-primary)" }}>{icon}</span>
                )}
                <span>{title}</span>
              </div>
            )}
            {description && (
              <p className="text-[11px] text-slate-400 leading-relaxed max-w-xl">
                {description}
              </p>
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
  className = "",
}) => {
  return (
    <div
      onClick={onClick}
      className={`flex items-center justify-between p-3.5 transition-colors ${
        onClick ? "cursor-pointer hover:bg-white/[0.02]" : ""
      } ${className}`}
    >
      <div className="flex items-center gap-3 min-w-0 pr-4">
        {icon && (
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border border-white/[0.06]"
            style={{
              backgroundColor:
                "color-mix(in srgb, var(--accent-primary) 10%, transparent)",
              color: "var(--accent-primary)",
            }}
          >
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-100">
              {title}
            </span>
            {badge}
          </div>
          {description && (
            <div className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
              {description}
            </div>
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
    <Button
      type="button"
      variant="ghost"
      onClick={onSelect}
      className={`w-full h-auto justify-between p-3 rounded-none text-left group ${
        selected
          ? "bg-white/[0.03] hover:bg-white/[0.04]"
          : "hover:bg-white/[0.015]"
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-all ${
            selected
              ? "border-[var(--accent-primary)] bg-[var(--accent-primary)]/10"
              : "border-slate-500 group-hover:border-slate-400"
          }`}
          style={selected ? { borderColor: "var(--accent-primary)" } : undefined}
        >
          {selected && (
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: "var(--accent-primary)" }}
            />
          )}
        </div>
        {icon && <span className="text-xl shrink-0 leading-none">{icon}</span>}
        <div className="min-w-0">
          <span
            className={`text-xs block truncate ${
              selected
                ? "text-white font-semibold"
                : "text-slate-300 group-hover:text-white"
            }`}
          >
            {title}
          </span>
          {subtitle && (
            <span className="text-[10px] text-slate-400 block truncate">
              {subtitle}
            </span>
          )}
        </div>
      </div>
      {badge && <div className="shrink-0 ml-2">{badge}</div>}
    </Button>
  );
};
