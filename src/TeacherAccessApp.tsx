import { useEffect, useMemo, useState } from 'react';
import { apiUrl } from "./config";

const TEACHER_TOKEN_STORAGE_KEY = 'growing_math_teacher_token';
const TEACHER_AUTO_DEMO_STORAGE_KEY = 'growing_math_teacher_auto_demo';
const TEACHER_DEMO_EMAIL = 'demo.prof@growingmath.app';
const TEACHER_DEMO_TAB_SEQUENCE: Array<'overview' | 'classes' | 'reports' | 'personalization' | 'recommendations'> = [
  'overview',
  'classes',
  'reports',
  'personalization',
  'recommendations',
];
const DEMO_SCREEN_DURATION_MS = 10000;

const getTeacherAuthHeaders = (): HeadersInit => {
  const token = localStorage.getItem(TEACHER_TOKEN_STORAGE_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
};

type TeacherProfile = {
  id: number;
  full_name: string;
  email: string;
  school_name?: string;
  subject?: string;
  created_at?: string;
  last_active?: string;
};

type TeacherDashboard = {
  summary: {
    totalStudents: number;
    avgLevel: number;
    activeToday: number;
    totalXp: number;
  };
  classes: Array<{
    id: number;
    name: string;
    teacherId: number;
    studentCount: number;
    avgLevel: number;
  }>;
  topStudents: Array<{
    name: string;
    email: string;
    level: number;
    xp: number;
    coins: number;
    last_active?: string;
  }>;
  strugglingTopics: Array<{
    topic: string;
    avg_mastery: number;
    records: number;
  }>;
};

type TeacherClassStudent = {
  id: number;
  name: string;
  email: string;
  level: number;
  xp: number;
  coins: number;
  last_active?: string;
  avg_mastery: number;
};

type TeacherClass = {
  id: number;
  name: string;
  teacherId: number;
  classCode: string;
  gradeLabel: string;
  description: string;
  createdAt: string;
  studentCount: number;
  students: TeacherClassStudent[];
};

type StudentSearchResult = {
  id: number;
  name: string;
  email: string;
  level: number;
  xp: number;
  coins: number;
  last_active?: string;
};

type ClassReport = {
  classInfo: {
    id: number;
    name: string;
    classCode: string;
    gradeLabel: string;
    description: string;
  };
  summary: {
    totalStudents: number;
    avgLevel: number;
    avgXp: number;
    activeToday: number;
  };
  byTopic: Array<{ topic: string; avg_mastery: number; records: number }>;
  students: Array<{
    id: number;
    name: string;
    email: string;
    level: number;
    xp: number;
    coins: number;
    avg_mastery: number;
    weakest_topic?: string;
  }>;
};

type TeacherPersonalization = {
  id: number;
  teacher_id: number;
  user_id: number;
  target_topic: string;
  weekly_goal: number;
  difficulty_preset: string;
  support_style: string;
  focus_notes: string;
  updated_at: string;
  student_name: string;
  student_email: string;
};

type TeacherRecommendation = {
  topic: string;
  mastery: number;
  priority: 'alta' | 'media' | 'baixa';
  suggestion: string;
};

export default function TeacherAccessApp() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [subject, setSubject] = useState('');
  const [password, setPassword] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [teacher, setTeacher] = useState<TeacherProfile | null>(null);
  const [dashboard, setDashboard] = useState<TeacherDashboard | null>(null);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'classes' | 'reports' | 'personalization' | 'recommendations'>('overview');

  const [classes, setClasses] = useState<TeacherClass[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState<number>(0);

  const [newClassName, setNewClassName] = useState('');
  const [newClassGrade, setNewClassGrade] = useState('');
  const [newClassDescription, setNewClassDescription] = useState('');

  const [studentSearch, setStudentSearch] = useState('');
  const [directStudentEmail, setDirectStudentEmail] = useState('');
  const [searchResults, setSearchResults] = useState<StudentSearchResult[]>([]);
  const [searchingStudents, setSearchingStudents] = useState(false);
  const [linkingDirectStudent, setLinkingDirectStudent] = useState(false);

  const [classReport, setClassReport] = useState<ClassReport | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);

  const [personalizations, setPersonalizations] = useState<TeacherPersonalization[]>([]);
  const [loadingPersonalizations, setLoadingPersonalizations] = useState(false);
  const [personalizationStudentId, setPersonalizationStudentId] = useState<number>(0);
  const [targetTopic, setTargetTopic] = useState('');
  const [weeklyGoal, setWeeklyGoal] = useState<number>(3);
  const [difficultyPreset, setDifficultyPreset] = useState('equilibrado');
  const [supportStyle, setSupportStyle] = useState('passo_a_passo');
  const [focusNotes, setFocusNotes] = useState('');

  const [recommendations, setRecommendations] = useState<TeacherRecommendation[]>([]);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);
  const [quickSavingStudentId, setQuickSavingStudentId] = useState<number | null>(null);
  const [autoDemoEnabled, setAutoDemoEnabled] = useState(() => localStorage.getItem(TEACHER_AUTO_DEMO_STORAGE_KEY) === '1');
  const [autoDemoStep, setAutoDemoStep] = useState(0);

  const selectedClass = useMemo(() => classes.find((c) => c.id === selectedClassId) || null, [classes, selectedClassId]);

  useEffect(() => {
    const onGlobalKeyDown = (event: KeyboardEvent) => {
      if (!teacher) return;

      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isTypingField = tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable;

      if (isTypingField) return;

      if (event.altKey) {
        if (event.key === '1') {
          event.preventDefault();
          setActiveTab('overview');
          return;
        }
        if (event.key === '2') {
          event.preventDefault();
          setActiveTab('classes');
          return;
        }
        if (event.key === '3') {
          event.preventDefault();
          setActiveTab('reports');
          return;
        }
        if (event.key === '4') {
          event.preventDefault();
          setActiveTab('personalization');
          return;
        }
        if (event.key === '5') {
          event.preventDefault();
          setActiveTab('recommendations');
        }
      }

      if (event.ctrlKey && (event.key === 'r' || event.key === 'R')) {
        event.preventDefault();
        void refreshAllTeacherData(teacher.id);
        return;
      }

      if (event.key === 'Escape') {
        setError('');
      }
    };

    window.addEventListener('keydown', onGlobalKeyDown);
    return () => window.removeEventListener('keydown', onGlobalKeyDown);
  }, [teacher]);

  const getMasteryTone = (mastery: number) => {
    if (mastery < 40) {
      return {
        row: 'bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-900/30',
        bar: 'bg-rose-500',
        label: 'Critico',
      };
    }

    if (mastery < 70) {
      return {
        row: 'bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/30',
        bar: 'bg-amber-500',
        label: 'Atencao',
      };
    }

    return {
      row: 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-900/30',
      bar: 'bg-emerald-500',
      label: 'Saudavel',
    };
  };

  const atRiskStudents = useMemo(() => {
    const now = Date.now();
    const seen = new Map<number, { id: number; name: string; email: string; level: number; avg_mastery: number; daysSinceActive: number; riskScore: number; classId: number; className: string }>();

    for (const c of classes) {
      for (const s of c.students) {
        const lastActiveTs = s.last_active ? Date.parse(s.last_active) : NaN;
        const daysSinceActive = Number.isFinite(lastActiveTs)
          ? Math.max(0, Math.floor((now - lastActiveTs) / (1000 * 60 * 60 * 24)))
          : 14;

        const masteryRisk = Math.max(0, 100 - (s.avg_mastery || 0));
        const inactivityRisk = Math.min(100, daysSinceActive * 8);
        const riskScore = Math.round(masteryRisk * 0.7 + inactivityRisk * 0.3);

        const candidate = {
          id: s.id,
          name: s.name,
          email: s.email,
          level: s.level,
          avg_mastery: s.avg_mastery || 0,
          daysSinceActive,
          riskScore,
          classId: c.id,
          className: c.name,
        };

        const existing = seen.get(s.id);
        if (!existing || candidate.riskScore > existing.riskScore) {
          seen.set(s.id, candidate);
        }
      }
    }

    return Array.from(seen.values()).sort((a, b) => b.riskScore - a.riskScore);
  }, [classes]);

  const riskSummary = useMemo(() => {
    return {
      high: atRiskStudents.filter((s) => s.riskScore >= 70).length,
      medium: atRiskStudents.filter((s) => s.riskScore >= 45 && s.riskScore < 70).length,
      low: atRiskStudents.filter((s) => s.riskScore < 45).length,
    };
  }, [atRiskStudents]);

  useEffect(() => {
    const isDemoTeacher = String(teacher?.email || '').trim().toLowerCase() === TEACHER_DEMO_EMAIL;
    if (!isDemoTeacher) {
      setAutoDemoEnabled(false);
      return;
    }

    setAutoDemoEnabled(localStorage.getItem(TEACHER_AUTO_DEMO_STORAGE_KEY) === '1');
  }, [teacher?.email]);

  useEffect(() => {
    const isDemoTeacher = String(teacher?.email || '').trim().toLowerCase() === TEACHER_DEMO_EMAIL;
    if (!teacher || !isDemoTeacher || !autoDemoEnabled) return;

    const cycleTabs = async () => {
      if (activeTab === 'overview') {
        await loadDashboard(teacher.id);
      } else if (activeTab === 'classes') {
        await loadClasses(teacher.id);
      } else if (activeTab === 'reports') {
        await loadClassReport(teacher.id, selectedClassId);
      } else if (activeTab === 'personalization') {
        if (atRiskStudents[0]) {
          openQuickIntervention(atRiskStudents[0]);
        }
        await loadPersonalizations(teacher.id, selectedClassId || undefined);
      } else if (activeTab === 'recommendations') {
        await loadRecommendations(teacher.id);
      }

      setAutoDemoStep((prev) => {
        const next = (prev + 1) % TEACHER_DEMO_TAB_SEQUENCE.length;
        setActiveTab(TEACHER_DEMO_TAB_SEQUENCE[next]);
        return next;
      });
    };

    const tabTimer = window.setInterval(() => {
      void cycleTabs();
    }, DEMO_SCREEN_DURATION_MS);

    return () => window.clearInterval(tabTimer);
  }, [
    teacher,
    autoDemoEnabled,
    activeTab,
    selectedClassId,
    atRiskStudents,
  ]);

  useEffect(() => {
    const isDemoTeacher = String(teacher?.email || '').trim().toLowerCase() === TEACHER_DEMO_EMAIL;
    if (!teacher || !isDemoTeacher || !autoDemoEnabled) return;

    let direction: 1 | -1 = 1;
    const scrollTimer = window.setInterval(() => {
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      if (maxScroll <= 0) return;

      const current = Math.max(0, Math.min(maxScroll, window.scrollY));
      if (current >= maxScroll - 10) direction = -1;
      if (current <= 10) direction = 1;

      window.scrollBy({ top: direction * 190, behavior: 'smooth' });
    }, 1400);

    return () => window.clearInterval(scrollTimer);
  }, [teacher, autoDemoEnabled, activeTab]);

  const openQuickIntervention = (student: {
    id: number;
    name: string;
    riskScore: number;
    classId: number;
  }) => {
    const strongestNeedTopic = dashboard?.strugglingTopics?.[0]?.topic || '';
    const isHighRisk = student.riskScore >= 70;

    setActiveTab('personalization');
    setSelectedClassId(student.classId);
    setPersonalizationStudentId(student.id);
    setTargetTopic(strongestNeedTopic);
    setWeeklyGoal(isHighRisk ? 6 : 4);
    setDifficultyPreset('reforco');
    setSupportStyle('passo_a_passo');
    setFocusNotes(
      `Plano rapido sugerido para ${student.name}: reforco guiado com foco em consolidacao de base e pratica diaria curta.`
    );

    if (teacher) {
      void loadPersonalizations(teacher.id, student.classId);
    }
  };

  const saveQuickInterventionNow = async (student: {
    id: number;
    name: string;
    riskScore: number;
    classId: number;
  }) => {
    if (!teacher) return;

    const strongestNeedTopic = dashboard?.strugglingTopics?.[0]?.topic || '';
    const isHighRisk = student.riskScore >= 70;

    setQuickSavingStudentId(student.id);
    setError('');

    try {
      const res = await fetch(apiUrl('/api/teacher/personalizations'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getTeacherAuthHeaders() },
        body: JSON.stringify({
          userId: student.id,
          targetTopic: strongestNeedTopic,
          weeklyGoal: isHighRisk ? 6 : 4,
          difficultyPreset: 'reforco',
          supportStyle: 'passo_a_passo',
          focusNotes: `Plano rapido aplicado automaticamente para ${student.name}, com foco em reforco de base e ritmo diario.`,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Nao foi possivel aplicar o plano rapido.');
      }

      await Promise.all([
        loadPersonalizations(teacher.id, student.classId),
        loadDashboard(teacher.id),
        loadRecommendations(teacher.id),
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao aplicar plano rapido.');
    } finally {
      setQuickSavingStudentId(null);
    }
  };

  const loadClasses = async (teacherId: number) => {
    setLoadingClasses(true);
    try {
      const res = await fetch(apiUrl(`/api/teacher/classes?teacherId=${teacherId}`), { headers: { ...getTeacherAuthHeaders() } });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Nao foi possivel carregar salas.');
      }
      setClasses(data as TeacherClass[]);
      if (!selectedClassId && data.length > 0) {
        setSelectedClassId(data[0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar salas.');
    } finally {
      setLoadingClasses(false);
    }
  };

  const loadClassReport = async (teacherId: number, classId: number) => {
    if (!classId) {
      setClassReport(null);
      return;
    }

    setLoadingReport(true);
    try {
      const res = await fetch(apiUrl(`/api/teacher/reports/class?teacherId=${teacherId}&classId=${classId}`), { headers: { ...getTeacherAuthHeaders() } });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Nao foi possivel carregar relatorio da sala.');
      }
      setClassReport(data as ClassReport);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar relatorio.');
    } finally {
      setLoadingReport(false);
    }
  };

  const loadPersonalizations = async (teacherId: number, classId?: number) => {
    setLoadingPersonalizations(true);
    try {
      const query = classId ? `?teacherId=${teacherId}&classId=${classId}` : `?teacherId=${teacherId}`;
      const res = await fetch(apiUrl(`/api/teacher/personalizations${query}`), { headers: { ...getTeacherAuthHeaders() } });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Nao foi possivel carregar personalizacoes.');
      }
      setPersonalizations(data as TeacherPersonalization[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar personalizacoes.');
    } finally {
      setLoadingPersonalizations(false);
    }
  };

  const loadRecommendations = async (teacherId: number) => {
    setLoadingRecommendations(true);
    try {
      const res = await fetch(apiUrl(`/api/teacher/recommendations?teacherId=${teacherId}`), { headers: { ...getTeacherAuthHeaders() } });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Nao foi possivel carregar recomendacoes.');
      }
      setRecommendations((data?.recommendations || []) as TeacherRecommendation[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar recomendacoes.');
    } finally {
      setLoadingRecommendations(false);
    }
  };

  const refreshAllTeacherData = async (teacherId: number) => {
    await Promise.all([
      loadDashboard(teacherId),
      loadClasses(teacherId),
      loadRecommendations(teacherId),
    ]);
  };

  const loadDashboard = async (teacherId: number) => {
    setLoadingDashboard(true);
    try {
      const res = await fetch(apiUrl(`/api/teacher/dashboard?teacherId=${teacherId}`), { headers: { ...getTeacherAuthHeaders() } });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Nao foi possivel carregar o painel do professor.');
      }
      setDashboard(data as TeacherDashboard);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro inesperado ao carregar painel.');
    } finally {
      setLoadingDashboard(false);
    }
  };

  const registerTeacher = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(apiUrl('/api/teacher-auth/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, email, schoolName, subject, password, accessCode }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Nao foi possivel cadastrar professor.');
      }

      if (!data?.authToken || !data?.teacher) {
        throw new Error('Resposta de autenticacao incompleta.');
      }

      localStorage.setItem(TEACHER_TOKEN_STORAGE_KEY, String(data.authToken));
      localStorage.removeItem(TEACHER_AUTO_DEMO_STORAGE_KEY);
      setTeacher(data.teacher as TeacherProfile);
      await refreshAllTeacherData(data.teacher.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro inesperado.');
    } finally {
      setLoading(false);
    }
  };

  const loginTeacher = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(apiUrl('/api/teacher-auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Nao foi possivel entrar.');
      }

      if (!data?.authToken || !data?.teacher) {
        throw new Error('Resposta de autenticacao incompleta.');
      }

      localStorage.setItem(TEACHER_TOKEN_STORAGE_KEY, String(data.authToken));
      const loggedEmail = String(data?.teacher?.email || email || '').trim().toLowerCase();
      if (loggedEmail === TEACHER_DEMO_EMAIL) {
        localStorage.setItem(TEACHER_AUTO_DEMO_STORAGE_KEY, '1');
      } else {
        localStorage.removeItem(TEACHER_AUTO_DEMO_STORAGE_KEY);
      }
      setTeacher(data.teacher as TeacherProfile);
      await refreshAllTeacherData(data.teacher.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro inesperado.');
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async () => {
    if (!email || !password) {
      setError('Email e senha sao obrigatorios.');
      return;
    }

    if (mode === 'register') {
      if (!fullName || !accessCode) {
        setError('Nome completo e codigo de acesso sao obrigatorios para cadastro.');
        return;
      }
      await registerTeacher();
      return;
    }

    await loginTeacher();
  };

  const loginTeacherDemo = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(apiUrl('/api/teacher-auth/demo-login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Nao foi possivel entrar no modo demonstracao de professor.');
      }

      if (!data?.authToken || !data?.teacher) {
        throw new Error('Resposta de autenticacao demo incompleta.');
      }

      localStorage.setItem(TEACHER_TOKEN_STORAGE_KEY, String(data.authToken));
      localStorage.setItem(TEACHER_AUTO_DEMO_STORAGE_KEY, '1');
      setTeacher(data.teacher as TeacherProfile);
      await refreshAllTeacherData(data.teacher.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro inesperado no modo demo.');
    } finally {
      setLoading(false);
    }
  };

  const createClass = async () => {
    if (!teacher) return;
    setError('');

    if (!newClassName.trim()) {
      setError('Nome da sala e obrigatorio.');
      return;
    }

    setLoadingClasses(true);
    try {
      const res = await fetch(apiUrl('/api/teacher/classes'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getTeacherAuthHeaders() },
        body: JSON.stringify({
          name: newClassName,
          gradeLabel: newClassGrade,
          description: newClassDescription,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Nao foi possivel criar sala.');
      }

      setNewClassName('');
      setNewClassGrade('');
      setNewClassDescription('');

      await loadClasses(teacher.id);
      setSelectedClassId(data.id);
      await loadDashboard(teacher.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao criar sala.');
    } finally {
      setLoadingClasses(false);
    }
  };

  const searchStudents = async () => {
    if (!teacher) return;
    setSearchingStudents(true);
    setError('');
    try {
      const res = await fetch(apiUrl(`/api/teacher/students/search?teacherId=${teacher.id}&q=${encodeURIComponent(studentSearch)}`), { headers: { ...getTeacherAuthHeaders() } });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Nao foi possivel buscar alunos.');
      }
      setSearchResults(data as StudentSearchResult[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao buscar alunos.');
    } finally {
      setSearchingStudents(false);
    }
  };

  const addStudentToClass = async (studentEmail: string) => {
    if (!teacher || !selectedClassId) return;
    setError('');
    try {
      const res = await fetch(apiUrl(`/api/teacher/classes/${selectedClassId}/students`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getTeacherAuthHeaders() },
        body: JSON.stringify({ studentEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Nao foi possivel vincular aluno.');
      }

      await Promise.all([
        loadClasses(teacher.id),
        loadDashboard(teacher.id),
        loadClassReport(teacher.id, selectedClassId),
        loadPersonalizations(teacher.id, selectedClassId),
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao vincular aluno.');
    }
  };

  const addStudentByEmailDirect = async () => {
    if (!directStudentEmail.trim()) {
      setError('Informe o email do aluno para vincular.');
      return;
    }

    setLinkingDirectStudent(true);
    try {
      await addStudentToClass(directStudentEmail.trim());
      setDirectStudentEmail('');
    } finally {
      setLinkingDirectStudent(false);
    }
  };

  const removeStudentFromClass = async (userId: number) => {
    if (!teacher || !selectedClassId) return;
    setError('');
    try {
      const res = await fetch(apiUrl(`/api/teacher/classes/${selectedClassId}/students/${userId}?teacherId=${teacher.id}`), {
        method: 'DELETE',
        headers: { ...getTeacherAuthHeaders() },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Nao foi possivel remover aluno da sala.');
      }

      await Promise.all([
        loadClasses(teacher.id),
        loadDashboard(teacher.id),
        loadClassReport(teacher.id, selectedClassId),
        loadPersonalizations(teacher.id, selectedClassId),
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao remover aluno da sala.');
    }
  };

  const savePersonalization = async () => {
    if (!teacher) return;
    setError('');

    if (!personalizationStudentId) {
      setError('Selecione um aluno para personalizar.');
      return;
    }

    try {
      const res = await fetch(apiUrl('/api/teacher/personalizations'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getTeacherAuthHeaders() },
        body: JSON.stringify({
          userId: personalizationStudentId,
          targetTopic,
          weeklyGoal,
          difficultyPreset,
          supportStyle,
          focusNotes,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Nao foi possivel salvar personalizacao.');
      }

      await loadPersonalizations(teacher.id, selectedClassId || undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar personalizacao.');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-cyan-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex items-start md:items-center justify-center p-0 sm:p-4 md:p-6">
      <div className="w-full min-h-screen md:min-h-0 md:max-w-3xl bg-white/95 dark:bg-slate-900/95 md:rounded-[32px] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden backdrop-blur-sm">
        <div className="p-6 bg-gradient-to-r from-blue-700 to-cyan-600 text-white">
          <h1 className="text-3xl font-black">Portal de Professores</h1>
          <p className="mt-1 opacity-90">Acesso exclusivo para cadastro e login de docentes.</p>
          <button
            onClick={() => {
              window.location.href = '/';
            }}
            className="mt-4 px-4 py-2 rounded-xl bg-white/20 hover:bg-white/30 text-white font-bold"
          >
            Voltar para App do Aluno
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-5">
          {!teacher ? (
            <>
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => setMode('login')}
                  className={`px-4 py-2 rounded-xl font-bold ${mode === 'login' ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200'}`}
                >
                  Entrar
                </button>
                <button
                  onClick={() => setMode('register')}
                  className={`px-4 py-2 rounded-xl font-bold ${mode === 'register' ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200'}`}
                >
                  Cadastrar Professor
                </button>
                <button
                  onClick={() => void loginTeacherDemo()}
                  disabled={loading}
                  className="sm:ml-auto px-4 py-2 rounded-xl font-bold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
                >
                  {loading ? 'Entrando...' : 'Modo Demonstracao'}
                </button>
              </div>

              {mode === 'register' && (
                <>
                  <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Nome completo" className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900" />
                  <input value={schoolName} onChange={(e) => setSchoolName(e.target.value)} placeholder="Escola (opcional)" className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900" />
                  <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Disciplina (opcional)" className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900" />
                </>
              )}

              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void onSubmit();
                  }
                }}
                placeholder="Email"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void onSubmit();
                  }
                }}
                placeholder="Senha"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              />

              {mode === 'register' && (
                <input
                  type="password"
                  value={accessCode}
                  onChange={(e) => setAccessCode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void onSubmit();
                    }
                  }}
                  placeholder="Codigo exclusivo de acesso para professores"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              )}

              {error && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-300 text-sm font-semibold">
                  {error}
                </div>
              )}

              <button
                onClick={() => void onSubmit()}
                disabled={loading}
                className="w-full py-3 rounded-xl font-black bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Processando...' : mode === 'login' ? 'Entrar como Professor' : 'Criar Conta de Professor'}
              </button>
            </>
          ) : (
            <div className="space-y-4">
              <div className="p-5 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-900/40">
                <h2 className="text-2xl font-black text-emerald-700 dark:text-emerald-300">Acesso autorizado</h2>
                <p className="text-slate-700 dark:text-slate-200 mt-2">Professor: {teacher.full_name}</p>
                <p className="text-slate-600 dark:text-slate-300">Email: {teacher.email}</p>
                <p className="text-slate-600 dark:text-slate-300">Escola: {teacher.school_name || 'Nao informada'}</p>
                <p className="text-slate-600 dark:text-slate-300">Disciplina: {teacher.subject || 'Nao informada'}</p>
              </div>

              <button
                onClick={() => {
                  localStorage.removeItem(TEACHER_TOKEN_STORAGE_KEY);
                  localStorage.removeItem(TEACHER_AUTO_DEMO_STORAGE_KEY);
                  setTeacher(null);
                  setDashboard(null);
                  setPassword('');
                  setAccessCode('');
                }}
                className="w-full py-3 rounded-xl font-black bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
              >
                Sair do Portal de Professores
              </button>

              <button
                onClick={() => {
                  if (teacher) {
                    void refreshAllTeacherData(teacher.id);
                  }
                }}
                disabled={loadingDashboard || loadingClasses || loadingRecommendations}
                className="w-full py-3 rounded-xl font-black bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {loadingDashboard || loadingClasses || loadingRecommendations ? 'Atualizando portal...' : 'Atualizar Portal'}
              </button>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                <button onClick={() => setActiveTab('overview')} className={`px-3 py-2 rounded-xl text-sm font-bold ${activeTab === 'overview' ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200'}`}>Resumo</button>
                <button onClick={() => setActiveTab('classes')} className={`px-3 py-2 rounded-xl text-sm font-bold ${activeTab === 'classes' ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200'}`}>Salas</button>
                <button onClick={() => setActiveTab('reports')} className={`px-3 py-2 rounded-xl text-sm font-bold ${activeTab === 'reports' ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200'}`}>Relatorios</button>
                <button onClick={() => setActiveTab('personalization')} className={`px-3 py-2 rounded-xl text-sm font-bold ${activeTab === 'personalization' ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200'}`}>Personalizar</button>
                <button onClick={() => setActiveTab('recommendations')} className={`px-3 py-2 rounded-xl text-sm font-bold ${activeTab === 'recommendations' ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200'}`}>Ideias IA</button>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Atalhos: Alt+1 Resumo, Alt+2 Salas, Alt+3 Relatorios, Alt+4 Personalizar, Alt+5 Ideias IA, Ctrl+R Atualizar portal, Esc limpa avisos.</p>

              {String(teacher.email || '').trim().toLowerCase() === TEACHER_DEMO_EMAIL && (
                <div className="rounded-2xl border border-indigo-200 dark:border-indigo-900/40 bg-indigo-50/80 dark:bg-indigo-900/20 p-4">
                  <p className="text-xs font-black uppercase tracking-wide text-indigo-700 dark:text-indigo-300">Demo Automatica do Professor</p>
                  <p className="text-sm text-slate-700 dark:text-slate-200 mt-1">Cada tela fica 10 segundos, com rolagem automatica da pagina inteira.</p>
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mt-2">Tela atual: {TEACHER_DEMO_TAB_SEQUENCE[autoDemoStep]}</p>
                  <button
                    onClick={() => {
                      setAutoDemoEnabled((prev) => {
                        const next = !prev;
                        if (next) {
                          localStorage.setItem(TEACHER_AUTO_DEMO_STORAGE_KEY, '1');
                        } else {
                          localStorage.removeItem(TEACHER_AUTO_DEMO_STORAGE_KEY);
                        }
                        return next;
                      });
                    }}
                    className={`mt-3 px-4 py-2 rounded-xl text-sm font-black transition-colors ${autoDemoEnabled ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600'}`}
                  >
                    {autoDemoEnabled ? 'Pausar demo automatica' : 'Ativar demo automatica'}
                  </button>
                </div>
              )}

              {dashboard && activeTab === 'overview' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-blue-100 dark:border-blue-900/30 bg-blue-50 dark:bg-blue-950/30 p-4">
                      <p className="text-xs font-bold text-blue-700 dark:text-blue-300 uppercase">Alunos totais</p>
                      <p className="text-2xl font-black text-blue-900 dark:text-blue-100">{dashboard.summary.totalStudents}</p>
                    </div>
                    <div className="rounded-2xl border border-indigo-100 dark:border-indigo-900/30 bg-indigo-50 dark:bg-indigo-950/30 p-4">
                      <p className="text-xs font-bold text-indigo-700 dark:text-indigo-300 uppercase">Ativos hoje</p>
                      <p className="text-2xl font-black text-indigo-900 dark:text-indigo-100">{dashboard.summary.activeToday}</p>
                    </div>
                    <div className="rounded-2xl border border-emerald-100 dark:border-emerald-900/30 bg-emerald-50 dark:bg-emerald-950/30 p-4">
                      <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300 uppercase">Nivel medio</p>
                      <p className="text-2xl font-black text-emerald-900 dark:text-emerald-100">{dashboard.summary.avgLevel || 0}</p>
                    </div>
                    <div className="rounded-2xl border border-amber-100 dark:border-amber-900/30 bg-amber-50 dark:bg-amber-950/30 p-4">
                      <p className="text-xs font-bold text-amber-700 dark:text-amber-300 uppercase">XP total</p>
                      <p className="text-2xl font-black text-amber-900 dark:text-amber-100">{dashboard.summary.totalXp}</p>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
                    <h3 className="font-black text-slate-900 dark:text-white mb-3">Turmas</h3>
                    {dashboard.classes.length === 0 ? (
                      <p className="text-sm text-slate-500 dark:text-slate-400">Nenhuma turma vinculada ainda.</p>
                    ) : (
                      <div className="space-y-2">
                        {dashboard.classes.map((c) => (
                          <div key={c.id} className="flex items-center justify-between rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3">
                            <div>
                              <p className="font-bold text-slate-800 dark:text-slate-100">{c.name}</p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">Nivel medio: {c.avgLevel || 0}</p>
                            </div>
                            <span className="text-sm font-black text-blue-700 dark:text-blue-300">{c.studentCount} aluno(s)</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
                    <h3 className="font-black text-slate-900 dark:text-white mb-3">Top alunos por XP</h3>
                    {dashboard.topStudents.length === 0 ? (
                      <p className="text-sm text-slate-500 dark:text-slate-400">Sem dados de alunos.</p>
                    ) : (
                      <div className="space-y-2">
                        {dashboard.topStudents.map((s) => (
                          <div key={s.email} className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3">
                            <p className="font-bold text-slate-800 dark:text-slate-100">{s.name}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">Nivel {s.level} • XP {s.xp} • Moedas {s.coins}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
                    <h3 className="font-black text-slate-900 dark:text-white mb-3">Topicos com mais dificuldade</h3>
                    {dashboard.strugglingTopics.length === 0 ? (
                      <p className="text-sm text-slate-500 dark:text-slate-400">Sem dados de progresso para analisar.</p>
                    ) : (
                      <div className="space-y-2">
                        {dashboard.strugglingTopics.map((t) => (
                          <div key={t.topic} className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3 flex items-center justify-between gap-3">
                            <p className="font-semibold text-slate-800 dark:text-slate-100">{t.topic}</p>
                            <p className="text-xs font-black text-rose-700 dark:text-rose-300">Dominio medio {t.avg_mastery}%</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <h3 className="font-black text-slate-900 dark:text-white">Heatmap de dominio por topico</h3>
                      <span className="text-xs font-bold text-slate-500 dark:text-slate-400">priorize os blocos mais quentes</span>
                    </div>
                    {dashboard.strugglingTopics.length === 0 ? (
                      <p className="text-sm text-slate-500 dark:text-slate-400">Sem dados para montar heatmap.</p>
                    ) : (
                      <div className="space-y-2">
                        {dashboard.strugglingTopics.slice(0, 8).map((t) => {
                          const tone = getMasteryTone(t.avg_mastery);
                          return (
                            <div key={`heat-${t.topic}`} className={`rounded-xl p-3 ${tone.row}`}>
                              <div className="flex items-center justify-between gap-3 mb-2">
                                <p className="font-semibold text-slate-800 dark:text-slate-100">{t.topic}</p>
                                <span className="text-xs font-black text-slate-700 dark:text-slate-200">{tone.label}</span>
                              </div>
                              <div className="h-2 w-full rounded-full bg-white/70 dark:bg-slate-800/80 overflow-hidden">
                                <div className={`h-full ${tone.bar} transition-all`} style={{ width: `${Math.max(5, Math.min(100, t.avg_mastery))}%` }} />
                              </div>
                              <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">Dominio medio {t.avg_mastery}% em {t.records} registro(s)</p>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
                    <h3 className="font-black text-slate-900 dark:text-white mb-3">Radar de alunos em risco</h3>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
                      <div className="rounded-xl p-3 bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-900/30">
                        <p className="text-xs font-bold uppercase text-rose-700 dark:text-rose-300">Risco alto</p>
                        <p className="text-2xl font-black text-rose-800 dark:text-rose-200">{riskSummary.high}</p>
                      </div>
                      <div className="rounded-xl p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/30">
                        <p className="text-xs font-bold uppercase text-amber-700 dark:text-amber-300">Risco medio</p>
                        <p className="text-2xl font-black text-amber-800 dark:text-amber-200">{riskSummary.medium}</p>
                      </div>
                      <div className="rounded-xl p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-900/30">
                        <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">Risco baixo</p>
                        <p className="text-2xl font-black text-emerald-800 dark:text-emerald-200">{riskSummary.low}</p>
                      </div>
                    </div>

                    {atRiskStudents.length === 0 ? (
                      <p className="text-sm text-slate-500 dark:text-slate-400">Sem alunos vinculados para analise.</p>
                    ) : (
                      <div className="space-y-2">
                        {atRiskStudents.slice(0, 6).map((s) => {
                          const riskClass = s.riskScore >= 70
                            ? 'text-rose-700 dark:text-rose-300'
                            : s.riskScore >= 45
                              ? 'text-amber-700 dark:text-amber-300'
                              : 'text-emerald-700 dark:text-emerald-300';

                          return (
                            <div key={`risk-${s.id}`} className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3">
                              <div className="flex items-center justify-between gap-3">
                                <p className="font-bold text-slate-800 dark:text-slate-100">{s.name}</p>
                                <span className={`text-xs font-black ${riskClass}`}>Risco {s.riskScore}%</span>
                              </div>
                              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Turma {s.className} • Nivel {s.level} • Dominio medio {s.avg_mastery}% • Ultima atividade ha {s.daysSinceActive} dia(s)</p>
                              <button
                                onClick={() => openQuickIntervention(s)}
                                className="mt-3 px-3 py-2 rounded-lg text-xs font-black bg-blue-600 text-white hover:bg-blue-700"
                              >
                                Criar plano rapido
                              </button>
                              <button
                                onClick={() => void saveQuickInterventionNow(s)}
                                disabled={quickSavingStudentId === s.id}
                                className="mt-2 ml-2 px-3 py-2 rounded-lg text-xs font-black bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                              >
                                {quickSavingStudentId === s.id ? 'Aplicando...' : 'Aplicar e salvar agora'}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'classes' && teacher && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
                    <h3 className="font-black text-slate-900 dark:text-white">Criar nova sala</h3>
                    <input
                      value={newClassName}
                      onChange={(e) => setNewClassName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void createClass();
                        }
                      }}
                      placeholder="Nome da sala (ex: 7A Matematica)"
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                    <input value={newClassGrade} onChange={(e) => setNewClassGrade(e.target.value)} placeholder="Serie/ano (opcional)" className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900" />
                    <textarea value={newClassDescription} onChange={(e) => setNewClassDescription(e.target.value)} placeholder="Descricao da sala (opcional)" className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 min-h-[88px]" />
                    <button onClick={() => void createClass()} disabled={loadingClasses} className="w-full py-3 rounded-xl font-black bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60">
                      {loadingClasses ? 'Criando sala...' : 'Criar Sala'}
                    </button>
                  </div>

                  <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
                    <h3 className="font-black text-slate-900 dark:text-white">Selecionar sala</h3>
                    <select
                      value={selectedClassId}
                      onChange={(e) => {
                        const nextId = Number(e.target.value);
                        setSelectedClassId(nextId);
                        if (teacher && nextId) {
                          void loadClassReport(teacher.id, nextId);
                          void loadPersonalizations(teacher.id, nextId);
                        }
                      }}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                    >
                      <option value={0}>Selecione uma sala</option>
                      {classes.map((c) => (
                        <option key={c.id} value={c.id}>{c.name} ({c.classCode})</option>
                      ))}
                    </select>

                    {selectedClass && (
                      <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3 text-sm text-slate-700 dark:text-slate-200">
                        <p className="font-bold">Codigo da sala: {selectedClass.classCode}</p>
                        <p>Alunos vinculados: {selectedClass.studentCount}</p>
                        <p>Serie: {selectedClass.gradeLabel || 'Nao informada'}</p>
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
                    <h3 className="font-black text-slate-900 dark:text-white">Vincular aluno cadastrado</h3>

                    <div className="rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/30 p-3 space-y-2">
                      <p className="text-sm font-bold text-blue-800 dark:text-blue-200">Adicionar aluno por e-mail na sala existente</p>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          value={directStudentEmail}
                          onChange={(e) => setDirectStudentEmail(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              void addStudentByEmailDirect();
                            }
                          }}
                          placeholder="Email do aluno (ex: aluno@email.com)"
                          className="flex-1 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                        />
                        <button
                          onClick={() => void addStudentByEmailDirect()}
                          disabled={!selectedClassId || linkingDirectStudent}
                          className="px-4 py-3 rounded-xl font-black bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {linkingDirectStudent ? 'Vinculando...' : 'Adicionar na sala'}
                        </button>
                      </div>
                      {!selectedClassId ? (
                        <p className="text-xs text-blue-700 dark:text-blue-300">Selecione uma sala acima para habilitar a vinculação direta.</p>
                      ) : null}
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        value={studentSearch}
                        onChange={(e) => setStudentSearch(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            void searchStudents();
                          }
                        }}
                        placeholder="Buscar por nome ou email"
                        className="flex-1 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                      <button onClick={() => void searchStudents()} disabled={searchingStudents} className="px-4 py-3 rounded-xl font-black bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60">
                        {searchingStudents ? 'Buscando...' : 'Buscar'}
                      </button>
                    </div>

                    <div className="space-y-2 max-h-64 overflow-auto">
                      {searchResults.map((s) => (
                        <div key={s.id} className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3 flex items-center justify-between gap-3">
                          <div>
                            <p className="font-bold text-slate-800 dark:text-slate-100">{s.name}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">{s.email} • Nivel {s.level} • XP {s.xp}</p>
                          </div>
                          <button
                            onClick={() => void addStudentToClass(s.email)}
                            disabled={!selectedClassId}
                            className="px-3 py-2 rounded-lg text-sm font-bold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                          >
                            Vincular
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
                    <h3 className="font-black text-slate-900 dark:text-white mb-3">Alunos da sala selecionada</h3>
                    {!selectedClass || selectedClass.students.length === 0 ? (
                      <p className="text-sm text-slate-500 dark:text-slate-400">Nenhum aluno nessa sala.</p>
                    ) : (
                      <div className="space-y-2">
                        {selectedClass.students.map((s) => (
                          <div key={s.id} className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3 flex items-center justify-between gap-3">
                            <div>
                              <p className="font-bold text-slate-800 dark:text-slate-100">{s.name}</p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">{s.email} • Nivel {s.level} • Dominio medio {s.avg_mastery}%</p>
                            </div>
                            <button onClick={() => void removeStudentFromClass(s.id)} className="px-3 py-2 rounded-lg text-sm font-bold bg-rose-600 text-white hover:bg-rose-700">
                              Remover
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'reports' && teacher && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
                    <h3 className="font-black text-slate-900 dark:text-white">Relatorio por sala</h3>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <select value={selectedClassId} onChange={(e) => setSelectedClassId(Number(e.target.value))} className="flex-1 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                        <option value={0}>Selecione uma sala</option>
                        {classes.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => {
                          if (selectedClassId) {
                            void loadClassReport(teacher.id, selectedClassId);
                          }
                        }}
                        disabled={loadingReport || !selectedClassId}
                        className="px-4 py-3 rounded-xl font-black bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                      >
                        {loadingReport ? 'Gerando...' : 'Gerar relatorio'}
                      </button>
                    </div>
                  </div>

                  {classReport && (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="rounded-2xl border border-indigo-100 dark:border-indigo-900/30 bg-indigo-50 dark:bg-indigo-950/30 p-4">
                          <p className="text-xs font-bold uppercase text-indigo-700 dark:text-indigo-300">Alunos</p>
                          <p className="text-2xl font-black text-indigo-900 dark:text-indigo-100">{classReport.summary.totalStudents}</p>
                        </div>
                        <div className="rounded-2xl border border-emerald-100 dark:border-emerald-900/30 bg-emerald-50 dark:bg-emerald-950/30 p-4">
                          <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">Ativos hoje</p>
                          <p className="text-2xl font-black text-emerald-900 dark:text-emerald-100">{classReport.summary.activeToday}</p>
                        </div>
                        <div className="rounded-2xl border border-blue-100 dark:border-blue-900/30 bg-blue-50 dark:bg-blue-950/30 p-4">
                          <p className="text-xs font-bold uppercase text-blue-700 dark:text-blue-300">Nivel medio</p>
                          <p className="text-2xl font-black text-blue-900 dark:text-blue-100">{classReport.summary.avgLevel}</p>
                        </div>
                        <div className="rounded-2xl border border-amber-100 dark:border-amber-900/30 bg-amber-50 dark:bg-amber-950/30 p-4">
                          <p className="text-xs font-bold uppercase text-amber-700 dark:text-amber-300">XP medio</p>
                          <p className="text-2xl font-black text-amber-900 dark:text-amber-100">{Math.round(classReport.summary.avgXp || 0)}</p>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
                        <h4 className="font-black text-slate-900 dark:text-white mb-3">Topicos criticos da sala</h4>
                        {classReport.byTopic.length === 0 ? (
                          <p className="text-sm text-slate-500 dark:text-slate-400">Sem dados ainda.</p>
                        ) : (
                          <div className="space-y-2">
                            {classReport.byTopic.slice(0, 6).map((t) => (
                              <div key={t.topic} className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3 flex items-center justify-between gap-3">
                                <p className="font-semibold text-slate-800 dark:text-slate-100">{t.topic}</p>
                                <p className="text-xs font-black text-rose-700 dark:text-rose-300">Dominio medio {t.avg_mastery}%</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
                        <h4 className="font-black text-slate-900 dark:text-white mb-3">Desempenho por aluno</h4>
                        <div className="space-y-2">
                          {classReport.students.map((s) => (
                            <div key={s.id} className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3">
                              <p className="font-bold text-slate-800 dark:text-slate-100">{s.name}</p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">Nivel {s.level} • XP {s.xp} • Dominio medio {s.avg_mastery}% • Topico mais fraco: {s.weakest_topic || 'Sem dados'}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {activeTab === 'personalization' && teacher && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
                    <h3 className="font-black text-slate-900 dark:text-white">Plano personalizado por aluno</h3>
                    <select value={selectedClassId} onChange={(e) => setSelectedClassId(Number(e.target.value))} className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                      <option value={0}>Selecione uma sala para personalizar</option>
                      {classes.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>

                    <select value={personalizationStudentId} onChange={(e) => setPersonalizationStudentId(Number(e.target.value))} className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                      <option value={0}>Selecione um aluno</option>
                      {(selectedClass?.students || []).map((s) => (
                        <option key={s.id} value={s.id}>{s.name} ({s.email})</option>
                      ))}
                    </select>

                    <input value={targetTopic} onChange={(e) => setTargetTopic(e.target.value)} placeholder="Topico prioritario (ex: fracoes)" className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900" />

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <input type="number" min={1} max={21} value={weeklyGoal} onChange={(e) => setWeeklyGoal(Number(e.target.value) || 3)} placeholder="Meta semanal" className="px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900" />
                      <select value={difficultyPreset} onChange={(e) => setDifficultyPreset(e.target.value)} className="px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                        <option value="reforco">Reforco</option>
                        <option value="equilibrado">Equilibrado</option>
                        <option value="desafio">Desafio</option>
                      </select>
                      <select value={supportStyle} onChange={(e) => setSupportStyle(e.target.value)} className="px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                        <option value="passo_a_passo">Passo a passo</option>
                        <option value="socratico">Socratico</option>
                        <option value="resumo_objetivo">Resumo objetivo</option>
                      </select>
                    </div>

                    <textarea value={focusNotes} onChange={(e) => setFocusNotes(e.target.value)} placeholder="Observacoes pedagogicas para o tutor do aluno" className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 min-h-[96px]" />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <button onClick={() => void savePersonalization()} className="py-3 rounded-xl font-black bg-emerald-600 text-white hover:bg-emerald-700">
                        Salvar personalizacao
                      </button>
                      <button onClick={() => void loadPersonalizations(teacher.id, selectedClassId || undefined)} disabled={loadingPersonalizations} className="py-3 rounded-xl font-black bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60">
                        {loadingPersonalizations ? 'Atualizando...' : 'Atualizar lista'}
                      </button>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
                    <h4 className="font-black text-slate-900 dark:text-white mb-3">Personalizacoes salvas</h4>
                    {personalizations.length === 0 ? (
                      <p className="text-sm text-slate-500 dark:text-slate-400">Nenhuma personalizacao salva ainda.</p>
                    ) : (
                      <div className="space-y-2">
                        {personalizations.map((p) => (
                          <div key={`${p.teacher_id}-${p.user_id}`} className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3">
                            <p className="font-bold text-slate-800 dark:text-slate-100">{p.student_name}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">Topico: {p.target_topic || 'geral'} • Meta/semana: {p.weekly_goal} • Dificuldade: {p.difficulty_preset} • Suporte: {p.support_style}</p>
                            {p.focus_notes ? <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">Notas: {p.focus_notes}</p> : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'recommendations' && teacher && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <h3 className="font-black text-slate-900 dark:text-white">Sugestoes automaticas de intervencao</h3>
                      <button onClick={() => void loadRecommendations(teacher.id)} disabled={loadingRecommendations} className="px-3 py-2 rounded-lg text-sm font-black bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60">
                        {loadingRecommendations ? 'Atualizando...' : 'Atualizar'}
                      </button>
                    </div>

                    {recommendations.length === 0 ? (
                      <p className="text-sm text-slate-500 dark:text-slate-400">Sem recomendacoes no momento. Gere mais atividades para obter sinais.</p>
                    ) : (
                      <div className="space-y-2">
                        {recommendations.map((r) => (
                          <div key={r.topic} className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-bold text-slate-800 dark:text-slate-100">{r.topic}</p>
                              <span className={`text-xs font-black px-2 py-1 rounded-full ${r.priority === 'alta' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300' : r.priority === 'media' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'}`}>
                                prioridade {r.priority}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400">Dominio medio: {r.mastery}%</p>
                            <p className="text-sm text-slate-700 dark:text-slate-200 mt-1">{r.suggestion}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
