import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface SchoolSettings {
  id: string;
  school_name: string;
  academic_year: string;
  period_system: string;
  grading_system: string;
  payment_reminder_frequency: string | null;
}

const defaultSettings: SchoolSettings = {
  id: '',
  school_name: 'TinTin Kapi',
  academic_year: '2024-2025',
  period_system: 'trimester',
  grading_system: 'numeric_20',
  payment_reminder_frequency: 'monthly',
};

export const useSchoolSettings = () => {
  const [settings, setSettings] = useState<SchoolSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSettings = async () => {
      const { data, error } = await supabase
        .from('school_settings')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (data && !error) {
        setSettings(data as SchoolSettings);
      }
      setLoading(false);
    };

    fetchSettings();
  }, []);

  return { settings, loading };
};
