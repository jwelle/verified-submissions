import { useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldCheck, FileText, Loader2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { useScoreAndRoute, useScoreAndRouteFromText } from "@workspace/api-client-react";
import { useLeadStore } from "@/hooks/use-lead-store";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export default function LeadCheck() {
  const [mode, setMode] = useState<"url" | "text">("url");
  const [url, setUrl] = useState("");
  const [logText, setLogText] = useState("");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { setResult } = useLeadStore();

  const { mutateAsync: scoreUrl, isPending: isPendingUrl } = useScoreAndRoute();
  const { mutateAsync: scoreText, isPending: isPendingText } = useScoreAndRouteFromText();

  const isPending = isPendingUrl || isPendingText;

  // Strip any path/fragment beyond the certificate hash, e.g. /assets/#certificate
  const normalizeCertUrl = (raw: string): string => {
    try {
      const parsed = new URL(raw);
      if (!parsed.hostname.includes("trustedform.com")) return raw;
      const hash = parsed.pathname.split("/").filter(Boolean)[0] ?? "";
      return hash ? `https://cert.trustedform.com/${hash}` : raw;
    } catch {
      return raw;
    }
  };

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // Auto-normalize as user types/pastes — strip any path after the hash
    if (raw.includes("trustedform.com/") && raw.length > 50) {
      setUrl(normalizeCertUrl(raw));
    } else {
      setUrl(raw);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      let data: any;
      if (mode === "url") {
        if (!url) {
          toast({ title: "Validation Error", description: "Please enter a certificate URL", variant: "destructive" });
          return;
        }
        if (!url.startsWith("https://cert.trustedform.com")) {
          toast({ title: "Validation Error", description: "Must be a valid TrustedForm URL (https://cert.trustedform.com/...)", variant: "destructive" });
          return;
        }
        data = await scoreUrl({ data: { certificate_url: normalizeCertUrl(url) } });
      } else {
        if (!logText.trim()) {
          toast({ title: "Validation Error", description: "Please paste the event log text", variant: "destructive" });
          return;
        }
        data = await scoreText({ data: { event_log_text: logText, certificate_url: url ? normalizeCertUrl(url) : undefined } });
      }

      // API returned ok: false (e.g. cert not found) — show readable error, don't navigate
      if (data && data.ok === false) {
        toast({
          title: "Certificate Error",
          description: data.error ?? data.claim_result?.error ?? "The certificate could not be claimed.",
          variant: "destructive",
        });
        return;
      }

      setResult(data);
      setLocation("/results");
    } catch (error: any) {
      toast({
        title: "Check Failed",
        description: error.message || "An unexpected error occurred while scoring the lead.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8 min-h-screen">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="w-full max-w-xl"
      >
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-6 border border-primary/20 shadow-[0_0_30px_rgba(var(--primary),0.15)]">
            <ShieldCheck className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-display font-bold text-foreground mb-3">
            Lead Integrity Checker
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base max-w-sm mx-auto">
            Evaluate TrustedForm data to detect fraud, ensure compliance, and route leads intelligently.
          </p>
        </div>

        <Card className="bg-card/60 backdrop-blur-xl border-border/50 shadow-2xl shadow-black/40 overflow-hidden">
          <CardContent className="p-6 sm:p-8">
            <div className="flex p-1 bg-background/80 rounded-xl mb-8 border border-border/30 shadow-inner">
              <button 
                type="button"
                className={cn(
                  "flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all duration-300 flex items-center justify-center gap-2", 
                  mode === "url" 
                    ? "bg-card text-foreground shadow-md border border-border/50" 
                    : "text-muted-foreground hover:text-foreground hover:bg-card/50"
                )}
                onClick={() => setMode("url")}
              >
                <Zap className="w-4 h-4" /> Live Certificate
              </button>
              <button 
                type="button"
                className={cn(
                  "flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all duration-300 flex items-center justify-center gap-2", 
                  mode === "text" 
                    ? "bg-card text-foreground shadow-md border border-border/50" 
                    : "text-muted-foreground hover:text-foreground hover:bg-card/50"
                )}
                onClick={() => setMode("text")}
              >
                <FileText className="w-4 h-4" /> Event Log
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <AnimatePresence mode="wait">
                {mode === "url" ? (
                  <motion.div 
                    key="url"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-3"
                  >
                    <label className="text-sm font-semibold text-foreground/90 pl-1">TrustedForm URL</label>
                    <Input 
                      placeholder="https://cert.trustedform.com/..." 
                      value={url} 
                      onChange={handleUrlChange}
                      className="bg-background/50 border-border/50 h-14 text-base px-4 focus-visible:ring-primary/30 focus-visible:border-primary/50"
                    />
                  </motion.div>
                ) : (
                  <motion.div 
                    key="text"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-5"
                  >
                    <div className="space-y-3">
                      <label className="text-sm font-semibold text-foreground/90 pl-1">Event Log Text</label>
                      <Textarea 
                        placeholder="Paste raw event log here..." 
                        value={logText} 
                        onChange={e => setLogText(e.target.value)}
                        className="bg-background/50 border-border/50 min-h-[160px] font-mono text-xs p-4 focus-visible:ring-primary/30"
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="text-sm font-semibold text-foreground/90 pl-1">
                        Reference URL <span className="text-muted-foreground font-normal">(Optional)</span>
                      </label>
                      <Input 
                        placeholder="https://cert.trustedform.com/..." 
                        value={url} 
                        onChange={e => setUrl(e.target.value)}
                        className="bg-background/50 border-border/50 h-12"
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <Button 
                type="submit" 
                disabled={isPending}
                className="w-full h-14 text-base font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5 transition-all duration-300 rounded-xl"
              >
                {isPending ? (
                  <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Analyzing Lead...</>
                ) : (
                  <><ShieldCheck className="w-5 h-5 mr-2" /> Check Lead Quality</>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
