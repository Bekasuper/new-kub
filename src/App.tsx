import { useCallback, useEffect, useRef, useState } from 'react';
import { InstructorPanel } from './components/InstructorPanel';
import { MoveDictionaryModal } from './components/MoveDictionaryModal';
import { RubiksCubeCanvas, RubiksCubeHandle } from './components/RubiksCubeCanvas';
import { StagesOverviewModal } from './components/StagesOverviewModal';
import { INITIAL_INSTRUCTOR_MESSAGE, STAGES } from './data/curriculum';
import { ChatMessage, CubeFocusMode, MoveNotation, TutorApiResponse } from './types/rubik';

const STORAGE_KEY = 'rubik_school_state_v1';

interface SavedState {
  messages: ChatMessage[];
  currentStage: number;
  focusMode: CubeFocusMode;
  whiteOnTop: boolean;
}

function formatTimeNow(): string {
  const now = new Date();
  return now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function loadSavedState(): SavedState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedState>;
    if (
      Array.isArray(parsed.messages) &&
      parsed.messages.length > 0 &&
      typeof parsed.currentStage === 'number'
    ) {
      return {
        messages: parsed.messages,
        currentStage: Math.max(0, Math.min(7, parsed.currentStage)),
        focusMode: parsed.focusMode ?? 'centers',
        whiteOnTop: typeof parsed.whiteOnTop === 'boolean' ? parsed.whiteOnTop : true,
      };
    }
  } catch {
    // Ignore storage errors
  }
  return null;
}

export default function App() {
  const saved = useRef<SavedState | null>(loadSavedState());
  const cubeRef = useRef<RubiksCubeHandle | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>(
    () => saved.current?.messages ?? [INITIAL_INSTRUCTOR_MESSAGE]
  );
  const [currentStage, setCurrentStage] = useState<number>(
    () => saved.current?.currentStage ?? 0
  );
  const [focusMode, setFocusMode] = useState<CubeFocusMode>(
    () => saved.current?.focusMode ?? 'centers'
  );
  const [whiteOnTop, setWhiteOnTop] = useState<boolean>(
    () => saved.current?.whiteOnTop ?? true
  );
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastSubmittedText, setLastSubmittedText] = useState<string | null>(null);

  const [isDictionaryOpen, setIsDictionaryOpen] = useState(false);
  const [isStagesOpen, setIsStagesOpen] = useState(false);

  useEffect(() => {
    try {
      const payload: SavedState = { messages, currentStage, focusMode, whiteOnTop };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage quota errors
    }
  }, [messages, currentStage, focusMode, whiteOnTop]);

  const sendMessage = useCallback(
    async (text: string, overrideStage?: number) => {
      const stageForCall = typeof overrideStage === 'number' ? overrideStage : currentStage;
      const studentMsg: ChatMessage = {
        id: `student-${Date.now()}`,
        role: 'student',
        text,
        stage: stageForCall,
        timestamp: formatTimeNow(),
      };

      const historySnapshot = messages.map((m) => ({ role: m.role, text: m.text }));
      setMessages((prev) => [...prev, studentMsg]);
      setLastSubmittedText(text);
      setErrorMessage(null);
      setIsLoading(true);

      try {
        const res = await fetch('/api/tutor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            currentStage: stageForCall,
            history: historySnapshot,
          }),
        });

        const data = (await res.json()) as TutorApiResponse & { error?: string };
        if (!res.ok) {
          throw new Error(data.error || 'Не удалось связаться с инструктором.');
        }

        const nextStage =
          typeof data.currentStage === 'number'
            ? Math.max(0, Math.min(7, data.currentStage))
            : stageForCall;

        const nextStageDef = STAGES[nextStage] ?? STAGES[0];
        if (nextStage !== stageForCall && nextStageDef.defaultWhiteTop !== whiteOnTop) {
          cubeRef.current?.flipCubeVertical(nextStageDef.defaultWhiteTop);
        }

        setCurrentStage(nextStage);
        setFocusMode(data.cubeFocus ?? nextStageDef.focus);

        const instructorMsg: ChatMessage = {
          id: `instructor-${Date.now()}`,
          role: 'instructor',
          text: data.reply,
          stage: nextStage,
          demoMoves: data.demoMoves && data.demoMoves.length > 0 ? data.demoMoves : undefined,
          demoLabel: data.demoLabel || undefined,
          cubeFocus: data.cubeFocus,
          quickReplies: data.quickReplies ?? [],
          timestamp: formatTimeNow(),
        };

        setMessages((prev) => [...prev, instructorMsg]);
      } catch (err: unknown) {
        const msg =
          err instanceof Error
            ? err.message
            : 'Произошла ошибка при обращении к серверу.';
        setErrorMessage(msg);
      } finally {
        setIsLoading(false);
      }
    },
    [currentStage, messages, whiteOnTop]
  );

  const handleRetryLast = useCallback(() => {
    if (!lastSubmittedText || isLoading) return;
    // Retry without duplicating the last student bubble
    const historyWithoutLastStudent = messages
      .slice(0, -1)
      .map((m) => ({ role: m.role, text: m.text }));

    setErrorMessage(null);
    setIsLoading(true);

    fetch('/api/tutor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: lastSubmittedText,
        currentStage,
        history: historyWithoutLastStudent,
      }),
    })
      .then(async (res) => {
        const data = (await res.json()) as TutorApiResponse & { error?: string };
        if (!res.ok) {
          throw new Error(data.error || 'Не удалось связаться с инструктором.');
        }
        const nextStage =
          typeof data.currentStage === 'number'
            ? Math.max(0, Math.min(7, data.currentStage))
            : currentStage;
        const nextStageDef = STAGES[nextStage] ?? STAGES[0];
        setCurrentStage(nextStage);
        setFocusMode(data.cubeFocus ?? nextStageDef.focus);
        setMessages((prev) => [
          ...prev,
          {
            id: `instructor-${Date.now()}`,
            role: 'instructor',
            text: data.reply,
            stage: nextStage,
            demoMoves: data.demoMoves && data.demoMoves.length > 0 ? data.demoMoves : undefined,
            demoLabel: data.demoLabel || undefined,
            cubeFocus: data.cubeFocus,
            quickReplies: data.quickReplies ?? [],
            timestamp: formatTimeNow(),
          },
        ]);
      })
      .catch((err: unknown) => {
        setErrorMessage(
          err instanceof Error ? err.message : 'Не удалось связаться с инструктором.'
        );
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [currentStage, isLoading, lastSubmittedText, messages]);

  const handleResetCourse = () => {
    setMessages([INITIAL_INSTRUCTOR_MESSAGE]);
    setCurrentStage(0);
    setFocusMode('centers');
    setErrorMessage(null);
    setLastSubmittedText(null);
    cubeRef.current?.resetSolved(true);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore
    }
  };

  const handleJumpToStage = (stageId: number) => {
    const target = STAGES[stageId];
    if (!target) return;
    setCurrentStage(stageId);
    setFocusMode(target.focus);
    if (target.defaultWhiteTop !== whiteOnTop) {
      cubeRef.current?.flipCubeVertical(target.defaultWhiteTop);
    }
    sendMessage(
      `Хочу перейти к этапу ${stageId}: «${target.shortTitle}». Объясни этот шаг с самого начала.`,
      stageId
    );
  };

  const handlePlayMoves = (moves: MoveNotation[]) => {
    cubeRef.current?.playMoves(moves);
  };

  const activeStageDef = STAGES[currentStage] ?? STAGES[0];

  return (
    <div className="min-h-dvh lg:h-dvh flex flex-col bg-slate-50 text-slate-900">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="h-16 px-5 lg:px-6 border-b border-slate-200 bg-white flex items-center justify-between gap-8 shrink-0">
        {/* Zone 1: Single-line brand wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setIsStagesOpen(true);
          }}
          className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          Школа кубика 3×3
        </a>

        {/* Zone 2: 4 concise single-line text nav links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
          <button
            type="button"
            onClick={() => setIsStagesOpen(true)}
            className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            Этапы (0–7)
          </button>
          <button
            type="button"
            onClick={() => setIsDictionaryOpen(true)}
            className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            Язык движений
          </button>
          <button
            type="button"
            onClick={() => cubeRef.current?.scrambleCube()}
            className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            Перемешать 3D
          </button>
          <button
            type="button"
            onClick={() => cubeRef.current?.resetSolved(whiteOnTop)}
            className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            Собрать 3D
          </button>
        </nav>

        {/* Zone 3: 1 Primary Action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleResetCourse}
            className="h-9 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            Начать с нуля
          </button>
        </div>
      </header>

      {/* Main Two-Zone Educational Sandbox */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-[minmax(0,1.42fr)_minmax(380px,1fr)] min-h-0">
        <RubiksCubeCanvas
          ref={cubeRef}
          focusMode={focusMode}
          whiteOnTop={whiteOnTop}
          onWhiteOnTopChange={setWhiteOnTop}
          stageTitle={activeStageDef.fullTitle}
        />

        <InstructorPanel
          messages={messages}
          currentStage={currentStage}
          isLoading={isLoading}
          errorMessage={errorMessage}
          onSendMessage={(text) => sendMessage(text)}
          onPlayDemoMoves={handlePlayMoves}
          onOpenStagesModal={() => setIsStagesOpen(true)}
          onOpenDictionaryModal={() => setIsDictionaryOpen(true)}
          onRetryLast={handleRetryLast}
        />
      </main>

      <MoveDictionaryModal
        isOpen={isDictionaryOpen}
        onClose={() => setIsDictionaryOpen(false)}
        onPlayMove={handlePlayMoves}
      />

      <StagesOverviewModal
        isOpen={isStagesOpen}
        currentStage={currentStage}
        onClose={() => setIsStagesOpen(false)}
        onSelectStage={handleJumpToStage}
      />
    </div>
  );
}
