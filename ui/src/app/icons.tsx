import type { ReactNode } from 'react';
import type { SidebarIconName } from './navigation';

type IconProps = {
  className?: string;
};

const SIDEBAR_ICON_PATHS: Record<SidebarIconName, string[]> = {
  list: [
    'M8 7h10',
    'M8 12h10',
    'M8 17h10',
    'M4 7h.01',
    'M4 12h.01',
    'M4 17h.01',
  ],
};

export function SidebarMenuIcon({
  icon,
  className = 'h-5 w-5 text-current',
}: {
  icon: SidebarIconName;
  className?: string;
}) {
  return (
    <IconSvg className={className}>
      {SIDEBAR_ICON_PATHS[icon].map((path) => (
        <path key={path} d={path} />
      ))}
    </IconSvg>
  );
}

export function MenuIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <IconSvg className={className} strokeLinejoin={undefined}>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </IconSvg>
  );
}

export function CloseIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <IconSvg className={className} strokeLinejoin={undefined}>
      <path d="M6 6l12 12" />
      <path d="M18 6 6 18" />
    </IconSvg>
  );
}

export function PlusIcon({ className = 'h-4.5 w-4.5 shrink-0' }: IconProps) {
  return (
    <IconSvg className={className} strokeLinejoin={undefined}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </IconSvg>
  );
}

export function PanelCollapseIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <IconSvg className={className}>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M10 5v14" />
      <path d="m14 12 3-3" />
      <path d="m14 12 3 3" />
    </IconSvg>
  );
}

export function PanelExpandIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <IconSvg className={className}>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M10 5v14" />
      <path d="m17 12-3-3" />
      <path d="m17 12-3 3" />
    </IconSvg>
  );
}

export function SearchIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <IconSvg className={className}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </IconSvg>
  );
}

export function LinkIcon({ className = 'h-3.5 w-3.5' }: IconProps) {
  return (
    <IconSvg className={className}>
      <path d="M10 13a5 5 0 0 0 7.07 0l2.12-2.12a5 5 0 0 0-7.07-7.07L11 4.93" />
      <path d="M14 11a5 5 0 0 0-7.07 0L4.81 13.12a5 5 0 0 0 7.07 7.07L13 19.07" />
    </IconSvg>
  );
}

export function DiskIcon({ className = 'h-3.5 w-3.5' }: IconProps) {
  return (
    <IconSvg className={className}>
      <path d="M5 4h11l3 3v13H5z" />
      <path d="M9 4v5h6V4" />
      <path d="M9 17h6" />
    </IconSvg>
  );
}

export function GearIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <IconSvg className={className}>
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.05.05a2 2 0 1 1-2.83 2.83l-.05-.05A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6l-.04.08a2 2 0 1 1-3.92 0L10 20a1.7 1.7 0 0 0-1-.6 1.7 1.7 0 0 0-1.88.34l-.05.05a2 2 0 1 1-2.83-2.83l.05-.05A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1l-.08-.04a2 2 0 1 1 0-3.92L4 10a1.7 1.7 0 0 0 .6-1 1.7 1.7 0 0 0-.34-1.88l-.05-.05A2 2 0 1 1 6.96 4.1l.05.05A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6l.04-.08a2 2 0 1 1 3.92 0L14 4a1.7 1.7 0 0 0 1 .6 1.7 1.7 0 0 0 1.88-.34l.05-.05a2 2 0 1 1 2.83 2.83l-.05.05A1.7 1.7 0 0 0 19.4 9c.4.2.73.4 1 .6l.08.04a2 2 0 1 1 0 3.92l-.08.04c-.27.2-.6.4-1 .6Z" />
    </IconSvg>
  );
}

export function UploadIcon({ className = 'h-3.5 w-3.5' }: IconProps) {
  return (
    <IconSvg className={className}>
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M5 20h14" />
    </IconSvg>
  );
}

export function ClipboardIcon({ className = 'h-3.5 w-3.5' }: IconProps) {
  return (
    <IconSvg className={className}>
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z" />
    </IconSvg>
  );
}

function IconSvg({
  children,
  className,
  strokeLinejoin = 'round',
}: {
  children: ReactNode;
  className: string;
  strokeLinejoin?: 'round' | undefined;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin={strokeLinejoin}
      className={className}
    >
      {children}
    </svg>
  );
}
