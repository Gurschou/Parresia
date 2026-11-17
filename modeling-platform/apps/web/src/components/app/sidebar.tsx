"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useTheme } from "next-themes";
import {
  BarChart3,
  ChevronsUpDown,
  Columns3,
  FileText,
  Home,
  Library,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Plus,
  Sun,
  Users,
} from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";
import { Logo } from "./logo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const NAV = [
  { href: "/", label: "Oversigt", icon: Home, exact: true },
  { href: "/analyses", label: "Analyser", icon: FileText },
  { href: "/experts", label: "Eksperter", icon: Users },
  { href: "/compare", label: "Sammenlign", icon: Columns3 },
  { href: "/patterns", label: "Mønsterbibliotek", icon: Library },
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
] as const;

function isActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  if (href === "/analyses") return pathname === "/analyses" || (pathname.startsWith("/analyses/") && pathname !== "/analyses/new");
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      <Link
        href="/analyses/new"
        onClick={onNavigate}
        className={cn(
          "mb-3 flex items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/25 transition hover:bg-primary/90",
          pathname === "/analyses/new" && "ring-2 ring-primary/30 ring-offset-2 ring-offset-sidebar",
        )}
      >
        <Plus className="size-4" /> Ny analyse
      </Link>
      {NAV.map((item) => {
        const active = isActive(pathname, item.href, "exact" in item ? item.exact : false);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground",
              active && "bg-sidebar-accent font-semibold text-foreground",
            )}
          >
            <item.icon className={cn("size-[18px] transition-colors", active ? "text-primary" : "group-hover:text-foreground")} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function UserMenu({ user, signOutAction }: { user: { name: string; email: string }; signOutAction: () => Promise<void> }) {
  const { setTheme, theme } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center gap-3 rounded-xl p-2 text-left outline-none transition hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring/40">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-series-7 text-xs font-bold text-white">
          {initials(user.name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{user.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
        </span>
        <ChevronsUpDown className="size-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-60">
        <DropdownMenuLabel>Tema</DropdownMenuLabel>
        {(
          [
            ["light", "Lyst", Sun],
            ["dark", "Mørkt", Moon],
            ["system", "Følg systemet", Monitor],
          ] as const
        ).map(([value, label, Icon]) => (
          <DropdownMenuItem key={value} onSelect={() => setTheme(value)} className={cn(theme === value && "font-semibold")}>
            <Icon /> {label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => void signOutAction()}>
          <LogOut /> Log ud
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Sidebar({ user, signOutAction }: { user: { name: string; email: string }; signOutAction: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {/* Desktop */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="px-5 pb-6 pt-6">
          <Link href="/">
            <Logo />
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto px-3">
          <NavLinks />
        </div>
        <div className="border-t border-sidebar-border p-3">
          <UserMenu user={user} signOutAction={signOutAction} />
        </div>
      </aside>

      {/* Mobil */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-background/85 px-4 backdrop-blur lg:hidden">
        <Link href="/">
          <Logo />
        </Link>
        <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
          <DialogPrimitive.Trigger className="rounded-lg p-2 hover:bg-muted" aria-label="Åbn menu">
            <Menu className="size-5" />
          </DialogPrimitive.Trigger>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
            <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-sidebar p-4 shadow-2xl data-[state=open]:animate-in data-[state=open]:slide-in-from-left">
              <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
              <Logo className="mb-6 px-2" />
              <div className="flex-1">
                <NavLinks onNavigate={() => setOpen(false)} />
              </div>
              <UserMenu user={user} signOutAction={signOutAction} />
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
      </header>
    </>
  );
}
