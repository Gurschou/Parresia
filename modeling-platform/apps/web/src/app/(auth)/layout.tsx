import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Logo } from "@/components/app/logo";
import { EXAMPLE_SPECIMEN, Specimen } from "@/components/report/specimen";

const FEATURES = [
  ["Strategier og TOTE", "Den mentale syntaks bag resultatet, trin for trin."],
  ["Overbevisninger, værdier og behov", "Hvad der driver adfærden, og hvad det koster."],
  ["Mønstre på tværs af eksperter", "Sammenlign modeller og byg dit eget mønsterbibliotek."],
] as const;

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (session?.user?.id) redirect("/");

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <aside className="hidden bg-sidebar text-sidebar-foreground lg:flex lg:flex-col">
        <div className="flex flex-1 flex-col justify-between gap-12 p-12">
          <Logo />
          <div className="max-w-xl">
            <p className="eyebrow mb-5 text-sidebar-muted">Advanced Behavioral Modeling</p>
            <h1 className="text-[3.4rem] leading-[0.98]">
              Fra det, de siger,
              <br />
              til det, de gør.
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-sidebar-muted text-pretty">
              Upload et interview, en optagelse eller et transskript, og få en evidensbaseret model af, hvordan en ekspert tænker, beslutter og handler.
            </p>
            <ul className="mt-10 grid gap-x-8 gap-y-5 border-t border-sidebar-border pt-8 sm:grid-cols-3">
              {FEATURES.map(([title, text]) => (
                <li key={title}>
                  <div className="font-semibold leading-snug">{title}</div>
                  <div className="mt-1 text-sm text-sidebar-muted">{text}</div>
                </li>
              ))}
            </ul>
          </div>
          <Specimen data={EXAMPLE_SPECIMEN} className="max-w-xl text-foreground" />
        </div>
      </aside>
      <main className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <Logo tone="ink" className="mb-10 lg:hidden" />
          {children}
        </div>
      </main>
    </div>
  );
}
