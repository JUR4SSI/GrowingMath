import { useState, useEffect, useRef, Component, type ReactNode, type RefObject, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { apiUrl } from "./config";
import { BrowserRouter as Router, Routes, Route, Link, useNavigate, useLocation, useParams } from 'react-router-dom';
import { 
  LayoutDashboard, 
  BookOpen, 
  Trophy, 
  User as UserIcon, 
  MessageSquare, 
  ChevronRight, 
  Star, 
  Zap, 
  Coins, 
  Flame,
  Menu,
  X,
  Plus,
  PieChart,
  Variable,
  Square,
  TrendingUp,
  Triangle,
  School,
  BarChart3,
  CheckCircle2,
  AlertCircle,
  Users,
  Shield,
  Sword,
  Backpack,
  Search,
  Target,
  Navigation,
  ShoppingCart,
  Sun,
  Moon,
  LogOut
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { User, TOPICS, Topic, GradeLevel, HeroClass, ShopItem } from './types';
import { AiStatus, generateExercise, getAiStatus, getTutorResponse } from './services/geminiService';
import DailyChallenge from './components/DailyChallenge';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import Markdown from 'react-markdown';
import confetti from 'canvas-confetti';
import { USER_TOKEN_STORAGE_KEY } from './auth';

const AUTO_DEMO_STORAGE_KEY = 'growing_math_auto_demo';
const DEMO_PROFILE_EMAIL = 'demo@growingmath.app';

const AUTO_DEMO_ROUTES = [
  '/',
  '/trilhas',
  '/inventario',
  '/loja',
  '/missoes',
  '/conquistas',
  '/ranking',
  '/perfil',
  '/tutor',
  '/exercicio/ops-basicas',
];

const getUserAuthHeaders = (): HeadersInit => {
  const token = localStorage.getItem(USER_TOKEN_STORAGE_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// --- Gamified Components ---

const AnimatedCounter = ({ value, prefix = "" }: { value: number, prefix?: string }) => {
  const [displayValue, setDisplayValue] = useState(value);

  useEffect(() => {
    const duration = 1000;
    const start = displayValue;
    const end = value;
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const current = Math.floor(start + (end - start) * progress);
      setDisplayValue(current);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [value]);

  return <span>{prefix}{displayValue.toLocaleString()}</span>;
};

const JourneyMap = ({ user }: { user: User | null }) => {
  const stageLore: Record<string, { chapter: string; rune: string; aura: string; chip: string }> = {
    'ops-basicas': { chapter: 'Pradarias da Soma', rune: '+', aura: 'from-emerald-300/20 via-transparent to-transparent', chip: 'Runa Aritmética' },
    'fracoes': { chapter: 'Ruínas das Frações', rune: '1/2', aura: 'from-cyan-300/20 via-transparent to-transparent', chip: 'Selo Fracionário' },
    'equacoes-1': { chapter: 'Cripta das Equações', rune: 'x', aura: 'from-violet-300/20 via-transparent to-transparent', chip: 'Sigilo Algébrico' },
    'geometria-basica': { chapter: 'Bastião Geométrico', rune: '△', aura: 'from-amber-300/20 via-transparent to-transparent', chip: 'Emblema Geométrico' },
    'funcoes': { chapter: 'Vale das Funções', rune: 'f(x)', aura: 'from-indigo-300/20 via-transparent to-transparent', chip: 'Marca Funcional' },
    'trigonometria': { chapter: 'Picos Trigonométricos', rune: 'sin', aura: 'from-sky-300/20 via-transparent to-transparent', chip: 'Insígnia Angular' },
    'calculo-intro': { chapter: 'Citadela do Cálculo', rune: '∫', aura: 'from-rose-300/20 via-transparent to-transparent', chip: 'Selo do Infinito' },
  };

  // O traçado sai das coordenadas reais dos topicos. Antes era um `d` fixo escrito
  // a mao, que divergia dos nos e fazia os icones flutuarem fora da trilha.
  const journeyPath = TOPICS.map((topic, index) => `${index === 0 ? 'M' : 'L'} ${topic.x} ${topic.y}`).join(' ');

  return (
    <div className="relative w-full max-w-4xl mx-auto min-h-[1240px] md:min-h-[1320px] bg-emerald-50/30 dark:bg-emerald-900/10 rounded-[60px] p-6 md:p-12 pb-24 md:pb-28 overflow-hidden border-4 border-white dark:border-slate-800 shadow-inner transition-colors">
      <div className="absolute inset-0 bg-gradient-to-b from-emerald-100/60 via-cyan-50/40 to-white/70 dark:from-slate-900/40 dark:via-slate-900/20 dark:to-slate-950/30 pointer-events-none" />
      <div className="absolute inset-0 opacity-30 dark:opacity-20 pointer-events-none [background-image:radial-gradient(circle_at_1px_1px,rgba(14,116,144,0.25)_1px,transparent_0)] [background-size:24px_24px]" />

      {/* Background path SVG */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-20" viewBox="0 0 100 100" preserveAspectRatio="none">
        <path
          d={journeyPath}
          fill="none"
          stroke="url(#journeyGlow)"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="opacity-75"
        />
        <path
          d={journeyPath}
          fill="none"
          stroke="currentColor"
          strokeWidth="0.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="2 2"
          className="text-emerald-500 dark:text-emerald-400"
        />
        <defs>
          <linearGradient id="journeyGlow" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#22c55e" stopOpacity="0.95" />
            <stop offset="50%" stopColor="#06b6d4" stopOpacity="0.75" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0.95" />
          </linearGradient>
        </defs>
      </svg>

      {TOPICS.map((topic, index) => {
        const progress = user?.progress.find(p => p.topic === topic.id)?.mastery || 0;
        const isUnlocked = index === 0 || (user?.progress.find(p => p.topic === TOPICS[index-1].id)?.mastery || 0) >= 50;
        const safeX = Math.min(74, Math.max(26, topic.x));
        const safeY = Math.min(90, Math.max(6, topic.y));
        const lore = stageLore[topic.id] || { chapter: topic.title, rune: '?', aura: 'from-emerald-300/20 via-transparent to-transparent', chip: 'Trilha' };
        const Icon = {
          Plus, PieChart, Variable, Square, TrendingUp, Triangle, Zap
        }[topic.icon] || BookOpen;

        return (
          <motion.div
            key={topic.id}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: index * 0.1, type: 'spring' }}
            style={{
              position: 'absolute',
              left: `${safeX}%`,
              top: `${safeY}%`,
            }}
            // Caixa de tamanho zero: o ponto (x,y) vira a origem real do no, entao o
            // scale da animacao nasce no ponto da trilha. NAO colocar transform aqui -
            // o framer-motion reescreve a propriedade inteira ao animar `scale` e
            // apagaria qualquer translate de centralizacao.
            className="z-10 h-0 w-0"
          >
            <Link 
              to={isUnlocked ? `/exercicio/${topic.id}` : '#'}
              className={`absolute left-0 top-0 flex w-36 -translate-x-1/2 -translate-y-8 flex-col items-center md:w-48 md:-translate-y-10 group ${!isUnlocked ? 'cursor-not-allowed' : ''}`}
            >
              {index === 0 && isUnlocked && progress < 100 && (
                <div className="absolute -top-12 left-1/2 -translate-x-1/2 whitespace-nowrap bg-emerald-600 text-white px-3 py-1 rounded-full text-[10px] font-black animate-bounce shadow-lg">
                  COMECE AQUI!
                </div>
              )}

              {/* Brilho centrado no icone. Antes era `-inset-6` sobre o Link inteiro,
                  o que espalhava o brilho por cima dos rotulos. */}
              <div className={`pointer-events-none absolute -top-6 left-1/2 h-28 w-28 -translate-x-1/2 rounded-full bg-gradient-to-b ${lore.aura} blur-xl md:h-32 md:w-32`} />
              
              <motion.div 
                whileHover={isUnlocked ? { scale: 1.1, rotate: 5 } : {}}
                // `relative` e obrigatorio: sem ele a runa, o anel de progresso e a
                // estrela se ancoravam no Link inteiro e apareciam soltos, longe do icone.
                className={`relative w-16 h-16 md:w-20 md:h-20 rounded-[20px] md:rounded-[24px] flex items-center justify-center shadow-lg transition-all border-4 ${
                  isUnlocked 
                    ? progress === 100 
                      ? 'bg-emerald-500 border-emerald-200 text-white' 
                      : 'bg-white border-emerald-100 text-emerald-600'
                    : 'bg-slate-200 border-slate-300 text-slate-400'
                }`}
              >
                {isUnlocked ? <Icon size={32} /> : <X size={32} />}

                <div className="absolute -right-2 -top-2 z-20 w-7 h-7 rounded-full bg-slate-900 text-cyan-200 dark:bg-cyan-900 dark:text-cyan-100 border-2 border-cyan-300 dark:border-cyan-700 text-[10px] font-black flex items-center justify-center shadow-md">
                  {lore.rune}
                </div>

                {progress === 100 && (
                  <div className="absolute -left-2 -top-2 z-20 bg-yellow-400 text-white p-1 rounded-full shadow-md">
                    <Star size={14} fill="currentColor" />
                  </div>
                )}
                
                {/* Anel de progresso: viewBox fixo para acompanhar o icone, que muda
                    de 64px para 80px no breakpoint md. Sem isso o anel so ficava
                    alinhado no desktop. Circunferencia = 2*PI*36 = 226. */}
                {isUnlocked && (
                  <svg className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none" viewBox="0 0 80 80">
                    <circle 
                      cx="40" cy="40" r="36" 
                      fill="none" 
                      stroke="currentColor" 
                      strokeWidth="4" 
                      strokeDasharray={`${progress * 2.26} 226`}
                      className="opacity-20"
                    />
                  </svg>
                )}
              </motion.div>
              
              <div className="mt-3 flex w-full flex-col items-center gap-1">
                <div className={`px-3 py-1.5 rounded-full text-[11px] md:text-xs font-bold shadow-sm text-center leading-tight ${
                  isUnlocked ? 'bg-white text-slate-700 dark:bg-slate-800 dark:text-slate-100' : 'bg-slate-100 text-slate-400 dark:bg-slate-800/60 dark:text-slate-500'
                }`}>
                  Etapa {index + 1}: {topic.title}
                </div>

                <div className={`px-2.5 py-0.5 rounded-full text-[9px] md:text-[10px] font-black uppercase tracking-wider border text-center leading-tight ${
                  isUnlocked
                    ? 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-900/20 dark:text-cyan-200 dark:border-cyan-900/50'
                    : 'bg-slate-100 text-slate-400 border-slate-200 dark:bg-slate-800 dark:text-slate-500 dark:border-slate-700'
                }`}>
                  {lore.chip}
                </div>

                <div className={`text-[10px] font-semibold text-center leading-tight ${isUnlocked ? 'text-slate-600 dark:text-slate-300' : 'text-slate-400 dark:text-slate-500'}`}>
                  {lore.chapter}
                </div>
              </div>
            </Link>
          </motion.div>
        );
      })}
    </div>
  );
};


// --- Components ---

const Sidebar = ({ isOpen, toggle }: { isOpen: boolean, toggle: () => void }) => {
  const location = useLocation();
  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Trilhas', path: '/trilhas', icon: BookOpen },
    { name: 'Tutor IA', path: '/tutor', icon: MessageSquare },
    { name: 'Missões', path: '/missoes', icon: Target },
    { name: 'Conquistas', path: '/conquistas', icon: Trophy },
    { name: 'Inventário', path: '/inventario', icon: Backpack },
    { name: 'Loja', path: '/loja', icon: ShoppingCart },
    { name: 'Escola', path: '/escola', icon: School },
    { name: 'Ranking', path: '/ranking', icon: BarChart3 },
    { name: 'Perfil', path: '/perfil', icon: UserIcon },
  ];

  return (
    <>
      <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 transform ${isOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 transition-transform duration-300 ease-in-out`}>
        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-white font-bold text-xl">
            G
          </div>
          <span className="text-xl font-bold text-slate-800 dark:text-white transition-colors">Growing Math</span>
        </div>
        
        <nav className="mt-6 px-4 space-y-1">
          {navItems.map((item, index) => (
            <Link
              key={item.path}
              to={item.path}
              accessKey={String((index + 1) % 10)}
              title={`Atalho: Alt+${(index + 1) % 10}`}
              onClick={() => window.innerWidth < 1024 && toggle()}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
                location.pathname === item.path 
                  ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' 
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <item.icon size={20} />
              <span className="font-medium">{item.name}</span>
            </Link>
          ))}
        </nav>

      </div>
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 lg:hidden" 
          onClick={toggle}
        />
      )}
    </>
  );
};

const Header = ({ user, toggleSidebar, darkMode, toggleDarkMode, onLogout, onExitApp, searchInputRef }: { 
  user: User | null, 
  toggleSidebar: () => void,
  darkMode: boolean,
  toggleDarkMode: () => void,
  onLogout: () => void,
  onExitApp: () => void,
  searchInputRef: RefObject<HTMLInputElement | null>
}) => {
  return (
    <header className="h-16 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 sticky top-0 z-30 px-4 lg:px-8 flex items-center justify-between transition-colors">
      <button onClick={toggleSidebar} className="lg:hidden p-2 text-slate-500 dark:text-slate-400">
        <Menu size={24} />
      </button>

      <div className="hidden md:flex items-center gap-2 bg-slate-100 dark:bg-slate-800 px-4 py-2 rounded-full w-96 transition-colors">
        <Search size={18} className="text-slate-400 dark:text-slate-500" />
        <input 
          ref={searchInputRef}
          type="text" 
          placeholder="Buscar tópicos, exercícios..." 
          aria-label="Buscar topicos"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.currentTarget.value = '';
              e.currentTarget.blur();
            }
          }}
          className="bg-transparent border-none focus:outline-none text-sm w-full dark:text-slate-200 dark:placeholder-slate-500"
        />
      </div>

      <div className="flex items-center gap-4 lg:gap-6">
        <button 
          onClick={toggleDarkMode}
          className="p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
        >
          {darkMode ? <Sun size={20} /> : <Moon size={20} />}
        </button>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 rounded-full border border-orange-100 dark:border-orange-900/30 transition-colors">
          <Flame size={18} fill="currentColor" />
          <span className="text-sm font-bold">
            <AnimatedCounter value={user?.streak || 0} />
          </span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400 rounded-full border border-yellow-100 dark:border-yellow-900/30 transition-colors">
          <Coins size={18} fill="currentColor" />
          <span className="text-sm font-bold">
            <AnimatedCounter value={user?.coins || 0} />
          </span>
        </div>
        <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 border-2 border-white dark:border-slate-800 shadow-sm flex items-center justify-center text-emerald-700 dark:text-emerald-400 font-bold overflow-hidden transition-colors">
          {user?.name?.[0].toUpperCase() || 'U'}
        </div>
        <button
          onClick={onLogout}
          className="px-3 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          title="Sair e trocar perfil"
        >
          <LogOut size={16} /> Sair
        </button>
        <button
          onClick={onExitApp}
          className="px-3 py-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
          title="Fechar aplicativo"
        >
          <X size={16} /> Fechar App
        </button>
      </div>
    </header>
  );
};

const KeyboardNavigation = ({
  onToggleSidebar,
  onToggleDarkMode,
  onLogout,
  searchInputRef,
}: {
  onToggleSidebar: () => void;
  onToggleDarkMode: () => void;
  onLogout: () => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
}) => {
  const navigate = useNavigate();

  useEffect(() => {
    const routeShortcuts: Record<string, string> = {
      '1': '/',
      '2': '/trilhas',
      '3': '/tutor',
      '4': '/missoes',
      '5': '/conquistas',
      '6': '/inventario',
      '7': '/loja',
      '8': '/ranking',
      '9': '/perfil',
      '0': '/escola',
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTypingTarget = Boolean(
        target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)
      );

      if (event.key === '/' && !isTypingTarget) {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (event.key === 'Escape' && document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }

      if (isTypingTarget) return;

      if (event.altKey && routeShortcuts[event.key]) {
        event.preventDefault();
        navigate(routeShortcuts[event.key]);
        return;
      }

      if (event.ctrlKey && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        onToggleSidebar();
        return;
      }

      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        onToggleDarkMode();
        return;
      }

      if (event.ctrlKey && event.key.toLowerCase() === 'q') {
        event.preventDefault();
        onLogout();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate, onToggleSidebar, onToggleDarkMode, onLogout, searchInputRef]);

  return null;
};

const GrowthTree = ({ mastery, completedTopics, totalTopics }: { mastery: number; completedTopics: number; totalTopics: number }) => {
  const safeMastery = Math.max(0, Math.min(100, mastery));
  const growthVisual = Math.round(Math.pow(safeMastery / 100, 1.2) * 100);
  const safeTotalTopics = Math.max(1, totalTopics);
  const safeCompletedTopics = Math.max(0, Math.min(completedTopics, safeTotalTopics));
  const milestoneProgress = Math.round((safeCompletedTopics / safeTotalTopics) * 100);
  const fruitsVisible = Math.max(1, Math.min(7, safeCompletedTopics + (safeMastery >= 90 ? 1 : 0)));

  const stages = [
    { min: 0, max: 9, label: 'Semente' },
    { min: 10, max: 19, label: 'Broto' },
    { min: 20, max: 34, label: 'Caule' },
    { min: 35, max: 49, label: 'Muda' },
    { min: 50, max: 64, label: 'Árvore Jovem' },
    { min: 65, max: 79, label: 'Árvore Frondosa' },
    { min: 80, max: 89, label: 'Árvore Antiga' },
    { min: 90, max: 97, label: 'Árvore Ancestral' },
    { min: 98, max: 100, label: 'Árvore Lendária' },
  ];

  const currentStage = stages.find((s) => safeMastery >= s.min && safeMastery <= s.max) || stages[0];
  const treeScale = 0.78 + growthVisual / 220;

  const fruitSpots = [
    { left: '22%', top: '33%' },
    { left: '34%', top: '23%' },
    { left: '49%', top: '38%' },
    { left: '60%', top: '26%' },
    { left: '72%', top: '35%' },
    { left: '40%', top: '49%' },
    { left: '57%', top: '53%' },
  ];

  return (
    <div className="relative w-full rounded-[44px] border-4 border-white dark:border-slate-800 shadow-2xl overflow-hidden bg-gradient-to-br from-emerald-100 via-emerald-50 to-lime-100 dark:from-slate-900 dark:via-slate-900 dark:to-emerald-950/40">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.55),rgba(255,255,255,0)_45%)] dark:bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.1),rgba(255,255,255,0)_45%)]" />

      <div className="relative px-7 pt-8 pb-6 md:px-10 md:pt-10">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
          <div className="max-w-md">
            <p className="text-[13px] font-black tracking-[0.18em] uppercase text-emerald-700/90 dark:text-emerald-300">Evolução Orgânica</p>
            <h3 className="mt-2 text-5xl leading-none font-black text-slate-800 dark:text-slate-100 font-display">Nível {currentStage.label}</h3>
            <p className="mt-2 text-2xl font-black text-emerald-700 dark:text-emerald-300">Marcos concluídos: {safeCompletedTopics}/{safeTotalTopics} tópicos</p>
          </div>

          <div className="relative h-64 md:h-72 w-full md:w-[23rem] shrink-0">
            <motion.div
              key={`${currentStage.label}-${safeCompletedTopics}`}
              initial={{ opacity: 0, y: 18, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.55, ease: 'easeOut' }}
              className="absolute inset-0 flex items-end justify-center"
            >
              <div className="absolute left-1/2 -translate-x-1/2 bottom-6 w-72 h-14 rounded-[100%] bg-emerald-500/30 dark:bg-emerald-400/10 blur-xl" />

              <div className="relative w-[19rem] h-[16.5rem]" style={{ transform: `scale(${treeScale})`, transformOrigin: 'center bottom' }}>
                <svg viewBox="0 0 320 280" className="absolute inset-0 w-full h-full" aria-hidden="true">
                  <defs>
                    <linearGradient id="gmTrunk" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#065f46" />
                      <stop offset="100%" stopColor="#064e3b" />
                    </linearGradient>
                    <linearGradient id="gmCanopyA" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#10b981" />
                      <stop offset="100%" stopColor="#0f766e" />
                    </linearGradient>
                    <linearGradient id="gmCanopyB" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#059669" />
                      <stop offset="100%" stopColor="#0f766e" />
                    </linearGradient>
                  </defs>

                  <ellipse cx="160" cy="252" rx="92" ry="16" fill="rgba(16, 185, 129, 0.25)" />

                  <path d="M145 170 C135 178, 126 194, 126 220 C126 246, 141 262, 160 262 C179 262, 194 246, 194 220 C194 194, 185 178, 175 170 Z" fill="url(#gmTrunk)" />
                  <path d="M132 196 C120 190, 108 188, 96 189" stroke="#065f46" strokeWidth="8" strokeLinecap="round" fill="none" />
                  <path d="M188 200 C201 195, 214 194, 228 195" stroke="#065f46" strokeWidth="8" strokeLinecap="round" fill="none" />

                  <circle cx="160" cy="96" r="68" fill="url(#gmCanopyA)" />
                  <circle cx="106" cy="126" r="50" fill="url(#gmCanopyB)" />
                  <circle cx="214" cy="132" r="52" fill="url(#gmCanopyB)" />
                  <circle cx="152" cy="150" r="56" fill="#047857" opacity="0.9" />
                  <circle cx="191" cy="154" r="46" fill="#0f766e" opacity="0.88" />
                </svg>

                {fruitSpots.slice(0, fruitsVisible).map((spot, index) => (
                  <motion.div
                    key={`fruit-${index}`}
                    animate={{ opacity: [0.75, 1, 0.75] }}
                    transition={{ duration: 2.2 + index * 0.22, repeat: Infinity }}
                    className="absolute w-4 h-4 rounded-full bg-lime-300 shadow-[0_0_14px_rgba(190,242,100,0.9)]"
                    style={{ left: spot.left, top: spot.top }}
                  />
                ))}
              </div>
            </motion.div>
          </div>
        </div>

        <div className="mt-6 rounded-3xl border border-white/80 dark:border-slate-700/60 bg-white/55 dark:bg-slate-900/45 backdrop-blur-sm px-6 py-5 space-y-5">
          <div>
            <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-[0.16em] text-slate-500 dark:text-slate-300">
              <span>Progresso de Maestria</span>
              <span className="text-emerald-700 dark:text-emerald-300 text-2xl tracking-normal">{safeMastery}%</span>
            </div>
            <div className="mt-2 h-6 rounded-full bg-white/80 dark:bg-slate-900/65 border-2 border-white dark:border-slate-700 p-1 shadow-inner">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${growthVisual}%` }}
                className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-emerald-500 to-teal-600"
              />
            </div>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 font-semibold">
              A árvore cresce em ritmo progressivo para destacar melhor cada fase da jornada.
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-[0.16em] text-slate-500 dark:text-slate-300">
              <span>Marcos por Tópico</span>
              <span className="text-emerald-700 dark:text-emerald-300 text-2xl tracking-normal">{milestoneProgress}%</span>
            </div>
            <div className="mt-2 h-6 rounded-full bg-white/80 dark:bg-slate-900/65 border-2 border-white dark:border-slate-700 p-1 shadow-inner">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${milestoneProgress}%` }}
                className="h-full rounded-full bg-gradient-to-r from-lime-400 via-emerald-500 to-teal-600"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

class RouteErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; errorMessage: string }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido.';
    return { hasError: true, errorMessage: message };
  }

  componentDidCatch(error: unknown) {
    console.error('Erro de renderizacao em rota:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="max-w-2xl mx-auto mt-10 p-8 bg-white dark:bg-slate-900 rounded-3xl border border-red-200 dark:border-red-900/40">
          <h2 className="text-2xl font-black text-red-600 dark:text-red-400 mb-2">Erro ao renderizar esta tela</h2>
          <p className="text-slate-600 dark:text-slate-300 mb-6">
            A rota encontrou um erro inesperado e foi interrompida para evitar tela branca.
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-6 break-all">{this.state.errorMessage}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-5 py-2 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700"
          >
            Recarregar aplicativo
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

type AuthProfile = {
  id: number;
  name: string;
  email: string;
  level: number;
};

const AccessPortal = ({
  profiles,
  onLogin,
  onDemoLogin,
  onRegister,
  onRefresh,
}: {
  profiles: AuthProfile[];
  onLogin: (email: string, password: string) => Promise<void>;
  onDemoLogin: () => Promise<void>;
  onRegister: (name: string, email: string, password: string) => Promise<void>;
  onRefresh: () => Promise<void>;
}) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [selectedEmail, setSelectedEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [registerName, setRegisterName] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [rememberProfile, setRememberProfile] = useState(() => {
    return localStorage.getItem('rememberProfileEmail') ? true : false;
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const remembered = localStorage.getItem('rememberProfileEmail');
    if (remembered && profiles.some((p) => p.email === remembered)) {
      setSelectedEmail(remembered);
      return;
    }

    if (profiles.length > 0 && !selectedEmail) {
      setSelectedEmail(profiles[0].email);
    }
  }, [profiles, selectedEmail]);

  const handleLogin = async () => {
    if (!selectedEmail || !loginPassword) {
      setError('Informe perfil e senha para entrar.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await onLogin(selectedEmail, loginPassword);
      if (rememberProfile) {
        localStorage.setItem('rememberProfileEmail', selectedEmail);
      } else {
        localStorage.removeItem('rememberProfileEmail');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Nao foi possivel entrar no perfil.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegister = async () => {
    if (!registerName || !registerEmail || !registerPassword) {
      setError('Preencha nome, email e senha para criar um perfil.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await onRegister(registerName, registerEmail, registerPassword);
      if (rememberProfile) {
        localStorage.setItem('rememberProfileEmail', registerEmail.trim().toLowerCase());
      } else {
        localStorage.removeItem('rememberProfileEmail');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Nao foi possivel criar o perfil.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDemoLogin = async () => {
    setSubmitting(true);
    setError('');
    try {
      await onDemoLogin();
      localStorage.setItem('rememberProfileEmail', 'demo@growingmath.app');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Nao foi possivel abrir o modo demonstracao.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-cyan-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex items-start md:items-center justify-center p-0 sm:p-4 md:p-6">
      <div className="w-full min-h-screen md:min-h-0 md:max-w-4xl bg-white/95 dark:bg-slate-900/95 md:rounded-[40px] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden backdrop-blur-sm">
        <div className="p-8 bg-gradient-to-r from-emerald-600 to-teal-600 text-white">
          <h1 className="text-3xl font-black">Acesso Seguro de Perfis</h1>
          <p className="opacity-90 mt-2">Entre em um perfil existente ou crie um novo com senha.</p>
          <button
            onClick={() => {
              window.location.href = '/professores';
            }}
            className="mt-4 px-4 py-2 rounded-xl bg-white/20 hover:bg-white/30 text-white font-bold"
          >
            Abrir App de Professores
          </button>
        </div>

        <div className="p-5 sm:p-6 md:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => setMode('login')}
              className={`px-4 py-2 rounded-xl font-bold ${mode === 'login' ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200'}`}
            >
              Entrar em Perfil
            </button>
            <button
              onClick={() => setMode('register')}
              className={`px-4 py-2 rounded-xl font-bold ${mode === 'register' ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200'}`}
            >
              Criar Perfil
            </button>
            <button
              onClick={() => void onRefresh()}
              className="sm:ml-auto px-4 py-2 rounded-xl font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
            >
              Atualizar Lista
            </button>
          </div>

          <button
            type="button"
            onClick={() => void handleDemoLogin()}
            disabled={submitting}
            className="w-full py-3 rounded-xl font-black bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {submitting ? 'Entrando no modo demonstracao...' : 'Entrar no Modo Demonstracao'}
          </button>

          {mode === 'login' ? (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void handleLogin();
              }}
            >
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-200">Perfil</label>
              <select
                value={selectedEmail}
                onChange={(e) => setSelectedEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              >
                {profiles.length === 0 && <option value="">Nenhum perfil cadastrado</option>}
                {profiles.map((p) => (
                  <option key={p.id} value={p.email}>{p.name} ({p.email}) - Nvl {p.level}</option>
                ))}
              </select>

              <label className="block text-sm font-bold text-slate-700 dark:text-slate-200">Senha</label>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="Digite sua senha"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              />

              <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={rememberProfile}
                  onChange={(e) => setRememberProfile(e.target.checked)}
                />
                Lembrar perfil neste dispositivo (somente email)
              </label>

              <button
                type="submit"
                disabled={submitting || profiles.length === 0}
                className="w-full py-3 rounded-xl font-black bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {submitting ? 'Entrando...' : 'Entrar'}
              </button>
            </form>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void handleRegister();
              }}
            >
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-200">Nome</label>
              <input
                value={registerName}
                onChange={(e) => setRegisterName(e.target.value)}
                placeholder="Nome do perfil"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              />

              <label className="block text-sm font-bold text-slate-700 dark:text-slate-200">Email</label>
              <input
                value={registerEmail}
                onChange={(e) => setRegisterEmail(e.target.value)}
                placeholder="email@perfil.com"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              />

              <label className="block text-sm font-bold text-slate-700 dark:text-slate-200">Senha forte (8+ com maiuscula, minuscula, numero e simbolo)</label>
              <input
                type="password"
                value={registerPassword}
                onChange={(e) => setRegisterPassword(e.target.value)}
                placeholder="Crie uma senha"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              />

              <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={rememberProfile}
                  onChange={(e) => setRememberProfile(e.target.checked)}
                />
                Lembrar perfil neste dispositivo (somente email)
              </label>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 rounded-xl font-black bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {submitting ? 'Criando perfil...' : 'Criar e Entrar'}
              </button>
            </form>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-300 text-sm font-semibold">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const SchoolDashboard = () => {
  const [classes, setClasses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(apiUrl('/api/teacher/classes'))
      .then(async (res) => {
        if (!res.ok) throw new Error(`Falha ao carregar turmas: ${res.status}`);
        return await res.json();
      })
      .then(data => {
        setClasses(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        console.error(err);
        setClasses([]);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="p-10 text-center">Carregando dados escolares...</div>;

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 dark:text-white font-display transition-colors">Painel do Professor</h1>
          <p className="text-slate-500 dark:text-slate-400 transition-colors">Gestão de turmas e análise de desempenho preditivo.</p>
        </div>
        <button className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold text-sm flex items-center gap-2">
          <Plus size={18} /> Nova Turma
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {classes.map(cls => (
          <div key={cls.id} className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-[32px] border border-slate-200 dark:border-slate-800 p-8 shadow-sm transition-colors">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center transition-colors">
                  <Users size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-800 dark:text-white transition-colors">{cls.name}</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 transition-colors">{cls.students.length} Alunos Ativos</p>
                </div>
              </div>
              <button className="text-emerald-600 dark:text-emerald-400 font-bold text-sm transition-colors">Ver Detalhes</button>
            </div>

            <div className="space-y-6">
              <div className="p-6 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 transition-colors">
                <h4 className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase mb-4 flex items-center gap-2 transition-colors">
                  <BarChart3 size={16} /> Alerta Pedagógico
                </h4>
                <div className="flex items-start gap-4">
                  <div className="p-2 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-lg transition-colors">
                    <AlertCircle size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-200 transition-colors">Dificuldade em "Equações de 1º Grau"</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 transition-colors">65% da turma está abaixo da média esperada neste tópico. Sugerimos uma revisão presencial ou lista extra.</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 border border-slate-100 dark:border-slate-800 rounded-2xl transition-colors">
                  <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase transition-colors">Média da Turma</p>
                  <p className="text-2xl font-bold text-slate-800 dark:text-white transition-colors">78%</p>
                </div>
                <div className="p-4 border border-slate-100 dark:border-slate-800 rounded-2xl transition-colors">
                  <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase transition-colors">Previsão ENEM</p>
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 transition-colors">640 pts</p>
                </div>
              </div>
            </div>
          </div>
        ))}

        <div className="bg-white dark:bg-slate-900 rounded-[32px] border border-slate-200 dark:border-slate-800 p-8 shadow-sm transition-colors">
          <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-6 transition-colors">Sugestões de IA</h3>
          <div className="space-y-4">
            {[
              "Gerar lista de revisão para João Silva",
              "Aplicar simulado de Trigonometria",
              "Enviar feedback positivo para Maria Oliveira",
              "Agendar reunião com pais de Pedro Santos"
            ].map((s, i) => (
              <div key={i} className="p-4 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 rounded-2xl text-sm font-medium border border-emerald-100 dark:border-emerald-800 flex items-center justify-between transition-colors">
                {s} <ChevronRight size={16} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const AchievementsView = ({ user }: { user: User | null }) => {
  const totalMastery = (user?.progress || []).reduce((acc, p) => acc + (p.mastery || 0), 0);
  const avgMastery = TOPICS.length ? Math.round(totalMastery / TOPICS.length) : 0;
  const completedTopics = (user?.progress || []).filter((p) => p.mastery >= 100).length;
  const equippedCount = (user?.inventory || []).filter((i) => i.equipped).length;
  const inventoryCount = (user?.inventory || []).length;

  const achievements = [
    { title: 'Primeiros Passos', desc: 'Concluiu o primeiro exercício', icon: Zap, color: 'bg-blue-500', rarity: 'Comum', unlocked: true },
    { title: 'Mestre da Soma', desc: '100% de domínio em Operações Básicas', icon: Plus, color: 'bg-emerald-500', rarity: 'Raro', unlocked: user?.progress.some(p => p.topic === 'ops-basicas' && p.mastery === 100) },
    { title: 'Persistente', desc: 'Manteve um streak de 7 dias', icon: Flame, color: 'bg-orange-500', rarity: 'Épico', unlocked: (user?.streak || 0) >= 7 },
    { title: 'Explorador Geométrico', desc: 'Iniciou a trilha de Geometria', icon: Square, color: 'bg-purple-500', rarity: 'Comum', unlocked: user?.progress.some(p => p.topic === 'geometria-basica') },
    { title: 'Cérebro de Ouro', desc: 'Acumulou 1000 moedas', icon: Coins, color: 'bg-yellow-500', rarity: 'Lendário', unlocked: (user?.coins || 0) >= 1000 },
    { title: 'Vanguarda', desc: 'Alcançou nível 5', icon: TrendingUp, color: 'bg-cyan-500', rarity: 'Raro', unlocked: (user?.level || 1) >= 5 },
    { title: 'Lenda em Formação', desc: 'Alcançou nível 10', icon: Trophy, color: 'bg-indigo-500', rarity: 'Épico', unlocked: (user?.level || 1) >= 10 },
    { title: 'Colecionador Arcano', desc: 'Obteve 6 itens no inventário', icon: Backpack, color: 'bg-fuchsia-500', rarity: 'Raro', unlocked: inventoryCount >= 6 },
    { title: 'Build Completa', desc: 'Equipou 4 itens simultaneamente', icon: Shield, color: 'bg-teal-500', rarity: 'Épico', unlocked: equippedCount >= 4 },
    { title: 'Especialista de Trilhas', desc: 'Concluiu 3 tópicos com 100%', icon: CheckCircle2, color: 'bg-lime-500', rarity: 'Épico', unlocked: completedTopics >= 3 },
    { title: 'Arquiteto do Saber', desc: 'Média de domínio geral >= 60%', icon: PieChart, color: 'bg-violet-500', rarity: 'Raro', unlocked: avgMastery >= 60 },
    { title: 'Mestre Supremo', desc: 'Concluiu todos os tópicos com 100%', icon: Star, color: 'bg-amber-500', rarity: 'Lendário', unlocked: completedTopics >= TOPICS.length },
    { title: 'Rico da Guilda', desc: 'Acumulou 2500 moedas', icon: Coins, color: 'bg-yellow-600', rarity: 'Lendário', unlocked: (user?.coins || 0) >= 2500 },
  ];

  const rarityColors = {
    'Comum': 'text-slate-400 dark:text-slate-500 border-slate-100 dark:border-slate-800',
    'Raro': 'text-blue-500 border-blue-100 dark:border-blue-900/30 bg-blue-50/30 dark:bg-blue-900/10',
    'Épico': 'text-purple-500 border-purple-100 dark:border-purple-900/30 bg-purple-50/30 dark:bg-purple-900/10',
    'Lendário': 'text-yellow-600 border-yellow-200 dark:border-yellow-900/30 bg-yellow-50/30 dark:bg-yellow-900/10 shadow-yellow-100 dark:shadow-none',
  };

  return (
    <div className="space-y-8">
      <div className="text-center max-w-2xl mx-auto">
        <h1 className="text-4xl font-extrabold text-slate-800 dark:text-white font-display tracking-tight transition-colors">Suas Conquistas</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-2 transition-colors">Colecione medalhas raras e mostre seu progresso ao mundo.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
        {achievements.map((ach, i) => (
          <motion.div 
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            whileHover={ach.unlocked ? { y: -10, scale: 1.02 } : {}}
            className={`relative p-8 rounded-[48px] border-4 flex flex-col items-center text-center transition-all ${
              ach.unlocked 
                ? `bg-white dark:bg-slate-900 ${rarityColors[ach.rarity as keyof typeof rarityColors]} shadow-2xl` 
                : 'bg-slate-50 dark:bg-slate-800/50 border-dashed border-slate-200 dark:border-slate-800 grayscale opacity-40'
            }`}
          >
            {ach.rarity === 'Lendário' && ach.unlocked && (
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
                className="absolute inset-0 rounded-[48px] border-4 border-yellow-400/20 border-t-yellow-400 pointer-events-none"
              />
            )}

            <div className={`w-24 h-24 ${ach.color} rounded-[32px] flex items-center justify-center text-white mb-6 shadow-xl relative z-10`}>
              <ach.icon size={48} />
              {ach.unlocked && (
                <motion.div 
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute -top-2 -right-2 bg-white dark:bg-slate-800 text-emerald-500 p-1.5 rounded-full shadow-lg border-2 border-emerald-50 dark:border-emerald-900/30 transition-colors"
                >
                  <CheckCircle2 size={16} />
                </motion.div>
              )}
            </div>

            <div className="relative z-10">
              <span className={`text-[10px] font-black uppercase tracking-widest mb-2 block ${ach.unlocked ? '' : 'text-slate-400 dark:text-slate-500'}`}>
                {ach.rarity}
              </span>
              <h3 className="font-black text-xl text-slate-800 dark:text-white mb-2 transition-colors">{ach.title}</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed font-medium transition-colors">{ach.desc}</p>
            </div>

            {!ach.unlocked && (
              <div className="mt-6 flex items-center gap-1 text-slate-400 dark:text-slate-500 font-bold text-xs transition-colors">
                <X size={14} /> Bloqueado
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
};

const InventoryView = ({ user, onUpdate }: { user: User | null, onUpdate: () => void }) => {
  const rarityColors = {
    'Comum': 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50',
    'Raro': 'border-blue-200 dark:border-blue-900/30 bg-blue-50 dark:bg-blue-900/10',
    'Épico': 'border-purple-200 dark:border-purple-900/30 bg-purple-50 dark:bg-purple-900/10',
    'Lendário': 'border-yellow-200 dark:border-yellow-900/30 bg-yellow-50 dark:bg-yellow-900/10',
  };

  const handleEquip = async (inventoryId: number, currentlyEquipped: boolean) => {
    if (!user) return;
    const response = await fetch(apiUrl('/api/user/equip-item'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getUserAuthHeaders() },
      body: JSON.stringify({ inventoryId, equipped: !currentlyEquipped })
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      alert(data?.error || 'Nao foi possivel equipar este item.');
      return;
    }

    onUpdate();
  };

  const equippedCounts = (user?.inventory || []).reduce((acc, item) => {
    if (!item.equipped) return acc;
    const slot = resolveEquipSlot(item.equip_type || item.type, item.name);
    acc[slot] += 1;
    return acc;
  }, { accessory: 0, armor: 0, weapon_1h: 0, weapon_2h: 0, shield: 0 } as Record<EquipSlot, number>);

  const equippedBySlot = (user?.inventory || []).reduce((acc, item) => {
    if (!item.equipped) return acc;
    const slot = resolveEquipSlot(item.equip_type || item.type, item.name);
    acc[slot].push(item);
    return acc;
  }, {
    accessory: [],
    armor: [],
    weapon_1h: [],
    weapon_2h: [],
    shield: [],
  } as Record<EquipSlot, Array<(typeof user extends null ? never : NonNullable<typeof user>['inventory'][number])>>);

  const slotOrder: EquipSlot[] = ['weapon_2h', 'weapon_1h', 'shield', 'armor', 'accessory'];

  const getSlotIcon = (slot: EquipSlot) => {
    if (slot === 'accessory') return <Coins size={14} />;
    if (slot === 'armor' || slot === 'shield') return <Shield size={14} />;
    return <Sword size={14} />;
  };

  const equippedTwoHand = equippedBySlot.weapon_2h[0] || null;
  const equippedMainHand = equippedTwoHand || equippedBySlot.weapon_1h[0] || null;
  const equippedOffHand = equippedTwoHand || equippedBySlot.shield[0] || equippedBySlot.weapon_1h[1] || null;
  const equippedArmor = equippedBySlot.armor[0] || null;
  const equippedAccessoryA = equippedBySlot.accessory[0] || null;
  const equippedAccessoryB = equippedBySlot.accessory[1] || null;

  const renderEquipSlot = (
    title: string,
    item: { name: string; equip_type?: string; type: string } | null,
    hint: string,
    blocked = false
  ) => (
    <div className="rounded-xl border border-slate-300 bg-white/80 px-2.5 py-2 min-h-[68px] dark:border-slate-700/90 dark:bg-slate-900/80">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase font-black tracking-wide text-slate-500 dark:text-slate-400">{title}</p>
        {blocked ? (
          <span className="text-[9px] font-black uppercase tracking-wide text-amber-700 dark:text-amber-300">Bloqueada</span>
        ) : null}
      </div>
      {item ? (
        <div className="mt-1.5 flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-slate-100 border border-slate-300 flex items-center justify-center shrink-0 dark:bg-slate-800 dark:border-slate-700">
            <ItemArtwork itemName={item.name} itemType={item.equip_type || item.type} size={18} />
          </div>
          <p className="text-[11px] font-semibold text-cyan-700 dark:text-cyan-100 truncate">{item.name}</p>
        </div>
      ) : (
        <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-500">{hint}</p>
      )}
    </div>
  );

  return (
    <div className="space-y-8">
      <div className="text-center max-w-2xl mx-auto">
        <h1 className="text-4xl font-extrabold text-slate-800 dark:text-white font-display tracking-tight transition-colors">Seu Inventário</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-2 transition-colors">Equipe itens mágicos para ganhar bônus de aprendizado.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-gradient-to-br from-slate-100 via-white to-cyan-50 border border-slate-200 rounded-3xl p-4 md:p-5 text-slate-900 shadow-xl dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 dark:border-slate-700 dark:text-white">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-700 dark:text-cyan-200">Painel de Equipamento</p>
            <p className="text-[11px] font-bold text-slate-500 dark:text-slate-300">Regras RPG ativas</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white/70 px-3 py-3 md:px-4 dark:border-slate-700 dark:bg-slate-800/70">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
              <div className="space-y-2">
                {renderEquipSlot('Mao Direita', equippedMainHand, 'Vazio')}
                {renderEquipSlot('Acessorio I', equippedAccessoryA, 'Vazio')}
              </div>

              <div className="relative rounded-2xl border border-slate-300 bg-white/80 min-h-[170px] flex items-center justify-center dark:border-slate-700/90 dark:bg-slate-900/80">
                <div className="absolute top-2 text-[10px] uppercase tracking-wider font-black text-slate-500 dark:text-slate-400">Avatar</div>
                <RpgHeroAvatar heroClass={user?.hero_class} size="lg" visualMode="profile" />
              </div>

              <div className="space-y-2">
                {renderEquipSlot(equippedTwoHand ? 'Mao Esquerda (2 Maos)' : 'Mao Esquerda', equippedOffHand, equippedTwoHand ? 'Bloqueada por arma de 2 maos' : 'Vazio', Boolean(equippedTwoHand))}
                {renderEquipSlot('Acessorio II', equippedAccessoryB, 'Vazio')}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
              {renderEquipSlot('Torso (Armadura)', equippedArmor, 'Vazio')}
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-2.5 py-2 min-h-[68px] dark:border-amber-900/50 dark:bg-amber-950/20">
                <p className="text-[10px] uppercase font-black tracking-wide text-amber-700 dark:text-amber-300">Regra de Maos</p>
                <p className="mt-1.5 text-[11px] text-amber-800 dark:text-amber-100">
                  Arma de 2 maos ocupa Mao Direita e Mao Esquerda.
                </p>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
              {slotOrder.map((slot) => (
                <div key={slot} className="rounded-xl bg-white/80 border border-slate-200 px-2.5 py-2 dark:bg-slate-900/85 dark:border-slate-700">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    {getSlotIcon(slot)} {EQUIP_SLOT_LABELS[slot]}
                  </p>
                  <p className={`text-xs font-black mt-1 ${equippedCounts[slot] > EQUIP_LIMITS[slot] ? 'text-red-600 dark:text-red-300' : 'text-emerald-700 dark:text-emerald-300'}`}>
                    {equippedCounts[slot]}/{EQUIP_LIMITS[slot]}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 md:p-5 transition-colors">
          <p className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">Limites de equipamento</p>
          <div className="space-y-2">
            {(Object.keys(EQUIP_LIMITS) as EquipSlot[]).map((slot) => (
              <div key={slot} className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 px-3 py-2">
                <p className="text-[11px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wide">{EQUIP_SLOT_LABELS[slot]}</p>
                <p className="text-sm font-black text-slate-700 dark:text-white">{equippedCounts[slot]}/{EQUIP_LIMITS[slot]}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {user?.inventory.map((item, i) => (
          <motion.div
            key={item.inventory_id}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.05 }}
            className={`p-6 rounded-[32px] border-4 flex flex-col items-center text-center relative transition-all ${
              rarityColors[item.rarity as keyof typeof rarityColors]
            } ${item.equipped ? 'ring-4 ring-emerald-500 ring-offset-4 dark:ring-offset-slate-950' : ''}`}
          >
            <div className="absolute right-3 top-3 px-2 py-1 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 uppercase tracking-wide">
              {EQUIP_SLOT_LABELS[resolveEquipSlot(item.equip_type || item.type, item.name)]}
            </div>
            <div className="w-24 h-24 bg-white dark:bg-slate-800 rounded-2xl flex items-center justify-center shadow-md mb-4 transition-colors">
              <ItemArtwork itemName={item.name} itemType={item.equip_type || item.type} size={48} />
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1 transition-colors">{item.rarity}</span>
            <h3 className="font-bold text-slate-800 dark:text-white mb-1 transition-colors">{item.name}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 transition-colors">{item.description}</p>
            
            <div className="flex flex-wrap justify-center gap-2 mb-6">
              {item.bonus_xp > 0 && (
                <div className="text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/20 px-2 py-0.5 rounded-full transition-colors">
                  +{item.bonus_xp}% XP
                </div>
              )}
              {item.bonus_damage && item.bonus_damage > 0 && (
                <div className="text-[10px] font-bold text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/20 px-2 py-0.5 rounded-full transition-colors">
                  +{item.bonus_damage} Dano
                </div>
              )}
              {item.bonus_hp && item.bonus_hp > 0 && (
                <div className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/20 px-2 py-0.5 rounded-full transition-colors">
                  +{item.bonus_hp} HP
                </div>
              )}
            </div>

            <button 
              onClick={() => handleEquip(item.inventory_id, item.equipped)}
              className={`w-full py-2 rounded-xl font-bold text-sm transition-all ${
                item.equipped ? 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300' : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg shadow-emerald-100 dark:shadow-none'
              }`}
            >
              {item.equipped ? 'Desequipar' : 'Equipar'}
            </button>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

const HERO_CLASS_VISUALS: Record<HeroClass, { weaponIcon: any; frame: string; armor: string; weapon: string }> = {
  Guerreiro: {
    weaponIcon: Sword,
    frame: 'from-orange-100 to-amber-200 dark:from-orange-900/50 dark:to-amber-900/40 border-orange-200 dark:border-orange-700/60',
    armor: 'bg-orange-600 dark:bg-orange-500',
    weapon: 'text-orange-200 dark:text-orange-100',
  },
  Mago: {
    weaponIcon: Zap,
    frame: 'from-sky-100 to-indigo-200 dark:from-sky-900/50 dark:to-indigo-900/40 border-sky-200 dark:border-sky-700/60',
    armor: 'bg-blue-600 dark:bg-blue-500',
    weapon: 'text-cyan-100 dark:text-cyan-50',
  },
  Arqueiro: {
    weaponIcon: Target,
    frame: 'from-emerald-100 to-lime-200 dark:from-emerald-900/50 dark:to-lime-900/40 border-emerald-200 dark:border-emerald-700/60',
    armor: 'bg-emerald-600 dark:bg-emerald-500',
    weapon: 'text-emerald-100',
  },
};

const HERO_CLASS_ART: Record<HeroClass, { profile: string[]; idle: string[]; attack: string[]; hurt: string[] }> = {
  Guerreiro: {
    profile: ['/assets/characters/guerreiro_perfil.png', '/assets/characters/guerreiro_padrao.png', '/assets/characters/guerreiro.png', '/assets/characters/guerreiro-cutout.png'],
    idle: ['/assets/characters/guerreiro_padrao.png', '/assets/characters/guerreiro.png', '/assets/characters/guerreiro-cutout.png'],
    attack: ['/assets/characters/guerreiro_ataque.png', '/assets/characters/guerreiro_padrao.png', '/assets/characters/guerreiro.png'],
    hurt: ['/assets/characters/guerreiro_padrao.png', '/assets/characters/guerreiro.png'],
  },
  Mago: {
    profile: ['/assets/characters/mago_perfil.png', '/assets/characters/mago_padrao.png', '/assets/characters/mago.png', '/assets/characters/mago-cutout.png'],
    idle: ['/assets/characters/mago_padrao.png', '/assets/characters/mago.png', '/assets/characters/mago-cutout.png'],
    attack: ['/assets/characters/mago_ataque1.png', '/assets/characters/mago_padrao.png', '/assets/characters/mago.png'],
    hurt: ['/assets/characters/mago_dano.png', '/assets/characters/mago_padrao.png', '/assets/characters/mago.png'],
  },
  Arqueiro: {
    profile: ['/assets/characters/arqueiro_perfil.png', '/assets/characters/arqueiro_padrao.png', '/assets/characters/arqueiro.png', '/assets/characters/arqueiro-cutout.png'],
    idle: ['/assets/characters/arqueiro_padrao.png', '/assets/characters/arqueiro.png', '/assets/characters/arqueiro-cutout.png'],
    attack: ['/assets/characters/arqueiro_ataque1.png', '/assets/characters/arqueiro_padrao.png', '/assets/characters/arqueiro.png'],
    hurt: ['/assets/characters/arqueiro_dano.png', '/assets/characters/arqueiro_padrao.png', '/assets/characters/arqueiro.png'],
  },
};

const VILLAIN_SPRITES = {
  idle: ['/assets/villain/vilao_padrao.png', '/assets/villain/dragon-idle.svg'],
  attack: ['/assets/villain/vilao_ataque1.png', '/assets/villain/vilao_ataque2.png', '/assets/villain/dragon-attack-windup.svg'],
  hurt: ['/assets/villain/vilao_dano.png', '/assets/villain/dragon-attack-breath.svg'],
};

const normalizeAssetName = (value: string) =>
  (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const normalizeItemFileStem = (value: string) =>
  normalizeAssetName(value)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

type EquipSlot = 'accessory' | 'armor' | 'weapon_1h' | 'weapon_2h' | 'shield';

const EQUIP_LIMITS: Record<EquipSlot, number> = {
  accessory: 2,
  armor: 1,
  weapon_1h: 2,
  weapon_2h: 1,
  shield: 1,
};

const EQUIP_SLOT_LABELS: Record<EquipSlot, string> = {
  accessory: 'Acessorios',
  armor: 'Armaduras',
  weapon_1h: 'Armas (1 mao)',
  weapon_2h: 'Armas (2 maos)',
  shield: 'Escudos',
};

const resolveEquipSlot = (itemType?: string, itemName?: string): EquipSlot => {
  const normalizedType = normalizeAssetName(itemType || '');
  const normalizedName = normalizeAssetName(itemName || '');

  if (normalizedType === 'weapon_2h' || normalizedType === 'two_handed_weapon') return 'weapon_2h';
  if (normalizedType === 'weapon_1h' || normalizedType === 'one_handed_weapon') return 'weapon_1h';
  if (normalizedType === 'shield') return 'shield';
  if (normalizedType === 'armor') return 'armor';
  if (normalizedType === 'accessory') return 'accessory';
  if (normalizedType === 'weapon') {
    if (normalizedName.includes('arco') || normalizedName.includes('lanca longa')) return 'weapon_2h';
    return 'weapon_1h';
  }

  if (normalizedName.includes('escudo')) return 'shield';
  if (normalizedName.includes('anel') || normalizedName.includes('amuleto')) return 'accessory';
  if (normalizedName.includes('manto') || normalizedName.includes('armadura')) return 'armor';
  if (normalizedName.includes('arco') || normalizedName.includes('lanca')) return 'weapon_2h';
  return 'weapon_1h';
};

const getItemArtCandidates = (itemName?: string, itemType?: string): string[] => {
  const normalizedName = normalizeAssetName(itemName || '');
  const normalizedStem = normalizeItemFileStem(itemName || '');
  const equipSlot = resolveEquipSlot(itemType, itemName);
  const nameAliases = new Set<string>([
    normalizedStem,
    normalizedStem.replace(/fibonacci/g, 'fibonnaci'),
    normalizedStem.replace(/_/g, ''),
  ]);

  if (normalizedName.includes('amuleto') || normalizedName.includes('fracoe')) {
    nameAliases.add('amuleto_fracoes');
  }

  if (normalizedName.includes('pocao') || normalizedName.includes('concentracao')) {
    nameAliases.add('pocao_concentracao');
  }

  if (normalizedName.includes('broquel') || normalizedName.includes('tales')) {
    nameAliases.add('broquel_tales');
  }

  if (normalizedName.includes('arco')) {
    nameAliases.add('arco_fibonnaci');
  }

  const candidatesByName = Array.from(nameAliases).flatMap((alias) => [
    `/assets/items/${alias}.png`,
    `/assets/items/${alias}.webp`,
    `/assets/items/${alias}.jpg`,
    `/assets/items/${alias}.jpeg`,
    `/assets/items/${alias}.svg`,
  ]);

  if (normalizedName.includes('pitagoras') || normalizedName.includes('cajado')) {
    return [...candidatesByName, '/assets/items/cajado_pitagoras.png'];
  }

  if (normalizedName.includes('euclides') || normalizedName.includes('escudo')) {
    return [...candidatesByName, '/assets/items/escudo_euclides.png'];
  }

  if (normalizedName.includes('manto') || normalizedName.includes('logica')) {
    return [...candidatesByName, '/assets/items/manto_logica.png'];
  }

  if (normalizedName.includes('infinito') || normalizedName.includes('anel')) {
    return [...candidatesByName, '/assets/items/anel_infinito.png'];
  }

  if (equipSlot === 'weapon_1h' || equipSlot === 'weapon_2h') return [...candidatesByName, '/assets/items/cajado_pitagoras.png'];
  if (equipSlot === 'shield') return [...candidatesByName, '/assets/items/escudo_euclides.png'];
  if (equipSlot === 'accessory') return [...candidatesByName, '/assets/items/anel_infinito.png'];
  if (equipSlot === 'armor') return [...candidatesByName, '/assets/items/manto_logica.png', '/assets/items/escudo_euclides.png'];

  return candidatesByName;
};

const ItemArtwork = ({
  itemName,
  itemType,
  size = 40,
}: {
  itemName?: string;
  itemType?: string;
  size?: number;
}) => {
  const candidates = getItemArtCandidates(itemName, itemType);
  const [imgIndex, setImgIndex] = useState(0);
  const [imgMissing, setImgMissing] = useState(candidates.length === 0);

  useEffect(() => {
    setImgIndex(0);
    setImgMissing(candidates.length === 0);
  }, [itemName, itemType]);

  const src = candidates[Math.min(imgIndex, Math.max(0, candidates.length - 1))];

  const handleError = () => {
    if (imgIndex < candidates.length - 1) {
      setImgIndex((prev) => prev + 1);
      return;
    }
    setImgMissing(true);
  };

  if (!imgMissing && src) {
    return (
      <img
        src={src}
        alt={itemName || 'Item'}
        onError={handleError}
          className="h-full w-full object-contain"
        style={{ width: size, height: size }}
      />
    );
  }

  const slot = resolveEquipSlot(itemType, itemName);
  if (slot === 'accessory') return <Coins size={size} className="text-slate-700 dark:text-slate-300" />;
  if (slot === 'armor' || slot === 'shield') return <Shield size={size} className="text-slate-700 dark:text-slate-300" />;
  return <Sword size={size} className="text-slate-700 dark:text-slate-300" />;
};

const hpToneClass = (ratio: number) =>
  ratio > 0.6 ? 'bg-emerald-500' : ratio > 0.3 ? 'bg-amber-400' : 'bg-rose-500';

const BattleHpBar = ({ hp, max, side }: { hp: number; max: number; side: 'ally' | 'foe' }) => {
  const safeMax = Math.max(1, max);
  const ratio = Math.max(0, Math.min(1, hp / safeMax));
  const pct = `${ratio * 100}%`;

  return (
    <div className="w-full">
      <div
        role="progressbar"
        aria-label={side === 'ally' ? 'Sua vida' : 'Vida do inimigo'}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={Math.max(0, hp)}
        className={`relative h-4 w-full overflow-hidden rounded-full border-2 bg-slate-950/80 ${
          side === 'ally' ? 'border-emerald-900/70' : 'border-rose-900/70'
        }`}
      >
        {/* [MOTIVO] barra-fantasma: drena com atraso para o jogador enxergar o tamanho do dano */}
        <motion.div
          className="absolute inset-y-0 left-0 bg-white/70"
          initial={false}
          animate={{ width: pct }}
          transition={{ duration: 0.45, delay: 0.28, ease: 'easeOut' }}
        />
        <motion.div
          className={`absolute inset-y-0 left-0 ${hpToneClass(ratio)}`}
          initial={false}
          animate={{ width: pct }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
        />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-white/25 via-transparent to-black/25" />
        <div
          aria-hidden
          className="absolute inset-0 opacity-40 [background-image:repeating-linear-gradient(90deg,transparent_0,transparent_9.4%,rgba(2,6,23,0.55)_9.4%,rgba(2,6,23,0.55)_10%)]"
        />
      </div>
      <p className="mt-1 text-center text-[11px] font-black tabular-nums tracking-wide text-slate-200">
        {Math.max(0, hp)} <span className="text-slate-500">/ {safeMax}</span>
      </p>
    </div>
  );
};

const RpgHeroAvatar = ({
  heroClass,
  size = 'md',
  showLabel = false,
  visualMode = 'auto',
  className = '',
  attacking = false,
  hurt = false,
  injuryLevel = 0,
  frameless = false,
}: {
  heroClass?: HeroClass | null;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  showLabel?: boolean;
  visualMode?: 'auto' | 'profile' | 'battle';
  className?: string;
  attacking?: boolean;
  hurt?: boolean;
  injuryLevel?: 0 | 1 | 2 | 3;
  frameless?: boolean;
}) => {
  const resolvedClass: HeroClass = heroClass || 'Guerreiro';
  const forceProfile = visualMode === 'profile';
  const spriteMode: 'profile' | 'idle' | 'attack' | 'hurt' = attacking ? 'attack' : hurt ? 'hurt' : (forceProfile || showLabel) ? 'profile' : 'idle';
  const portraitCandidates = HERO_CLASS_ART[resolvedClass][spriteMode];
  const [portraitIndex, setPortraitIndex] = useState(0);
  const [portraitMissing, setPortraitMissing] = useState(false);

  useEffect(() => {
    setPortraitIndex(0);
    setPortraitMissing(false);
  }, [resolvedClass, spriteMode]);

  const portraitSrc = portraitCandidates[Math.min(portraitIndex, portraitCandidates.length - 1)];

  const handlePortraitError = () => {
    if (portraitIndex < portraitCandidates.length - 1) {
      setPortraitIndex((prev) => prev + 1);
      return;
    }
    setPortraitMissing(true);
  };

  const sizeMap = {
    sm: {
      box: 'w-14 h-14 rounded-2xl',
      label: 'text-[9px] px-1.5 py-0.5',
    },
    md: {
      box: 'w-20 h-20 rounded-3xl',
      label: 'text-[10px] px-2 py-0.5',
    },
    lg: {
      box: 'w-24 h-24 rounded-[28px]',
      label: 'text-[10px] px-2 py-0.5',
    },
    xl: {
      box: 'w-28 h-28 rounded-[32px]',
      label: 'text-[11px] px-2.5 py-0.5',
    },
    '2xl': {
      box: 'w-40 h-40 rounded-[36px]',
      label: 'text-xs px-3 py-1',
    },
  }[size];

  const heroSpriteClass = (() => {
    if (resolvedClass === 'Guerreiro') {
      if (spriteMode === 'attack') return 'object-[50%_57%] scale-[1.2]';
      if (spriteMode === 'profile') return 'object-[50%_54%] scale-[1.12]';
      return 'object-[50%_56%] scale-[1.1]';
    }

    if (resolvedClass === 'Mago') {
      if (spriteMode === 'attack') return 'object-[51%_56%] scale-[1.18]';
      if (spriteMode === 'profile') return 'object-[50%_53%] scale-[1.1]';
      return 'object-[50%_55%] scale-[1.08]';
    }

    if (spriteMode === 'attack') return 'object-[52%_57%] scale-[1.2]';
    if (spriteMode === 'hurt') return 'object-[52%_58%] scale-[1.12]';
    if (spriteMode === 'profile') return 'object-[52%_54%] scale-[1.12]';
    return 'object-[52%_56%] scale-[1.1]';
  })();

  return (
    <div className={`relative inline-flex flex-col items-center ${className}`}>
      <motion.div
        animate={
          attacking
            ? { x: [0, 4, 10, 0], y: [0, -2, -3, 0], rotate: [0, -4, 5, 0], scale: [1, 1.02, 1.04, 1] }
            : hurt
              ? { x: [0, -4, 4, -2, 0], rotate: [0, -6, 4, -2, 0] }
              : injuryLevel >= 2
                ? { y: [0, 1.5, 0], rotate: [0, -1.2, 0.8, 0] }
                : {}
        }
        transition={
          attacking
            ? { duration: 0.38, ease: 'easeOut' }
            : hurt
              ? { duration: 0.34, ease: 'easeInOut' }
              : injuryLevel >= 2
                ? { duration: 1.8, repeat: Infinity, ease: 'easeInOut' }
                : undefined
        }
        className={`relative ${sizeMap.box} bg-transparent ${frameless ? '' : 'border-2 border-slate-300 dark:border-slate-700 shadow-lg'} flex items-center justify-center overflow-hidden`}
      >
        {!portraitMissing ? (
          <>
            <img
              src={portraitSrc}
              alt={`Avatar ${resolvedClass}`}
              onError={handlePortraitError}
              className={`absolute inset-0 h-full w-full object-contain ${heroSpriteClass} transition-transform duration-300`}
            />
          </>
        ) : (
          <div className="px-2 text-center text-[10px] font-bold text-slate-500 dark:text-slate-300">
            Imagem da classe ausente
          </div>
        )}

        {injuryLevel >= 1 ? <div className="absolute inset-0 rounded-[inherit] bg-rose-700/10 pointer-events-none" /> : null}
        {injuryLevel >= 2 ? <div className="absolute inset-0 rounded-[inherit] border border-rose-300/40 pointer-events-none" /> : null}
        {injuryLevel >= 3 ? <div className="absolute inset-0 rounded-[inherit] bg-slate-900/20 pointer-events-none" /> : null}
      </motion.div>
      {showLabel ? (
        <div className={`${sizeMap.label} mt-1 rounded-full bg-white/90 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 font-black text-slate-700 dark:text-slate-200`}>
          {resolvedClass}
        </div>
      ) : null}
    </div>
  );
};

const ClassSelectionView = ({ user, onUpdate }: { user: User | null, onUpdate: () => void }) => {
  const classes: { name: HeroClass, desc: string, stats: string }[] = [
    { name: 'Guerreiro', desc: 'Alta resistência e dano físico constante.', stats: 'HP: 150 | Dano: 20' },
    { name: 'Mago', desc: 'Dano explosivo, mas baixa resistência.', stats: 'HP: 80 | Dano: 40' },
    { name: 'Arqueiro', desc: 'Equilíbrio entre agilidade e precisão.', stats: 'HP: 110 | Dano: 30' },
  ];

  const handleSelect = async (heroClass: HeroClass) => {
    if (!user) return;
    await fetch(apiUrl('/api/user/update-class'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getUserAuthHeaders() },
      body: JSON.stringify({ heroClass })
    });
    onUpdate();
  };

  return (
    <div className="max-w-4xl mx-auto space-y-12 py-12 transition-colors">
      <div className="text-center space-y-4">
        <h1 className="text-5xl font-black text-slate-800 dark:text-white font-display transition-colors">Escolha sua Classe</h1>
        <p className="text-slate-500 dark:text-slate-400 text-lg transition-colors">Sua jornada matemática começa com uma identidade única.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {classes.map((c, i) => (
          <motion.div
            key={c.name}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            whileHover={{ y: -10 }}
            className="bg-white dark:bg-slate-900 p-8 rounded-[48px] border-4 border-slate-100 dark:border-slate-800 shadow-xl flex flex-col items-center text-center group hover:border-emerald-500 dark:hover:border-emerald-500 transition-all"
          >
            <RpgHeroAvatar heroClass={c.name} size="lg" showLabel className="mb-4 group-hover:scale-110 transition-transform" />
            <h3 className="text-2xl font-black text-slate-800 dark:text-white mb-2 transition-colors">{c.name}</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 transition-colors">{c.desc}</p>
            <div className="text-xs font-bold text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800 px-4 py-2 rounded-full mb-8 transition-colors">
              {c.stats}
            </div>
            <button
              onClick={() => handleSelect(c.name)}
              className="w-full py-4 bg-emerald-600 text-white font-bold rounded-2xl hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-100 dark:shadow-none"
            >
              Selecionar
            </button>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

const CombatView = ({ user, onUpdate }: { user: User | null, onUpdate: () => void }) => {
  const { topicId } = useParams<{ topicId: string }>();
  const topic = TOPICS.find(t => t.id === topicId);
  const [exercise, setExercise] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [isResolvingAnswer, setIsResolvingAnswer] = useState(false);
  
  // Dynamic Stats based on Class + Items
  const classStats = {
    'Guerreiro': { hp: 150, damage: 20 },
    'Mago': { hp: 80, damage: 40 },
    'Arqueiro': { hp: 110, damage: 30 },
  };

  const bonuses = user?.inventory.filter(i => i.equipped).reduce((acc, item) => ({
    damage: acc.damage + (item.bonus_damage || 0),
    hp: acc.hp + (item.bonus_hp || 0),
    xp: acc.xp + (item.bonus_xp || 0),
  }), { damage: 0, hp: 0, xp: 0 }) || { damage: 0, hp: 0, xp: 0 };

  const currentStats = user?.hero_class ? {
    hp: classStats[user.hero_class].hp + bonuses.hp,
    damage: classStats[user.hero_class].damage + bonuses.damage
  } : { hp: 100 + bonuses.hp, damage: 25 + bonuses.damage };

  // [MOTIVO] HP escala com o nivel na mesma taxa do dano (level*2 no ataque), senao
  // o teto por golpe vira o unico fator e toda batalha dura o mesmo tanto.
  const enemyMaxHp = 100 + (user?.level || 1) * 25;

  const [enemyHp, setEnemyHp] = useState(enemyMaxHp);
  const [playerHp, setPlayerHp] = useState(currentStats.hp);
  const [isAttacking, setIsAttacking] = useState(false);
  const [isHurt, setIsHurt] = useState(false);
  const [isEnemyAttacking, setIsEnemyAttacking] = useState(false);
  const [enemyAttackFxId, setEnemyAttackFxId] = useState(0);
  const [damageText, setDamageText] = useState<{ text: string, x: number } | null>(null);
  const [attackFx, setAttackFx] = useState<{ id: number, variant: 'sword' | 'arcane' | 'arrow', critical: boolean } | null>(null);
  const [enemyHitPulse, setEnemyHitPulse] = useState(0);
  const [villainSpriteIndex, setVillainSpriteIndex] = useState(0);
  const [villainSpriteMissing, setVillainSpriteMissing] = useState(false);
  const [combo, setCombo] = useState(0);
  const focusDurationSeconds = 10 * 60;
  const focusTargetHits = 6;
  const [focusModeActive, setFocusModeActive] = useState(false);
  const [focusSecondsLeft, setFocusSecondsLeft] = useState(focusDurationSeconds);
  const [focusHits, setFocusHits] = useState(0);
  const [focusRewardState, setFocusRewardState] = useState<'idle' | 'claiming' | 'claimed' | 'expired'>('idle');
  const focusStorageKey = `growing-math-focus-${topicId || 'unknown'}`;
  const topicMastery = topic ? (user?.progress.find((p) => p.topic === topic.id)?.mastery || 0) : 0;
  const playerHpRatio = Math.max(0, Math.min(1, playerHp / Math.max(1, currentStats.hp)));
  const playerInjuryLevel: 0 | 1 | 2 | 3 = playerHpRatio <= 0.2 ? 3 : playerHpRatio <= 0.45 ? 2 : playerHpRatio <= 0.7 ? 1 : 0;
  const injuryLabel = playerInjuryLevel === 3 ? 'Crítico' : playerInjuryLevel === 2 ? 'Machucado' : playerInjuryLevel === 1 ? 'Arranhões' : 'Inteiro';
  const injuryBadgeClass =
    playerInjuryLevel >= 3
      ? 'border-rose-400/60 bg-rose-500/20 text-rose-200'
      : playerInjuryLevel >= 2
        ? 'border-amber-400/60 bg-amber-500/20 text-amber-200'
        : 'border-emerald-400/50 bg-emerald-500/15 text-emerald-200';
  const estimatedHitsToMaster = Math.max(0, Math.ceil((100 - topicMastery) / 15));
  const villainMode: 'idle' | 'attack' | 'hurt' = isEnemyAttacking ? 'attack' : isAttacking ? 'hurt' : 'idle';
  const villainCandidates = VILLAIN_SPRITES[villainMode];
  const villainSprite = villainCandidates[Math.min(villainSpriteIndex, villainCandidates.length - 1)];
  const villainSpriteClass =
    villainMode === 'attack'
      ? 'object-[50%_54%] scale-[1.16]'
      : villainMode === 'hurt'
        ? 'object-[50%_56%] scale-[1.08]'
        : 'object-[50%_55%] scale-[1.1]';

  useEffect(() => {
    setVillainSpriteIndex(0);
    setVillainSpriteMissing(false);
  }, [villainMode]);

  useEffect(() => {
    if (!isEnemyAttacking) return;
    setVillainSpriteIndex((enemyAttackFxId % 2 === 0) ? 0 : 1);
  }, [isEnemyAttacking, enemyAttackFxId]);

  const handleVillainSpriteError = () => {
    if (villainSpriteIndex < villainCandidates.length - 1) {
      setVillainSpriteIndex((prev) => prev + 1);
      return;
    }
    setVillainSpriteMissing(true);
  };

  useEffect(() => {
    if (!topicId) return;
    const raw = sessionStorage.getItem(focusStorageKey);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as {
        focusModeActive?: boolean;
        focusSecondsLeft?: number;
        focusHits?: number;
        focusRewardState?: 'idle' | 'claiming' | 'claimed' | 'expired';
      };

      if (typeof parsed.focusModeActive === 'boolean') setFocusModeActive(parsed.focusModeActive);
      if (typeof parsed.focusSecondsLeft === 'number') setFocusSecondsLeft(Math.max(0, Math.min(focusDurationSeconds, parsed.focusSecondsLeft)));
      if (typeof parsed.focusHits === 'number') setFocusHits(Math.max(0, parsed.focusHits));
      if (parsed.focusRewardState) setFocusRewardState(parsed.focusRewardState);
    } catch {
      sessionStorage.removeItem(focusStorageKey);
    }
  }, [topicId, focusStorageKey]);

  useEffect(() => {
    if (!topicId) return;
    sessionStorage.setItem(
      focusStorageKey,
      JSON.stringify({
        focusModeActive,
        focusSecondsLeft,
        focusHits,
        focusRewardState,
      })
    );
  }, [topicId, focusStorageKey, focusModeActive, focusSecondsLeft, focusHits, focusRewardState]);

  const startFocusMode = () => {
    setFocusModeActive(true);
    setFocusSecondsLeft(focusDurationSeconds);
    setFocusHits(0);
    setFocusRewardState('idle');
  };

  const cancelFocusMode = () => {
    setFocusModeActive(false);
    setFocusSecondsLeft(focusDurationSeconds);
    setFocusHits(0);
    setFocusRewardState('idle');
  };

  const formatFocusTime = (seconds: number) => {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  const attackVisualByClass = {
    sword: {
      Icon: Sword,
      weaponColor: 'text-amber-300',
      trail: 'from-amber-300/0 via-amber-200/55 to-amber-300/0',
      impactBorder: 'border-amber-200',
      label: 'CORTE!',
      extraEffect: {
        type: 'arc',
        color: 'bg-amber-400',
        duration: 0.6
      }
    },
    arcane: {
      Icon: Zap,
      weaponColor: 'text-cyan-300',
      trail: 'from-cyan-300/0 via-cyan-200/55 to-cyan-300/0',
      impactBorder: 'border-cyan-200',
      label: 'RAIO!',
      extraEffect: {
        type: 'runes',
        color: 'bg-cyan-400',
        duration: 0.7
      }
    },
    arrow: {
      Icon: Navigation,
      weaponColor: 'text-lime-300',
      trail: 'from-lime-300/0 via-lime-200/55 to-lime-300/0',
      impactBorder: 'border-lime-200',
      label: 'DISPARO!',
      extraEffect: {
        type: 'trail',
        color: 'bg-lime-400',
        duration: 0.5
      }
    }
  } as const;

  const renderExtraEffect = (effect: { type: 'arc' | 'runes' | 'trail'; color: string; duration: number }, id: number) => {
    switch (effect.type) {
      case 'arc':
        return (
          <motion.div
            key={`arc-${id}`}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1.5 }}
            exit={{ opacity: 0 }}
            transition={{ duration: effect.duration }}
            className={`absolute w-32 h-32 rounded-full ${effect.color}`}
            style={{ left: '60%', top: '40%' }}
          />
        );
      case 'runes':
        return (
          <motion.div
            key={`runes-${id}`}
            initial={{ opacity: 0, rotate: 0 }}
            animate={{ opacity: 1, rotate: 360 }}
            exit={{ opacity: 0 }}
            transition={{ duration: effect.duration }}
            className={`absolute w-24 h-24 ${effect.color} rounded-lg`}
            style={{ left: '62%', top: '42%' }}
          />
        );
      case 'trail':
        return (
          <motion.div
            key={`trail-${id}`}
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 50 }}
            exit={{ opacity: 0 }}
            transition={{ duration: effect.duration }}
            className={`absolute w-16 h-16 ${effect.color} rounded-full`}
            style={{ left: '58%', top: '38%' }}
          />
        );
      default:
        return null;
    }
  };

  const applyDamageOverTime = async (damage: number) => {
    const steps = 8;
    let remainingDamage = damage;

    for (let step = 0; step < steps; step++) {
      const chunk = step === steps - 1 ? remainingDamage : Math.max(1, Math.floor(damage / steps));
      remainingDamage -= chunk;
      setEnemyHp(prev => Math.max(0, prev - chunk));
      setEnemyHitPulse(prev => prev + 1);
      await new Promise(resolve => setTimeout(resolve, 55));
    }
  };

  const fetchExercise = async () => {
    if (!topic) return;
    setLoading(true);
    setSelectedOption(null);
    setIsCorrect(null);
    try {
      const ex = await generateExercise(topic.id, user?.level || 1);
      setExercise(ex);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExercise();
  }, [topic]);

  useEffect(() => {
    setEnemyHp(enemyMaxHp);
    setPlayerHp(currentStats.hp);
    setCombo(0);
  }, [topicId, enemyMaxHp, currentStats.hp]);

  useEffect(() => {
    if (!focusModeActive) return;
    if (focusRewardState === 'claimed') return;
    if (enemyHp <= 0 || playerHp <= 0) return;

    const timer = window.setInterval(() => {
      setFocusSecondsLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          setFocusModeActive(false);
          setFocusRewardState((state) => (state === 'claimed' ? state : 'expired'));
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [focusModeActive, focusRewardState, enemyHp, playerHp]);

  useEffect(() => {
    if (focusRewardState !== 'idle') return;
    if (focusHits < focusTargetHits) return;
    if (!user) return;

    let cancelled = false;

    const applyFocusReward = async () => {
      setFocusModeActive(false);
      setFocusRewardState('claiming');
      try {
        await fetch(apiUrl('/api/user/update-progress'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getUserAuthHeaders() },
          body: JSON.stringify({
            topic: topic?.id,
            action: 'focus_reward'
          })
        });

        if (cancelled) return;

        confetti({
          particleCount: 120,
          spread: 75,
          origin: { y: 0.55 },
          colors: ['#22c55e', '#06b6d4', '#facc15']
        });

        setFocusRewardState('claimed');
        setFocusModeActive(false);
        onUpdate();
      } catch (error) {
        if (!cancelled) {
          setFocusRewardState('idle');
        }
      }
    };

    void applyFocusReward();

    return () => {
      cancelled = true;
    };
  }, [focusRewardState, focusHits, focusTargetHits, user, topic?.id, onUpdate]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!exercise || !Array.isArray(exercise.options)) return;
      if (enemyHp <= 0 || playerHp <= 0) return;
      if (isResolvingAnswer || isCorrect === true) return;

      const optionIndex = Number(event.key) - 1;
      if (optionIndex >= 0 && optionIndex < exercise.options.length) {
        event.preventDefault();
        setSelectedOption(optionIndex);
        return;
      }

      if (event.key === 'Enter' && selectedOption !== null) {
        event.preventDefault();
        void handleAttack();
        return;
      }

      if ((event.key === 'n' || event.key === 'N') && !isResolvingAnswer) {
        event.preventDefault();
        void fetchExercise();
        return;
      }

      if ((event.key === 'f' || event.key === 'F') && !focusModeActive && !isResolvingAnswer) {
        event.preventDefault();
        startFocusMode();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [exercise, enemyHp, playerHp, isResolvingAnswer, isCorrect, selectedOption, topicMastery, focusModeActive]);

  const handleAttack = async () => {
    if (selectedOption === null || isResolvingAnswer || isCorrect === true) return;
    setIsResolvingAnswer(true);

    try {
      const correct = selectedOption === exercise.correctAnswerIndex;
      setIsCorrect(correct);

      const mastery = topicMastery;

      if (correct) {
      setIsAttacking(true);
      setTimeout(() => setIsAttacking(false), 550);

      if (focusModeActive && focusSecondsLeft > 0 && focusRewardState !== 'claimed') {
        setFocusHits((prev) => prev + 1);
      }
      
      const nextCombo = combo + 1;
      setCombo(nextCombo);

      const baseDamage = currentStats.damage + (user?.level || 1) * 2;
      const masteryMultiplier = 1 + mastery / 220;
      const comboMultiplier = 1 + Math.min(nextCombo, 6) * 0.12;
      const levelMultiplier = 1 + Math.min(user?.level || 1, 20) * 0.015;
      const critChance = Math.min(0.45, 0.12 + Math.min(user?.level || 1, 20) * 0.01 + Math.min(nextCombo, 6) * 0.02);
      const isCritical = Math.random() < critChance;
      const critMultiplier = isCritical ? 1.6 : 1;

      const rawDamage = Math.max(10, Math.round(baseDamage * masteryMultiplier * comboMultiplier * levelMultiplier * critMultiplier));
      // [MOTIVO] piso de ~3 golpes contra hitkill. Antes era 35% com HP baixo, o que
      // fazia o teto sobrepor o dano bruto SEMPRE - critico, combo, maestria e
      // equipamento viravam enfeite e toda luta durava exatos 3 acertos.
      const maxDamagePerHit = Math.max(12, Math.round(enemyMaxHp * 0.4));
      const damage = Math.min(rawDamage, maxDamagePerHit);

      const attackVariant = user?.hero_class === 'Guerreiro' ? 'sword' : user?.hero_class === 'Mago' ? 'arcane' : 'arrow';
      setAttackFx({ id: Date.now(), variant: attackVariant, critical: isCritical });
      setTimeout(() => setAttackFx(null), 560);

      await applyDamageOverTime(damage);
      setDamageText({ text: isCritical ? `CRIT -${damage}` : `-${damage}`, x: 70 });
      
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#10b981', '#34d399']
      });
      
      if (user) {
        await fetch(apiUrl('/api/user/update-progress'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getUserAuthHeaders() },
          body: JSON.stringify({
            topic: topic?.id,
            action: 'combat_hit'
          })
        });
        onUpdate();
      }
      } else {
        setCombo(0);
        setIsHurt(true);
        setIsEnemyAttacking(true);
        setEnemyAttackFxId(Date.now());
        setTimeout(() => setIsHurt(false), 500);
        setTimeout(() => setIsEnemyAttacking(false), 640);
        
        const baseEnemyDamage = 7 + Math.round((user?.level || 1) * 1.5) + Math.max(0, Math.floor(mastery / 30));
        const classMitigation = user?.hero_class === 'Guerreiro' ? 0.78 : user?.hero_class === 'Arqueiro' ? 0.88 : 0.94;
        const scaledEnemyDamage = Math.round(baseEnemyDamage * classMitigation);
        const maxEnemyDamage = Math.max(8, Math.round(currentStats.hp * 0.16));
        const enemyDamage = Math.min(maxEnemyDamage, Math.max(6, scaledEnemyDamage));
        setPlayerHp(prev => Math.max(0, prev - enemyDamage));
        setDamageText({ text: `-${enemyDamage}`, x: 30 });
        // Keep the battle flowing after a wrong answer.
        setSelectedOption(null);
        setTimeout(() => setIsCorrect(null), 900);
      }

      setTimeout(() => setDamageText(null), 1000);
    } finally {
      setIsResolvingAnswer(false);
    }
  };

  if (!topic) return <div className="p-20 text-center">Tópico não encontrado. <Link to="/trilhas" className="text-emerald-600 font-bold">Voltar para o Mapa</Link></div>;
  if (loading) return <div className="p-20 text-center">Iniciando combate...</div>;
  if (!exercise || !Array.isArray(exercise.options)) {
    return (
      <div className="p-20 text-center">
        <p className="mb-4">Nao foi possivel gerar o exercicio desta batalha.</p>
        <button onClick={fetchExercise} className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold">
          Tentar novamente
        </button>
      </div>
    );
  }
  if (!user?.hero_class) return <ClassSelectionView user={user} onUpdate={onUpdate} />;

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Battle Arena */}
      <div className="relative h-[23rem] md:h-[28rem] bg-gradient-to-b from-slate-900 via-slate-900 to-slate-800 rounded-[48px] border-8 border-slate-700 shadow-2xl overflow-hidden flex items-center justify-around px-3 md:px-8 py-6">
        {/* [MOTIVO] piso + vinheta: planta os combatentes no cenario em vez de deixa-los flutuando no vazio */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-slate-950/85 via-slate-950/30 to-transparent" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_42%,rgba(2,6,23,0.72)_100%)]" />
        </div>

        {/* [MOTIVO] HUD no topo: tira Estado/Combo da coluna do heroi, que desbalanceava a altura das colunas */}
        <div className="pointer-events-none absolute left-1/2 top-4 z-20 flex -translate-x-1/2 items-center gap-2">
          <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wider ${injuryBadgeClass}`}>
            {injuryLabel}
          </span>
          <motion.span
            key={combo}
            initial={combo > 0 ? { scale: 0.7 } : false}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 14 }}
            className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wider ${
              combo > 0
                ? 'border-amber-300/70 bg-amber-400/20 text-amber-200'
                : 'border-slate-600 bg-slate-800/70 text-slate-400'
            }`}
          >
            Combo x{combo}
          </motion.span>
        </div>

        {playerInjuryLevel >= 1 ? (
          <motion.div
            initial={false}
            animate={{ opacity: playerInjuryLevel === 1 ? 0.08 : playerInjuryLevel === 2 ? 0.14 : 0.2 }}
            className="absolute inset-0 pointer-events-none bg-gradient-to-t from-rose-600/20 via-transparent to-transparent"
          />
        ) : null}
        {/* Player Side */}
        <motion.div 
          animate={isAttacking ? { x: [0, 34, 76, 0], y: [0, -8, -2, 0], rotate: [0, -6, 6, 0] } : isHurt ? { x: [0, -14, 14, -8, 0], rotate: [0, -6, 5, -2, 0] } : playerInjuryLevel >= 2 ? { y: [0, 2, 0], rotate: [0, -1, 0] } : {}}
          transition={isAttacking ? { duration: 0.42, ease: 'easeOut' } : isHurt ? { duration: 0.34, ease: 'easeInOut' } : playerInjuryLevel >= 2 ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' } : undefined}
          className="relative flex h-[16rem] w-28 flex-col items-center justify-start gap-2 sm:w-44 md:h-[19rem] md:w-72 md:gap-3"
        >
          <div className="relative flex h-28 w-28 items-center justify-center sm:h-36 sm:w-44 md:h-48 md:w-72">
            {/* [MOTIVO] sombra de chao: da peso e assenta o personagem no cenario */}
            <div aria-hidden className="absolute bottom-1 left-1/2 h-3 w-20 -translate-x-1/2 md:h-5 md:w-44 rounded-[100%] bg-slate-950/70 blur-md" />
            <div aria-hidden className="absolute bottom-3 left-1/2 h-14 w-24 -translate-x-1/2 md:h-24 md:w-48 rounded-[100%] bg-emerald-400/10 blur-2xl" />
            <RpgHeroAvatar heroClass={user.hero_class} size="2xl" frameless visualMode="battle" attacking={isAttacking} hurt={isHurt} injuryLevel={playerInjuryLevel} className="relative scale-[0.6] sm:scale-[0.8] md:scale-100" />
            {playerInjuryLevel >= 2 ? (
              <motion.div
                animate={{ opacity: [0.2, 0.5, 0.2] }}
                transition={{ duration: 1.2, repeat: Infinity }}
                className="absolute left-1/2 top-1/2 h-44 w-44 -translate-x-1/2 -translate-y-1/2 rounded-[40px] border border-rose-300/50 pointer-events-none"
              />
            ) : null}
            {playerInjuryLevel >= 3 ? (
              <motion.div
                animate={{ opacity: [0.1, 0.3, 0.1] }}
                transition={{ duration: 0.9, repeat: Infinity }}
                className="absolute left-1/2 top-1/2 -ml-[5.25rem] -mt-[5.25rem] text-rose-200 pointer-events-none"
              >
                <AlertCircle size={14} />
              </motion.div>
            ) : null}
          </div>
          <div className="flex w-full flex-col items-center gap-2 px-1 md:w-56">
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="text-[11px] font-black leading-tight text-white md:text-sm">Você</span>
              <span className="rounded-full border border-emerald-400/50 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-200">
                {user.hero_class}
              </span>
            </div>
            <BattleHpBar hp={playerHp} max={currentStats.hp} side="ally" />
          </div>
        </motion.div>

        {/* [MOTIVO] divisor visivel: o VS anterior era slate-600 sobre slate-900 e sumia no fundo */}
        <div aria-hidden className="relative flex h-28 items-center justify-center md:h-44">
          <div className="h-full w-px bg-gradient-to-b from-transparent via-slate-600/70 to-transparent" />
          <div className="absolute flex h-10 w-10 items-center justify-center rounded-full md:h-14 md:w-14 border-2 border-slate-600 bg-slate-900 shadow-[0_0_28px_rgba(148,163,184,0.28)]">
            <span className="text-sm font-black italic text-slate-300 md:text-lg">VS</span>
          </div>
        </div>

        {/* Enemy Side */}
        <motion.div 
          animate={
            isEnemyAttacking
              ? { x: [0, -16, -5, 0], y: [0, -6, -2, 0], scale: [1, 1.03, 1] }
              : isAttacking || enemyHitPulse > 0
                ? { x: [0, 10, -10, 8, 0], scale: [1, 0.92, 1] }
                : {}
          }
          transition={{ duration: 0.24 }}
          className="relative flex h-[16rem] w-28 flex-col items-center justify-start gap-2 sm:w-44 md:h-[19rem] md:w-72 md:gap-3"
        >
          <div className="relative flex h-28 w-28 items-center justify-center sm:h-36 sm:w-44 md:h-48 md:w-72">
            <div aria-hidden className="absolute bottom-1 left-1/2 h-3 w-24 -translate-x-1/2 md:h-5 md:w-48 rounded-[100%] bg-slate-950/70 blur-md" />
            <div aria-hidden className="absolute bottom-3 left-1/2 h-14 w-28 -translate-x-1/2 md:h-24 md:w-52 rounded-[100%] bg-rose-500/10 blur-2xl" />
            {!villainSpriteMissing ? (
              <img
                src={villainSprite}
                alt="Dragão da Matemática"
                onError={handleVillainSpriteError}
                className={`relative h-full w-full object-contain p-0.5 ${villainSpriteClass}`}
              />
            ) : (
              <div className="relative px-2 text-center text-xs font-bold text-slate-500">
                Sprite do vilão ausente
              </div>
            )}
          </div>
          <div className="flex w-full flex-col items-center gap-2 px-1 md:w-56">
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="text-[11px] font-black leading-tight text-white md:text-sm">Dragão da Matemática</span>
              <span className="rounded-full border border-rose-400/50 bg-rose-500/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-rose-200">
                Inimigo
              </span>
            </div>
            <BattleHpBar hp={enemyHp} max={enemyMaxHp} side="foe" />
          </div>
        </motion.div>

        {/* Battle Effects Overlay */}
        <AnimatePresence>
          {isEnemyAttacking && (
            <motion.div
              key={`villain-attack-sprite-${enemyAttackFxId}`}
              initial={{ opacity: 0, x: 90, scale: 0.88 }}
              animate={{ opacity: [0, 1, 1, 0], x: [90, 20, -45, -55], scale: [0.88, 1.04, 1.08, 1.1] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.62, ease: 'easeOut' }}
              className="absolute pointer-events-none right-[23%] top-[35%] w-80 h-44 overflow-hidden rounded-2xl"
            >
              {!villainSpriteMissing ? (
                <img
                  src={villainSprite}
                  alt="Ataque do Dragao da Matematica"
                  onError={handleVillainSpriteError}
                  className={`h-full w-full object-contain ${villainSpriteClass}`}
                />
              ) : null}
            </motion.div>
          )}

          {attackFx && (
            (() => {
              const visual = attackVisualByClass[attackFx.variant];
              const AttackIcon = visual.Icon;

              return (
                <>
              <motion.div
                key={`flash-${attackFx.id}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0.35, 0] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.45 }}
                className="absolute inset-0 pointer-events-none bg-gradient-to-r from-transparent via-white/20 to-transparent"
              />
              <motion.div
                key={`trail-${attackFx.id}`}
                initial={{ opacity: 0, scaleX: 0.15 }}
                animate={{ opacity: [0, 0.9, 0], scaleX: [0.2, 1.15, 1.25] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5 }}
                style={{ left: '33%', top: '51%' }}
                className={`absolute w-72 h-2 rounded-full pointer-events-none bg-gradient-to-r ${visual.trail}`}
              >
              </motion.div>

              {attackFx.variant === 'sword' && (
                <>
                  <motion.div
                    key={`sword-arc-a-${attackFx.id}`}
                    initial={{ opacity: 0, scale: 0.3, rotate: -35 }}
                    animate={{ opacity: [0, 0.9, 0], scale: [0.35, 1.2, 1.5], rotate: [-35, -8, 8] }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.42 }}
                    style={{ left: '56%', top: '38%' }}
                    className="absolute pointer-events-none w-24 h-24 rounded-full border-t-4 border-l-4 border-amber-200/90"
                  />
                  <motion.div
                    key={`sword-arc-b-${attackFx.id}`}
                    initial={{ opacity: 0, scale: 0.25, rotate: 30 }}
                    animate={{ opacity: [0, 0.75, 0], scale: [0.3, 1.05, 1.4], rotate: [30, 5, -8] }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.4, delay: 0.06 }}
                    style={{ left: '61%', top: '42%' }}
                    className="absolute pointer-events-none w-20 h-20 rounded-full border-b-4 border-r-4 border-orange-200/85"
                  />
                </>
              )}

              {attackFx.variant === 'arcane' && (
                <>
                  {[0, 1, 2].map((ring) => (
                    <motion.div
                      key={`arcane-ring-${ring}-${attackFx.id}`}
                      initial={{ opacity: 0, scale: 0.2, rotate: 0 }}
                      animate={{
                        opacity: [0, 0.7, 0],
                        scale: [0.22, 0.95 + ring * 0.25, 1.45 + ring * 0.2],
                        rotate: [0, 90 + ring * 25, 160 + ring * 30]
                      }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.48 + ring * 0.05, delay: ring * 0.03 }}
                      style={{ left: '63%', top: '40%' }}
                      className="absolute pointer-events-none w-20 h-20 rounded-full border border-cyan-200/90"
                    >
                      <div className="absolute inset-2 rounded-full border border-cyan-100/60" />
                    </motion.div>
                  ))}
                  <motion.div
                    key={`arcane-glyph-${attackFx.id}`}
                    initial={{ opacity: 0, scale: 0.45 }}
                    animate={{ opacity: [0, 1, 0], scale: [0.45, 1.1, 1.2], rotate: [0, 45, 90] }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.45 }}
                    style={{ left: '66%', top: '43%' }}
                    className="absolute pointer-events-none text-cyan-100 drop-shadow-[0_0_14px_rgba(103,232,249,0.95)]"
                  >
                    <Star size={34} fill="currentColor" />
                  </motion.div>
                </>
              )}

              {attackFx.variant === 'arrow' && (
                <>
                  {[0, 1, 2].map((ghost) => (
                    <motion.div
                      key={`arrow-ghost-${ghost}-${attackFx.id}`}
                      initial={{ opacity: 0, x: -20 - ghost * 10, y: 6 + ghost * 4, rotate: -20 }}
                      animate={{ opacity: [0, 0.45, 0], x: [0, 100 + ghost * 25], y: [0, -30 - ghost * 6], rotate: [-20, 6] }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.36 + ghost * 0.07, delay: ghost * 0.04 }}
                      style={{ left: '34%', top: '57%' }}
                      className="absolute pointer-events-none text-lime-200/80"
                    >
                      <Navigation size={38 - ghost * 4} />
                    </motion.div>
                  ))}
                  {[0, 1, 2, 3].map((spark) => (
                    <motion.div
                      key={`arrow-spark-${spark}-${attackFx.id}`}
                      initial={{ opacity: 0, y: 0 }}
                      animate={{ opacity: [0, 1, 0], y: [-2, -18 - spark * 6, -28 - spark * 8] }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.36, delay: spark * 0.03 }}
                      style={{ left: `${66 + spark}%`, top: `${48 + (spark % 2) * 3}%` }}
                      className="absolute pointer-events-none text-lime-200"
                    >
                      <Star size={12} fill="currentColor" />
                    </motion.div>
                  ))}
                </>
              )}

              <motion.div
                key={`weapon-${attackFx.id}`}
                initial={{ opacity: 0, x: 0, y: 0, scale: 0.7, rotate: -35 }}
                animate={{
                  opacity: [0, 1, 1, 0],
                  x: [0, 120, 285, 315],
                  y: [0, -26, -58, -58],
                  scale: [0.75, 1, attackFx.critical ? 1.28 : 1.12, attackFx.critical ? 1.28 : 1.12],
                  rotate: [-35, -15, 14, 20]
                }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.52, ease: 'easeOut' }}
                style={{ left: '26%', top: '56%' }}
                className={`absolute pointer-events-none drop-shadow-[0_0_16px_rgba(255,255,255,0.55)] ${visual.weaponColor}`}
              >
                <AttackIcon size={attackFx.critical ? 132 : 112} />
              </motion.div>
              <motion.div
                key={`impact-${attackFx.id}`}
                initial={{ opacity: 0.8, scale: 0.25 }}
                animate={{ opacity: [0.9, 0.45, 0], scale: [0.25, 1.8, 2.4] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.45 }}
                style={{ left: '68%', top: '44%' }}
                className={`absolute pointer-events-none w-24 h-24 border-4 ${visual.impactBorder} rounded-full`}
              />
              <motion.div
                key={`label-${attackFx.id}`}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: [0, 1, 0], y: [-6, -22, -36] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.45 }}
                style={{ left: '64%', top: '34%' }}
                className="absolute pointer-events-none text-orange-300 font-black text-xl"
              >
                {attackFx.critical ? 'CRITICO!' : visual.label}
              </motion.div>
                </>
              );
            })()
          )}
          {damageText && (
            <motion.div
              initial={{ opacity: 0, y: 0 }}
              animate={{ opacity: 1, y: -50 }}
              exit={{ opacity: 0 }}
              style={{ left: `${damageText.x}%`, top: '40%' }}
              className="absolute pointer-events-none text-3xl font-black text-red-500 drop-shadow-lg z-50"
            >
              {damageText.text}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Combat UI (Exercise) */}
      {enemyHp > 0 && playerHp > 0 ? (
        <div className="bg-white dark:bg-slate-900 p-8 rounded-[40px] border border-slate-200 dark:border-slate-800 shadow-xl transition-colors">
          <div className="mb-5 rounded-2xl border border-cyan-200 dark:border-cyan-900/40 bg-cyan-50/70 dark:bg-cyan-950/30 p-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-cyan-700 dark:text-cyan-300">Modo Foco (10 min)</p>
                <p className="text-sm text-slate-700 dark:text-slate-200">Meta: {focusTargetHits} acertos para bonus de +120 XP e +25 moedas.</p>
              </div>
              <div className="flex items-center gap-2">
                {!focusModeActive ? (
                  <button
                    onClick={startFocusMode}
                    className="px-3 py-2 rounded-xl bg-cyan-600 text-white text-xs font-black hover:bg-cyan-700"
                  >
                    Iniciar foco
                  </button>
                ) : (
                  <button
                    onClick={cancelFocusMode}
                    className="px-3 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-black hover:bg-slate-300 dark:hover:bg-slate-700"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
              <div className="rounded-xl bg-white dark:bg-slate-900 px-3 py-2 border border-slate-200 dark:border-slate-800">
                <p className="font-bold text-slate-500 dark:text-slate-400 uppercase">Tempo</p>
                <p className="font-black text-slate-800 dark:text-slate-100">{formatFocusTime(focusSecondsLeft)}</p>
              </div>
              <div className="rounded-xl bg-white dark:bg-slate-900 px-3 py-2 border border-slate-200 dark:border-slate-800">
                <p className="font-bold text-slate-500 dark:text-slate-400 uppercase">Acertos no foco</p>
                <p className="font-black text-slate-800 dark:text-slate-100">{focusHits}/{focusTargetHits}</p>
              </div>
              <div className="rounded-xl bg-white dark:bg-slate-900 px-3 py-2 border border-slate-200 dark:border-slate-800">
                <p className="font-bold text-slate-500 dark:text-slate-400 uppercase">Status</p>
                <p className="font-black text-slate-800 dark:text-slate-100">
                  {focusRewardState === 'claimed' ? 'Bonus aplicado' : focusRewardState === 'claiming' ? 'Aplicando bonus...' : focusRewardState === 'expired' ? 'Tempo encerrado' : focusModeActive ? 'Em andamento' : 'Inativo'}
                </p>
              </div>
            </div>
          </div>

          <div className="mb-5 grid grid-cols-1 md:grid-cols-3 gap-2">
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 px-3 py-2">
              <p className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Dominio no topico</p>
              <p className="text-sm font-black text-slate-800 dark:text-slate-100">{topicMastery}%</p>
            </div>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 px-3 py-2">
              <p className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Ate maestria</p>
              <p className="text-sm font-black text-slate-800 dark:text-slate-100">{estimatedHitsToMaster} acerto(s)</p>
            </div>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 px-3 py-2">
              <p className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Atalhos</p>
              <p className="text-sm font-black text-slate-800 dark:text-slate-100">1-4 escolhe, Enter ataca, N troca</p>
            </div>
          </div>

          <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-6 transition-colors">{exercise.question}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {exercise.options.map((opt: string, i: number) => (
              <button
                key={i}
                disabled={isCorrect === true || isResolvingAnswer}
                onClick={() => setSelectedOption(i)}
                className={`p-4 rounded-2xl border-2 text-left transition-all ${
                  selectedOption === i 
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400' 
                    : 'border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-200 dark:hover:border-slate-700'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-3">
            <button 
              onClick={handleAttack}
              disabled={selectedOption === null || isCorrect === true || isResolvingAnswer}
              className="py-4 bg-emerald-600 text-white font-bold rounded-2xl shadow-lg hover:bg-emerald-700 disabled:opacity-50"
            >
              {isResolvingAnswer ? 'Resolvendo...' : 'Atacar!'}
            </button>
            <button
              onClick={fetchExercise}
              disabled={isResolvingAnswer}
              className="py-4 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold rounded-2xl border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50"
            >
              Trocar questao
            </button>
          </div>
          <div className="mt-4 text-xs text-slate-500 dark:text-slate-400 font-semibold">
            Acertos consecutivos aumentam o dano. Maestria no topico tambem fortalece seus ataques.
          </div>
          
          {isCorrect === false && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 text-center text-red-500 font-bold">
              Errou! O monstro contra-ataca. Escolha outra alternativa e tente novamente.
            </motion.p>
          )}
          {isCorrect === true && (
            <div className="mt-8">
              <button onClick={fetchExercise} className="w-full py-4 bg-slate-800 text-white font-bold rounded-2xl">
                Próximo Turno
              </button>
            </div>
          )}
        </div>
      ) : (
        <motion.div 
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className={`p-12 rounded-[48px] text-center space-y-6 border-8 shadow-2xl transition-colors ${
            enemyHp <= 0 
              ? 'bg-white dark:bg-slate-900 border-emerald-500' 
              : 'bg-white dark:bg-slate-900 border-red-500'
          }`}
        >
          <div className={`w-24 h-24 rounded-full flex items-center justify-center mx-auto ${
            enemyHp <= 0 ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600' : 'bg-red-100 dark:bg-red-900/30 text-red-600'
          }`}>
            {enemyHp <= 0 ? <Trophy size={48} /> : <AlertCircle size={48} />}
          </div>
          <h2 className="text-5xl font-black text-slate-800 dark:text-white mb-4 font-display transition-colors">
            {enemyHp <= 0 ? 'VITÓRIA!' : 'DERROTA...'}
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-lg max-w-md mx-auto transition-colors">
            {enemyHp <= 0 
              ? 'Você derrotou o Boss da Lógica e provou sua maestria matemática! Recompensas foram adicionadas ao seu baú.' 
              : 'O monstro foi mais forte desta vez. Não desanime! Revise seus conceitos e tente novamente para conquistar a glória.'}
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4 pt-4">
            <Link to="/trilhas" className="px-10 py-4 bg-slate-800 dark:bg-slate-700 text-white font-bold rounded-2xl hover:bg-slate-900 dark:hover:bg-slate-600 transition-all">
              Voltar ao Mapa
            </Link>
            {enemyHp <= 0 ? (
              <div className="px-10 py-4 bg-emerald-600 text-white font-bold rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-100 dark:shadow-none">
                <Coins size={20} /> +50 Moedas
              </div>
            ) : (
              <button onClick={() => window.location.reload()} className="px-10 py-4 bg-red-600 text-white font-bold rounded-2xl hover:bg-red-700 transition-all">
                Tentar Novamente
              </button>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
};

const QuestsView = ({ user }: { user: User | null }) => {
  if (!user) {
    return (
      <div className="max-w-xl mx-auto mt-12 p-8 text-center bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800">
        <h2 className="text-2xl font-black text-slate-800 dark:text-white mb-2">Dados do perfil indisponiveis</h2>
        <p className="text-slate-500 dark:text-slate-400 mb-6">Nao foi possivel carregar o usuario para mostrar as missoes.</p>
        <button
          onClick={() => window.location.reload()}
          className="px-5 py-2 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  const quests = Array.isArray(user.quests) ? user.quests : [];

  return (
    <div className="space-y-8">
      <div className="text-center max-w-2xl mx-auto space-y-4">
        <h1 className="text-5xl font-black text-slate-800 dark:text-white font-display transition-colors">Missões Ativas</h1>
        <p className="text-slate-500 dark:text-slate-400 text-lg transition-colors">Complete desafios para ganhar XP e moedas extras.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {quests.map((quest, i) => (
          <motion.div
            key={quest.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.1 }}
            className={`p-8 rounded-[40px] border-2 transition-all ${
              quest.completed 
                ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800 opacity-75' 
                : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 shadow-xl shadow-slate-100 dark:shadow-none'
            }`}
          >
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className={`text-xl font-bold mb-1 transition-colors ${quest.completed ? 'text-emerald-700 dark:text-emerald-400 line-through' : 'text-slate-800 dark:text-white'}`}>
                  {quest.title}
                </h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm transition-colors">{quest.description}</p>
              </div>
              {quest.completed && (
                <div className="bg-emerald-500 text-white p-2 rounded-full">
                  <CheckCircle2 size={20} />
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="flex justify-between text-xs font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 transition-colors">
                <span>Progresso</span>
                <span>{quest.current_value} / {quest.target_value}</span>
              </div>
              <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden transition-colors">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, (quest.current_value / quest.target_value) * 100)}%` }}
                  className={`h-full transition-all ${quest.completed ? 'bg-emerald-500' : 'bg-blue-500'}`}
                />
              </div>
            </div>

            <div className="mt-8 flex gap-4">
              <div className="flex items-center gap-2 text-blue-600 font-black text-sm">
                <Zap size={16} /> +{quest.reward_xp} XP
              </div>
              <div className="flex items-center gap-2 text-orange-600 font-black text-sm">
                <Coins size={16} /> +{quest.reward_coins} Moedas
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

const ShopView = ({ user, onUpdate }: { user: User | null, onUpdate: () => void }) => {
  const [items, setItems] = useState<ShopItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState<number | null>(null);

  useEffect(() => {
    const fetchShop = async () => {
      try {
        const res = await fetch(apiUrl('/api/shop'));
        if (!res.ok) throw new Error(`Falha ao carregar loja: ${res.status}`);
        const data = await res.json();
        setItems(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error(err);
        setItems([]);
      } finally {
        setLoading(false);
      }
    };
    fetchShop();
  }, []);

  const handleBuy = async (itemId: number) => {
    if (!user) return;
    setBuying(itemId);
    try {
      const res = await fetch(apiUrl('/api/shop/buy'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getUserAuthHeaders() },
        body: JSON.stringify({ itemId })
      });
      if (res.ok) {
        onUpdate();
      } else {
        const data = await res.json();
        alert(data.error || 'Erro ao comprar item');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setBuying(null);
    }
  };

  if (loading) return <div className="p-20 text-center">Carregando loja...</div>;

  return (
    <div className="space-y-8">
      <div className="text-center max-w-2xl mx-auto space-y-4">
        <h1 className="text-5xl font-black text-slate-800 dark:text-white font-display transition-colors">Loja de Itens</h1>
        <p className="text-slate-500 dark:text-slate-400 text-lg transition-colors">Gaste suas moedas em equipamentos poderosos.</p>
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 rounded-2xl font-black border border-orange-100 dark:border-orange-900/30 transition-colors">
          <Coins size={20} />
          <span>{user?.coins} Moedas</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {items.map((item, i) => {
          const inventory = Array.isArray(user?.inventory) ? user.inventory : [];
          const alreadyOwned = inventory.some(inv => inv.id === item.id);
          return (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-white dark:bg-slate-900 p-6 rounded-[40px] border border-slate-100 dark:border-slate-800 shadow-xl shadow-slate-100 dark:shadow-none flex flex-col items-center text-center relative overflow-hidden group transition-colors"
            >
                <div className="w-24 h-24 bg-slate-50 dark:bg-slate-800 rounded-3xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <ItemArtwork itemName={item.name} itemType={item.equip_type || item.type} size={48} />
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1 transition-colors">{item.rarity}</span>
              <h3 className="font-bold text-slate-800 dark:text-white mb-1 transition-colors">{item.name}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 h-8 transition-colors">{item.description}</p>
              
              <div className="flex flex-wrap justify-center gap-2 mb-6">
                {item.bonus_xp > 0 && <div className="text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/20 px-2 py-0.5 rounded-full transition-colors">+{item.bonus_xp}% XP</div>}
                {item.bonus_damage && item.bonus_damage > 0 && <div className="text-[10px] font-bold text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/20 px-2 py-0.5 rounded-full transition-colors">+{item.bonus_damage} Dano</div>}
                {item.bonus_hp && item.bonus_hp > 0 && <div className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/20 px-2 py-0.5 rounded-full transition-colors">+{item.bonus_hp} HP</div>}
              </div>

              <button
                onClick={() => handleBuy(item.id)}
                disabled={alreadyOwned || buying === item.id || (user?.coins || 0) < item.price}
                className={`w-full py-3 rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                  alreadyOwned 
                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed' 
                    : (user?.coins || 0) < item.price
                      ? 'bg-slate-50 dark:bg-slate-800/50 text-slate-300 dark:text-slate-700 cursor-not-allowed'
                      : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg shadow-emerald-100 dark:shadow-none'
                }`}
              >
                {alreadyOwned ? (
                  'Já Possui'
                ) : buying === item.id ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Coins size={16} />
                    {item.price}
                  </>
                )}
              </button>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

const LeaderboardView = () => {
  const [leaders, setLeaders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLeaders = async () => {
      try {
        const res = await fetch(apiUrl('/api/leaderboard'), { headers: getUserAuthHeaders() });
        if (!res.ok) throw new Error(`Falha ao carregar ranking: ${res.status}`);
        const data = await res.json();
        setLeaders(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error(err);
        setLeaders([]);
      } finally {
        setLoading(false);
      }
    };
    fetchLeaders();
  }, []);

  if (loading) return <div className="p-20 text-center">Carregando ranking...</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="text-center space-y-4">
        <h1 className="text-5xl font-black text-slate-800 dark:text-white font-display transition-colors">Hall da Fama</h1>
        <p className="text-slate-500 dark:text-slate-400 text-lg transition-colors">Os maiores heróis matemáticos do reino.</p>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-[48px] border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden transition-colors">
        <div className="grid grid-cols-12 bg-slate-50 dark:bg-slate-800/50 p-6 border-b border-slate-100 dark:border-slate-800 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 transition-colors">
          <div className="col-span-1 text-center">Pos</div>
          <div className="col-span-5">Herói</div>
          <div className="col-span-2 text-center">Classe</div>
          <div className="col-span-2 text-center">Nível</div>
          <div className="col-span-2 text-right">XP Total</div>
        </div>
        
        <div className="divide-y divide-slate-50 dark:divide-slate-800 transition-colors">
          {leaders.map((leader, i) => (
            <div key={i} className="grid grid-cols-12 p-6 items-center hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
              <div className="col-span-1 text-center font-black text-slate-400 dark:text-slate-600 transition-colors">
                {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
              </div>
              <div className="col-span-5 flex items-center gap-4">
                <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-bold transition-colors">
                  {(leader?.name || '?')[0]}
                </div>
                <span className="font-bold text-slate-800 dark:text-white transition-colors">{leader?.name || 'Sem nome'}</span>
              </div>
              <div className="col-span-2 text-center">
                <span className="px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded-full text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase transition-colors">
                  {leader?.hero_class || 'Novato'}
                </span>
              </div>
              <div className="col-span-2 text-center font-bold text-slate-600 dark:text-slate-400 transition-colors">
                Lvl {leader?.level ?? 1}
              </div>
              <div className="col-span-2 text-right font-black text-emerald-600 dark:text-emerald-400 transition-colors">
                {Number(leader?.xp || 0).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const ProfileView = ({ user, onUpdate, onChangePassword }: { user: User | null, onUpdate: () => void, onChangePassword: (currentPassword: string, newPassword: string) => Promise<void> }) => {
  const [isEditingClass, setIsEditingClass] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [securityError, setSecurityError] = useState('');
  const [securityLoading, setSecurityLoading] = useState(false);

  const closePasswordModal = () => {
    setIsChangingPassword(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setSecurityError('');
  };

  const submitPasswordChange = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      setSecurityError('Preencha todos os campos.');
      return;
    }

    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(newPassword)) {
      setSecurityError('Use 8+ caracteres com maiuscula, minuscula, numero e simbolo.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setSecurityError('A confirmacao da senha nao confere.');
      return;
    }

    setSecurityLoading(true);
    setSecurityError('');
    try {
      await onChangePassword(currentPassword, newPassword);
      closePasswordModal();
    } catch (e) {
      setSecurityError(e instanceof Error ? e.message : 'Falha ao trocar senha.');
    } finally {
      setSecurityLoading(false);
    }
  };

  const handlePasswordModalKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void submitPasswordChange();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      closePasswordModal();
    }
  };

  if (!user) {
    return (
      <div className="max-w-xl mx-auto mt-12 p-8 text-center bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800">
        <h2 className="text-2xl font-black text-slate-800 dark:text-white mb-2">Perfil indisponivel</h2>
        <p className="text-slate-500 dark:text-slate-400 mb-6">Os dados do usuario ainda nao foram carregados.</p>
        <button
          onClick={onUpdate}
          className="px-5 py-2 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700"
        >
          Recarregar dados
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="bg-white dark:bg-slate-900 p-10 rounded-[48px] border border-slate-200 dark:border-slate-800 shadow-xl relative overflow-hidden transition-colors">
        <div className="absolute top-5 right-5 opacity-10 dark:opacity-20 transition-colors">
          <RpgHeroAvatar heroClass={user.hero_class} size="lg" visualMode="profile" />
        </div>
        
        <div className="flex flex-col md:flex-row items-center gap-8 relative z-10">
          <RpgHeroAvatar heroClass={user.hero_class} size="lg" visualMode="profile" />
          <div className="text-center md:text-left">
            <h1 className="text-4xl font-black text-slate-800 dark:text-white mb-2 transition-colors">{user.name}</h1>
            <p className="text-slate-500 dark:text-slate-400 font-medium transition-colors">{user.email}</p>
            <div className="flex flex-wrap justify-center md:justify-start gap-3 mt-4">
              <div className="px-4 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-full text-xs font-bold border border-blue-100 dark:border-blue-900/30 transition-colors">
                Nível {user.level}
              </div>
              <div className="px-4 py-1.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-full text-xs font-bold border border-emerald-100 dark:border-emerald-900/30 transition-colors">
                {user.hero_class || 'Sem Classe'}
              </div>
              <div className="px-4 py-1.5 bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 rounded-full text-xs font-bold border border-orange-100 dark:border-orange-900/30 transition-colors">
                {user.streak} Dias de Streak
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-white dark:bg-slate-900 p-8 rounded-[40px] border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
          <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-6 flex items-center gap-2 transition-colors">
            <Zap size={20} className="text-yellow-500" /> Sua Classe
          </h3>
          {user.hero_class ? (
            <div className="space-y-6">
              <div className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 transition-colors">
                <RpgHeroAvatar heroClass={user.hero_class} size="sm" visualMode="profile" />
                <div>
                  <p className="font-bold text-slate-800 dark:text-white transition-colors">{user.hero_class}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 transition-colors">Classe Ativa</p>
                </div>
              </div>
              <button 
                onClick={() => setIsEditingClass(true)}
                className="w-full py-3 border-2 border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-bold rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
              >
                Trocar de Classe
              </button>
            </div>
          ) : (
            <button 
              onClick={() => setIsEditingClass(true)}
              className="w-full py-4 bg-emerald-600 text-white font-bold rounded-2xl"
            >
              Escolher Classe
            </button>
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 p-8 rounded-[40px] border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
          <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-6 flex items-center gap-2 transition-colors">
            <Coins size={20} className="text-yellow-500" /> Economia
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-100 dark:border-yellow-900/30 rounded-2xl transition-colors">
              <p className="text-[10px] font-black text-yellow-600 dark:text-yellow-400 uppercase tracking-widest mb-1 transition-colors">Moedas</p>
              <p className="text-2xl font-black text-yellow-700 dark:text-yellow-500 transition-colors">{user.coins}</p>
            </div>
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/30 rounded-2xl transition-colors">
              <p className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest mb-1 transition-colors">XP Total</p>
              <p className="text-2xl font-black text-blue-700 dark:text-blue-500 transition-colors">{user.xp}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 p-8 rounded-[40px] border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
        <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-3 transition-colors">Seguranca do Perfil</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 transition-colors">
          Altere sua senha para manter sua conta protegida.
        </p>
        <button
          onClick={() => {
            setIsChangingPassword(true);
            setSecurityError('');
          }}
          className="px-5 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-colors"
        >
          Trocar Senha
        </button>
      </div>

      {isEditingClass && (
        <div className="fixed inset-0 z-[100] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="max-w-5xl w-full">
            <div className="flex justify-end mb-4">
              <button onClick={() => setIsEditingClass(false)} className="p-2 bg-white/10 text-white rounded-full hover:bg-white/20">
                <X size={24} />
              </button>
            </div>
            <ClassSelectionView user={user} onUpdate={() => { onUpdate(); setIsEditingClass(false); }} />
          </div>
        </div>
      )}

      {isChangingPassword && (
        <div className="fixed inset-0 z-[120] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
            <h4 className="text-2xl font-black text-slate-800 dark:text-white">Trocar Senha</h4>

            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              onKeyDown={handlePasswordModalKeyDown}
              placeholder="Senha atual"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
            />
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              onKeyDown={handlePasswordModalKeyDown}
              placeholder="Nova senha"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onKeyDown={handlePasswordModalKeyDown}
              placeholder="Confirmar nova senha"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
            />

            {securityError && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-300 text-sm font-semibold">
                {securityError}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={closePasswordModal}
                className="flex-1 py-3 rounded-xl font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
              >
                Cancelar
              </button>
              <button
                disabled={securityLoading}
                onClick={() => void submitPasswordChange()}
                className="flex-1 py-3 rounded-xl font-bold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {securityLoading ? 'Salvando...' : 'Salvar Nova Senha'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const Dashboard = ({ user, onUpdate }: { user: User | null; onUpdate: () => void }) => {
  const data = [
    { name: 'Seg', xp: 400 },
    { name: 'Ter', xp: 300 },
    { name: 'Qua', xp: 600 },
    { name: 'Qui', xp: 800 },
    { name: 'Sex', xp: 500 },
    { name: 'Sáb', xp: 900 },
    { name: 'Dom', xp: 1100 },
  ];

  const totalMastery = TOPICS.reduce((acc, topic) => {
    const topicMastery = user?.progress.find((p) => p.topic === topic.id)?.mastery || 0;
    return acc + topicMastery;
  }, 0);
  const avgMastery = TOPICS.length ? Math.round(totalMastery / TOPICS.length) : 0;
  const topicStatus = TOPICS.map((topic, index) => {
    const mastery = user?.progress.find((p) => p.topic === topic.id)?.mastery || 0;
    const isUnlocked = index === 0 || (user?.progress.find((p) => p.topic === TOPICS[index - 1].id)?.mastery || 0) >= 50;
    return { topic, mastery, isUnlocked };
  });
  const recommendedTopic = topicStatus.find((entry) => entry.isUnlocked && entry.mastery < 100) || topicStatus[0];
  const completedTopics = user?.progress.filter(p => p.mastery === 100).length || 0;
  const targetToday = Math.max(2, Math.min(6, Math.ceil((100 - avgMastery) / 20)));

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 dark:text-white transition-colors">Olá, {user?.name || 'Estudante'}! 👋</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 transition-colors">Pronto para sua próxima batalha matemática?</p>
        </div>
        <Link to="/trilhas" className="px-6 py-3 bg-emerald-600 text-white font-bold rounded-2xl shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-all flex items-center gap-2 w-fit">
          Explorar Mapa <ChevronRight size={20} />
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <GrowthTree mastery={avgMastery} completedTopics={completedTopics} totalTopics={TOPICS.length} />
          
          <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-800 dark:text-white transition-colors">Atividade Semanal</h3>
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-1 rounded-full transition-colors">
                <TrendingUp size={14} /> +24% que semana passada
              </div>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data}>
                  <defs>
                    <linearGradient id="colorXp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} dy={10} />
                  <YAxis hide />
                  <Tooltip 
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  />
                  <Area type="monotone" dataKey="xp" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorXp)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="space-y-8">
          <div className="bg-gradient-to-br from-emerald-500 to-cyan-500 p-6 rounded-3xl text-white shadow-xl">
            <h3 className="text-lg font-black">Plano de Hoje</h3>
            <p className="text-sm text-white/90 mt-1">Continue no ponto ideal para acelerar seu dominio.</p>

            <div className="mt-4 grid grid-cols-2 gap-3 text-xs font-bold">
              <div className="bg-white/15 rounded-xl p-3">
                <p className="uppercase text-white/80">Sequencia</p>
                <p className="text-xl mt-1">{user?.streak || 0} dias</p>
              </div>
              <div className="bg-white/15 rounded-xl p-3">
                <p className="uppercase text-white/80">Meta diaria</p>
                <p className="text-xl mt-1">{targetToday} exercicios</p>
              </div>
            </div>

            <div className="mt-4 p-3 rounded-xl bg-white/15">
              <p className="text-[11px] uppercase font-bold text-white/80">Proximo foco</p>
              <p className="font-black text-base">{recommendedTopic.topic.title}</p>
              <p className="text-xs text-white/85">Dominio atual: {recommendedTopic.mastery}%</p>
            </div>

            <Link
              to={`/exercicio/${recommendedTopic.topic.id}`}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-emerald-700 font-black hover:bg-emerald-50 transition-colors"
            >
              Continuar agora <ChevronRight size={16} />
            </Link>
          </div>

          {/* RPG Character Card */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden relative transition-colors">
            <div className="absolute top-0 right-0 p-4 opacity-15 dark:opacity-20 transition-colors">
              <RpgHeroAvatar heroClass={user?.hero_class} size="md" visualMode="profile" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4 relative z-10 transition-colors">Seu Herói</h3>
            <div className="flex items-center gap-4 mb-6 relative z-10">
              <RpgHeroAvatar heroClass={user?.hero_class} size="md" visualMode="profile" />
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-white transition-colors">{user?.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 transition-colors">Nível {user?.level} Matemático</p>
                <div className="flex gap-1 mt-2">
                  {user?.inventory.filter(i => i.equipped).map(item => (
                    <div key={item.id} className="p-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-400 transition-colors" title={item.name}>
                      <ItemArtwork itemName={item.name} itemType={item.equip_type || item.type} size={14} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="space-y-3 relative z-10">
              <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase">
                <span>XP para Nível {user ? user.level + 1 : 2}</span>
                <span>{(user?.xp || 0) % 1000}/1000</span>
              </div>
              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <motion.div animate={{ width: `${(user?.xp || 0) % 1000 / 10}%` }} className="h-full bg-blue-500" />
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
            <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4 transition-colors">Estatísticas Rápidas</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl transition-colors">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl transition-colors">
                    <Zap size={20} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase transition-colors">XP Total</p>
                    <p className="text-lg font-bold text-slate-800 dark:text-white transition-colors">{user?.xp || 0}</p>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl transition-colors">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-xl transition-colors">
                    <Star size={20} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase transition-colors">Nível</p>
                    <p className="text-lg font-bold text-slate-800 dark:text-white transition-colors">{user?.level || 1}</p>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl transition-colors">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-xl transition-colors">
                    <BookOpen size={20} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase transition-colors">Tópicos Concluídos</p>
                    <p className="text-lg font-bold text-slate-800 dark:text-white transition-colors">
                      {completedTopics}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <DailyChallenge user={user} onUpdate={onUpdate} />
        </div>
      </div>
    </div>
  );
};

const Trilhas = ({ user }: { user: User | null }) => {
  const mapScrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [activeMarkerId, setActiveMarkerId] = useState<string | null>(null);

  const getTopicMastery = (topicId: string) => {
    return user?.progress.find((p) => p.topic === topicId)?.mastery || 0;
  };

  const updateScrollProgress = (el: HTMLDivElement) => {
    const maxScroll = Math.max(1, el.scrollHeight - el.clientHeight);
    const progress = Math.max(0, Math.min(100, (el.scrollTop / maxScroll) * 100));
    setScrollProgress(progress);
  };

  useEffect(() => {
    const el = mapScrollRef.current;
    if (!el) return;
    updateScrollProgress(el);
  }, []);

  const scrollToTop = () => {
    mapScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const scrollToBottom = () => {
    const el = mapScrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  };

  const scrollToTopic = (topicY: number) => {
    const el = mapScrollRef.current;
    if (!el) return;

    const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
    const targetTop = Math.max(0, Math.min(maxScroll, (topicY / 100) * maxScroll));
    el.scrollTo({ top: targetTop, behavior: 'smooth' });
  };

  return (
    <div className="space-y-8 transition-colors">
      <div className="text-center max-w-2xl mx-auto">
        <h1 className="text-4xl font-extrabold text-slate-800 dark:text-white font-display tracking-tight transition-colors">Sua Jornada Matemática</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-3 text-lg transition-colors">Desbloqueie novos mundos e faça sua árvore crescer resolvendo desafios.</p>
      </div>

      <div className="relative">
        <div
          ref={mapScrollRef}
          onScroll={(e) => updateScrollProgress(e.currentTarget)}
          className="max-h-[calc(100vh-250px)] overflow-y-auto scroll-smooth pr-2"
        >
          <JourneyMap user={user} />
        </div>

        <div className="fixed left-6 bottom-6 z-30 hidden lg:flex items-center gap-3 rounded-2xl bg-white/95 dark:bg-slate-800/95 border border-slate-200 dark:border-slate-700 shadow-lg px-3 py-3">
          <div className="relative h-28 w-2">
            <div className="absolute inset-0 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
              <div
                className="w-full bg-emerald-500 transition-all duration-200"
                style={{ height: `${scrollProgress}%`, marginTop: `${100 - scrollProgress}%` }}
              />
            </div>

            {TOPICS.map((topic) => {
              const mastery = getTopicMastery(topic.id);
              const markerClass = mastery >= 100
                ? 'bg-emerald-500 ring-emerald-200 dark:ring-emerald-900/40'
                : mastery > 0
                  ? 'bg-amber-400 ring-amber-200 dark:ring-amber-900/40'
                  : 'bg-slate-300 dark:bg-slate-600 ring-slate-200 dark:ring-slate-700';
              const isActive = activeMarkerId === topic.id;

              return (
                <div
                  key={`marker-${topic.id}`}
                  className="absolute left-1/2"
                  style={{ top: `${topic.y}%`, transform: 'translate(-50%, -50%)' }}
                >
                  <button
                    type="button"
                    onClick={() => scrollToTopic(topic.y)}
                    onMouseEnter={() => setActiveMarkerId(topic.id)}
                    onMouseLeave={() => setActiveMarkerId((current) => (current === topic.id ? null : current))}
                    onFocus={() => setActiveMarkerId(topic.id)}
                    onBlur={() => setActiveMarkerId((current) => (current === topic.id ? null : current))}
                    className={`h-2.5 w-2.5 rounded-full ring-2 ${markerClass} hover:scale-125 focus:scale-125 transition-transform`}
                    title={`${topic.title} - ${mastery}%`}
                    aria-label={`Ir para ${topic.title}`}
                  />

                  {isActive && (
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-lg bg-slate-900 text-white text-[11px] font-semibold px-2 py-1 shadow-lg">
                      {topic.title} ({mastery}%)
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="space-y-1">
            <div className="text-xs font-bold text-slate-600 dark:text-slate-300">
              {Math.round(scrollProgress)}%
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 space-y-1">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span>Concluido</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-amber-400" />
                <span>Em andamento</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-slate-300 dark:bg-slate-600" />
                <span>Pendente</span>
              </div>
            </div>
          </div>
        </div>

        <div className="fixed right-6 bottom-6 z-30 flex flex-col gap-3 lg:right-10 lg:bottom-10">
          <button
            onClick={scrollToTop}
            className="px-4 py-2 rounded-xl bg-white/95 dark:bg-slate-800/95 border border-slate-200 dark:border-slate-700 shadow-lg text-slate-700 dark:text-slate-200 font-bold"
          >
            Ir ao topo
          </button>
          <button
            onClick={scrollToBottom}
            className="px-4 py-2 rounded-xl bg-emerald-600 text-white shadow-lg font-bold hover:bg-emerald-700 transition-colors"
          >
            Ir ao final
          </button>
        </div>
      </div>
    </div>
  );
};

const ExerciseView = ({ user, onUpdate }: { user: User | null, onUpdate: () => void }) => {
  const { topicId } = useParams<{ topicId: string }>();
  const topic = TOPICS.find(t => t.id === topicId);
  const [exercise, setExercise] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);

  const fetchExercise = async () => {
    if (!topic) return;
    setLoading(true);
    setSelectedOption(null);
    setIsCorrect(null);
    setShowExplanation(false);
    try {
      const ex = await generateExercise(topic.id, user?.level || 1);
      setExercise(ex);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExercise();
  }, [topic]);

  const handleCheck = async () => {
    if (selectedOption === null) return;
    const correct = selectedOption === exercise.correctAnswerIndex;
    setIsCorrect(correct);
    setShowExplanation(true);

    if (correct && user) {
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#10b981', '#34d399', '#6ee7b7']
      });

      await fetch(apiUrl('/api/user/update-progress'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getUserAuthHeaders() },
        body: JSON.stringify({
          topic: topic?.id,
          action: 'exercise_correct'
        })
      });
      onUpdate();
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4">
        <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-500 font-medium">Gerando desafio personalizado...</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8 transition-colors">
      <div className="flex items-center justify-between">
        <Link to="/trilhas" className="text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white flex items-center gap-1 font-medium transition-colors">
          <ChevronRight size={20} className="rotate-180" /> Voltar para Trilhas
        </Link>
        <div className="px-4 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-full text-xs font-bold uppercase tracking-wider transition-colors">
          {topic?.title}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 p-8 md:p-12 rounded-[40px] border border-slate-200 dark:border-slate-800 shadow-xl shadow-slate-100 dark:shadow-none transition-colors">
        <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-8 leading-relaxed transition-colors">
          {exercise.question}
        </h2>

        <div className="grid grid-cols-1 gap-4">
          {exercise.options.map((option: string, index: number) => (
            <button
              key={index}
              disabled={isCorrect === true}
              onClick={() => setSelectedOption(index)}
              className={`p-6 rounded-2xl border-2 text-left transition-all flex items-center justify-between group ${
                selectedOption === index 
                  ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' 
                  : 'border-slate-100 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-800/50'
              } ${
                isCorrect !== null && index === exercise.correctAnswerIndex 
                  ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400' 
                  : ''
              } ${
                isCorrect === false && selectedOption === index 
                  ? 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400' 
                  : ''
              }`}
            >
              <span className="font-medium">{option}</span>
              <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                selectedOption === index ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-200 dark:border-slate-700'
              }`}>
                {selectedOption === index && <div className="w-2 h-2 bg-white rounded-full" />}
              </div>
            </button>
          ))}
        </div>

        <div className="mt-12 flex flex-col md:flex-row gap-4">
          {isCorrect === true ? (
            <button
              onClick={fetchExercise}
              className="flex-1 py-4 bg-slate-800 text-white font-bold rounded-2xl shadow-lg shadow-slate-200 hover:bg-slate-900 transition-all"
            >
              Proximo Exercicio
            </button>
          ) : (
            <button
              onClick={handleCheck}
              disabled={selectedOption === null}
              className="flex-1 py-4 bg-emerald-600 text-white font-bold rounded-2xl shadow-lg shadow-emerald-100 hover:bg-emerald-700 disabled:opacity-50 disabled:shadow-none transition-all"
            >
              {isCorrect === false ? 'Tentar Novamente' : 'Verificar Resposta'}
            </button>
          )}
          <Link to="/tutor" className="px-8 py-4 bg-white border-2 border-slate-200 text-slate-700 font-bold rounded-2xl hover:bg-slate-50 transition-all flex items-center justify-center gap-2">
            <MessageSquare size={20} /> Pedir ajuda ao Tutor
          </Link>
        </div>

        <AnimatePresence>
          {showExplanation && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              className="mt-8 p-6 bg-slate-50 rounded-3xl border border-slate-100"
            >
              <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-2">
                {isCorrect ? '✨ Excelente!' : '💡 Vamos aprender?'}
              </h4>
              <p className="text-slate-600 text-sm leading-relaxed">
                {exercise.explanation}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

const TutorChat = () => {
  const [messages, setMessages] = useState<{ role: 'user' | 'tutor', text: string }[]>([
    { role: 'tutor', text: 'Olá! Eu sou o Growing Math Tutor. Com o que posso te ajudar hoje? Pode me perguntar sobre qualquer conceito matemático ou pedir para eu explicar um problema passo a passo.' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);

  useEffect(() => {
    let active = true;

    const loadStatus = async () => {
      try {
        const status = await getAiStatus();
        if (active) setAiStatus(status);
      } catch (error) {
        console.error('Erro ao carregar status da IA:', error);
        if (active) setAiStatus(null);
      }
    };

    void loadStatus();
    const interval = window.setInterval(() => void loadStatus(), 12000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  const statusMeta = (() => {
    if (aiStatus?.runtimeMode === 'gemini') {
      return {
        label: 'IA online (Gemini)',
        dotClass: 'bg-emerald-500',
        textClass: 'text-emerald-600 dark:text-emerald-400',
      };
    }
    if (aiStatus?.runtimeMode === 'ollama') {
      return {
        label: `IA local (Ollama${aiStatus.modelDetected ? `: ${aiStatus.modelDetected}` : ''})`,
        dotClass: 'bg-cyan-500',
        textClass: 'text-cyan-600 dark:text-cyan-400',
      };
    }
    return {
      label: 'Modo offline ativo',
      dotClass: 'bg-amber-500',
      textClass: 'text-amber-600 dark:text-amber-400',
    };
  })();

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    
    const userMsg = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setLoading(true);

    try {
      const response = await getTutorResponse([], userMsg);
      setMessages(prev => [...prev, { role: 'tutor', text: response }]);
    } catch (err) {
      console.error(err);
      setMessages(prev => [
        ...prev,
        {
          role: 'tutor',
          text: 'Nao consegui processar sua mensagem agora, mas continuo disponivel. Tente enviar novamente com os dados da questao e eu explico passo a passo.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto h-[calc(100vh-12rem)] flex flex-col bg-white dark:bg-slate-900 rounded-[40px] border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden transition-colors">
      <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex items-center gap-4 transition-colors">
        <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center text-white shadow-lg">
          <MessageSquare size={24} />
        </div>
        <div>
          <h2 className="font-bold text-slate-800 dark:text-white transition-colors">Tutor IA</h2>
          <p className={`text-xs font-bold flex items-center gap-1 transition-colors ${statusMeta.textClass}`}>
            <span className={`w-2 h-2 rounded-full animate-pulse ${statusMeta.dotClass}`} /> {statusMeta.label}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] p-5 rounded-3xl transition-colors ${
              msg.role === 'user' 
                ? 'bg-emerald-600 text-white rounded-tr-none' 
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-tl-none border border-slate-200/50 dark:border-slate-700'
            }`}>
              <div className="prose prose-sm max-w-none prose-slate dark:prose-invert transition-colors">
                <Markdown>{msg.text}</Markdown>
              </div>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-slate-100 dark:bg-slate-800 p-5 rounded-3xl rounded-tl-none flex gap-1 transition-colors">
              <div className="w-2 h-2 bg-slate-400 dark:bg-slate-600 rounded-full animate-bounce" />
              <div className="w-2 h-2 bg-slate-400 dark:bg-slate-600 rounded-full animate-bounce [animation-delay:0.2s]" />
              <div className="w-2 h-2 bg-slate-400 dark:bg-slate-600 rounded-full animate-bounce [animation-delay:0.4s]" />
            </div>
          </div>
        )}
      </div>

      <div className="p-6 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 transition-colors">
        <div className="flex gap-4">
          <input 
            type="text" 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder="Digite sua dúvida aqui..." 
            className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white rounded-2xl px-6 py-4 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
          />
          <button 
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className="px-8 bg-emerald-600 text-white font-bold rounded-2xl hover:bg-emerald-700 disabled:opacity-50 transition-all"
          >
            Enviar
          </button>
        </div>
      </div>
    </div>
  );
};

const AutoDemoDirector = ({ user, onUpdate }: { user: User | null; onUpdate: () => Promise<void> }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const isDemoUser = normalizeAssetName(user?.email || '') === DEMO_PROFILE_EMAIL;
  const [enabled, setEnabled] = useState(() => localStorage.getItem(AUTO_DEMO_STORAGE_KEY) === '1');
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (!isDemoUser) {
      setEnabled(false);
      return;
    }

    setEnabled(localStorage.getItem(AUTO_DEMO_STORAGE_KEY) === '1');
  }, [isDemoUser]);

  const runBattleTurn = () => {
    if (!location.pathname.startsWith('/exercicio/')) return;

    const buttons = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[];
    const nextTurnButton = buttons.find((btn) => btn.textContent?.trim().toLowerCase().includes('proximo turno') && !btn.disabled);
    if (nextTurnButton) {
      nextTurnButton.click();
      return;
    }

    const tryAgainButton = buttons.find((btn) => btn.textContent?.trim().toLowerCase().includes('tentar novamente') && !btn.disabled);
    if (tryAgainButton) {
      tryAgainButton.click();
      return;
    }

    const startFocusButton = buttons.find((btn) => btn.textContent?.trim().toLowerCase().includes('iniciar foco') && !btn.disabled);
    if (startFocusButton) {
      startFocusButton.click();
    }

    const attackButton = buttons.find((btn) => btn.textContent?.trim().toLowerCase().includes('atacar!') && !btn.disabled);
    if (!attackButton) return;

    const selectedOption = buttons.find((btn) => btn.className.includes('border-emerald-500') && !btn.disabled);
    if (!selectedOption) {
      const actionLabels = ['atacar!', 'trocar questao', 'proximo turno', 'iniciar foco', 'cancelar'];
      const optionButtons = buttons.filter((btn) => {
        const txt = btn.textContent?.trim().toLowerCase() || '';
        if (!txt) return false;
        if (btn.disabled) return false;
        if (actionLabels.some((label) => txt.includes(label))) return false;
        return btn.className.includes('text-left');
      });

      const candidate = optionButtons[Math.floor(Math.random() * optionButtons.length)];
      if (candidate) {
        candidate.click();
      }
      return;
    }

    attackButton.click();
  };

  const runShopAction = async () => {
    if (location.pathname !== '/loja') return;

    const [shopRes, meRes] = await Promise.all([
      fetch(apiUrl('/api/shop'), { headers: { ...getUserAuthHeaders() } }),
      fetch(apiUrl('/api/auth/me'), { headers: { ...getUserAuthHeaders() } }),
    ]);

    if (!shopRes.ok || !meRes.ok) return;

    const shopData = await shopRes.json();
    const meData = await meRes.json();
    const shopItems = Array.isArray(shopData) ? shopData : [];
    const inventory = Array.isArray(meData?.inventory) ? meData.inventory : [];
    const ownedIds = new Set<number>(inventory.map((it: any) => Number(it.id)));
    const coins = Number(meData?.coins || 0);

    const candidate = shopItems.find((item: any) => !ownedIds.has(Number(item.id)) && Number(item.price || 0) <= coins);
    if (!candidate) return;

    const buyRes = await fetch(apiUrl('/api/shop/buy'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getUserAuthHeaders() },
      body: JSON.stringify({ itemId: candidate.id }),
    });

    if (buyRes.ok) {
      await onUpdate();
    }
  };

  const runInventoryAction = async () => {
    if (location.pathname !== '/inventario') return;

    const meRes = await fetch(apiUrl('/api/auth/me'), { headers: { ...getUserAuthHeaders() } });
    if (!meRes.ok) return;
    const meData = await meRes.json();
    const inventory = Array.isArray(meData?.inventory) ? meData.inventory : [];
    if (inventory.length === 0) return;

    const unequipped = inventory.find((item: any) => !item.equipped);
    const equipped = inventory.find((item: any) => item.equipped);
    const target = unequipped || equipped;
    if (!target) return;

    const equipRes = await fetch(apiUrl('/api/user/equip-item'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getUserAuthHeaders() },
      body: JSON.stringify({ inventoryId: target.inventory_id, equipped: !Boolean(target.equipped) }),
    });

    if (equipRes.ok) {
      await onUpdate();
    }
  };

  useEffect(() => {
    if (!enabled || !isDemoUser) return;

    const battleTicker = window.setInterval(() => {
      runBattleTurn();
    }, 1800);

    return () => window.clearInterval(battleTicker);
  }, [enabled, isDemoUser, location.pathname]);

  useEffect(() => {
    if (!enabled || !isDemoUser) return;

    const cycleRoutes = async () => {
      if (location.pathname === '/loja') {
        await runShopAction();
      } else if (location.pathname === '/inventario') {
        await runInventoryAction();
      } else if (location.pathname.startsWith('/exercicio/')) {
        runBattleTurn();
      }

      setStepIndex((prev) => {
        const next = (prev + 1) % AUTO_DEMO_ROUTES.length;
        navigate(AUTO_DEMO_ROUTES[next]);
        return next;
      });
    };

    const routeTimer = window.setInterval(() => {
      void cycleRoutes();
    }, 10000);

    return () => window.clearInterval(routeTimer);
  }, [enabled, isDemoUser, location.pathname, navigate]);

  useEffect(() => {
    if (!enabled || !isDemoUser) return;

    let direction: 1 | -1 = 1;
    const scrollTimer = window.setInterval(() => {
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      if (maxScroll <= 0) return;

      const current = Math.max(0, Math.min(maxScroll, window.scrollY));
      if (current >= maxScroll - 10) direction = -1;
      if (current <= 10) direction = 1;

      window.scrollBy({ top: direction * 180, behavior: 'smooth' });
    }, 1400);

    return () => window.clearInterval(scrollTimer);
  }, [enabled, isDemoUser, location.pathname]);

  if (!isDemoUser) return null;

  return (
    <div className="fixed right-4 bottom-4 z-[120] rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 px-4 py-3 shadow-xl backdrop-blur-sm">
      <p className="text-[11px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Modo Demo Automatica
      </p>
      <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">Rota: {AUTO_DEMO_ROUTES[stepIndex]}</p>
      <button
        onClick={() => {
          setEnabled((prev) => {
            const next = !prev;
            if (next) {
              localStorage.setItem(AUTO_DEMO_STORAGE_KEY, '1');
            } else {
              localStorage.removeItem(AUTO_DEMO_STORAGE_KEY);
            }
            return next;
          });
        }}
        className={`w-full px-3 py-2 rounded-xl text-xs font-black transition-colors ${enabled ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600'}`}
      >
        {enabled ? 'Pausar automacao' : 'Ativar automacao'}
      </button>
    </div>
  );
};

// --- Main App ---

const LevelUpModal = ({ level, onClose }: { level: number, onClose: () => void }) => {
  useEffect(() => {
    confetti({
      particleCount: 150,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#10b981', '#fbbf24', '#3b82f6']
    });
  }, []);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] bg-slate-900/90 backdrop-blur-xl flex items-center justify-center p-4 transition-colors"
    >
      <motion.div 
        initial={{ scale: 0.5, y: 50 }}
        animate={{ scale: 1, y: 0 }}
        className="bg-white dark:bg-slate-900 p-12 rounded-[60px] border-8 border-emerald-500 shadow-2xl text-center max-w-md w-full relative overflow-hidden transition-colors"
      >
        <div className="absolute top-0 left-0 w-full h-2 bg-emerald-500" />
        <div className="w-32 h-32 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center text-emerald-600 dark:text-emerald-400 mx-auto mb-8 shadow-inner transition-colors">
          <Trophy size={64} />
        </div>
        <h2 className="text-5xl font-black text-slate-800 dark:text-white mb-4 font-display transition-colors">LEVEL UP!</h2>
        <p className="text-slate-500 dark:text-slate-400 text-lg mb-8 transition-colors">
          Incrível! Você alcançou o <span className="text-emerald-600 dark:text-emerald-400 font-black">Nível {level}</span>. 
          Seus poderes matemáticos estão crescendo!
        </p>
        <button 
          onClick={onClose}
          className="w-full py-5 bg-emerald-600 text-white font-black rounded-3xl shadow-xl shadow-emerald-200 dark:shadow-none hover:bg-emerald-700 transition-all text-xl"
        >
          CONTINUAR JORNADA
        </button>
      </motion.div>
    </motion.div>
  );
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profiles, setProfiles] = useState<AuthProfile[]>([]);
  const [authenticated, setAuthenticated] = useState(false);
  const [authBooting, setAuthBooting] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showLevelUp, setShowLevelUp] = useState<number | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    if (!saved) return false;

    try {
      return JSON.parse(saved);
    } catch {
      return false;
    }
  });

  useEffect(() => {
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const normalizeUser = (data: any): User => ({
    ...data,
    progress: Array.isArray(data?.progress) ? data.progress : [],
    achievements: Array.isArray(data?.achievements) ? data.achievements : [],
    inventory: Array.isArray(data?.inventory) ? data.inventory : [],
    quests: Array.isArray(data?.quests) ? data.quests : [],
  });

  const loadProfiles = async () => {
    const res = await fetch(apiUrl('/api/auth/profiles'));
    if (!res.ok) {
      throw new Error(`Falha ao carregar perfis: ${res.status}`);
    }
    const data = await res.json();
    setProfiles(Array.isArray(data) ? data : []);
  };

  const loginWithProfile = async (email: string, password: string) => {
    const res = await fetch(apiUrl('/api/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error || 'Credenciais invalidas.');
    }

    if (!data?.authToken || !data?.user) {
      throw new Error('Resposta de autenticacao incompleta.');
    }

    localStorage.setItem(USER_TOKEN_STORAGE_KEY, String(data.authToken));
    if (normalizeAssetName(email) === DEMO_PROFILE_EMAIL) {
      localStorage.setItem(AUTO_DEMO_STORAGE_KEY, '1');
    } else {
      localStorage.removeItem(AUTO_DEMO_STORAGE_KEY);
    }
    setUser(normalizeUser(data.user));
    setAuthenticated(true);
    setLoading(false);
    await loadProfiles();
  };

  const registerProfile = async (name: string, email: string, password: string) => {
    const res = await fetch(apiUrl('/api/auth/register'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error || 'Nao foi possivel criar o perfil.');
    }

    if (!data?.authToken || !data?.user) {
      throw new Error('Resposta de autenticacao incompleta.');
    }

    localStorage.setItem(USER_TOKEN_STORAGE_KEY, String(data.authToken));
    localStorage.removeItem(AUTO_DEMO_STORAGE_KEY);
    setUser(normalizeUser(data.user));
    setAuthenticated(true);
    setLoading(false);
    await loadProfiles();
  };

  const loginWithDemo = async () => {
    const res = await fetch(apiUrl('/api/auth/demo-login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error || 'Modo demonstracao indisponivel.');
    }

    if (!data?.authToken || !data?.user) {
      throw new Error('Resposta de autenticacao demo incompleta.');
    }

    localStorage.setItem(USER_TOKEN_STORAGE_KEY, String(data.authToken));
    localStorage.setItem(AUTO_DEMO_STORAGE_KEY, '1');
    setUser(normalizeUser(data.user));
    setAuthenticated(true);
    setLoading(false);
    await loadProfiles();
  };

  const changePasswordForCurrentUser = async (currentPassword: string, newPassword: string) => {
    if (!user?.email) {
      throw new Error('Nenhum perfil autenticado.');
    }

    const res = await fetch(apiUrl('/api/auth/change-password'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getUserAuthHeaders() },
      body: JSON.stringify({ currentPassword, newPassword }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error || 'Nao foi possivel trocar a senha.');
    }
  };

  const logoutProfile = () => {
    localStorage.removeItem(USER_TOKEN_STORAGE_KEY);
    localStorage.removeItem(AUTO_DEMO_STORAGE_KEY);
    setAuthenticated(false);
    setUser(null);
    setShowLevelUp(null);
    setIsSidebarOpen(false);
  };

  const exitApplication = () => {
    window.close();
  };

  const fetchUser = async () => {
    if (!localStorage.getItem(USER_TOKEN_STORAGE_KEY)) return;

    setLoading(true);
    try {
      const res = await fetch(apiUrl('/api/auth/me'), { headers: { ...getUserAuthHeaders() } });
      if (!res.ok) throw new Error(`Falha ao carregar usuario: ${res.status}`);
      const data = await res.json();
      const normalizedUser = normalizeUser(data);
      
      if (user && normalizedUser.level > user.level) {
        setShowLevelUp(normalizedUser.level);
      }
      
      setUser(normalizedUser);
    } catch (err) {
      console.error(err);
      // Keep the current user in memory to avoid collapsing the UI on transient API failures.
      setUser((current) => current);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const bootAuth = async () => {
      const token = localStorage.getItem(USER_TOKEN_STORAGE_KEY);
      if (!token) return;

      try {
        const res = await fetch(apiUrl('/api/auth/me'), { headers: { ...getUserAuthHeaders() } });
        if (!res.ok) {
          localStorage.removeItem(USER_TOKEN_STORAGE_KEY);
          return;
        }

        const data = await res.json();
        setUser(normalizeUser(data));
        setAuthenticated(true);
      } catch {
        localStorage.removeItem(USER_TOKEN_STORAGE_KEY);
      }
    };

    void bootAuth();
  }, []);

  useEffect(() => {
    loadProfiles()
      .catch((err) => {
        console.error(err);
        setProfiles([]);
      })
      .finally(() => {
        setAuthBooting(false);
      });
  }, []);

  if (authBooting) {
    return (
      <div className="fixed inset-0 bg-white dark:bg-slate-950 flex items-center justify-center transition-colors">
        <motion.div
          animate={{ scale: [1, 1.15, 1], rotate: [0, 360] }}
          transition={{ duration: 1.8, repeat: Infinity }}
          className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center text-white font-bold text-3xl"
        >
          G
        </motion.div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <AccessPortal
        profiles={profiles}
        onLogin={loginWithProfile}
        onDemoLogin={loginWithDemo}
        onRegister={registerProfile}
        onRefresh={loadProfiles}
      />
    );
  }

  if (authenticated && !user) {
    return (
      <div className="fixed inset-0 bg-white dark:bg-slate-950 flex items-center justify-center p-6 transition-colors">
        <div className="max-w-lg w-full bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8 shadow-xl text-center">
          <h2 className="text-2xl font-black text-slate-800 dark:text-white mb-2">Nao foi possivel carregar seu perfil</h2>
          <p className="text-slate-500 dark:text-slate-400 mb-6">
            O acesso foi realizado, mas os dados do usuario nao foram carregados corretamente. Tente recarregar ou entrar novamente.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => window.location.reload()}
              className="px-5 py-3 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-700"
            >
              Recarregar
            </button>
            <button
              onClick={logoutProfile}
              className="px-5 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold hover:bg-slate-200 dark:hover:bg-slate-700"
            >
              Voltar ao acesso
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-white dark:bg-slate-950 flex items-center justify-center transition-colors">
        <motion.div 
          animate={{ scale: [1, 1.2, 1], rotate: [0, 360] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center text-white font-bold text-3xl shadow-lg shadow-emerald-200 dark:shadow-none"
        >
          G
        </motion.div>
      </div>
    );
  }

  return (
    <Router>
      <AutoDemoDirector user={user} onUpdate={fetchUser} />
      <KeyboardNavigation
        onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
        onToggleDarkMode={() => setDarkMode((prev: boolean) => !prev)}
        onLogout={logoutProfile}
        searchInputRef={searchInputRef}
      />

      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100 transition-colors">
        <Sidebar isOpen={isSidebarOpen} toggle={() => setIsSidebarOpen(!isSidebarOpen)} />
        
        <div className="lg:ml-64 min-h-screen flex flex-col">
          <Header 
            user={user} 
            toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} 
            darkMode={darkMode}
            toggleDarkMode={() => setDarkMode((prev: boolean) => !prev)}
            onLogout={logoutProfile}
            onExitApp={exitApplication}
            searchInputRef={searchInputRef}
          />
          
          <main className="flex-1 p-4 lg:p-10 max-w-7xl mx-auto w-full">
            <RouteErrorBoundary>
              <AnimatePresence mode="wait">
                <Routes>
                  <Route path="/" element={<Dashboard user={user} onUpdate={fetchUser} />} />
                  <Route path="/trilhas" element={<Trilhas user={user} />} />
                  <Route path="/exercicio/:topicId" element={<CombatView user={user} onUpdate={fetchUser} />} />
                  <Route path="/tutor" element={<TutorChat />} />
                  <Route path="/escola" element={<SchoolDashboard />} />
                  <Route path="/conquistas" element={<AchievementsView user={user} />} />
                  <Route path="/inventario" element={<InventoryView user={user} onUpdate={fetchUser} />} />
                  <Route path="/loja" element={<ShopView user={user} onUpdate={fetchUser} />} />
                  <Route path="/missoes" element={<QuestsView user={user} />} />
                  <Route path="/ranking" element={<LeaderboardView />} />
                  <Route path="/perfil" element={<ProfileView user={user} onUpdate={fetchUser} onChangePassword={changePasswordForCurrentUser} />} />
                  <Route path="*" element={<div className="text-center py-20"><h2 className="text-2xl font-bold">Pagina em construcao</h2><Link to="/" className="text-emerald-600 font-bold mt-4 inline-block">Voltar para o inicio</Link></div>} />
                </Routes>
              </AnimatePresence>
            </RouteErrorBoundary>
          </main>
        </div>
      </div>

      <AnimatePresence>
        {showLevelUp && (
          <LevelUpModal level={showLevelUp} onClose={() => setShowLevelUp(null)} />
        )}
      </AnimatePresence>
    </Router>
  );
}
