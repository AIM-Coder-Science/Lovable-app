import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { User } from '@supabase/supabase-js';

type UserRole = 'admin' | 'teacher' | 'student';

interface AuthState {
  user: User | null;
  role: UserRole | null;
  profileId: string | null;
  teacherId: string | null;
  studentId: string | null;
  isPrincipal: boolean;
  loading: boolean;
}

const INITIAL_STATE: AuthState = {
  user: null,
  role: null,
  profileId: null,
  teacherId: null,
  studentId: null,
  isPrincipal: false,
  loading: true,
};

export const useAuth = () => {
  const [authState, setAuthState] = useState<AuthState>(INITIAL_STATE);
  // Évite les setState sur un composant démonté
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;

    const fetchAuthState = async () => {
      // Utilise getUser() au lieu de getSession() pour valider côté serveur
      const { data: { user }, error } = await supabase.auth.getUser();

      if (!isMounted.current) return;

      if (error || !user) {
        setAuthState({ ...INITIAL_STATE, loading: false });
        return;
      }

      // Fetch role + profile en parallèle
      const [roleResult, profileResult] = await Promise.all([
        supabase.from('user_roles').select('role').eq('user_id', user.id).maybeSingle(),
        supabase.from('profiles').select('id').eq('user_id', user.id).maybeSingle(),
      ]);

      if (!isMounted.current) return;

      const role = roleResult.data?.role as UserRole | null;
      let teacherId: string | null = null;
      let isPrincipal = false;
      let studentId: string | null = null;

      if (role === 'teacher') {
        const teacherResult = await supabase
          .from('teachers')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (!isMounted.current) return;

        teacherId = teacherResult.data?.id ?? null;

        if (teacherId) {
          const principalResult = await supabase
            .from('teacher_classes')
            .select('id', { count: 'exact', head: true })
            .eq('teacher_id', teacherId)
            .eq('is_principal', true)
            .limit(1);

          if (!isMounted.current) return;

          isPrincipal = (principalResult.count ?? 0) > 0;
        }
      }

      if (role === 'student') {
        const studentResult = await supabase
          .from('students')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (!isMounted.current) return;

        studentId = studentResult.data?.id ?? null;
      }

      if (isMounted.current) {
        setAuthState({
          user,
          role,
          profileId: profileResult.data?.id ?? null,
          teacherId,
          studentId,
          isPrincipal,
          loading: false,
        });
      }
    };

    fetchAuthState();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      if (isMounted.current) fetchAuthState();
    });

    return () => {
      isMounted.current = false;
      subscription.unsubscribe();
    };
  }, []);

  return authState;
};
