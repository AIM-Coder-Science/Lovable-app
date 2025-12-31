export type UserRole = 'admin' | 'teacher' | 'student';

export interface Profile {
  id: string;
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  avatar_url?: string;
  phone?: string;
  created_at: string;
  updated_at: string;
}

export interface Class {
  id: string;
  name: string;
  level: string;
  academic_year: string;
  principal_teacher_id?: string;
  created_at: string;
}

export interface Subject {
  id: string;
  name: string;
  coefficient: number;
  created_at: string;
}

export interface Student {
  id: string;
  user_id: string;
  class_id: string;
  matricule: string;
  first_name: string;
  last_name: string;
  email: string;
  birthday?: string;
  avatar_url?: string;
  parent_name?: string;
  parent_phone?: string;
  is_active: boolean;
  created_at: string;
}

export interface Teacher {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  avatar_url?: string;
  is_active: boolean;
  created_at: string;
}

export interface TeacherClass {
  id: string;
  teacher_id: string;
  class_id: string;
  subject_id: string;
  is_principal: boolean;
}

export interface TeacherSpecialty {
  id: string;
  teacher_id: string;
  subject_id: string;
}

export interface Grade {
  id: string;
  student_id: string;
  subject_id: string;
  class_id: string;
  teacher_id: string;
  grade_type: 'interrogation' | 'exam' | 'homework' | 'participation';
  value: number;
  max_value: number;
  coefficient: number;
  period: string;
  academic_year: string;
  created_at: string;
}

export interface Publication {
  id: string;
  title: string;
  content: string;
  author_id: string;
  author_type: 'admin' | 'teacher';
  visibility: 'all' | 'teachers' | 'students';
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface Bulletin {
  id: string;
  student_id: string;
  class_id: string;
  period: string;
  academic_year: string;
  average: number;
  rank?: number;
  appreciation?: string;
  principal_appreciation?: string;
  admin_signature?: boolean;
  pdf_url?: string;
  created_at: string;
}

export interface Document {
  id: string;
  title: string;
  type: 'bulletin' | 'schedule' | 'info' | 'other';
  file_url: string;
  class_id?: string;
  student_id?: string;
  visibility: 'all' | 'class' | 'student';
  created_at: string;
}
