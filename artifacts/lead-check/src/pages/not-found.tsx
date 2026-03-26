import { ShieldAlert } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

export default function NotFound() {
  const [, setLocation] = useLocation();
  
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 text-center min-h-screen">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center"
      >
        <div className="w-20 h-20 rounded-2xl bg-card border border-border/50 shadow-xl flex items-center justify-center mb-8 relative">
          <div className="absolute inset-0 bg-primary/10 rounded-2xl animate-pulse" />
          <ShieldAlert className="w-10 h-10 text-muted-foreground relative z-10" />
        </div>
        <h1 className="text-4xl font-display font-bold text-foreground mb-3 tracking-tight">404</h1>
        <p className="text-lg text-muted-foreground max-w-md mb-8">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Button 
          onClick={() => setLocation("/")}
          className="h-12 px-8 text-base font-semibold shadow-lg shadow-primary/20 hover:-translate-y-0.5 transition-all duration-300"
        >
          Back to Dashboard
        </Button>
      </motion.div>
    </div>
  );
}
