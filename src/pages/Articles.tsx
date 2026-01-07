import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  ShoppingCart, Package, CreditCard, Wallet, Check, AlertCircle,
  Loader2, CheckCircle
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

interface Article {
  id: string;
  name: string;
  description: string | null;
  price: number;
  is_required: boolean;
  target_group: string | null;
  target_class_id: string | null;
}

interface StudentArticle {
  id: string;
  article_id: string;
  amount: number;
  amount_paid: number;
  status: string;
  article: Article;
}

const Articles = () => {
  const { role, studentId } = useAuth();
  const [articles, setArticles] = useState<Article[]>([]);
  const [studentArticles, setStudentArticles] = useState<StudentArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<string>("");
  const [paymentAmount, setPaymentAmount] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);

  const fetchArticles = async () => {
    setLoading(true);
    
    // Fetch available articles
    const { data: articlesData, error: articlesError } = await supabase
      .from('fee_articles')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (articlesError) {
      toast({ title: "Erreur", description: "Impossible de charger les articles", variant: "destructive" });
      setLoading(false);
      return;
    }

    setArticles(articlesData || []);

    // Fetch student's ordered articles
    if (studentId) {
      const { data: studentArticlesData } = await supabase
        .from('student_articles')
        .select(`
          id, article_id, amount, amount_paid, status,
          fee_articles!student_articles_article_id_fkey (id, name, description, price, is_required, target_group, target_class_id)
        `)
        .eq('student_id', studentId);

      if (studentArticlesData) {
        setStudentArticles(studentArticlesData.map((sa: any) => ({
          ...sa,
          article: sa.fee_articles
        })));
      }
    }

    setLoading(false);
  };

  useEffect(() => {
    if (role === 'student') {
      fetchArticles();
    }
  }, [role, studentId]);

  const handleOrderArticle = async (article: Article) => {
    if (!studentId) return;

    try {
      // Check if already ordered
      const existing = studentArticles.find(sa => sa.article_id === article.id);
      if (existing) {
        toast({ title: "Info", description: "Vous avez déjà commandé cet article" });
        return;
      }

      const { error } = await supabase
        .from('student_articles')
        .insert({
          student_id: studentId,
          article_id: article.id,
          amount: article.price,
          amount_paid: 0,
          status: 'pending',
        });

      if (error) throw error;

      toast({ title: "Succès", description: "Article commandé avec succès" });
      fetchArticles();
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    }
  };

  const openPaymentDialog = (article: Article) => {
    setSelectedArticle(article);
    const studentArticle = studentArticles.find(sa => sa.article_id === article.id);
    const remaining = studentArticle ? studentArticle.amount - studentArticle.amount_paid : article.price;
    setPaymentAmount(remaining.toString());
    setPaymentMethod("");
    setIsPaymentDialogOpen(true);
  };

  const handlePayment = async () => {
    if (!selectedArticle || !paymentMethod || !paymentAmount || !studentId) {
      toast({ title: "Erreur", description: "Veuillez remplir tous les champs", variant: "destructive" });
      return;
    }

    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: "Erreur", description: "Montant invalide", variant: "destructive" });
      return;
    }

    setIsProcessing(true);

    try {
      const studentArticle = studentArticles.find(sa => sa.article_id === selectedArticle.id);
      
      if (!studentArticle) {
        // Create student article first
        await supabase.from('student_articles').insert({
          student_id: studentId,
          article_id: selectedArticle.id,
          amount: selectedArticle.price,
          amount_paid: 0,
          status: 'pending',
        });
      }

      // For FedaPay integration - we would redirect to FedaPay payment page
      if (paymentMethod === 'fedapay' || paymentMethod === 'card') {
        // Simulate payment processing - in production, this would redirect to FedaPay
        toast({ 
          title: "Paiement FedaPay", 
          description: "Redirection vers FedaPay pour le paiement..." 
        });
        
        // Simulate successful payment after delay
        setTimeout(async () => {
          const newAmountPaid = (studentArticle?.amount_paid || 0) + amount;
          const totalAmount = studentArticle?.amount || selectedArticle.price;
          const newStatus = newAmountPaid >= totalAmount ? 'paid' : 'partial';

          await supabase
            .from('student_articles')
            .update({
              amount_paid: newAmountPaid,
              status: newStatus,
              payment_date: newStatus === 'paid' ? new Date().toISOString() : null,
            })
            .eq('student_id', studentId)
            .eq('article_id', selectedArticle.id);

          // Record transaction
          await supabase.from('payment_transactions').insert({
            student_id: studentId,
            article_id: selectedArticle.id,
            amount: amount,
            payment_method: paymentMethod,
            status: 'completed',
            transaction_ref: `TX-${Date.now()}`,
          });

          toast({ title: "Succès", description: "Paiement effectué avec succès" });
          setIsPaymentDialogOpen(false);
          setIsProcessing(false);
          fetchArticles();
        }, 2000);
        return;
      }

      // For cash payment (handled by admin)
      await supabase.from('payment_transactions').insert({
        student_id: studentId,
        article_id: selectedArticle.id,
        amount: amount,
        payment_method: 'cash',
        status: 'pending',
        notes: 'En attente de validation par l\'administration',
      });

      toast({ 
        title: "Demande envoyée", 
        description: "Votre demande de paiement en espèces a été envoyée à l'administration" 
      });
      setIsPaymentDialogOpen(false);
      setIsProcessing(false);
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      setIsProcessing(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <Badge className="bg-success/20 text-success">Payé</Badge>;
      case 'partial':
        return <Badge className="bg-warning/20 text-warning">Partiel</Badge>;
      default:
        return <Badge variant="secondary">En attente</Badge>;
    }
  };

  if (role !== 'student') {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Cette page est réservée aux apprenants.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Articles & Paiements</h1>
          <p className="text-muted-foreground mt-1">
            Commandez et payez vos articles scolaires
          </p>
        </div>

        {/* My Orders Section */}
        {studentArticles.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-primary" />
              Mes commandes
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {studentArticles.map((sa) => {
                const remaining = sa.amount - sa.amount_paid;
                const progress = (sa.amount_paid / sa.amount) * 100;
                
                return (
                  <Card key={sa.id} className="relative overflow-hidden">
                    <div 
                      className="absolute bottom-0 left-0 h-1 bg-primary transition-all"
                      style={{ width: `${progress}%` }}
                    />
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <CardTitle className="text-base">{sa.article.name}</CardTitle>
                        {getStatusBadge(sa.status)}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Total:</span>
                        <span className="font-medium">{sa.amount.toLocaleString()} FCFA</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Payé:</span>
                        <span className="font-medium text-success">{sa.amount_paid.toLocaleString()} FCFA</span>
                      </div>
                      {remaining > 0 && (
                        <>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Restant:</span>
                            <span className="font-medium text-destructive">{remaining.toLocaleString()} FCFA</span>
                          </div>
                          <Button 
                            className="w-full gap-2" 
                            size="sm"
                            onClick={() => openPaymentDialog(sa.article)}
                          >
                            <CreditCard className="w-4 h-4" />
                            Payer maintenant
                          </Button>
                        </>
                      )}
                      {sa.status === 'paid' && (
                        <div className="flex items-center justify-center gap-2 text-success py-2">
                          <CheckCircle className="w-5 h-5" />
                          <span className="font-medium">Entièrement payé</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* Available Articles Section */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            Articles disponibles
          </h2>
          
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : articles.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Package className="w-12 h-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Aucun article disponible pour le moment</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {articles.map((article) => {
                const isOrdered = studentArticles.some(sa => sa.article_id === article.id);
                
                return (
                  <Card key={article.id} className="hover:shadow-lg transition-shadow">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <CardTitle className="text-base">{article.name}</CardTitle>
                        {article.is_required && (
                          <Badge variant="destructive" className="text-xs">Obligatoire</Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {article.description && (
                        <p className="text-sm text-muted-foreground">{article.description}</p>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-2xl font-bold text-primary">
                          {article.price.toLocaleString()} <span className="text-sm font-normal">FCFA</span>
                        </span>
                      </div>
                      {isOrdered ? (
                        <Button variant="outline" className="w-full gap-2" disabled>
                          <Check className="w-4 h-4" />
                          Déjà commandé
                        </Button>
                      ) : (
                        <Button 
                          className="w-full gap-2"
                          onClick={() => handleOrderArticle(article)}
                        >
                          <ShoppingCart className="w-4 h-4" />
                          Commander
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Payment Dialog */}
        <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Paiement - {selectedArticle?.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <Label>Montant à payer (FCFA)</Label>
                <Input
                  type="number"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="Montant"
                />
              </div>
              
              <div>
                <Label>Mode de paiement</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner un mode de paiement" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="card">
                      <div className="flex items-center gap-2">
                        <CreditCard className="w-4 h-4" />
                        Carte bancaire
                      </div>
                    </SelectItem>
                    <SelectItem value="fedapay">
                      <div className="flex items-center gap-2">
                        <Wallet className="w-4 h-4" />
                        FedaPay (Mobile Money)
                      </div>
                    </SelectItem>
                    <SelectItem value="cash">
                      <div className="flex items-center gap-2">
                        <Wallet className="w-4 h-4" />
                        Espèces (à la caisse)
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {paymentMethod === 'cash' && (
                <div className="flex items-start gap-2 p-3 bg-warning/10 rounded-lg border border-warning/20">
                  <AlertCircle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
                  <p className="text-sm text-muted-foreground">
                    Le paiement en espèces doit être effectué à la caisse de l'établissement. 
                    Votre demande sera enregistrée et validée par l'administration.
                  </p>
                </div>
              )}

              <Button 
                onClick={handlePayment} 
                className="w-full gap-2"
                disabled={isProcessing || !paymentMethod}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Traitement en cours...
                  </>
                ) : (
                  <>
                    <CreditCard className="w-4 h-4" />
                    Procéder au paiement
                  </>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default Articles;
