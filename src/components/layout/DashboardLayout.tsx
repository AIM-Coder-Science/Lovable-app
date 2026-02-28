import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { useAuth } from "@/hooks/useAuth";

interface DashboardLayoutProps {
  children: ReactNode;
}

/**
 * Layout principal — utilise useAuth (source de vérité unique)
 * au lieu de dupliquer la logique d'authentification.
 */
export const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  const navigate = useNavigate();
  const { user, role, isPrincipal, loading } = useAuth();

  // Redirige si non authentifié (après le chargement)
  if (!loading && !user) {
    navigate("/auth");
    return null;
  }

  const profileFromUser = user?.user_metadata;
  const userName = profileFromUser
    ? `${profileFromUser.first_name ?? ""} ${profileFromUser.last_name ?? ""}`.trim()
    : "";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-3 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground">Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        userRole={role ?? "student"}
        userName={userName}
        isPrincipal={isPrincipal}
      />
      <main className="lg:ml-64 transition-all duration-300">
        <div className="p-4 pt-16 lg:pt-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
};
