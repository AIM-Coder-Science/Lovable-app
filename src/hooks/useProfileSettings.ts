import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface ProfileEditSettings {
  students_can_edit_phone: boolean;
  students_can_edit_avatar: boolean;
  teachers_can_edit_phone: boolean;
  teachers_can_edit_avatar: boolean;
}

const defaultSettings: ProfileEditSettings = {
  students_can_edit_phone: false,
  students_can_edit_avatar: true,
  teachers_can_edit_phone: false,
  teachers_can_edit_avatar: true,
};

export const useProfileSettings = () => {
  const [settings, setSettings] = useState<ProfileEditSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSettings = async () => {
      const { data } = await supabase
        .from('school_settings')
        .select('profile_edit_settings')
        .limit(1)
        .maybeSingle();

      if (data?.profile_edit_settings) {
        setSettings(data.profile_edit_settings as unknown as ProfileEditSettings);
      }
      setLoading(false);
    };

    fetchSettings();
  }, []);

  const updateSettings = async (newSettings: ProfileEditSettings) => {
    const { data: existing } = await supabase
      .from('school_settings')
      .select('id')
      .limit(1)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from('school_settings')
        .update({ profile_edit_settings: JSON.parse(JSON.stringify(newSettings)) })
        .eq('id', existing.id);

      if (!error) {
        setSettings(newSettings);
        return true;
      }
    }
    return false;
  };

  return { settings, loading, updateSettings };
};
