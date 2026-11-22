import { Play, X } from 'lucide-react';
import { MOVE_DICTIONARY } from '../data/curriculum';
import { MoveNotation } from '../types/rubik';

interface MoveDictionaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPlayMove: (moves: MoveNotation[]) => void;
}

const ORDERED_MOVES: MoveNotation[] = ['R', "R'", 'U', "U'", 'F', "F'", 'L', "L'", 'D', "D'"];

export function MoveDictionaryModal({
  isOpen,
  onClose,
  onPlayMove,
}: MoveDictionaryModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="move-dict-title"
    >
      <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden flex flex-col max-h-[86vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 id="move-dict-title" className="text-lg font-bold text-slate-900">
              Словарь движений простыми словами
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Штрих (′) означает поворот в обратную сторону · Нажмите «Показать», чтобы увидеть на 3D-кубике
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть словарь движений"
            className="h-9 w-9 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto p-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {ORDERED_MOVES.map((notation) => {
            const item = MOVE_DICTIONARY[notation];
            return (
              <div
                key={notation}
                className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 flex flex-col justify-between gap-3"
              >
                <div>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-mono text-base font-bold text-slate-900">
                      {item.notation}
                    </span>
                    <span className="text-xs text-slate-500">{item.axisHint}</span>
                  </div>
                  <div className="text-sm font-semibold text-slate-800 mt-1">
                    {item.russianName}
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed mt-1">
                    {item.plainDescription}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onPlayMove([notation]);
                    onClose();
                  }}
                  className="h-8 px-3 rounded-md border border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 text-xs font-medium text-slate-700 inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Показать движение</span>
                </button>
              </div>
            );
          })}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-600">
            <span className="font-semibold text-slate-900">Главный приём «Пиф-паф»:</span>{' '}
            <span className="font-mono text-slate-800">R U R&apos; U&apos;</span> — правую от себя, верхнюю влево, правую на себя, верхнюю вправо.
          </div>
          <button
            type="button"
            onClick={() => {
              onPlayMove(['R', 'U', "R'", "U'"]);
              onClose();
            }}
            className="h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Play className="w-3.5 h-3.5" />
            <span>Показать Пиф-паф</span>
          </button>
        </div>
      </div>
    </div>
  );
}
