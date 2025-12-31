import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Actualites from "./pages/Actualites";
import Enseignants from "./pages/Enseignants";
import Apprenants from "./pages/Apprenants";
import Classes from "./pages/Classes";
import Matieres from "./pages/Matieres";
import Notes from "./pages/Notes";
import Appreciations from "./pages/Appreciations";
import BulletinsPage from "./pages/BulletinsPage";
import Documents from "./pages/Documents";
import Parametres from "./pages/Parametres";
import Timetable from "./pages/Timetable";
import Administration from "./pages/Administration";
import Invoices from "./pages/Invoices";
import Events from "./pages/Events";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/actualites" element={<Actualites />} />
          <Route path="/enseignants" element={<Enseignants />} />
          <Route path="/apprenants" element={<Apprenants />} />
          <Route path="/classes" element={<Classes />} />
          <Route path="/matieres" element={<Matieres />} />
          <Route path="/notes" element={<Notes />} />
          <Route path="/appreciations" element={<Appreciations />} />
          <Route path="/bulletins" element={<BulletinsPage />} />
          <Route path="/documents" element={<Documents />} />
          <Route path="/parametres" element={<Parametres />} />
          <Route path="/timetable" element={<Timetable />} />
          <Route path="/administration" element={<Administration />} />
          <Route path="/invoices" element={<Invoices />} />
          <Route path="/events" element={<Events />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
