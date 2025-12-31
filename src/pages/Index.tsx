import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { GraduationCap, Users, BookOpen, FileText, ArrowRight } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Check if user is already logged in
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        navigate("/dashboard");
      }
    };
    checkSession();
  }, [navigate]);

  const features = [
    {
      icon: Users,
      title: "Gestion des Apprenants",
      description: "Suivez les informations, notes et bulletins de chaque apprenant",
    },
    {
      icon: BookOpen,
      title: "Suivi des Enseignants",
      description: "Gérez les classes, matières et attributions des enseignants",
    },
    {
      icon: FileText,
      title: "Bulletins Automatiques",
      description: "Génération et signature des bulletins en quelques clics",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[var(--gradient-hero)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background" />
        
        {/* Decorative elements */}
        <div className="absolute top-20 left-10 w-72 h-72 bg-primary/20 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-accent/20 rounded-full blur-3xl" />

        <div className="relative z-10 container mx-auto px-4 py-24">
          {/* Navigation */}
          <nav className="flex items-center justify-between mb-16">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
                <GraduationCap className="w-7 h-7 text-primary-foreground" />
              </div>
              <span className="text-2xl font-bold text-primary-foreground">EduGest</span>
            </div>
            <Button
              onClick={() => navigate("/auth")}
              variant="hero"
              size="lg"
            >
              Connexion
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </nav>

          {/* Hero Content */}
          <div className="text-center max-w-4xl mx-auto">
            <h1 className="text-4xl md:text-6xl font-bold text-primary-foreground mb-6 leading-tight animate-fade-in">
              Gestion Scolaire
              <span className="block mt-2 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-teal-400">
                Simplifiée & Moderne
              </span>
            </h1>
            <p className="text-xl text-primary-foreground/70 mb-10 max-w-2xl mx-auto animate-fade-in" style={{ animationDelay: "0.1s" }}>
              Une plateforme complète pour gérer efficacement vos apprenants, enseignants, notes et bulletins.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-in" style={{ animationDelay: "0.2s" }}>
              <Button
                onClick={() => navigate("/auth")}
                size="xl"
                variant="gradient"
              >
                Commencer maintenant
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="container mx-auto px-4 py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold text-foreground mb-4">
            Fonctionnalités Principales
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Tout ce dont vous avez besoin pour gérer votre établissement scolaire
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <div
              key={index}
              className="stat-card text-center animate-slide-up"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
                <feature.icon className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-3">
                {feature.title}
              </h3>
              <p className="text-muted-foreground">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="container mx-auto px-4 text-center">
          <p className="text-muted-foreground text-sm">
            © 2025 EduGest. Tous droits réservés.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
