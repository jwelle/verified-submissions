export function GlowBackground() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10 bg-background">
      <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-primary/10 blur-[120px] animate-pulse" style={{ animationDuration: '8s' }} />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-blue-600/10 blur-[120px] animate-pulse" style={{ animationDuration: '10s' }} />
      <div className="absolute top-[30%] left-[50%] w-[40%] h-[40%] rounded-full bg-indigo-500/5 blur-[100px]" />
      <div className="absolute inset-0 bg-grain opacity-[0.04] mix-blend-overlay"></div>
    </div>
  );
}
