import { motion } from "framer-motion";

export function ScoreRing({ score, status }: { score: number; status: string }) {
  const radius = 64;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  let strokeColor = "text-emerald-500";
  let dropShadowColor = "drop-shadow-[0_0_12px_rgba(16,185,129,0.4)]";
  
  if (status === "review") {
    strokeColor = "text-amber-500";
    dropShadowColor = "drop-shadow-[0_0_12px_rgba(245,158,11,0.4)]";
  } else if (status === "reject") {
    strokeColor = "text-rose-500";
    dropShadowColor = "drop-shadow-[0_0_12px_rgba(244,63,94,0.4)]";
  }

  return (
    <div className="relative flex items-center justify-center w-48 h-48 mx-auto">
      <svg className="w-full h-full transform -rotate-90 overflow-visible">
        <circle
          cx="96" cy="96" r={radius}
          className="stroke-muted/30 fill-none" 
          strokeWidth="10"
        />
        <motion.circle
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 1.5, ease: "easeOut", delay: 0.2 }}
          cx="96" cy="96" r={radius}
          className={`${strokeColor} fill-none ${dropShadowColor}`}
          strokeWidth="10"
          strokeDasharray={circumference}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center">
        <motion.span 
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="text-6xl font-display font-bold text-foreground tracking-tight"
        >
          {score}
        </motion.span>
      </div>
    </div>
  );
}
