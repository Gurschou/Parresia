"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Samtale" },
  { href: "/dashboard", label: "Dashboard" },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-dot" />
        SYNAPSE
      </div>
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={`nav-link${pathname === link.href ? " active" : ""}`}
        >
          {link.label}
        </Link>
      ))}
      <div className="sidebar-footer">
        Mønster → Forståelse → Skifte → Handling → Refleksion → Vækst
      </div>
    </aside>
  );
}
