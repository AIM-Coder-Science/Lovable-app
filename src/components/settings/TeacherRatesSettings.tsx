import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Pencil, Save, X, Briefcase } from "lucide-react";

interface TeacherRate {
  id: string;
  rate_type: string;
  hourly_rate: number;
  description: string | null;
}

export const TeacherRatesSettings = () => {
  const [rates, setRates] = useState<TeacherRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRate, setEditRate] = useState("");

  const fetchRates = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('teacher_rates')
      .select('*')
      .eq('is_active', true)
      .order('rate_type', { ascending: true });

    setRates(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchRates();
  }, []);

  const handleSave = async (rate: TeacherRate) => {
    const hourlyRate = parseFloat(editRate) || 0;

    const { error } = await supabase
      .from('teacher_rates')
      .update({ hourly_rate: hourlyRate })
      .eq('id', rate.id);

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Succès", description: "Taux horaire mis à jour" });
    setEditingId(null);
    fetchRates();
  };

  const getRateLabel = (type: string) => {
    switch (type) {
      case 'titulaire': return 'Enseignant Titulaire';
      case 'vacataire': return 'Enseignant Vacataire';
      default: return type;
    }
  };

  if (loading) {
    return <div className="text-muted-foreground text-center py-4">Chargement...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Briefcase className="w-5 h-5" />
          Taux Horaires Enseignants
        </CardTitle>
        <CardDescription>
          Définissez le montant par heure selon le type d'enseignant
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {rates.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              Aucun taux configuré.
            </p>
          ) : (
            rates.map((rate) => (
              <div
                key={rate.id}
                className="flex items-center justify-between p-4 rounded-lg border border-border bg-muted/30"
              >
                <div>
                  <p className="font-medium">{getRateLabel(rate.rate_type)}</p>
                  {rate.description && (
                    <p className="text-sm text-muted-foreground">{rate.description}</p>
                  )}
                </div>

                {editingId === rate.id ? (
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={editRate}
                      onChange={(e) => setEditRate(e.target.value)}
                      className="w-32"
                      placeholder="Montant"
                    />
                    <span className="text-sm text-muted-foreground">FCFA/h</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleSave(rate)}
                    >
                      <Save className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setEditingId(null)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-primary text-lg">
                      {rate.hourly_rate.toLocaleString()} FCFA/h
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        setEditingId(rate.id);
                        setEditRate(rate.hourly_rate.toString());
                      }}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
};
