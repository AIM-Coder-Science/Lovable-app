import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import { Pencil, Save, X } from "lucide-react";

interface ClassFee {
  id: string;
  class_id: string;
  class_name: string;
  class_level: string;
  amount: number;
  description: string;
}

export const ClassFeesSettings = () => {
  const { settings } = useSchoolSettings();
  const [classFees, setClassFees] = useState<ClassFee[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");

  const fetchClassFees = async () => {
    setLoading(true);
    // Fetch all active classes regardless of academic year
    const { data: classes } = await supabase
      .from('classes')
      .select('id, name, level')
      .eq('is_active', true)
      .order('level', { ascending: true });

    if (classes) {
      const { data: fees } = await supabase
        .from('class_fees')
        .select('*')
        .eq('academic_year', settings.academic_year);

      const feeMap = new Map(fees?.map(f => [f.class_id, f]) || []);

      const classFeesList: ClassFee[] = classes.map(c => {
        const fee = feeMap.get(c.id);
        return {
          id: fee?.id || '',
          class_id: c.id,
          class_name: c.name,
          class_level: c.level,
          amount: fee?.amount || 0,
          description: fee?.description || 'Frais de scolarité',
        };
      });

      setClassFees(classFeesList);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (settings.academic_year) {
      fetchClassFees();
    }
  }, [settings.academic_year]);

  const handleSave = async (classFee: ClassFee) => {
    const amount = parseFloat(editAmount) || 0;
    
    if (classFee.id) {
      // Update existing
      const { error } = await supabase
        .from('class_fees')
        .update({ amount })
        .eq('id', classFee.id);

      if (error) {
        toast({ title: "Erreur", description: error.message, variant: "destructive" });
        return;
      }
    } else {
      // Insert new
      const { error } = await supabase
        .from('class_fees')
        .insert({
          class_id: classFee.class_id,
          amount,
          academic_year: settings.academic_year,
        });

      if (error) {
        toast({ title: "Erreur", description: error.message, variant: "destructive" });
        return;
      }
    }

    toast({ title: "Succès", description: "Frais mis à jour" });
    setEditingId(null);
    fetchClassFees();
  };

  if (loading) {
    return <div className="text-muted-foreground text-center py-4">Chargement...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Frais de Scolarité par Classe</CardTitle>
        <CardDescription>
          Définissez le montant de la contribution pour chaque classe ({settings.academic_year})
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {classFees.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              Aucune classe active. Créez d'abord des classes.
            </p>
          ) : (
            classFees.map((cf) => (
              <div
                key={cf.class_id}
                className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30"
              >
                <div>
                  <p className="font-medium">{cf.class_name}</p>
                  <p className="text-sm text-muted-foreground">{cf.class_level}</p>
                </div>
                
                {editingId === cf.class_id ? (
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={editAmount}
                      onChange={(e) => setEditAmount(e.target.value)}
                      className="w-32"
                      placeholder="Montant"
                    />
                    <span className="text-sm text-muted-foreground">FCFA</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleSave(cf)}
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
                    <span className="font-semibold text-primary">
                      {cf.amount.toLocaleString()} FCFA
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        setEditingId(cf.class_id);
                        setEditAmount(cf.amount.toString());
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
