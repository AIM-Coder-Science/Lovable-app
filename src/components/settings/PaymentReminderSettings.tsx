import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Bell } from "lucide-react";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export const PaymentReminderSettings = ({ value, onChange }: Props) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="w-5 h-5" />
          Rappels de Paiement
        </CardTitle>
        <CardDescription>
          Fréquence d'envoi des notifications de rappel aux apprenants
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RadioGroup value={value} onValueChange={onChange} className="space-y-3">
          <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer">
            <RadioGroupItem value="weekly" id="weekly" />
            <div className="flex-1">
              <Label htmlFor="weekly" className="font-medium cursor-pointer">Hebdomadaire</Label>
              <p className="text-sm text-muted-foreground">Rappel chaque semaine</p>
            </div>
          </div>
          <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer">
            <RadioGroupItem value="monthly" id="monthly" />
            <div className="flex-1">
              <Label htmlFor="monthly" className="font-medium cursor-pointer">Mensuel</Label>
              <p className="text-sm text-muted-foreground">Rappel chaque mois</p>
            </div>
          </div>
          <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer">
            <RadioGroupItem value="quarterly" id="quarterly" />
            <div className="flex-1">
              <Label htmlFor="quarterly" className="font-medium cursor-pointer">Trimestriel</Label>
              <p className="text-sm text-muted-foreground">Rappel chaque trimestre (3 mois)</p>
            </div>
          </div>
          <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer">
            <RadioGroupItem value="none" id="none" />
            <div className="flex-1">
              <Label htmlFor="none" className="font-medium cursor-pointer">Désactivé</Label>
              <p className="text-sm text-muted-foreground">Pas de rappel automatique</p>
            </div>
          </div>
        </RadioGroup>
      </CardContent>
    </Card>
  );
};
