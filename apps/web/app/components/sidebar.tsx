"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ChatIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path
      d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const DashboardIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M12 20V10" strokeLinecap="round" />
    <path d="M18 20V4" strokeLinecap="round" />
    <path d="M6 20v-4" strokeLinecap="round" />
  </svg>
);

const BoltIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path
      d="M13 2 3 14h7l-1 8 10-12h-7l1-8z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ClipboardIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <rect x="5" y="4" width="14" height="17" rx="2" />
    <path d="M9 4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2" />
    <path d="M9 11h6M9 15h4" strokeLinecap="round" />
  </svg>
);

const links = [
  { href: "/", label: "Samtale", icon: ChatIcon },
  { href: "/dashboard", label: "Dashboard", icon: DashboardIcon },
  { href: "/intake", label: "SynapseX · Intake", icon: BoltIcon },
  { href: "/briefings", label: "Coach-briefings", icon: ClipboardIcon },
];

const loop = [
  "Mønster",
  "Forståelse",
  "Skifte",
  "Handling",
  "Refleksion",
  "Vækst",
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-orb" />
        <span className="gradient-text">SYNAPSE</span>
      </div>
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={`nav-link${pathname === link.href ? " active" : ""}`}
        >
          {link.icon}
          {link.label}
        </Link>
      ))}
      <div className="sidebar-footer">
        <div className="loop-title">Transformationsloop</div>
        <div className="loop-steps">
          {loop.map((step) => (
            <span className="loop-step" key={step}>
              {step}
            </span>
          ))}
        </div>
      </div>
    </aside>
  );
}
