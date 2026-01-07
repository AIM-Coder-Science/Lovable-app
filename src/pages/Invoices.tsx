import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Receipt, Plus, Search, Filter, CreditCard, AlertCircle, 
  CheckCircle, Clock, DollarSign, Users, TrendingUp, FileText,
  Wallet, Building
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

interface Invoice {
  id: string;
  invoice_number: string;
  description: string;
  amount: number;
  amount_paid: number;
  due_date: string;
  status: string;
  payment_date: string | null;
  notes: string | null;
  student_id: string;
  student?: {
    matricule: string;
    profile: { first_name: string; last_name: string };
    class?: { name: string };
  };
}

interface TeacherPayment {
  id: string;
  teacher_id: string;
  amount: number;
  amount_paid: number;
  description: string;
  due_date: string;
  status: string;
  payment_date: string | null;
  notes: string | null;
}

interface Student {
  id: string;
  matricule: string;
  profile: { first_name: string; last_name: string };
  class?: { name: string };
}

const Invoices = () => {
  const { role, studentId, teacherId, loading: authLoading } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [teacherPayments, setTeacherPayments] = useState<TeacherPayment[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  
  const [formData, setFormData] = useState({
    student_id: "",
    description: "",
    amount: 0,
    due_date: "",
  });

  const fetchData = async () => {
    setLoading(true);
    
    if (role === 'admin') {
      const [invoicesRes, studentsRes] = await Promise.all([
        supabase
          .from('invoices')
          .select(`
            *,
            student:students(
              matricule,
              profile:profiles(first_name, last_name),
              class:classes(name)
            )
          `)
          .order('created_at', { ascending: false }),
        supabase
          .from('students')
          .select('id, matricule, profile:profiles(first_name, last_name), class:classes(name)')
          .eq('is_active', true)
      ]);

      if (!invoicesRes.error) {
        setInvoices(invoicesRes.data as any || []);
      }
      setStudents(studentsRes.data as any || []);
    } else if (role === 'student' && studentId) {
      const { data } = await supabase
        .from('invoices')
        .select('*')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false });
      
      setInvoices(data as any || []);
    } else if (role === 'teacher' && teacherId) {
      const { data } = await supabase
        .from('teacher_payments')
        .select('*')
        .eq('teacher_id', teacherId)
        .order('created_at', { ascending: false });
      
      setTeacherPayments(data as any || []);
    }
    
    setLoading(false);
  };

  useEffect(() => {
    if (!authLoading && role) {
      fetchData();
    }
  }, [role, authLoading, studentId, teacherId]);

  const generateInvoiceNumber = () => {
    const year = new Date().getFullYear();
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `INV-${year}-${random}`;
  };

  const handleCreate = async () => {
    if (!formData.student_id || !formData.description || !formData.amount || !formData.due_date) {
      toast({ title: "Erreur", description: "Veuillez remplir tous les champs", variant: "destructive" });
      return;
    }

    try {
      const { error } = await supabase.from('invoices').insert({
        student_id: formData.student_id,
        invoice_number: generateInvoiceNumber(),
        description: formData.description,
        amount: formData.amount,
        due_date: formData.due_date,
        status: 'pending',
      });

      if (error) throw error;

      toast({ title: "Succès", description: "Facture créée" });
      setIsDialogOpen(false);
      setFormData({ student_id: "", description: "", amount: 0, due_date: "" });
      fetchData();
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    }
  };

  const handlePayment = async () => {
    if (!selectedInvoice || paymentAmount <= 0) {
      toast({ title: "Erreur", description: "Montant invalide", variant: "destructive" });
      return;
    }

    const newAmountPaid = selectedInvoice.amount_paid + paymentAmount;
    const newStatus = newAmountPaid >= selectedInvoice.amount ? 'paid' : 'partial';

    try {
      const { error } = await supabase
        .from('invoices')
        .update({
          amount_paid: newAmountPaid,
          status: newStatus,
          payment_date: newStatus === 'paid' ? new Date().toISOString() : null,
        })
        .eq('id', selectedInvoice.id);

      if (error) throw error;

      toast({ title: "Succès", description: "Paiement enregistré" });
      setIsPaymentDialogOpen(false);
      setSelectedInvoice(null);
      setPaymentAmount(0);
      fetchData();
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <Badge className="bg-success/20 text-success border-success/30 gap-1"><CheckCircle className="w-3 h-3" /> Payé</Badge>;
      case 'partial':
        return <Badge className="bg-warning/20 text-warning border-warning/30 gap-1"><Clock className="w-3 h-3" /> Partiel</Badge>;
      case 'overdue':
        return <Badge className="bg-destructive/20 text-destructive border-destructive/30 gap-1"><AlertCircle className="w-3 h-3" /> En retard</Badge>;
      default:
        return <Badge variant="secondary" className="gap-1"><Clock className="w-3 h-3" /> En attente</Badge>;
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-FR', { 
      style: 'currency', 
      currency: 'XOF',
      maximumFractionDigits: 0
    }).format(amount);
  };

  const filteredInvoices = invoices.filter(inv => {
    const studentName = inv.student ? `${inv.student.profile?.first_name} ${inv.student.profile?.last_name}`.toLowerCase() : '';
    const matchesSearch = studentName.includes(searchQuery.toLowerCase()) || 
                          inv.invoice_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          inv.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterStatus === "all" || inv.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  // Stats
  const totalAmount = invoices.reduce((acc, inv) => acc + inv.amount, 0);
  const totalPaid = invoices.reduce((acc, inv) => acc + inv.amount_paid, 0);
  const remainingAmount = totalAmount - totalPaid;
  const pendingCount = invoices.filter(inv => inv.status === 'pending' || inv.status === 'partial').length;

  // Teacher stats
  const teacherTotalAmount = teacherPayments.reduce((acc, p) => acc + p.amount, 0);
  const teacherTotalPaid = teacherPayments.reduce((acc, p) => acc + p.amount_paid, 0);

  if (authLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </DashboardLayout>
    );
  }

  // Student view
  if (role === 'student') {
    return (
      <DashboardLayout>
        <div className="space-y-6 animate-fade-in">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Mes Factures</h1>
            <p className="text-muted-foreground mt-1">Suivi de vos paiements de scolarité</p>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
                  <Receipt className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="text-lg font-bold text-foreground">{formatCurrency(totalAmount)}</p>
                  <p className="text-sm text-muted-foreground">Total à payer</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-success/10 to-success/5 border-success/20">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-success/20 flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-success" />
                </div>
                <div>
                  <p className="text-lg font-bold text-foreground">{formatCurrency(totalPaid)}</p>
                  <p className="text-sm text-muted-foreground">Déjà payé</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-warning/10 to-warning/5 border-warning/20">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-warning/20 flex items-center justify-center">
                  <Wallet className="w-6 h-6 text-warning" />
                </div>
                <div>
                  <p className="text-lg font-bold text-foreground">{formatCurrency(remainingAmount)}</p>
                  <p className="text-sm text-muted-foreground">Reste à payer</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Invoices List */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : invoices.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <FileText className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">Aucune facture</h3>
                <p className="text-muted-foreground text-center">Vous n'avez pas encore de factures.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {invoices.map(inv => (
                <Card key={inv.id}>
                  <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-sm text-muted-foreground">{inv.invoice_number}</span>
                          {getStatusBadge(inv.status)}
                        </div>
                        <p className="font-medium text-foreground">{inv.description}</p>
                        <p className="text-sm text-muted-foreground">
                          Échéance: {new Date(inv.due_date).toLocaleDateString('fr-FR')}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-foreground">{formatCurrency(inv.amount)}</p>
                        <p className="text-sm text-success">Payé: {formatCurrency(inv.amount_paid)}</p>
                        <p className="text-sm text-warning">Reste: {formatCurrency(inv.amount - inv.amount_paid)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </DashboardLayout>
    );
  }

  // Teacher view
  if (role === 'teacher') {
    return (
      <DashboardLayout>
        <div className="space-y-6 animate-fade-in">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Mes Paiements</h1>
            <p className="text-muted-foreground mt-1">Suivi de vos paiements de salaire</p>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
                  <Building className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="text-lg font-bold text-foreground">{formatCurrency(teacherTotalAmount)}</p>
                  <p className="text-sm text-muted-foreground">Total dû</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-success/10 to-success/5 border-success/20">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-success/20 flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-success" />
                </div>
                <div>
                  <p className="text-lg font-bold text-foreground">{formatCurrency(teacherTotalPaid)}</p>
                  <p className="text-sm text-muted-foreground">Reçu</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-warning/10 to-warning/5 border-warning/20">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-warning/20 flex items-center justify-center">
                  <Wallet className="w-6 h-6 text-warning" />
                </div>
                <div>
                  <p className="text-lg font-bold text-foreground">{formatCurrency(teacherTotalAmount - teacherTotalPaid)}</p>
                  <p className="text-sm text-muted-foreground">En attente</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Payments List */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : teacherPayments.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <FileText className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">Aucun paiement</h3>
                <p className="text-muted-foreground text-center">Vous n'avez pas encore de paiements enregistrés.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {teacherPayments.map(payment => (
                <Card key={payment.id}>
                  <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          {getStatusBadge(payment.status)}
                        </div>
                        <p className="font-medium text-foreground">{payment.description}</p>
                        <p className="text-sm text-muted-foreground">
                          Échéance: {new Date(payment.due_date).toLocaleDateString('fr-FR')}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-foreground">{formatCurrency(payment.amount)}</p>
                        <p className="text-sm text-success">Reçu: {formatCurrency(payment.amount_paid)}</p>
                        <p className="text-sm text-warning">En attente: {formatCurrency(payment.amount - payment.amount_paid)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </DashboardLayout>
    );
  }

  // Admin view
  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Facturation</h1>
            <p className="text-muted-foreground mt-1">Gestion des frais de scolarité</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                Nouvelle facture
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Créer une facture</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div>
                  <Label>Apprenant</Label>
                  <Select 
                    value={formData.student_id} 
                    onValueChange={v => setFormData({ ...formData, student_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner un apprenant" />
                    </SelectTrigger>
                    <SelectContent>
                      {students.map(s => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.profile?.first_name} {s.profile?.last_name} - {s.class?.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Description</Label>
                  <Input 
                    value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Ex: Frais de scolarité - 1er trimestre"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Montant (FCFA)</Label>
                    <Input 
                      type="number"
                      value={formData.amount}
                      onChange={e => setFormData({ ...formData, amount: Number(e.target.value) })}
                      min={0}
                    />
                  </div>
                  <div>
                    <Label>Date d'échéance</Label>
                    <Input 
                      type="date"
                      value={formData.due_date}
                      onChange={e => setFormData({ ...formData, due_date: e.target.value })}
                    />
                  </div>
                </div>
                <Button onClick={handleCreate} className="w-full">Créer la facture</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
                <Receipt className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{invoices.length}</p>
                <p className="text-sm text-muted-foreground">Total factures</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-success/10 to-success/5 border-success/20">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-success/20 flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-success" />
              </div>
              <div>
                <p className="text-lg font-bold text-foreground">{formatCurrency(totalPaid)}</p>
                <p className="text-sm text-muted-foreground">Encaissé</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-warning/10 to-warning/5 border-warning/20">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-warning/20 flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-warning" />
              </div>
              <div>
                <p className="text-lg font-bold text-foreground">{formatCurrency(totalAmount - totalPaid)}</p>
                <p className="text-sm text-muted-foreground">Reste à encaisser</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-accent/10 to-accent/5 border-accent/20">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-accent/20 flex items-center justify-center">
                <Users className="w-6 h-6 text-accent" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{pendingCount}</p>
                <p className="text-sm text-muted-foreground">En attente</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search & Filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Rechercher par nom ou numéro..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Statut" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              <SelectItem value="pending">En attente</SelectItem>
              <SelectItem value="partial">Partiel</SelectItem>
              <SelectItem value="paid">Payé</SelectItem>
              <SelectItem value="overdue">En retard</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Invoices Table */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : filteredInvoices.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <FileText className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Aucune facture</h3>
              <p className="text-muted-foreground text-center max-w-sm">
                {searchQuery ? "Aucun résultat pour votre recherche." : "Créez une première facture pour commencer."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>N° Facture</TableHead>
                    <TableHead>Apprenant</TableHead>
                    <TableHead>Classe</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Montant</TableHead>
                    <TableHead className="text-right">Payé</TableHead>
                    <TableHead className="text-right">Reste</TableHead>
                    <TableHead>Échéance</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInvoices.map(inv => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-mono text-sm">{inv.invoice_number}</TableCell>
                      <TableCell className="font-medium">
                        {inv.student?.profile?.first_name} {inv.student?.profile?.last_name}
                      </TableCell>
                      <TableCell>{inv.student?.class?.name || '-'}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{inv.description}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(inv.amount)}</TableCell>
                      <TableCell className="text-right text-success font-medium">{formatCurrency(inv.amount_paid)}</TableCell>
                      <TableCell className="text-right text-warning font-medium">{formatCurrency(inv.amount - inv.amount_paid)}</TableCell>
                      <TableCell>{new Date(inv.due_date).toLocaleDateString('fr-FR')}</TableCell>
                      <TableCell>{getStatusBadge(inv.status)}</TableCell>
                      <TableCell className="text-right">
                        {inv.status !== 'paid' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedInvoice(inv);
                              setPaymentAmount(inv.amount - inv.amount_paid);
                              setIsPaymentDialogOpen(true);
                            }}
                          >
                            <CreditCard className="w-4 h-4 mr-1" />
                            Payer
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Payment Dialog */}
        <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Enregistrer un paiement</DialogTitle>
            </DialogHeader>
            {selectedInvoice && (
              <div className="space-y-4 mt-4">
                <div className="p-4 bg-muted rounded-lg space-y-2">
                  <p className="text-sm text-muted-foreground">Facture: <span className="font-mono text-foreground">{selectedInvoice.invoice_number}</span></p>
                  <p className="text-sm text-muted-foreground">Montant total: <span className="text-foreground font-medium">{formatCurrency(selectedInvoice.amount)}</span></p>
                  <p className="text-sm text-muted-foreground">Déjà payé: <span className="text-success font-medium">{formatCurrency(selectedInvoice.amount_paid)}</span></p>
                  <p className="text-sm text-muted-foreground">Reste: <span className="text-warning font-medium">{formatCurrency(selectedInvoice.amount - selectedInvoice.amount_paid)}</span></p>
                </div>
                <div>
                  <Label>Montant du paiement (FCFA)</Label>
                  <Input 
                    type="number"
                    value={paymentAmount}
                    onChange={e => setPaymentAmount(Number(e.target.value))}
                    min={0}
                    max={selectedInvoice.amount - selectedInvoice.amount_paid}
                  />
                </div>
                <Button onClick={handlePayment} className="w-full">
                  <CreditCard className="w-4 h-4 mr-2" />
                  Confirmer le paiement
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default Invoices;
