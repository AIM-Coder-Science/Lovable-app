import { ReactNode, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Sidebar } from "./Sidebar";
import { cn } from "@/lib/utils";

type UserRole = "admin" | "teacher" | "student";

interface DashboardLayoutProps {
  children: ReactNode;
}

export const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  const navigate = useNavigate();
  const [userRole, setUserRole] = useState<UserRole>("student");
  const [userName, setUserName] = useState("");
  const [isPrincipal, setIsPrincipal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        navigate("/auth");
        return;
      }

      const userId = session.user.id;

      // Get user role from database
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .single();

      if (roleData) {
        setUserRole(roleData.role as UserRole);
      }

      // Get user profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('first_name, last_name')
        .eq('user_id', userId)
        .single();

      if (profileData) {
        setUserName(`${profileData.first_name} ${profileData.last_name}`);
      }

      // Check if teacher is principal of any class
      if (roleData?.role === 'teacher') {
        const { data: teacherData } = await supabase
          .from('teachers')
          .select('id')
          .eq('user_id', userId)
          .single();

        if (teacherData) {
          const { data: principalData } = await supabase
            .from('teacher_classes')
            .select('id')
            .eq('teacher_id', teacherData.id)
            .eq('is_principal', true)
            .limit(1);

          setIsPrincipal(principalData && principalData.length > 0);
        }
      }

      setIsLoading(false);
    };

    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        navigate("/auth");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  if (isLoading) {
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
      <Sidebar userRole={userRole} userName={userName} isPrincipal={isPrincipal} />
      <main className="lg:ml-64 transition-all duration-300">
        <div className="p-4 pt-16 lg:pt-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
};
