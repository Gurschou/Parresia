import { redirect } from "next/navigation";
import { Brain, Quote, ScanSearch, Workflow } from "lucide-react";
import { auth } from "@/auth";
import { Logo } from "@/components/app/logo";

const FEATURES = [
  { icon: Workflow, title: "Strategier & TOTE", text: "Den mentale syntaks bag resultatet — trin for trin." },
  { icon: Brain, title: "Overbevisninger, værdier & behov", text: "Hvad der driver adfærden, og hvad det koster." },
  { icon: ScanSearch, title: "Mønstre på tværs af eksperter", text: "Sammenlign modeller og byg dit eget mønsterbibliotek." },
];

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (session?.user?.id) redirect("/");

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden border-r bg-sidebar lg:flex lg:flex-col">
        <div className="absolute inset-0 bg-aurora" />
        <div className="absolute inset-0 bg-grid opacity-60 [mask-image:radial-gradient(70%_60%_at_30%_30%,black,transparent)]" />
        <div className="relative flex flex-1 flex-col justify-between p-12">
          <Logo />
          <div className="max-w-lg">
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-primary">Advanced Behavioral Modeling</p>
            <h1 className="text-5xl font-semibold leading-[1.05] text-balance">
              Success leaves clues. <span className="italic text-primary">Find dem.</span>
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-muted-foreground text-pretty">
              Upload et interview, en optagelse eller et transskript — og få en evidensbaseret model af, hvordan en ekspert
              faktisk tænker, beslutter og handler.
            </p>
            <ul className="mt-10 space-y-5">
              {FEATURES.map((f) => (
                <li key={f.title} className="flex gap-4">
                  <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl border bg-card/80 shadow-sm backdrop-blur">
                    <f.icon className="size-5 text-primary" />
                  </span>
                  <div>
                    <div className="font-semibold">{f.title}</div>
                    <div className="text-sm text-muted-foreground">{f.text}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <figure className="max-w-md rounded-2xl border bg-card/70 p-5 shadow-sm backdrop-blur">
            <Quote className="size-5 text-primary/60" />
            <blockquote className="mt-2 font-serif text-lg italic leading-snug">
              “Se mødet for dig, før det sker. Og stop først, når det føles rigtigt.”
            </blockquote>
            <figcaption className="mt-3 text-xs font-semibold text-muted-foreground">
              Strategi: <span className="font-mono">Vᶜ → Ad → Kⁱ → Exit</span>
            </figcaption>
          </figure>
        </div>
      </aside>
      <main className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <Logo className="mb-10 lg:hidden" />
          {children}
        </div>
      </main>
    </div>
  );
}
