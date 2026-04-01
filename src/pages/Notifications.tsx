import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { CheckCheck, Clock, CreditCard, RefreshCw, Bell } from "lucide-react";

type NotificationRow = {
  id: string;
  created_at: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  metadata: any;
  user_id: string;
};

const formatDateTime = (iso: string) => {
  try {
    return new Date(iso).toLocaleString("fr-FR");
  } catch {
    return iso;
  }
};

export default function Notifications() {
  const { role, user, loading } = useAuth();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isActing, setIsActing] = useState<string | null>(null);
  const [validatedIds, setValidatedIds] = useState<Set<string>>(new Set());

  const canView = role === "admin";

  const unreadCount = useMemo(() => items.filter((n) => !n.is_read).length, [items]);

  const fetchNotifications = useCallback(async () => {
    if (!user?.id) return;
    setIsLoading(true);
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Erreur", description: "Impossible de charger les notifications", variant: "destructive" });
      setIsLoading(false);
      return;
    }
    setItems((data as NotificationRow[]) || []);
    setIsLoading(false);
  }, [user?.id]);

  useEffect(() => {
    if (loading || !canView) return;
    fetchNotifications();
  }, [loading, canView, fetchNotifications]);

  const markAsRead = async (id: string) => {
    setIsActing(id);
    const { error } = await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    if (error) {
      toast({ title: "Erreur", description: "Impossible de marquer comme lu", variant: "destructive" });
      setIsActing(null);
      return;
    }
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    setIsActing(null);
  };

  const validateCashPayment = async (notification: NotificationRow) => {
    const txId = notification?.metadata?.transaction_id;
    if (!txId) {
      toast({ title: "Erreur", description: "Transaction introuvable", variant: "destructive" });
      return;
    }
    setIsActing(notification.id);
    const { data, error } = await supabase.functions.invoke("validate-cash-payment", {
      body: { transactionId: txId },
    });
    if (error || data?.error) {
      toast({ title: "Erreur", description: error?.message || data?.error, variant: "destructive" });
      setIsActing(null);
      return;
    }
    toast({ title: "Paiement validé", description: "La transaction a été confirmée." });
    setValidatedIds((prev) => new Set(prev).add(notification.id));
    await supabase.from("notifications").update({ is_read: true }).eq("id", notification.id);
    setItems((prev) => prev.map((n) => (n.id === notification.id ? { ...n, is_read: true } : n)));
    setIsActing(null);
  };

  if (!canView && !loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Cette page est réservée aux administrateurs.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-2">
              <Bell className="w-7 h-7 text-primary" />
              Notifications
            </h1>
            <p className="text-muted-foreground mt-1">Demandes en cours, paiements à valider, etc.</p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={unreadCount > 0 ? "default" : "secondary"}>
              {unreadCount} non lue{unreadCount > 1 ? "s" : ""}
            </Badge>
            <Button variant="outline" className="gap-2" onClick={fetchNotifications} disabled={isLoading}>
              <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
              Actualiser
            </Button>
          </div>
        </header>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Boîte de réception</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-10">
                <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              </div>
            ) : items.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">Aucune notification.</p>
            ) : (
              <div className="space-y-3">
                {items.map((n) => {
                  const isPaymentRequest = n.type === "payment_request";
                  const busy = isActing === n.id;
                  const alreadyValidated = validatedIds.has(n.id);
                  const needsValidation = isPaymentRequest && !alreadyValidated;

                  return (
                    <div
                      key={n.id}
                      className={cn(
                        "rounded-xl border p-4 transition-all duration-300",
                        !n.is_read
                          ? "bg-primary/5 border-primary/20 shadow-sm"
                          : "bg-muted/20 border-border/50"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className={cn("font-semibold truncate", n.is_read && "text-muted-foreground")}>{n.title}</h3>
                            {!n.is_read ? (
                              <Badge variant="default" className="text-[10px] px-1.5 py-0">Nouveau</Badge>
                            ) : (
                              <span className="inline-flex items-center gap-0.5 text-primary">
                                <CheckCheck className="w-4 h-4" />
                              </span>
                            )}
                            {alreadyValidated && (
                              <Badge className="bg-emerald-500 text-[10px] px-1.5 py-0">Validé ✓</Badge>
                            )}
                          </div>
                          <p className={cn("text-sm mt-1", n.is_read ? "text-muted-foreground/70" : "text-muted-foreground")}>{n.message}</p>
                          <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground/60">
                            <Clock className="w-3 h-3" />
                            <span>{formatDateTime(n.created_at)}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {needsValidation && (
                            <Button
                              size="sm"
                              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                              onClick={() => validateCashPayment(n)}
                              disabled={busy}
                            >
                              <CreditCard className="w-3.5 h-3.5" />
                              Valider
                            </Button>
                          )}

                          {!n.is_read && !needsValidation && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="gap-1.5 text-xs"
                              onClick={() => markAsRead(n.id)}
                              disabled={busy}
                            >
                              <CheckCheck className="w-3.5 h-3.5" />
                              Marquer lu
                            </Button>
                          )}
                        </div>
                      </div>

                      {isPaymentRequest && (
                        <>
                          <Separator className="my-3" />
                          <div className="text-xs text-muted-foreground/60">
                            Transaction : <span className="font-mono">{String(n.metadata?.transaction_id ?? "-")}</span>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
