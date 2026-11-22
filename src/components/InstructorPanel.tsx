import { FormEvent, Fragment, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Play, RotateCcw, Send } from 'lucide-react';
import { STAGES } from '../data/curriculum';
import { ChatMessage, MoveNotation } from '../types/rubik';

interface InstructorPanelProps {
  messages: ChatMessage[];
  currentStage: number;
  isLoading: boolean;
  errorMessage: string | null;
  onSendMessage: (text: string) => void;
  onPlayDemoMoves: (moves: MoveNotation[]) => void;
  onOpenStagesModal: () => void;
  onOpenDictionaryModal: () => void;
  onRetryLast: () => void;
}

function renderInlineFormatting(line: string) {
  // Split by **bold** and `code` safely using React elements
  const tokens = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return tokens.map((token, idx) => {
    if (token.startsWith('**') && token.endsWith('**') && token.length > 4) {
      return (
        <strong key={idx} className="font-semibold text-slate-900">
          {token.slice(2, -2)}
        </strong>
      );
    }
    if (token.startsWith('`') && token.endsWith('`') && token.length > 2) {
      return (
        <code
          key={idx}
          className="font-mono text-[13px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    return <Fragment key={idx}>{token}</Fragment>;
  });
}

function FormattedProse({ text }: { text: string }) {
  const paragraphs = text.split(/\n{2,}/);
  return (
    <div className="flex flex-col gap-2.5 text-[15px] leading-relaxed text-slate-700">
      {paragraphs.map((para, pIdx) => {
        const lines = para.split('\n').filter((l) => l.trim().length > 0);
        return (
          <div key={pIdx} className="flex flex-col gap-1">
            {lines.map((line, lIdx) => (
              <p key={lIdx}>{renderInlineFormatting(line)}</p>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export function InstructorPanel({
  messages,
  currentStage,
  isLoading,
  errorMessage,
  onSendMessage,
  onPlayDemoMoves,
  onOpenStagesModal,
  onOpenDictionaryModal,
  onRetryLast,
}: InstructorPanelProps) {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const stageInfo = STAGES[currentStage] ?? STAGES[0];
  const latestInstructorMsg = [...messages].reverse().find((m) => m.role === 'instructor');
  const quickReplies = latestInstructorMsg?.quickReplies ?? [];

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading, errorMessage]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    setInput('');
    onSendMessage(trimmed);
  };

  return (
    <section className="flex flex-col h-full bg-white border-t lg:border-t-0 lg:border-l border-slate-200 min-h-0">
      {/* Stage progress header */}
      <div className="px-5 py-4 border-b border-slate-200 flex flex-col gap-3 shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="font-mono tabular-nums font-semibold text-blue-700">
              Этап {currentStage} из 7
            </span>
            <span aria-hidden="true">·</span>
            <span>{stageInfo.analogy}</span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={onOpenDictionaryModal}
              className="md:hidden text-xs font-medium text-slate-600 hover:text-slate-900 hover:underline cursor-pointer whitespace-nowrap"
            >
              Движения
            </button>
            <button
              type="button"
              onClick={onOpenStagesModal}
              className="text-xs font-medium text-blue-700 hover:underline cursor-pointer whitespace-nowrap"
            >
              Все этапы
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <h1 className="text-base font-bold text-slate-900 leading-snug">
            {stageInfo.fullTitle}
          </h1>
        </div>

        {/* 8-segment visual progress bar */}
        <div className="grid grid-cols-8 gap-1.5" aria-label="Прогресс по этапам сборки">
          {STAGES.map((stage) => {
            const isComplete = stage.id < currentStage;
            const isActive = stage.id === currentStage;
            return (
              <button
                key={stage.id}
                type="button"
                title={stage.fullTitle}
                onClick={onOpenStagesModal}
                className={`h-2 rounded-full transition-colors cursor-pointer ${
                  isComplete
                    ? 'bg-emerald-600'
                    : isActive
                    ? 'bg-blue-600'
                    : 'bg-slate-200 hover:bg-slate-300'
                }`}
              />
            );
          })}
        </div>
      </div>

      {/* Chat thread */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto tutor-scroll px-5 py-5 flex flex-col gap-4 min-h-0"
      >
        {messages.map((msg) => {
          if (msg.role === 'student') {
            return (
              <div key={msg.id} className="flex justify-end">
                <div className="max-w-[85%] rounded-xl bg-blue-600 text-white px-4 py-3 text-[15px] leading-relaxed shadow-xs">
                  {msg.text}
                </div>
              </div>
            );
          }

          return (
            <div key={msg.id} className="flex flex-col gap-2.5">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="font-semibold text-slate-800">Инструктор</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">Этап {msg.stage}</span>
                <span aria-hidden="true">·</span>
                <span>{msg.timestamp}</span>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 flex flex-col gap-3">
                <FormattedProse text={msg.text} />

                {msg.demoMoves && msg.demoMoves.length > 0 && (
                  <div className="pt-2 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs text-slate-600">
                      {msg.demoMoves.join(' ')}
                    </span>
                    <button
                      type="button"
                      onClick={() => onPlayDemoMoves(msg.demoMoves!)}
                      className="h-8 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>{msg.demoLabel || 'Показать на 3D-кубике'}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {isLoading && (
          <div className="flex flex-col gap-2">
            <div className="text-xs text-slate-500 font-medium">
              Инструктор смотрит на ваш шаг...
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 flex flex-col gap-2">
              <div className="h-3.5 w-3/4 rounded bg-slate-200" />
              <div className="h-3.5 w-1/2 rounded bg-slate-200" />
            </div>
          </div>
        )}

        {errorMessage && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-3.5 flex items-start justify-between gap-3"
          >
            <div className="flex items-start gap-2.5 text-xs text-red-800 leading-relaxed">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={onRetryLast}
              className="h-8 px-2.5 rounded-md border border-red-200 bg-white hover:bg-red-50 text-xs font-medium text-red-700 inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Повторить</span>
            </button>
          </div>
        )}
      </div>

      {/* Quick replies + message composer */}
      <div className="p-4 border-t border-slate-200 bg-slate-50/70 flex flex-col gap-3 shrink-0">
        {quickReplies.length > 0 && !isLoading && (
          <div className="flex flex-wrap gap-1.5">
            {quickReplies.map((reply) => (
              <button
                key={reply}
                type="button"
                onClick={() => onSendMessage(reply)}
                className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 text-xs font-medium text-slate-700 text-left transition-colors cursor-pointer inline-flex items-center gap-1.5"
              >
                {reply.toLowerCase().startsWith('да') && (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                )}
                <span>{reply}</span>
              </button>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading}
            placeholder="Ответьте инструктору или опишите, где запутались..."
            className="flex-1 h-11 px-3.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            aria-label="Отправить сообщение"
            className="h-11 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Send className="w-4 h-4" />
            <span className="hidden sm:inline">Ответить</span>
          </button>
        </form>
      </div>
    </section>
  );
}
