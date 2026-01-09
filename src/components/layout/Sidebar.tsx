import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  GraduationCap,
  LayoutDashboard,
  Users,
  BookOpen,
  FileText,
  Bell,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  School,
  UserCheck,
  ClipboardList,
  Star,
  FolderOpen,
  Calendar,
  Building2,
  Receipt,
  CalendarDays,
  Menu,
  UserCircle,
} from "lucide-react";

type UserRole = "admin" | "teacher" | "student";

interface SidebarProps {
  userRole: UserRole;
  userName?: string;
  isPrincipal?: boolean;
}

interface NavItem {
  icon: React.ElementType;
  label: string;
  href: string;
  roles: UserRole[];
  principalOnly?: boolean;
}

const navItems: NavItem[] = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard", roles: ["admin", "teacher", "student"] },
  { icon: Bell, label: "Actualités", href: "/actualites", roles: ["admin", "teacher", "student"] },
  { icon: Calendar, label: "Emploi du temps", href: "/timetable", roles: ["admin", "teacher", "student"] },
  { icon: CalendarDays, label: "Événements", href: "/events", roles: ["admin", "teacher", "student"] },
  { icon: Building2, label: "Administration", href: "/administration", roles: ["admin", "teacher", "student"] },
  { icon: Users, label: "Apprenants", href: "/apprenants", roles: ["admin", "teacher"] },
  { icon: UserCheck, label: "Enseignants", href: "/enseignants", roles: ["admin"] },
  { icon: School, label: "Classes", href: "/classes", roles: ["admin"] },
  { icon: BookOpen, label: "Matières", href: "/matieres", roles: ["admin"] },
  { icon: ClipboardList, label: "Notes", href: "/notes", roles: ["teacher"] },
  { icon: Star, label: "Appréciations", href: "/appreciations", roles: ["teacher"], principalOnly: true },
  { icon: FileText, label: "Bulletins", href: "/bulletins", roles: ["admin", "teacher", "student"], principalOnly: false },
  { icon: Receipt, label: "Facturation", href: "/invoices", roles: ["admin", "teacher", "student"] },
  { icon: Receipt, label: "Articles", href: "/articles", roles: ["student"] },
  { icon: FolderOpen, label: "Documents", href: "/documents", roles: ["admin", "teacher", "student"] },
  { icon: UserCircle, label: "Mon Profil", href: "/profile", roles: ["teacher", "student"] },
  { icon: Settings, label: "Paramètres", href: "/parametres", roles: ["admin", "teacher", "student"] },
];

export const Sidebar = ({ userRole, userName = "Utilisateur", isPrincipal = false }: SidebarProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast({ title: "Erreur", description: "Impossible de se déconnecter", variant: "destructive" });
      return;
    }
    navigate("/auth");
  };

  const filteredItems = navItems.filter((item) => {
    if (!item.roles.includes(userRole)) return false;
    // For bulletins, teachers need to be principal to see it
    if (item.href === '/bulletins' && userRole === 'teacher' && !isPrincipal) return false;
    // For appreciations, only principal teachers
    if (item.principalOnly && !isPrincipal && userRole === 'teacher') return false;
    return true;
  });

  const SidebarContent = ({ mobile = false }: { mobile?: boolean }) => (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-sidebar-border">
        <div className={cn("flex items-center gap-3", !mobile && isCollapsed && "justify-center")}>
          <div className="w-10 h-10 rounded-xl bg-sidebar-primary/20 flex items-center justify-center flex-shrink-0">
            <GraduationCap className="w-6 h-6 text-sidebar-primary" />
          </div>
          {(mobile || !isCollapsed) && (
            <span className="text-lg font-bold text-sidebar-foreground">TinTin Kapi</span>
          )}
        </div>
        {!mobile && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent hidden lg:flex"
          >
            {isCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
          </Button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-4 space-y-1">
        {filteredItems.map((item) => {
          const isActive = location.pathname === item.href;
          return (
            <button
              key={item.href}
              onClick={() => {
                navigate(item.href);
                if (mobile) setIsMobileOpen(false);
              }}
              className={cn(
                "sidebar-link w-full",
                isActive ? "sidebar-link-active" : "sidebar-link-inactive",
                !mobile && isCollapsed && "justify-center px-0"
              )}
              title={!mobile && isCollapsed ? item.label : undefined}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {(mobile || !isCollapsed) && <span>{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-sidebar-border">
        <div className={cn("flex items-center gap-3 mb-4", !mobile && isCollapsed && "justify-center")}>
          <div className="w-10 h-10 rounded-full bg-sidebar-accent flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-semibold text-sidebar-primary">
              {userName.charAt(0).toUpperCase()}
            </span>
          </div>
          {(mobile || !isCollapsed) && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{userName}</p>
              <p className="text-xs text-sidebar-foreground/60 capitalize">{userRole}</p>
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          onClick={handleLogout}
          className={cn(
            "w-full text-sidebar-foreground/70 hover:text-destructive hover:bg-destructive/10",
            !mobile && isCollapsed ? "px-0 justify-center" : "justify-start"
          )}
        >
          <LogOut className="w-5 h-5" />
          {(mobile || !isCollapsed) && <span className="ml-3">Déconnexion</span>}
        </Button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Menu Button */}
      <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="fixed top-4 left-4 z-50 lg:hidden bg-background shadow-md"
          >
            <Menu className="w-5 h-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="p-0 w-72 bg-sidebar text-sidebar-foreground">
          <SidebarContent mobile />
        </SheetContent>
      </Sheet>

      {/* Desktop Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-40 h-screen bg-sidebar text-sidebar-foreground transition-all duration-300 hidden lg:flex lg:flex-col",
          isCollapsed ? "w-20" : "w-64"
        )}
      >
        <SidebarContent />
      </aside>
    </>
  );
};
