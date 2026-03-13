import { useState, useEffect } from 'react';
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

export const useAuth = () => {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    role: null,
    profileId: null,
    teacherId: null,
    studentId: null,
    isPrincipal: false,
    loading: true,
  });

  useEffect(() => {
    const fetchAuthState = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        setAuthState(prev => ({ ...prev, loading: false }));
        return;
      }

      // Fetch role
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();

      // Fetch profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      let teacherId = null;
      let isPrincipal = false;
      let studentId = null;

      if (roleData?.role === 'teacher') {
        const { data: teacherData } = await supabase
          .from('teachers')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();
        
        teacherId = teacherData?.id;

        if (teacherId) {
          const { data: principalData } = await supabase
            .from('teacher_classes')
            .select('id')
            .eq('teacher_id', teacherId)
            .eq('is_principal', true)
            .limit(1);
          
          isPrincipal = (principalData?.length ?? 0) > 0;
        }
      }

      if (roleData?.role === 'student') {
        const { data: studentData } = await supabase
          .from('students')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();
        
        studentId = studentData?.id;
      }

      setAuthState({
        user,
        role: roleData?.role as UserRole | null,
        profileId: profileData?.id ?? null,
        teacherId,
        studentId,
        isPrincipal,
        loading: false,
      });
    };

    fetchAuthState();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      fetchAuthState();
    });

    return () => subscription.unsubscribe();
  }, []);

  return authState;
};
