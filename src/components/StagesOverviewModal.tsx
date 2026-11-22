import { ArrowRight, Check, X } from 'lucide-react';
import { STAGES } from '../data/curriculum';

interface StagesOverviewModalProps {
  isOpen: boolean;
  currentStage: number;
  onClose: () => void;
  onSelectStage: (stageId: number) => void;
}

export function StagesOverviewModal({
  isOpen,
  currentStage,
  onClose,
  onSelectStage,
}: StagesOverviewModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="stages-overview-title"
    >
      <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden flex flex-col max-h-[86vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 id="stages-overview-title" className="text-lg font-bold text-slate-900">
              Маршрут послойной сборки (Этапы 0–7)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Идём строго по одному шагу · Вы можете перейти к нужному этапу, если часть кубика уже собрана
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть список этапов"
            className="h-9 w-9 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto p-6 flex flex-col gap-2.5">
          {STAGES.map((stage) => {
            const isCurrent = stage.id === currentStage;
            const isDone = stage.id < currentStage;

            return (
              <div
                key={stage.id}
                className={`rounded-lg border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                  isCurrent
                    ? 'border-blue-300 bg-blue-50/50'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="font-mono tabular-nums font-semibold text-slate-700">
                      0{stage.id}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>Образ: {stage.analogy}</span>
                    {isDone && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                          <Check className="w-3 h-3" />
                          Пройден
                        </span>
                      </>
                    )}
                    {isCurrent && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-blue-700 font-semibold">Текущий этап</span>
                      </>
                    )}
                  </div>
                  <div className="text-sm font-bold text-slate-900">{stage.fullTitle}</div>
                  <p className="text-xs text-slate-600 leading-relaxed">{stage.goal}</p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    onSelectStage(stage.id);
                    onClose();
                  }}
                  className={`h-9 px-3.5 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    isCurrent
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <span>{isCurrent ? 'Продолжить' : 'Перейти к этапу'}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
