import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { GraduationCap, Lock, Mail, Eye, EyeOff, User, UserPlus } from "lucide-react";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email("Email invalide").max(255),
  password: z.string().min(6, "Mot de passe trop court").max(100),
});

const setupSchema = z.object({
  email: z.string().email("Email invalide").max(255),
  password: z.string().min(6, "Mot de passe minimum 6 caractères").max(100),
  firstName: z.string().min(2, "Prénom requis").max(50),
  lastName: z.string().min(2, "Nom requis").max(50),
});

const Auth = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSetupMode, setIsSetupMode] = useState(false);
  const [checkingAdmin, setCheckingAdmin] = useState(true);

  useEffect(() => {
    checkExistingAdmin();
  }, []);

  const checkExistingAdmin = async () => {
    try {
      // Check if any admin exists by trying to count user_roles with admin
      // Since RLS prevents unauthenticated access, we'll use a different approach
      // We'll try to call the create-admin function with a check-only flag
      setCheckingAdmin(true);
      
      // For now, we'll assume setup mode is needed if login fails
      // The edge function will handle the actual check
      setIsSetupMode(true);
      setCheckingAdmin(false);
    } catch (error) {
      console.error('Error checking admin:', error);
      setCheckingAdmin(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const validation = loginSchema.safeParse({ email, password });
      if (!validation.success) {
        toast({
          title: "Erreur de validation",
          description: validation.error.errors[0].message,
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        toast({
          title: "Erreur de connexion",
          description: error.message === "Invalid login credentials" 
            ? "Email ou mot de passe incorrect" 
            : error.message,
          variant: "destructive",
        });
        return;
      }

      if (data.user) {
        toast({
          title: "Connexion réussie",
          description: "Bienvenue !",
        });
        navigate("/dashboard");
      }
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Une erreur inattendue s'est produite",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetupAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const validation = setupSchema.safeParse({ 
        email, 
        password, 
        firstName, 
        lastName 
      });
      
      if (!validation.success) {
        toast({
          title: "Erreur de validation",
          description: validation.error.errors[0].message,
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke('create-admin', {
        body: { email, password, firstName, lastName },
      });

      if (error) {
        toast({
          title: "Erreur",
          description: error.message || "Impossible de créer le compte admin",
          variant: "destructive",
        });
        return;
      }

      if (data?.error) {
        // If admin already exists, switch to login mode
        if (data.error.includes('existe déjà')) {
          setIsSetupMode(false);
          toast({
            title: "Admin existant",
            description: "Un compte admin existe déjà. Veuillez vous connecter.",
          });
          return;
        }
        
        toast({
          title: "Erreur",
          description: data.error,
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Compte admin créé",
        description: "Vous pouvez maintenant vous connecter",
      });

      // Auto-login after creation
      const { error: loginError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (!loginError) {
        navigate("/dashboard");
      } else {
        setIsSetupMode(false);
      }

    } catch (error) {
      console.error('Setup error:', error);
      toast({
        title: "Erreur",
        description: "Une erreur inattendue s'est produite",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (checkingAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-3 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground">Vérification...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Decorative */}
      <div className="hidden lg:flex lg:w-1/2 bg-[var(--gradient-hero)] relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-accent/20" />
        <div className="relative z-10 flex flex-col justify-center px-12 text-sidebar-foreground">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-14 h-14 rounded-2xl bg-sidebar-primary/20 flex items-center justify-center">
              <GraduationCap className="w-8 h-8 text-sidebar-primary" />
            </div>
            <span className="text-2xl font-bold">EduGest</span>
          </div>
          <h1 className="text-4xl font-bold mb-4 leading-tight">
            Plateforme de Gestion<br />Scolaire Moderne
          </h1>
          <p className="text-lg text-sidebar-foreground/70 max-w-md">
            Gérez efficacement vos apprenants, enseignants, notes et bulletins dans une interface intuitive et élégante.
          </p>
          
          {/* Decorative circles */}
          <div className="absolute -bottom-32 -left-32 w-64 h-64 rounded-full bg-sidebar-primary/10 blur-3xl" />
          <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-accent/10 blur-3xl" />
        </div>
      </div>

      {/* Right Panel - Login/Setup Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-md animate-fade-in">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <GraduationCap className="w-7 h-7 text-primary" />
            </div>
            <span className="text-2xl font-bold text-foreground">EduGest</span>
          </div>

          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-foreground mb-2">
              {isSetupMode ? "Configuration Initiale" : "Connexion"}
            </h2>
            <p className="text-muted-foreground">
              {isSetupMode 
                ? "Créez le premier compte administrateur" 
                : "Entrez vos identifiants pour accéder à votre espace"}
            </p>
          </div>

          <form onSubmit={isSetupMode ? handleSetupAdmin : handleLogin} className="space-y-5">
            {isSetupMode && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName" className="text-sm font-medium">
                    Prénom
                  </Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      id="firstName"
                      type="text"
                      placeholder="Jean"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="pl-11"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName" className="text-sm font-medium">
                    Nom
                  </Label>
                  <Input
                    id="lastName"
                    type="text"
                    placeholder="Dupont"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">
                Email
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@edugest.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-11"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">
                Mot de passe
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-11 pr-11"
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  {isSetupMode ? "Création..." : "Connexion..."}
                </div>
              ) : (
                <>
                  {isSetupMode ? (
                    <>
                      <UserPlus className="w-4 h-4 mr-2" />
                      Créer le compte admin
                    </>
                  ) : (
                    "Se connecter"
                  )}
                </>
              )}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => setIsSetupMode(!isSetupMode)}
              className="text-sm text-primary hover:underline"
            >
              {isSetupMode 
                ? "J'ai déjà un compte → Se connecter" 
                : "Configuration initiale → Créer admin"}
            </button>
          </div>

          {!isSetupMode && (
            <p className="mt-6 text-center text-sm text-muted-foreground">
              Vous n'avez pas de compte ?{" "}
              <span className="text-primary font-medium">
                Contactez votre administrateur
              </span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default Auth;
