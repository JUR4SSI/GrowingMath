import { useEffect, useMemo, useState } from 'react';
import { apiUrl } from "../config";
import { CheckCircle2, Trophy, XCircle } from 'lucide-react';
import { User } from '../types';
import { getUserAuthHeaders } from '../auth';

type DailyChallengePayload = {
  id: number;
  challengeKey: string;
  title: string;
  question: string;
  options: string[];
  rewardXp: number;
  rewardCoins: number;
  completed: boolean;
  attempts: number;
  createdAt: string;
};

type ChallengeSubmitResponse = {
  success: boolean;
  correct: boolean;
  alreadyCompleted: boolean;
  message: string;
  rewardXp: number;
  rewardCoins: number;
  attempts: number;
  completed: boolean;
};

type DailyChallengeHistoryItem = {
  challengeKey: string;
  title: string;
  completed: boolean;
  attempts: number;
  completedAt: string | null;
};

type DailyChallengeHistoryResponse = {
  streak: number;
  history: DailyChallengeHistoryItem[];
};

const FALLBACK_CHALLENGE = 'Resolva a conta 14 + 9';

const FALLBACK_OPTIONS = ['22', '23', '24', '25'];

const DailyChallenge = ({ user, onUpdate }: { user: User | null; onUpdate: () => void }) => {
  const [challenge, setChallenge] = useState<DailyChallengePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<ChallengeSubmitResponse | null>(null);
  const [history, setHistory] = useState<DailyChallengeHistoryResponse | null>(null);

  const challengeOptions = useMemo(() => {
    if (challenge?.options && challenge.options.length === 4) {
      return challenge.options;
    }
    return FALLBACK_OPTIONS;
  }, [challenge]);

  const fetchChallenge = async () => {
    setLoading(true);
    try {
      const response = await fetch(apiUrl(`/api/daily-challenge`), { headers: { ...getUserAuthHeaders() } });
      if (!response.ok) {
        throw new Error(`Falha ao carregar desafio diario: ${response.status}`);
      }
      const payload = (await response.json()) as DailyChallengePayload;
      setChallenge(payload);
      setSelectedOption(null);
      setFeedback(null);
    } catch (error) {
      console.error('Error fetching daily challenge:', error);
      setChallenge({
        id: 0,
        challengeKey: new Date().toISOString().slice(0, 10),
        title: 'Desafio Diario',
        question: FALLBACK_CHALLENGE,
        options: FALLBACK_OPTIONS,
        rewardXp: 20,
        rewardCoins: 15,
        completed: false,
        attempts: 0,
        createdAt: new Date().toISOString(),
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchChallenge();
  }, [user?.email]);

  const fetchHistory = async () => {
    if (!user?.email) {
      setHistory(null);
      return;
    }

    try {
      const response = await fetch(apiUrl(`/api/daily-challenge/history`), { headers: { ...getUserAuthHeaders() } });
      if (!response.ok) {
        throw new Error(`Falha ao carregar historico: ${response.status}`);
      }
      const payload = (await response.json()) as DailyChallengeHistoryResponse;
      setHistory(payload);
    } catch (error) {
      console.error('Error fetching challenge history:', error);
    }
  };

  useEffect(() => {
    void fetchHistory();
  }, [user?.email]);

  const submitChallenge = async () => {
    if (!user?.email || selectedOption === null) return;

    setSubmitting(true);
    try {
      const response = await fetch(apiUrl('/api/daily-challenge/submit'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getUserAuthHeaders() },
        body: JSON.stringify({
          challengeKey: challenge?.challengeKey,
          selectedOption,
        }),
      });

      const payload = (await response.json()) as ChallengeSubmitResponse;
      if (!response.ok) {
        throw new Error(payload?.message || 'Falha ao enviar resposta.');
      }

      setFeedback(payload);
      if (payload.completed) {
        await fetchChallenge();
        await fetchHistory();
        onUpdate();
      }
    } catch (error) {
      console.error('Error submitting daily challenge:', error);
      setFeedback({
        success: false,
        correct: false,
        alreadyCompleted: false,
        message: error instanceof Error ? error.message : 'Nao foi possivel enviar sua resposta.',
        rewardXp: 0,
        rewardCoins: 0,
        attempts: challenge?.attempts || 0,
        completed: false,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-emerald-600 p-6 rounded-3xl text-white shadow-lg shadow-emerald-100 dark:shadow-none relative overflow-hidden">
      <div className="relative z-10">
        <h3 className="text-lg font-bold mb-1">Desafio Diario</h3>
        <p className="text-emerald-100 text-sm mb-2">
          {challenge?.title || 'Desafio do dia'}
        </p>
        <p className="text-emerald-100/90 text-xs mb-4">
          Recompensa: +{challenge?.rewardXp || 20} XP e +{challenge?.rewardCoins || 15} moedas
        </p>

        {history && (
          <div className="mb-4 rounded-2xl bg-emerald-700/40 border border-white/20 p-3">
            <p className="text-xs font-bold text-emerald-100 mb-2">
              Sequencia atual: {history.streak} dia(s)
            </p>
            <div className="grid grid-cols-7 gap-1">
              {history.history.map((item) => (
                <div
                  key={item.challengeKey}
                  title={`${item.challengeKey} - ${item.completed ? 'Concluido' : 'Nao concluido'}`}
                  className={`h-7 rounded-md border text-[10px] flex items-center justify-center font-bold ${
                    item.completed
                      ? 'bg-white text-emerald-700 border-white'
                      : 'bg-emerald-800/40 text-emerald-100 border-white/20'
                  }`}
                >
                  {item.challengeKey.slice(8, 10)}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-emerald-700/40 rounded-2xl p-4 mb-4 border border-white/20">
          <p className="text-sm font-semibold mb-3">
            {loading ? 'Carregando desafio...' : challenge?.question || FALLBACK_CHALLENGE}
          </p>

          {expanded && (
            <div className="space-y-2">
              {challengeOptions.map((option, index) => {
                const checked = selectedOption === index;
                return (
                  <label
                    key={`${option}-${index}`}
                    className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border transition-colors ${
                      checked ? 'bg-white text-emerald-700 border-white' : 'bg-emerald-700/40 text-white border-white/20 hover:bg-emerald-700/60'
                    }`}
                  >
                    <input
                      type="radio"
                      name="daily-challenge-option"
                      className="accent-emerald-600"
                      checked={checked}
                      onChange={() => setSelectedOption(index)}
                      disabled={Boolean(challenge?.completed) || submitting}
                    />
                    <span className="text-sm font-medium">{option}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {feedback && (
          <div className={`mb-4 p-3 rounded-xl text-sm font-semibold border ${feedback.correct ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-red-100 text-red-800 border-red-200'}`}>
            <div className="flex items-center gap-2">
              {feedback.correct ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
              <span>{feedback.message}</span>
            </div>
          </div>
        )}

        {!user?.email ? (
          <p className="text-xs text-emerald-100">Entre em um perfil para resolver o desafio diario.</p>
        ) : challenge?.completed ? (
          <button
            onClick={() => void fetchChallenge()}
            className="w-full py-3 bg-white text-emerald-600 font-bold rounded-xl hover:bg-emerald-50 transition-colors"
          >
            Desafio concluido hoje
          </button>
        ) : !expanded ? (
          <button
            onClick={() => setExpanded(true)}
            className="w-full py-3 bg-white text-emerald-600 font-bold rounded-xl hover:bg-emerald-50 transition-colors"
          >
            Comecar Agora
          </button>
        ) : (
          <button
            onClick={() => void submitChallenge()}
            disabled={selectedOption === null || submitting}
            className="w-full py-3 bg-white text-emerald-600 font-bold rounded-xl hover:bg-emerald-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Enviando...' : 'Enviar Resposta'}
          </button>
        )}
      </div>
      <div className="absolute -bottom-4 -right-4 opacity-20">
        <Trophy size={120} />
      </div>
    </div>
  );
};

export default DailyChallenge;