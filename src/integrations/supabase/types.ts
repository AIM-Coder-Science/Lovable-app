export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      administration_members: {
        Row: {
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          order_index: number | null
          phone: string | null
          photo_url: string | null
          profile_id: string | null
          role_name: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          order_index?: number | null
          phone?: string | null
          photo_url?: string | null
          profile_id?: string | null
          role_name: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          order_index?: number | null
          phone?: string | null
          photo_url?: string | null
          profile_id?: string | null
          role_name?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "administration_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bulletins: {
        Row: {
          academic_year: string
          admin_signature: boolean | null
          admin_signed_at: string | null
          average: number | null
          class_id: string
          created_at: string
          id: string
          pdf_url: string | null
          period: string
          principal_appreciation: string | null
          rank: number | null
          student_id: string
          teacher_appreciation: string | null
          total_students: number | null
          updated_at: string
        }
        Insert: {
          academic_year?: string
          admin_signature?: boolean | null
          admin_signed_at?: string | null
          average?: number | null
          class_id: string
          created_at?: string
          id?: string
          pdf_url?: string | null
          period: string
          principal_appreciation?: string | null
          rank?: number | null
          student_id: string
          teacher_appreciation?: string | null
          total_students?: number | null
          updated_at?: string
        }
        Update: {
          academic_year?: string
          admin_signature?: boolean | null
          admin_signed_at?: string | null
          average?: number | null
          class_id?: string
          created_at?: string
          id?: string
          pdf_url?: string | null
          period?: string
          principal_appreciation?: string | null
          rank?: number | null
          student_id?: string
          teacher_appreciation?: string | null
          total_students?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bulletins_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bulletins_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      class_fees: {
        Row: {
          academic_year: string
          amount: number
          class_id: string
          created_at: string
          description: string | null
          id: string
          updated_at: string
        }
        Insert: {
          academic_year?: string
          amount?: number
          class_id: string
          created_at?: string
          description?: string | null
          id?: string
          updated_at?: string
        }
        Update: {
          academic_year?: string
          amount?: number
          class_id?: string
          created_at?: string
          description?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_fees_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          academic_year: string
          created_at: string
          id: string
          is_active: boolean
          level: string
          name: string
        }
        Insert: {
          academic_year?: string
          created_at?: string
          id?: string
          is_active?: boolean
          level: string
          name: string
        }
        Update: {
          academic_year?: string
          created_at?: string
          id?: string
          is_active?: boolean
          level?: string
          name?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          class_id: string | null
          created_at: string
          doc_type: string
          file_url: string
          id: string
          student_id: string | null
          title: string
          uploaded_by: string | null
          visibility: string
        }
        Insert: {
          class_id?: string | null
          created_at?: string
          doc_type: string
          file_url: string
          id?: string
          student_id?: string | null
          title: string
          uploaded_by?: string | null
          visibility?: string
        }
        Update: {
          class_id?: string | null
          created_at?: string
          doc_type?: string
          file_url?: string
          id?: string
          student_id?: string | null
          title?: string
          uploaded_by?: string | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          end_date: string | null
          event_type: string
          id: string
          is_published: boolean
          location: string | null
          start_date: string
          title: string
          updated_at: string
          visibility: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          event_type?: string
          id?: string
          is_published?: boolean
          location?: string | null
          start_date: string
          title: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          event_type?: string
          id?: string
          is_published?: boolean
          location?: string | null
          start_date?: string
          title?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: []
      }
      fee_articles: {
        Row: {
          academic_year: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_required: boolean
          name: string
          price: number
          target_class_id: string | null
          target_group: string | null
          updated_at: string
        }
        Insert: {
          academic_year?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_required?: boolean
          name: string
          price?: number
          target_class_id?: string | null
          target_group?: string | null
          updated_at?: string
        }
        Update: {
          academic_year?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_required?: boolean
          name?: string
          price?: number
          target_class_id?: string | null
          target_group?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_articles_target_class_id_fkey"
            columns: ["target_class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      grades: {
        Row: {
          academic_year: string
          class_id: string
          coefficient: number
          created_at: string
          grade_type: string
          id: string
          max_value: number
          period: string
          student_id: string
          subject_id: string
          teacher_appreciation: string | null
          teacher_id: string | null
          value: number
        }
        Insert: {
          academic_year?: string
          class_id: string
          coefficient?: number
          created_at?: string
          grade_type: string
          id?: string
          max_value?: number
          period?: string
          student_id: string
          subject_id: string
          teacher_appreciation?: string | null
          teacher_id?: string | null
          value: number
        }
        Update: {
          academic_year?: string
          class_id?: string
          coefficient?: number
          created_at?: string
          grade_type?: string
          id?: string
          max_value?: number
          period?: string
          student_id?: string
          subject_id?: string
          teacher_appreciation?: string | null
          teacher_id?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "grades_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grades_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grades_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grades_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          academic_year: string
          amount: number
          amount_paid: number
          created_at: string
          description: string
          due_date: string
          id: string
          invoice_number: string
          notes: string | null
          payment_date: string | null
          status: string
          student_id: string
          updated_at: string
        }
        Insert: {
          academic_year?: string
          amount: number
          amount_paid?: number
          created_at?: string
          description: string
          due_date: string
          id?: string
          invoice_number: string
          notes?: string | null
          payment_date?: string | null
          status?: string
          student_id: string
          updated_at?: string
        }
        Update: {
          academic_year?: string
          amount?: number
          amount_paid?: number
          created_at?: string
          description?: string
          due_date?: string
          id?: string
          invoice_number?: string
          notes?: string | null
          payment_date?: string | null
          status?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string
          metadata: Json | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          metadata?: Json | null
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          metadata?: Json | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      payment_transactions: {
        Row: {
          amount: number
          article_id: string | null
          created_at: string
          id: string
          invoice_id: string | null
          notes: string | null
          payment_method: string
          status: string
          student_id: string | null
          teacher_id: string | null
          transaction_ref: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          article_id?: string | null
          created_at?: string
          id?: string
          invoice_id?: string | null
          notes?: string | null
          payment_method: string
          status?: string
          student_id?: string | null
          teacher_id?: string | null
          transaction_ref?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          article_id?: string | null
          created_at?: string
          id?: string
          invoice_id?: string | null
          notes?: string | null
          payment_method?: string
          status?: string
          student_id?: string | null
          teacher_id?: string | null
          transaction_ref?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_transactions_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "fee_articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          first_name: string
          id: string
          is_active: boolean
          last_name: string
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          first_name: string
          id?: string
          is_active?: boolean
          last_name: string
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          first_name?: string
          id?: string
          is_active?: boolean
          last_name?: string
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      publications: {
        Row: {
          author_id: string | null
          author_type: string
          content: string
          created_at: string
          id: string
          is_published: boolean
          title: string
          updated_at: string
          visibility: string
        }
        Insert: {
          author_id?: string | null
          author_type: string
          content: string
          created_at?: string
          id?: string
          is_published?: boolean
          title: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          author_id?: string | null
          author_type?: string
          content?: string
          created_at?: string
          id?: string
          is_published?: boolean
          title?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: []
      }
      school_settings: {
        Row: {
          academic_year: string
          created_at: string
          grading_system: string
          id: string
          payment_reminder_frequency: string | null
          period_system: string
          school_name: string
          updated_at: string
        }
        Insert: {
          academic_year?: string
          created_at?: string
          grading_system?: string
          id?: string
          payment_reminder_frequency?: string | null
          period_system?: string
          school_name?: string
          updated_at?: string
        }
        Update: {
          academic_year?: string
          created_at?: string
          grading_system?: string
          id?: string
          payment_reminder_frequency?: string | null
          period_system?: string
          school_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      student_articles: {
        Row: {
          academic_year: string
          amount: number
          amount_paid: number
          article_id: string
          created_at: string
          id: string
          payment_date: string | null
          status: string
          student_id: string
          updated_at: string
        }
        Insert: {
          academic_year?: string
          amount: number
          amount_paid?: number
          article_id: string
          created_at?: string
          id?: string
          payment_date?: string | null
          status?: string
          student_id: string
          updated_at?: string
        }
        Update: {
          academic_year?: string
          amount?: number
          amount_paid?: number
          article_id?: string
          created_at?: string
          id?: string
          payment_date?: string | null
          status?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_articles_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "fee_articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_articles_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          birthday: string | null
          class_id: string | null
          created_at: string
          id: string
          is_active: boolean
          matricule: string
          parent_name: string | null
          parent_phone: string | null
          profile_id: string
          user_id: string
        }
        Insert: {
          birthday?: string | null
          class_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          matricule: string
          parent_name?: string | null
          parent_phone?: string | null
          profile_id: string
          user_id: string
        }
        Update: {
          birthday?: string | null
          class_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          matricule?: string
          parent_name?: string | null
          parent_phone?: string | null
          profile_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subject_level_coefficients: {
        Row: {
          coefficient: number
          created_at: string
          id: string
          level: string
          subject_id: string
        }
        Insert: {
          coefficient?: number
          created_at?: string
          id?: string
          level: string
          subject_id: string
        }
        Update: {
          coefficient?: number
          created_at?: string
          id?: string
          level?: string
          subject_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subject_level_coefficients_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      subjects: {
        Row: {
          coefficient: number
          created_at: string
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          coefficient?: number
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          coefficient?: number
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      teacher_classes: {
        Row: {
          class_id: string
          created_at: string
          id: string
          is_principal: boolean
          subject_id: string
          teacher_id: string
        }
        Insert: {
          class_id: string
          created_at?: string
          id?: string
          is_principal?: boolean
          subject_id: string
          teacher_id: string
        }
        Update: {
          class_id?: string
          created_at?: string
          id?: string
          is_principal?: boolean
          subject_id?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_classes_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_classes_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_classes_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_payments: {
        Row: {
          academic_year: string
          amount: number
          amount_paid: number
          created_at: string
          description: string
          due_date: string
          id: string
          notes: string | null
          payment_date: string | null
          status: string
          teacher_id: string
          updated_at: string
        }
        Insert: {
          academic_year?: string
          amount: number
          amount_paid?: number
          created_at?: string
          description: string
          due_date: string
          id?: string
          notes?: string | null
          payment_date?: string | null
          status?: string
          teacher_id: string
          updated_at?: string
        }
        Update: {
          academic_year?: string
          amount?: number
          amount_paid?: number
          created_at?: string
          description?: string
          due_date?: string
          id?: string
          notes?: string | null
          payment_date?: string | null
          status?: string
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_payments_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_rates: {
        Row: {
          created_at: string
          description: string | null
          hourly_rate: number
          id: string
          is_active: boolean
          rate_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          hourly_rate?: number
          id?: string
          is_active?: boolean
          rate_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          hourly_rate?: number
          id?: string
          is_active?: boolean
          rate_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      teacher_specialties: {
        Row: {
          created_at: string
          id: string
          subject_id: string
          teacher_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          subject_id: string
          teacher_id: string
        }
        Update: {
          created_at?: string
          id?: string
          subject_id?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_specialties_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_specialties_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      teachers: {
        Row: {
          created_at: string
          employee_id: string | null
          id: string
          is_active: boolean
          principal_score: number | null
          profile_id: string
          score: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          employee_id?: string | null
          id?: string
          is_active?: boolean
          principal_score?: number | null
          profile_id: string
          score?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          employee_id?: string | null
          id?: string
          is_active?: boolean
          principal_score?: number | null
          profile_id?: string
          score?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teachers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      timetable_slots: {
        Row: {
          academic_year: string
          class_id: string
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          room: string | null
          start_time: string
          subject_id: string
          teacher_id: string
        }
        Insert: {
          academic_year?: string
          class_id: string
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          room?: string | null
          start_time: string
          subject_id: string
          teacher_id: string
        }
        Update: {
          academic_year?: string
          class_id?: string
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          room?: string | null
          start_time?: string
          subject_id?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "timetable_slots_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_slots_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_slots_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_principal_of_class: {
        Args: { _class_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "teacher" | "student"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "teacher", "student"],
    },
  },
} as const
