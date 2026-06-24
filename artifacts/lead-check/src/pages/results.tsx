import { useEffect } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import type { Variants } from "framer-motion";
import { useLeadStore } from "@/hooks/use-lead-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  ShieldAlert, ShieldCheck, AlertTriangle, CheckCircle2, XCircle, 
  User, Mail, Phone, MapPin, Building2, Copy, ArrowLeft, 
  Activity, Database, Send, Code, ChevronDown, MonitorPlay, MousePointerClick
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ScoreRing } from "@/components/score-ring";
import { cn } from "@/lib/utils";

// Helper components
function InfoItem({ icon: Icon, label, value }: { icon: any, label: string, value?: string | number | null }) {
  return (
    <div className="flex items-start gap-3 p-3.5 rounded-xl bg-background/40 border border-border/30 hover:bg-background/60 transition-colors">
      <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
        <Icon className="w-4 h-4" />
      </div>
      <div className="overflow-hidden">
        <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider mb-0.5">{label}</p>
        <p className="text-sm text-foreground font-medium truncate" title={value?.toString() || ""}>
          {value || <span className="text-muted-foreground/50 italic font-normal">Not extracted</span>}
        </p>
      </div>
    </div>
  );
}

function MetricItem({ label, value }: { label: string, value: any }) {
  return (
    <div className="flex flex-col p-4 rounded-xl bg-background/40 border border-border/30 text-center hover:bg-background/60 transition-colors">
      <span className="text-2xl font-display font-bold text-foreground mb-1">{value ?? '-'}</span>
      <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">{label}</span>
    </div>
  );
}

export default function Results() {
  const { result } = useLeadStore();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    if (!result) {
      setLocation("/");
    }
  }, [result, setLocation]);

  if (!result) return null;

  const { parsed_lead, score, routing, sheet_result, webhook_result } = result;

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(result, null, 2));
    toast({ title: "Copied to Clipboard", description: "Raw JSON payload has been copied." });
  };

  const statusColor = 
    score?.status === 'approved' ? 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' :
    score?.status === 'review' ? 'text-amber-500 bg-amber-500/10 border-amber-500/20' :
    'text-rose-500 bg-rose-500/10 border-rose-500/20';

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
  };

  return (
    <div className="flex-1 w-full max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 min-h-screen pb-20">
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8 pt-4"
      >
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Evaluation Results</h1>
          <p className="text-muted-foreground mt-1">Detailed integrity analysis and routing decisions.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={handleCopy} className="bg-card/50 backdrop-blur-sm border-border/50 hover:bg-muted/80">
            <Copy className="w-4 h-4 mr-2" /> Copy JSON
          </Button>
          <Button onClick={() => setLocation("/")} className="shadow-lg shadow-primary/20">
            <ArrowLeft className="w-4 h-4 mr-2" /> New Check
          </Button>
        </div>
      </motion.div>

      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 lg:grid-cols-12 gap-6"
      >
        {/* LEFT COLUMN */}
        <div className="space-y-6 lg:col-span-4">
          <motion.div variants={itemVariants}>
            <Card className="bg-card/40 border-border/40 backdrop-blur-md overflow-hidden shadow-xl shadow-black/20">
              <CardContent className="p-8 flex flex-col items-center text-center">
                <ScoreRing score={score?.value ?? 0} status={score?.status ?? 'reject'} />
                
                <div className="mt-8 w-full space-y-3">
                  <div className="flex justify-between items-center py-3 border-b border-border/30">
                    <span className="text-muted-foreground text-sm font-medium">Final Status</span>
                    <Badge variant="outline" className={cn("uppercase tracking-wider font-bold px-3 py-1 text-xs", statusColor)}>
                      {score?.status}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center py-3 border-b border-border/30">
                    <span className="text-muted-foreground text-sm font-medium">Confidence Level</span>
                    <Badge variant="outline" className="capitalize bg-background/50 border-border/50 text-foreground/80">
                      {score?.confidence}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={itemVariants}>
            <Card className="bg-card/40 border-border/40 backdrop-blur-md shadow-lg shadow-black/10">
              <CardHeader className="pb-4 border-b border-border/20">
                <CardTitle className="text-base font-display flex items-center gap-2">
                  <Send className="w-4 h-4 text-primary" /> System Routing
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-background/40 rounded-xl border border-border/30">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Decision</p>
                    <p className="text-sm font-semibold font-mono text-foreground">{routing?.decision}</p>
                  </div>
                  <div className="p-3 bg-background/40 rounded-xl border border-border/30">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Destination</p>
                    <p className="text-sm font-semibold text-foreground capitalize">{routing?.destination?.replace(/_/g, ' ')}</p>
                  </div>
                </div>
                {routing?.notes && routing.notes.length > 0 && (
                  <div className="p-4 bg-primary/5 rounded-xl border border-primary/10 space-y-2.5 mt-2">
                    <p className="text-xs font-semibold text-primary uppercase tracking-wider">Routing Notes</p>
                    {routing.notes.map((note, i) => (
                      <div key={i} className="text-sm text-foreground/80 flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-0.5 text-primary shrink-0" />
                        <span>{note}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-6 lg:col-span-8">
          
          <motion.div variants={itemVariants}>
            <Card className="bg-card/40 border-border/40 backdrop-blur-md shadow-lg shadow-black/10">
              <CardHeader className="pb-4 border-b border-border/20 flex flex-row items-center justify-between">
                <CardTitle className="text-base font-display flex items-center gap-2">
                  <User className="w-4 h-4 text-primary" /> Contact Profile
                </CardTitle>
                <Badge variant="outline" className="bg-background/50 font-normal">
                  Source: {parsed_lead?.lead_source || 'Unknown'}
                </Badge>
              </CardHeader>
              <CardContent className="pt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                <InfoItem icon={User} label="Full Name" value={`${parsed_lead?.first_name || ''} ${parsed_lead?.last_name || ''}`.trim() || null} />
                <InfoItem icon={Mail} label="Email Address" value={parsed_lead?.email} />
                <InfoItem icon={Phone} label="Phone Number" value={parsed_lead?.phone} />
                <InfoItem icon={MapPin} label="Address" value={parsed_lead?.address_full} />
                <InfoItem icon={Building2} label="Business Name" value={parsed_lead?.business_name} />
                <InfoItem icon={User} label="Company Size" value={parsed_lead?.employee_count ? `${parsed_lead.employee_count} employees` : null} />
              </CardContent>
            </Card>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <motion.div variants={itemVariants} className="h-full">
              <Card className="bg-card/40 border-border/40 backdrop-blur-md shadow-lg shadow-black/10 h-full">
                <CardHeader className="pb-4 border-b border-border/20">
                  <CardTitle className="text-base font-display flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-primary" /> Compliance
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-xl bg-background/40 border border-border/30">
                    <span className="text-sm font-medium text-foreground">Consent Detected</span>
                    {parsed_lead?.consent_detected ? (
                      <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 px-3 py-1"><CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Confirmed</Badge>
                    ) : (
                      <Badge variant="destructive" className="bg-rose-500/10 text-rose-500 border-rose-500/20 px-3 py-1"><XCircle className="w-3.5 h-3.5 mr-1.5" /> Missing</Badge>
                    )}
                  </div>
                  <div className="p-4 rounded-xl bg-background/40 border border-border/30">
                    <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider font-medium">Certificate ID</p>
                    <p className="text-sm font-mono text-foreground break-all">{parsed_lead?.certificate_id || 'Not available'}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-xl bg-background/40 border border-border/30">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Session Started</p>
                      <p className="text-xs font-medium truncate">{parsed_lead?.certificate_created_at || '-'}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-background/40 border border-border/30">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Form Submitted</p>
                      <p className="text-xs font-medium truncate">{parsed_lead?.submitted_at || '-'}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div variants={itemVariants} className="h-full">
              <Card className="bg-card/40 border-border/40 backdrop-blur-md shadow-lg shadow-black/10 h-full">
                <CardHeader className="pb-4 border-b border-border/20">
                  <CardTitle className="text-base font-display flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500" /> Risks & Findings
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-6">
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Detected Flags</h4>
                    {score?.risk_flags && score.risk_flags.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {score.risk_flags.map(flag => (
                          <Badge key={flag} variant="destructive" className="bg-rose-500/10 text-rose-500 border-rose-500/20 font-medium">
                            {flag.replace(/_/g, ' ')}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <div className="p-3 rounded-xl border border-dashed border-emerald-500/30 bg-emerald-500/5 text-emerald-500 text-sm flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4" /> No risk flags detected
                      </div>
                    )}
                  </div>
                  
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Score Explanations</h4>
                    <ul className="space-y-2.5">
                      {score?.explanations?.map((exp, i) => (
                        <li key={i} className="flex items-start gap-2.5 text-sm text-foreground/80 bg-background/30 p-2.5 rounded-lg border border-border/20">
                          <Activity className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                          <span className="leading-snug">{exp}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          <motion.div variants={itemVariants}>
            <Card className="bg-card/40 border-border/40 backdrop-blur-md shadow-lg shadow-black/10">
              <CardHeader className="pb-4 border-b border-border/20">
                <CardTitle className="text-base font-display flex items-center gap-2">
                  <MonitorPlay className="w-4 h-4 text-primary" /> Session Activity Metrics
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 grid grid-cols-2 md:grid-cols-5 gap-3">
                <MetricItem label="Seconds" value={score?.metrics?.session_seconds ?? '-'} />
                <MetricItem label="Interactions" value={score?.metrics?.meaningful_event_count} />
                <MetricItem label="Repeats" value={score?.metrics?.repeated_field_edit_count} />
                <MetricItem label="Resizes" value={score?.metrics?.resize_event_count} />
                <MetricItem label="Slider Moves" value={score?.metrics?.slider_change_count} />
              </CardContent>
            </Card>
          </motion.div>

          {(sheet_result || webhook_result) && (
            <motion.div variants={itemVariants}>
              <Card className="bg-card/40 border-border/40 backdrop-blur-md shadow-lg shadow-black/10">
                <CardHeader className="pb-4 border-b border-border/20">
                  <CardTitle className="text-base font-display flex items-center gap-2">
                    <Database className="w-4 h-4 text-primary" /> Integrations Status
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {sheet_result && (
                    <div className="p-4 rounded-xl bg-background/40 border border-border/30">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-semibold">Google Sheets</span>
                        <Badge variant="outline" className={sheet_result.success ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-rose-500/10 text-rose-500 border-rose-500/20"}>
                          {sheet_result.success ? "Appended" : "Failed"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground font-mono truncate bg-black/40 p-2 rounded border border-border/20">
                        {sheet_result.row_id || sheet_result.error || "No details available"}
                      </p>
                    </div>
                  )}
                  {webhook_result && (
                    <div className="p-4 rounded-xl bg-background/40 border border-border/30">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-semibold">Outbound Webhook</span>
                        <Badge variant="outline" className={webhook_result.success ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-rose-500/10 text-rose-500 border-rose-500/20"}>
                          {webhook_result.success ? "Delivered" : "Failed"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground font-mono truncate bg-black/40 p-2 rounded border border-border/20">
                        {webhook_result.status_code ? `HTTP ${webhook_result.status_code}` : webhook_result.error || "No details available"}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}

          <motion.div variants={itemVariants}>
            <Collapsible className="border border-border/40 rounded-xl overflow-hidden bg-card/40 backdrop-blur-md shadow-lg shadow-black/10">
              <CollapsibleTrigger className="flex items-center justify-between w-full p-5 hover:bg-muted/30 transition-colors group">
                <div className="flex items-center gap-2 font-display font-semibold">
                  <Code className="w-4 h-4 text-primary group-hover:text-primary/80 transition-colors" />
                  Raw Output & Developer Data
                </div>
                <ChevronDown className="w-5 h-5 text-muted-foreground group-data-[state=open]:rotate-180 transition-transform duration-300" />
              </CollapsibleTrigger>
              <CollapsibleContent className="p-5 border-t border-border/20 bg-background/50">
                <pre className="text-[11px] font-mono text-muted-foreground overflow-auto p-4 rounded-lg bg-black/60 border border-border/30 max-h-[400px] shadow-inner">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </CollapsibleContent>
            </Collapsible>
          </motion.div>

        </div>
      </motion.div>
    </div>
  );
}
