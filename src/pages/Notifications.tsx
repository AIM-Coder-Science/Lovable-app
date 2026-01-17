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
import { CheckCircle2, Clock, CreditCard, RefreshCw } from "lucide-react";

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
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
};

export default function Notifications() {
  const { role, user, loading } = useAuth();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isActing, setIsActing] = useState<string | null>(null);

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
    if (loading) return;
    if (!canView) return;
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
      toast({ title: "Erreur", description: "Transaction introuvable dans la notification", variant: "destructive" });
      return;
    }

    setIsActing(notification.id);

    const { data, error } = await supabase.functions.invoke("validate-cash-payment", {
      body: { transactionId: txId },
    });

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      setIsActing(null);
      return;
    }

    if (data?.error) {
      toast({ title: "Erreur", description: data.error, variant: "destructive" });
      setIsActing(null);
      return;
    }

    toast({
      title: "Paiement validé",
      description: "La transaction a été confirmée et l'apprenant sera notifié.",
    });

    // Mark this notification as read + refresh
    await supabase.from("notifications").update({ is_read: true }).eq("id", notification.id);
    await fetchNotifications();
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
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Notifications</h1>
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
              <p className="text-muted-foreground">Aucune notification.</p>
            ) : (
              <div className="space-y-4">
                {items.map((n) => {
                  const isPaymentRequest = n.type === "payment_request";
                  const busy = isActing === n.id;

                  return (
                    <div key={n.id} className={cn("rounded-lg border p-4", !n.is_read && "bg-muted/30")}> 
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold truncate">{n.title}</h3>
                            {!n.is_read ? (
                              <Badge variant="default">Nouveau</Badge>
                            ) : (
                              <Badge variant="secondary">Lu</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">{n.message}</p>
                          <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                            <Clock className="w-3.5 h-3.5" />
                            <span>{formatDateTime(n.created_at)}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {isPaymentRequest && (
                            <Button
                              size="sm"
                              className="gap-2"
                              onClick={() => validateCashPayment(n)}
                              disabled={busy}
                            >
                              <CreditCard className="w-4 h-4" />
                              Valider
                            </Button>
                          )}

                          {!n.is_read && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-2"
                              onClick={() => markAsRead(n.id)}
                              disabled={busy}
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              Lu
                            </Button>
                          )}
                        </div>
                      </div>

                      {isPaymentRequest && (
                        <>
                          <Separator className="my-4" />
                          <div className="text-xs text-muted-foreground">
                            Transaction: <span className="font-mono">{String(n.metadata?.transaction_id ?? "-")}</span>
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
