
-- =============================================
-- EDUGEST - SYSTÈME DE GESTION SCOLAIRE
-- =============================================

-- 1. ENUM pour les rôles
CREATE TYPE public.app_role AS ENUM ('admin', 'teacher', 'student');

-- 2. Table des rôles utilisateurs (séparée pour la sécurité)
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (user_id, role)
);

-- 3. Table des profils
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    email TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    phone TEXT,
    avatar_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 4. Table des classes
CREATE TABLE public.classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    level TEXT NOT NULL,
    academic_year TEXT NOT NULL DEFAULT '2024-2025',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 5. Table des matières
CREATE TABLE public.subjects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    coefficient INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 6. Table des enseignants
CREATE TABLE public.teachers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    employee_id TEXT UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    score NUMERIC(5,2) DEFAULT 0,
    principal_score NUMERIC(5,2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 7. Table des apprenants
CREATE TABLE public.students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
    matricule TEXT NOT NULL UNIQUE,
    birthday DATE,
    parent_name TEXT,
    parent_phone TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 8. Attribution des classes aux enseignants
CREATE TABLE public.teacher_classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id UUID REFERENCES public.teachers(id) ON DELETE CASCADE NOT NULL,
    class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE NOT NULL,
    subject_id UUID REFERENCES public.subjects(id) ON DELETE CASCADE NOT NULL,
    is_principal BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (teacher_id, class_id, subject_id),
    UNIQUE (class_id, subject_id) -- Un seul prof par matière par classe
);

-- 9. Spécialités des enseignants
CREATE TABLE public.teacher_specialties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id UUID REFERENCES public.teachers(id) ON DELETE CASCADE NOT NULL,
    subject_id UUID REFERENCES public.subjects(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (teacher_id, subject_id)
);

-- 10. Table des notes
CREATE TABLE public.grades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID REFERENCES public.students(id) ON DELETE CASCADE NOT NULL,
    subject_id UUID REFERENCES public.subjects(id) ON DELETE CASCADE NOT NULL,
    class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE NOT NULL,
    teacher_id UUID REFERENCES public.teachers(id) ON DELETE SET NULL,
    grade_type TEXT NOT NULL CHECK (grade_type IN ('interrogation', 'exam', 'homework', 'participation')),
    value NUMERIC(5,2) NOT NULL CHECK (value >= 0),
    max_value NUMERIC(5,2) NOT NULL DEFAULT 20 CHECK (max_value > 0),
    coefficient NUMERIC(3,2) NOT NULL DEFAULT 1,
    period TEXT NOT NULL DEFAULT 'Trimestre 1',
    academic_year TEXT NOT NULL DEFAULT '2024-2025',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 11. Table des publications/actualités
CREATE TABLE public.publications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    author_type TEXT NOT NULL CHECK (author_type IN ('admin', 'teacher')),
    visibility TEXT NOT NULL DEFAULT 'all' CHECK (visibility IN ('all', 'teachers', 'students')),
    is_published BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 12. Table des bulletins
CREATE TABLE public.bulletins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID REFERENCES public.students(id) ON DELETE CASCADE NOT NULL,
    class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE NOT NULL,
    period TEXT NOT NULL,
    academic_year TEXT NOT NULL DEFAULT '2024-2025',
    average NUMERIC(5,2),
    rank INTEGER,
    total_students INTEGER,
    teacher_appreciation TEXT,
    principal_appreciation TEXT,
    admin_signature BOOLEAN DEFAULT false,
    admin_signed_at TIMESTAMP WITH TIME ZONE,
    pdf_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (student_id, period, academic_year)
);

-- 13. Table des documents
CREATE TABLE public.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    doc_type TEXT NOT NULL CHECK (doc_type IN ('bulletin', 'schedule', 'info', 'other')),
    file_url TEXT NOT NULL,
    class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
    student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
    visibility TEXT NOT NULL DEFAULT 'all' CHECK (visibility IN ('all', 'class', 'student')),
    uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- =============================================
-- FONCTIONS DE SÉCURITÉ
-- =============================================

-- Fonction pour vérifier les rôles (évite la récursion RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.user_roles
        WHERE user_id = _user_id
          AND role = _role
    )
$$;

-- Fonction pour obtenir le rôle d'un utilisateur
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT role
    FROM public.user_roles
    WHERE user_id = _user_id
    LIMIT 1
$$;

-- Fonction pour vérifier si un enseignant est principal d'une classe
CREATE OR REPLACE FUNCTION public.is_principal_of_class(_user_id UUID, _class_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.teachers t
        JOIN public.teacher_classes tc ON tc.teacher_id = t.id
        WHERE t.user_id = _user_id
          AND tc.class_id = _class_id
          AND tc.is_principal = true
    )
$$;

-- =============================================
-- ACTIVATION RLS
-- =============================================

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_specialties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bulletins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- =============================================
-- POLITIQUES RLS
-- =============================================

-- USER_ROLES
CREATE POLICY "Users can view their own roles" ON public.user_roles
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all roles" ON public.user_roles
    FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- PROFILES
CREATE POLICY "Users can view their own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all profiles" ON public.profiles
    FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Teachers can view all profiles" ON public.profiles
    FOR SELECT USING (public.has_role(auth.uid(), 'teacher'));

-- CLASSES
CREATE POLICY "Everyone can view classes" ON public.classes
    FOR SELECT USING (true);

CREATE POLICY "Admins can manage classes" ON public.classes
    FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- SUBJECTS
CREATE POLICY "Everyone can view subjects" ON public.subjects
    FOR SELECT USING (true);

CREATE POLICY "Admins can manage subjects" ON public.subjects
    FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- TEACHERS
CREATE POLICY "Admins can manage teachers" ON public.teachers
    FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Teachers can view all teachers" ON public.teachers
    FOR SELECT USING (public.has_role(auth.uid(), 'teacher'));

CREATE POLICY "Teachers can view themselves" ON public.teachers
    FOR SELECT USING (user_id = auth.uid());

-- STUDENTS
CREATE POLICY "Admins can manage students" ON public.students
    FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Teachers can view students in their classes" ON public.students
    FOR SELECT USING (
        public.has_role(auth.uid(), 'teacher')
        AND EXISTS (
            SELECT 1 FROM public.teachers t
            JOIN public.teacher_classes tc ON tc.teacher_id = t.id
            WHERE t.user_id = auth.uid() AND tc.class_id = students.class_id
        )
    );

CREATE POLICY "Students can view themselves" ON public.students
    FOR SELECT USING (user_id = auth.uid());

-- TEACHER_CLASSES
CREATE POLICY "Everyone can view teacher_classes" ON public.teacher_classes
    FOR SELECT USING (true);

CREATE POLICY "Admins can manage teacher_classes" ON public.teacher_classes
    FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- TEACHER_SPECIALTIES
CREATE POLICY "Everyone can view teacher_specialties" ON public.teacher_specialties
    FOR SELECT USING (true);

CREATE POLICY "Admins can manage teacher_specialties" ON public.teacher_specialties
    FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- GRADES
CREATE POLICY "Admins can manage all grades" ON public.grades
    FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Teachers can manage grades for their classes" ON public.grades
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.teachers t
            JOIN public.teacher_classes tc ON tc.teacher_id = t.id
            WHERE t.user_id = auth.uid() 
              AND tc.class_id = grades.class_id 
              AND tc.subject_id = grades.subject_id
        )
    );

CREATE POLICY "Principal teachers can view all grades in their class" ON public.grades
    FOR SELECT USING (
        public.is_principal_of_class(auth.uid(), grades.class_id)
    );

CREATE POLICY "Students can view their own grades" ON public.grades
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.students s
            WHERE s.user_id = auth.uid() AND s.id = grades.student_id
        )
    );

-- PUBLICATIONS
CREATE POLICY "Users can view publications based on visibility" ON public.publications
    FOR SELECT USING (
        is_published = true
        AND (
            visibility = 'all'
            OR (visibility = 'teachers' AND public.has_role(auth.uid(), 'teacher'))
            OR (visibility = 'students' AND public.has_role(auth.uid(), 'student'))
            OR public.has_role(auth.uid(), 'admin')
        )
    );

CREATE POLICY "Admins can manage all publications" ON public.publications
    FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Teachers can create publications" ON public.publications
    FOR INSERT WITH CHECK (
        public.has_role(auth.uid(), 'teacher')
        AND author_id = auth.uid()
        AND author_type = 'teacher'
    );

CREATE POLICY "Teachers can update their own publications" ON public.publications
    FOR UPDATE USING (
        public.has_role(auth.uid(), 'teacher')
        AND author_id = auth.uid()
    );

-- BULLETINS
CREATE POLICY "Admins can manage all bulletins" ON public.bulletins
    FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Principal teachers can manage bulletins for their class" ON public.bulletins
    FOR ALL USING (
        public.is_principal_of_class(auth.uid(), bulletins.class_id)
    );

CREATE POLICY "Students can view their own bulletins" ON public.bulletins
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.students s
            WHERE s.user_id = auth.uid() AND s.id = bulletins.student_id
        )
    );

-- DOCUMENTS
CREATE POLICY "Admins can manage all documents" ON public.documents
    FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view documents based on visibility" ON public.documents
    FOR SELECT USING (
        visibility = 'all'
        OR (
            visibility = 'class' 
            AND EXISTS (
                SELECT 1 FROM public.students s
                WHERE s.user_id = auth.uid() AND s.class_id = documents.class_id
            )
        )
        OR (
            visibility = 'student'
            AND EXISTS (
                SELECT 1 FROM public.students s
                WHERE s.user_id = auth.uid() AND s.id = documents.student_id
            )
        )
        OR public.has_role(auth.uid(), 'teacher')
    );

-- =============================================
-- TRIGGERS
-- =============================================

-- Trigger pour mettre à jour updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_publications_updated_at
    BEFORE UPDATE ON public.publications
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_bulletins_updated_at
    BEFORE UPDATE ON public.bulletins
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- STORAGE BUCKET
-- =============================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', true);

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true);

-- Policies pour le storage
CREATE POLICY "Anyone can view public documents"
ON storage.objects FOR SELECT
USING (bucket_id IN ('documents', 'avatars'));

CREATE POLICY "Authenticated users can upload documents"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id IN ('documents', 'avatars')
    AND auth.role() = 'authenticated'
);

CREATE POLICY "Users can update their own uploads"
ON storage.objects FOR UPDATE
USING (
    bucket_id IN ('documents', 'avatars')
    AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Admins can delete documents"
ON storage.objects FOR DELETE
USING (
    bucket_id IN ('documents', 'avatars')
    AND public.has_role(auth.uid(), 'admin')
);
