import React, { createContext, useContext, useEffect, useState } from "react";

const ONBOARDED_KEY = "antiloki:onboarded";

type Ctx = {
  onboarded: boolean;
  tourStep: number; // -1 = inactive, 0..3 = active step
  startTour: () => void;
  nextStep: () => void;
  endTour: () => void;
  skip: () => void;
};

const OnboardingCtx = createContext<Ctx | null>(null);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [onboarded, setOnboarded] = useState(true); // SSR-safe default
  const [tourStep, setTourStep] = useState(-1);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setOnboarded(window.localStorage?.getItem(ONBOARDED_KEY) === "1");
  }, []);

  const persist = () => {
    if (typeof window !== "undefined") window.localStorage?.setItem(ONBOARDED_KEY, "1");
    setOnboarded(true);
  };

  const startTour = () => { setTourStep(0); };
  const nextStep = () => {
    setTourStep(s => {
      const n = s + 1;
      if (n >= 4) { persist(); return -1; }
      return n;
    });
  };
  const endTour = () => { setTourStep(-1); persist(); };
  const skip = () => { persist(); setTourStep(-1); };

  return (
    <OnboardingCtx.Provider value={{ onboarded, tourStep, startTour, nextStep, endTour, skip }}>
      {children}
    </OnboardingCtx.Provider>
  );
}

export function useOnboarding() {
  const v = useContext(OnboardingCtx);
  if (!v) throw new Error("useOnboarding must be used inside OnboardingProvider");
  return v;
}

const STEPS = [
  { title: "The logo opens the menu", body: "The a. at the right of the bottom bar opens spaces, threads, agents, sagas, search and settings. Ctrl+Space is the leader key: then T opens a terminal, A an agent, B a browser, F files, 1 to 0 a thread, and Up and Down roll the thread dial." },
  { title: "Panes are your workspace", body: "Terminals, agents, specialists, a light or full browser, Files and your apps (Linear, Notion, GitHub) sit side by side in a thread. + opens the menu: a specialist an agent made waits there for your approval, and models on this machine work as agents too." },
  { title: "Teams are graphs you can read", body: "Talk to a team's Leader (Chat), then see it drawn (Graph), read what it writes (Editor) or its order over time (Sequence). The small numbers on the nodes are the order and each branch has its own colour. The DNA icon improves the team by experiment, the bee tests several ideas at once." },
  { title: "The bottom bar is the meter", body: "Left: the time and cost of the team you are in; click it for the full waterfall. Right: each AI's limits and the machine. If memory or CPU runs short, background runs pause and continue by themselves." },
];

export function TourOverlay() {
  const { tourStep, nextStep, skip } = useOnboarding();
  if (tourStep < 0 || tourStep >= STEPS.length) return null;
  const step = STEPS[tourStep];

  return (
    <>
      <div
        onClick={nextStep}
        style={{
          position: "fixed", inset: 0, background: "oklch(0 0 0 / 0.45)", zIndex: 300,
        }}
      />
      <div style={{
        position: "fixed",
        bottom: 32, left: "50%", transform: "translateX(-50%)",
        background: "oklch(0.19 0.006 250)",
        border: "1px solid oklch(0.78 0.16 295)",
        borderRadius: 12, padding: 18,
        width: 460, maxWidth: "92vw", zIndex: 310,
        boxShadow: "0 24px 60px -12px rgba(0,0,0,.7)",
        color: "oklch(0.94 0.005 250)",
        fontFamily: '-apple-system, system-ui, sans-serif',
      }}>
        <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{
              flex: 1, height: 3, borderRadius: 2,
              background: i <= tourStep ? "oklch(0.78 0.16 295)" : "oklch(0.32 0.012 250)",
            }} />
          ))}
        </div>
        <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: "oklch(0.55 0.02 250)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
          tour · {tourStep + 1} of {STEPS.length}
        </div>
        <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0, marginBottom: 8 }}>{step.title}</h3>
        <p style={{ color: "oklch(0.68 0.02 250)", fontSize: 13, margin: 0, marginBottom: 16, lineHeight: 1.5 }}>{step.body}</p>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button onClick={nextStep} style={{
            background: "oklch(0.78 0.16 295)", color: "oklch(0.14 0.005 250)",
            border: "none", borderRadius: 8, padding: "8px 14px",
            cursor: "pointer", fontFamily: '"JetBrains Mono", monospace', fontSize: 11, fontWeight: 600,
          }}>{tourStep === STEPS.length - 1 ? "done" : "next →"}</button>
          <button onClick={skip} style={{
            background: "transparent", color: "oklch(0.55 0.02 250)",
            border: "none", padding: "8px 12px",
            cursor: "pointer", fontFamily: '"JetBrains Mono", monospace', fontSize: 11,
            marginLeft: "auto",
          }}>skip tour</button>
        </div>
      </div>
    </>
  );
}
