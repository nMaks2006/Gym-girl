import React, { useState } from 'react';
import { exercises, INITIAL_CYCLE_1_PLAN } from './db.js';
import { useWorkoutState, WEEK_TITLES, getScheme, calculateNextWeekPlan } from './useWorkoutState.js';

export default function App() {
  const {
    currentCycle,
    currentWeek,
    viewCycle,
    setViewCycle,
    viewWeek,
    setViewWeek,
    workoutData,
    updateFact,
    removeFact,
    getFact,
    completeWeek,
    resetWorkoutData
  } = useWorkoutState();

  // Локальное состояние веса ввода для каждого упражнения (ключ: cycle_week_exId)
  const [inputWeights, setInputWeights] = useState({});

  const handleResetData = () => {
    setModalState({
      title: 'Сбросить все тренировки?',
      subtitle: 'Очистка сохраненных данных',
      notice: (
        <span>
          Все записанные веса и история будут удалены. Приложение начнется с <strong className="font-bold text-pink-900">Цикла 1, Недели 1</strong> с базовым плановым весом.
        </span>
      ),
      type: 'confirm',
      onConfirm: () => {
        resetWorkoutData();
        setInputWeights({});
        setModalState(null);
      }
    });
  };

  // Проверка: находится ли пользователь в актуальном этапе тренировок
  const isCurrentView = viewCycle === currentCycle && viewWeek === currentWeek;

  // Группировка упражнений по дням
  const groupedExercises = exercises.reduce((acc, ex) => {
    const day = ex.day || 'Без дня';
    if (!acc[day]) acc[day] = [];
    acc[day].push(ex);
    return acc;
  }, {});

  /**
   * Получить список упражнений, для которых еще не сохранен факт или не выбрана сложность.
   * Для недели 4 (Разгрузка) достаточно сохраненного веса факта.
   * Для остальных недель (1, 2, 3, 5, 6) обязателен факт с выбранной сложностью (difficulty !== null).
   */
  const getMissingExercises = (week = currentWeek, cycle = currentCycle) => {
    return exercises.filter((ex) => {
      const fact = getFact(ex.id, week, cycle);
      if (!fact || fact.weight === null || fact.weight === undefined || fact.weight === '') {
        return true;
      }
      if (week !== 4 && (!fact.difficulty || fact.difficulty === '')) {
        return true;
      }
      return false;
    });
  };

  const missingExercisesCurrent = getMissingExercises(currentWeek, currentCycle);
  const isCurrentWeekComplete = missingExercisesCurrent.length === 0;

  // Прогресс заполнения для просматриваемой недели (viewWeek, viewCycle)
  const viewMissingExercises = getMissingExercises(viewWeek, viewCycle);
  const viewCompletedCount = exercises.length - viewMissingExercises.length;
  const viewProgressPercent = Math.round((viewCompletedCount / exercises.length) * 100);

  // Состояние модального окна уведомления/подтверждения в розовом стиле
  const [modalState, setModalState] = useState(null);
  // modalState: { title, message, items: [], type: 'alert' | 'confirm', onConfirm?: () => void }

  // Состояние стильного модального окна выбора ('cycle' | 'week' | null)
  const [pickerModal, setPickerModal] = useState(null);

  const handleFinishWeek = () => {
    const missing = getMissingExercises(currentWeek, currentCycle);
    if (missing.length > 0) {
      setModalState({
        title: 'Нельзя перейти на следующую неделю',
        subtitle: (
          <span>
            Осталось заполнить: <strong className="font-bold text-pink-900">{missing.length}</strong> из <strong className="font-bold text-pink-900">{exercises.length}</strong> упражнений
          </span>
        ),
        notice: (
          <span>
            Выберите <strong className="font-semibold text-slate-800">режим сложности</strong> или укажите <strong className="font-semibold text-slate-800">вес</strong> для каждого упражнения:
          </span>
        ),
        items: missing.map((e) => e.name),
        type: 'alert'
      });
      return;
    }

    const weekTitle = WEEK_TITLES[currentWeek] || `Неделя ${currentWeek}`;
    setModalState({
      title: 'Завершение недели',
      message: (
        <span>
          Завершить <strong className="font-bold text-slate-800">«{weekTitle}»</strong> (<strong className="font-semibold text-pink-700">Цикл {currentCycle}</strong>) и перейти к следующему этапу тренировок?
        </span>
      ),
      type: 'confirm',
      onConfirm: () => {
        completeWeek();
        setModalState(null);
      }
    });
  };

  const handleWeekChange = (targetWeek) => {
    // Если пытаемся переключиться на будущую неделю в текущем цикле
    if (viewCycle === currentCycle && targetWeek > currentWeek) {
      const missing = getMissingExercises(currentWeek, currentCycle);
      if (missing.length > 0) {
        setModalState({
          title: `Неделя ${targetWeek} пока недоступна`,
          subtitle: (
            <span>
              Сначала завершите текущую <strong className="font-bold text-pink-900">Неделю {currentWeek}</strong>.
            </span>
          ),
          notice: (
            <span>
              Не выбран режим сложности для <strong className="font-bold text-pink-900">{missing.length}</strong> упражнений:
            </span>
          ),
          items: missing.map((e) => e.name),
          type: 'alert'
        });
        return;
      }
    }
    setViewWeek(targetWeek);
  };

  const handleWeightChange = (exId, value) => {
    // Безопасная нормализация: заменяем запятую на точку для надежности парсинга
    const sanitizedValue = value !== undefined && value !== null ? value.toString().replace(',', '.') : '';
    setInputWeights((prev) => ({
      ...prev,
      [`${viewCycle}_${viewWeek}_${exId}`]: sanitizedValue
    }));

    // При вводе нового числа сбрасываем сохраненный статус и сложность, чтобы выбрать заново
    removeFact(exId, viewWeek, viewCycle);
  };

  /**
   * Определение планового рабочего веса на просматриваемую неделю (viewCycle / viewWeek)
   */
  const getPlannedWeight = (ex) => {
    try {
      if (!ex) return null;

      // Если это 1-я неделя:
      if (viewWeek === 1) {
        // Если это цикл > 1: План 1-й недели (Мезоцикл 2) = Факт 6-й недели (Мезоцикл 1) * 0.9
        // Сложность 6-й недели полностью игнорируется (что бы ни было: легко, тяжело или очень тяжело)
        if (viewCycle > 1) {
          const prevCycleFact = getFact(ex.id, 6, viewCycle - 1);
          if (prevCycleFact && prevCycleFact.weight !== null && prevCycleFact.weight !== undefined && prevCycleFact.weight !== '') {
            const sanitizedValue = prevCycleFact.weight.toString().replace(',', '.');
            const numericValue = parseFloat(sanitizedValue);
            if (!isNaN(numericValue)) {
              const res = calculateNextWeekPlan(ex, numericValue, null, 1);
              return isNaN(res) ? null : res;
            }
          }
        }

        // Для 1-го цикла базовый план 1-й недели рассчитывается из исходных данных 6-й недели
        if (INITIAL_CYCLE_1_PLAN && INITIAL_CYCLE_1_PLAN[ex.id] !== undefined) {
          return INITIAL_CYCLE_1_PLAN[ex.id];
        }

        return null;
      }

      // Неделя 4 (Разгрузка): 50% от факта 3-й недели (оценка сложности не требуется)
      if (viewWeek === 4) {
        const prevFactWeek3 = getFact(ex.id, 3, viewCycle);
        if (prevFactWeek3 && prevFactWeek3.weight !== null && prevFactWeek3.weight !== undefined && prevFactWeek3.weight !== '') {
          const sanitizedValue = prevFactWeek3.weight.toString().replace(',', '.');
          const numericValue = parseFloat(sanitizedValue);
          if (!isNaN(numericValue)) {
            const res = calculateNextWeekPlan(ex, numericValue, null, 4);
            return isNaN(res) ? null : res;
          }
        }
        return null;
      }

      // Неделя 5 (Силовая): берем факт и сложность 3-й недели (формула как для 3-й недели, зависит от выбранной сложности)
      if (viewWeek === 5) {
        const factWeek3 = getFact(ex.id, 3, viewCycle);
        if (factWeek3 && factWeek3.weight !== null && factWeek3.weight !== undefined && factWeek3.weight !== '') {
          const sanitizedValue = factWeek3.weight.toString().replace(',', '.');
          const numericValue = parseFloat(sanitizedValue);
          if (!isNaN(numericValue)) {
            const res = calculateNextWeekPlan(ex, numericValue, factWeek3.difficulty, 5, numericValue);
            return isNaN(res) ? null : res;
          }
        }

        // Если на 3-й неделе не было записи, проверяем факт 4-й недели
        const factWeek4 = getFact(ex.id, 4, viewCycle);
        if (factWeek4 && factWeek4.weight !== null && factWeek4.weight !== undefined && factWeek4.weight !== '') {
          const sanitizedValue = factWeek4.weight.toString().replace(',', '.');
          const numericValue = parseFloat(sanitizedValue);
          if (!isNaN(numericValue)) {
            const res = calculateNextWeekPlan(ex, numericValue, factWeek4.difficulty, 5, numericValue);
            return isNaN(res) ? null : res;
          }
        }
        return null;
      }

      // Недели 2, 3, 6: берем факт предыдущей недели (viewWeek - 1)
      const prevFact = getFact(ex.id, viewWeek - 1, viewCycle);
      if (prevFact && prevFact.weight !== null && prevFact.weight !== undefined && prevFact.weight !== '') {
        const sanitizedValue = prevFact.weight.toString().replace(',', '.');
        const numericValue = parseFloat(sanitizedValue);
        if (!isNaN(numericValue)) {
          const res = calculateNextWeekPlan(ex, numericValue, prevFact.difficulty, viewWeek);
          return isNaN(res) ? null : res;
        }
      }

      return null;
    } catch (e) {
      console.error("Ошибка при расчете getPlannedWeight:", e);
      return null;
    }
  };

  const handleSaveFact = (ex, difficulty = null) => {
    try {
      const plannedWeight = getPlannedWeight(ex);
      const inputKey = `${viewCycle}_${viewWeek}_${ex.id}`;
      const userEntered = inputWeights[inputKey];

      // Безопасный парсинг: везде, где значение из инпута передается в updateFact или сохраняется,
      // предварительно заменяем запятую на точку и проверяем на NaN.
      let weightToSave = 0;
      if (userEntered !== undefined && userEntered !== null && userEntered !== '') {
        const sanitizedValue = userEntered.toString().replace(',', '.');
        const numericValue = parseFloat(sanitizedValue);
        weightToSave = isNaN(numericValue) ? 0 : numericValue;
      } else if (plannedWeight !== null && plannedWeight !== undefined && plannedWeight !== '') {
        const sanitizedValue = plannedWeight.toString().replace(',', '.');
        const numericValue = parseFloat(sanitizedValue);
        weightToSave = isNaN(numericValue) ? 0 : numericValue;
      } else {
        weightToSave = 0;
      }

      updateFact(ex.id, viewWeek, weightToSave, difficulty, viewCycle);

      // Сбрасываем локальное состояние ввода для этой карточки, чтобы отображался сохраненный вес
      setInputWeights((prev) => {
        const next = { ...prev };
        delete next[inputKey];
        return next;
      });
    } catch (e) {
      console.error("Ошибка в handleSaveFact:", e);
    }
  };

  return (
    <div className="bg-pink-50 text-slate-800 min-h-screen pb-[max(env(safe-area-inset-bottom),2rem)] font-sans antialiased selection:bg-pink-400 selection:text-white">
      {/* Шапка (Компактная, Glassmorphism) */}
      <header className="sticky top-0 z-50 bg-white/85 backdrop-blur-md border-b border-pink-100 px-3 pt-[max(env(safe-area-inset-top),0.5rem)] pb-2 shadow-xs flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {/* Кнопка выбора цикла в едином розовом стиле с красивым шрифтом */}
          <button
            type="button"
            onClick={() => setPickerModal('cycle')}
            className="h-8 bg-pink-50/90 hover:bg-pink-100/80 active:scale-95 text-slate-800 text-xs font-semibold rounded-xl px-2.5 border border-pink-200 shadow-2xs transition-all flex items-center gap-1.5 shrink-0 cursor-pointer font-sans"
          >
            <span className="font-display font-bold text-pink-700 tracking-wide">Цикл {viewCycle}</span>
            {viewCycle === currentCycle && (
              <span className="text-[10px] font-bold text-pink-500 bg-pink-100/70 px-1 py-0.2 rounded-md">тек.</span>
            )}
            <svg className="w-3 h-3 text-pink-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Кнопка выбора недели в едином розовом стиле с красивым шрифтом */}
          <button
            type="button"
            onClick={() => setPickerModal('week')}
            className="h-8 min-w-0 flex-1 max-w-[210px] bg-pink-50/90 hover:bg-pink-100/80 active:scale-95 text-slate-800 text-xs font-semibold rounded-xl px-2.5 border border-pink-200 shadow-2xs transition-all flex items-center justify-between gap-1 cursor-pointer font-sans"
          >
            <span className="truncate font-display font-medium text-slate-800">
              {WEEK_TITLES[viewWeek] || `Неделя ${viewWeek}`}
            </span>
            <svg className="w-3 h-3 text-pink-400 shrink-0 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>

        {/* Кнопка "Завершить неделю" и кнопка "Сброс" */}
        <div className="shrink-0 flex items-center gap-1.5">
          {/* Кнопка полного сброса данных */}
          <button
            type="button"
            onClick={handleResetData}
            title="Сбросить все тренировки до исходного состояния"
            className="h-8 w-8 rounded-xl bg-pink-50/90 hover:bg-rose-100/80 active:scale-95 text-slate-400 hover:text-rose-600 border border-pink-200/80 flex items-center justify-center transition-all cursor-pointer shadow-2xs shrink-0"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>

          {isCurrentView ? (
            <button
              onClick={handleFinishWeek}
              title={
                isCurrentWeekComplete
                  ? "Все упражнения заполнены! Нажмите для перехода"
                  : `Заполнено ${exercises.length - missingExercisesCurrent.length} из ${exercises.length}. Выберите режим сложности для всех упражнений.`
              }
              className={`h-8 transition-all font-semibold px-2.5 rounded-lg shadow-xs text-xs flex items-center gap-1 cursor-pointer active:scale-95 ${
                isCurrentWeekComplete
                  ? 'bg-pink-600 hover:bg-pink-700 text-white'
                  : 'bg-pink-100 hover:bg-pink-200 text-pink-700 border border-pink-200'
              }`}
            >
              <span>Завершить</span>
              <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                isCurrentWeekComplete ? 'bg-white/20 text-white' : 'bg-pink-200/80 text-pink-800'
              }`}>
                {exercises.length - missingExercisesCurrent.length}/{exercises.length}
              </span>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </button>
          ) : (
            <button
              onClick={() => {
                setViewCycle(currentCycle);
                setViewWeek(currentWeek);
              }}
              title="Вернуться к актуальной неделе"
              className="h-8 bg-pink-100 hover:bg-pink-200 active:scale-95 transition-all text-pink-700 font-semibold px-2.5 rounded-lg text-xs shadow-2xs flex items-center gap-1 cursor-pointer"
            >
              <span>К текущей ↩</span>
            </button>
          )}
        </div>
      </header>

      {/* Основной контент */}
      <main className="max-w-xl mx-auto px-3 pt-2">
        {/* Полоска прогресса выполнения недели с округленными углами и гармоничными розовыми оттенками */}
        <div className="mb-3 bg-pink-100/70 border border-pink-200/80 rounded-2xl p-2.5 shadow-2xs">
          <div className="flex items-center justify-between text-xs mb-1.5 px-0.5 font-sans">
            <span className="font-semibold text-slate-700 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-pink-500 inline-block animate-pulse"></span>
              <span>Прогресс недели</span>
            </span>
            <span className="font-bold text-pink-700 font-display text-[11px]">
              {viewCompletedCount} из {exercises.length} ({viewProgressPercent}%)
            </span>
          </div>

          {/* Сама закругленная полоска */}
          <div className="w-full h-2.5 bg-white/90 rounded-full overflow-hidden p-0.5 border border-pink-200/60 shadow-inner">
            <div
              className="h-full bg-gradient-to-r from-pink-400 via-pink-500 to-pink-600 rounded-full transition-all duration-500 ease-out shadow-xs"
              style={{ width: `${Math.max(viewProgressPercent > 0 ? 4 : 0, viewProgressPercent)}%` }}
            ></div>
          </div>
        </div>

        {Object.entries(groupedExercises).map(([dayTitle, dayExercises]) => (
          <section key={dayTitle} className="mb-4">
            {/* Компактный заголовок дня */}
            <div className="flex items-center gap-1.5 mb-2 mt-1">
              <div className="w-1.5 h-3.5 bg-pink-500 rounded-full"></div>
              <h2 className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                {dayTitle}
              </h2>
            </div>

            {/* Карточки упражнений (Компактные, до 4 карточек на экране) */}
            <div className="space-y-2">
              {dayExercises.map((ex) => {
                const currentFact = getFact(ex.id, viewWeek, viewCycle);
                const plannedWeight = getPlannedWeight(ex);
                const currentScheme = getScheme(ex, viewWeek) || '—';

                // Безопасное определение сохраненного факта с защитой от некорректных данных и NaN
                let factWeightDisplay = null;
                let isFactSaved = false;
                if (currentFact && currentFact.weight !== null && currentFact.weight !== undefined && currentFact.weight !== '') {
                  const sanitizedValue = currentFact.weight.toString().replace(',', '.');
                  const numericValue = parseFloat(sanitizedValue);
                  if (!isNaN(numericValue)) {
                    factWeightDisplay = numericValue;
                    isFactSaved = true;
                  }
                }

                // Безопасное определение планового веса с защитой от некорректных данных и NaN
                let planWeightDisplay = '—';
                if (plannedWeight !== null && plannedWeight !== undefined && plannedWeight !== '') {
                  const sanitizedValue = plannedWeight.toString().replace(',', '.');
                  const numericValue = parseFloat(sanitizedValue);
                  if (!isNaN(numericValue)) {
                    planWeightDisplay = `${numericValue} ${ex.unit_label || 'кг'}`;
                  }
                }

                const inputKey = `${viewCycle}_${viewWeek}_${ex.id}`;
                let rawValue = inputWeights[inputKey];
                if (rawValue === undefined) {
                  if (isFactSaved && factWeightDisplay !== null) {
                    rawValue = factWeightDisplay;
                  } else if (plannedWeight !== null && plannedWeight !== undefined && plannedWeight !== '') {
                    const sanitizedValue = plannedWeight.toString().replace(',', '.');
                    const numericValue = parseFloat(sanitizedValue);
                    rawValue = !isNaN(numericValue) ? numericValue : '';
                  } else {
                    rawValue = '';
                  }
                }

                // Защита от NaN и null при рендере в value инпута
                const currentInputValue = (rawValue === null || rawValue === undefined || (typeof rawValue === 'number' && isNaN(rawValue)))
                  ? ''
                  : String(rawValue);

                return (
                  <div
                    key={ex.id}
                    className={`bg-white rounded-2xl p-3 shadow-sm shadow-pink-100 border transition-all ${
                      isFactSaved ? 'border-pink-300 ring-1 ring-pink-200/70' : 'border-pink-100/90'
                    }`}
                  >
                    {/* Строка 1: Название упражнения + Оборудование */}
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-base font-bold text-slate-800 leading-snug truncate">
                        {ex.name || 'Упражнение'}
                      </h3>
                      <span className="text-[10px] font-semibold text-pink-600 bg-pink-50 px-2 py-0.5 rounded-full border border-pink-100/80 shrink-0">
                        {ex.equipment || 'снаряд'}
                      </span>
                    </div>

                    {/* Строка 2: План на сегодня, Схема и статус сохранения */}
                    <div className="flex items-center justify-between text-xs text-slate-500 mt-1 mb-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-slate-400">План:</span>
                        <span className="font-bold text-pink-600">
                          {planWeightDisplay}
                        </span>
                        <span className="text-slate-300">•</span>
                        <span className="text-slate-400">Схема:</span>
                        <span className="font-semibold text-slate-700 bg-slate-100/90 px-1.5 py-0.5 rounded text-[11px]">
                          {currentScheme}
                        </span>
                      </div>

                      {/* Отметка сохранения */}
                      {isFactSaved && factWeightDisplay !== null && (
                        <span className="text-[11px] font-medium text-emerald-600 bg-emerald-50 border border-emerald-100/80 px-1.5 py-0.5 rounded-md flex items-center gap-0.5 shrink-0">
                          <svg className="w-3 h-3 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                          </svg>
                          <span>{factWeightDisplay} {ex.unit_label || 'кг'}</span>
                        </span>
                      )}
                    </div>

                    {/* Строка 3: Блок ввода (Инпут + Кнопки в одну линию h-10) */}
                    <div className="flex items-center gap-2">
                      {/* Поле <input> высотой h-10 с поддержкой дробных весов (inputMode="decimal") и скрытыми стрелочками */}
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="Вес"
                        value={currentInputValue}
                        onChange={(e) => handleWeightChange(ex.id, e.target.value)}
                        className="w-20 sm:w-24 h-10 text-lg text-center font-bold bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder:text-slate-300 focus:outline-none focus:border-pink-400 focus:ring-1 focus:ring-pink-400 transition-all shadow-2xs shrink-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [appearance:textfield]"
                      />

                      {/* Если viewWeek === 4 (Разгрузка): кнопка Выполнено на всю оставшуюся ширину */}
                      {viewWeek === 4 ? (
                        <button
                          onClick={() => handleSaveFact(ex, null)}
                          className={`h-10 flex-1 rounded-lg text-xs font-semibold transition-colors duration-150 active:scale-95 flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer ${
                            isFactSaved
                              ? 'bg-pink-600 text-white shadow-xs'
                              : 'bg-pink-50 text-pink-600 hover:bg-pink-100'
                          }`}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                          </svg>
                          <span>{isFactSaved ? 'Сохранено' : 'Выполнено'}</span>
                        </button>
                      ) : (
                        /* Кнопки сложности: h-10, text-xs font-medium, rounded-lg, transition-colors duration-150 */
                        <div className="grid grid-cols-4 gap-1 sm:gap-1.5 flex-1 h-10">
                          {[
                            {
                              label: 'Оч. тяж',
                              fullLabel: 'Очень тяжело',
                              val: 'Очень тяжело',
                              defaultCls: 'bg-rose-50 text-rose-600 hover:bg-rose-100 active:bg-rose-500 active:text-white',
                              selectedCls: 'bg-rose-500 text-white shadow-xs font-semibold'
                            },
                            {
                              label: 'Тяжело',
                              fullLabel: 'Тяжело',
                              val: 'Тяжело',
                              defaultCls: 'bg-orange-50 text-orange-600 hover:bg-orange-100 active:bg-orange-500 active:text-white',
                              selectedCls: 'bg-orange-500 text-white shadow-xs font-semibold'
                            },
                            {
                              label: 'Норм',
                              fullLabel: 'Норм',
                              val: 'Норм',
                              defaultCls: 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 active:bg-emerald-500 active:text-white',
                              selectedCls: 'bg-emerald-500 text-white shadow-xs font-semibold'
                            },
                            {
                              label: 'Легко',
                              fullLabel: 'Легко',
                              val: 'Легко',
                              defaultCls: 'bg-sky-50 text-sky-600 hover:bg-sky-100 active:bg-sky-500 active:text-white',
                              selectedCls: 'bg-sky-500 text-white shadow-xs font-semibold'
                            }
                          ].map((btn) => {
                            const isSelected = currentFact?.difficulty === btn.val;
                            return (
                              <button
                                key={btn.val}
                                onClick={() => handleSaveFact(ex, btn.val)}
                                className={`h-10 rounded-lg text-xs font-medium transition-colors duration-150 active:scale-95 cursor-pointer flex items-center justify-center text-center px-0.5 select-none ${
                                  isSelected ? btn.selectedCls : btn.defaultCls
                                }`}
                                title={btn.fullLabel}
                              >
                                {btn.label}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </main>

      {/* Модальное окно уведомлений в стилистике приложения (фон bg-pink-50, розовая рамка border-pink-300, более круглые углы rounded-3xl) */}
      {modalState && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-200">
          <div
            className="w-full max-w-sm bg-pink-50 border-2 border-pink-300 rounded-3xl shadow-2xl p-5 text-slate-800 transition-all transform scale-100 flex flex-col items-center"
            role="dialog"
            aria-modal="true"
          >
            {/* Иконка статуса (круглая, по центру) */}
            <div className="w-11 h-11 rounded-2xl bg-pink-100 border border-pink-200 flex items-center justify-center shrink-0 text-pink-600 mb-3 shadow-2xs">
              {modalState.type === 'confirm' ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              )}
            </div>

            {/* Контейнер текста: центрирован по ширине окна, но текст внутри аккуратно выровнен по левому краю */}
            <div className="w-full text-left space-y-1.5 px-0.5">
              <h3 className="text-base font-bold text-slate-900 leading-snug">
                {modalState.title}
              </h3>

              {modalState.subtitle && (
                <p className="text-xs text-pink-700 font-medium leading-relaxed">
                  {modalState.subtitle}
                </p>
              )}

              {modalState.notice && (
                <p className="text-xs text-slate-600 leading-relaxed pt-0.5">
                  {modalState.notice}
                </p>
              )}
            </div>

            {/* Сообщение или пояснение */}
            {modalState.message && (
              <div className="w-full text-left text-xs text-slate-700 mt-3 p-3 bg-white/70 rounded-2xl border border-pink-200/80 leading-relaxed shadow-2xs">
                {modalState.message}
              </div>
            )}

            {/* Список незаполненных упражнений */}
            {modalState.items && modalState.items.length > 0 && (
              <div className="w-full mt-3 max-h-48 overflow-y-auto bg-white/75 border border-pink-200/90 rounded-2xl p-3 space-y-1.5 text-xs text-left shadow-2xs">
                {modalState.items.map((itemName, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-slate-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-pink-500 shrink-0"></span>
                    <span className="font-medium truncate">{itemName}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Кнопки действий */}
            <div className="w-full flex items-center justify-end gap-2 mt-4 pt-3 border-t border-pink-200/70">
              {modalState.type === 'confirm' ? (
                <>
                  <button
                    onClick={() => setModalState(null)}
                    className="flex-1 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-white/80 hover:bg-white border border-pink-200 rounded-xl transition-colors cursor-pointer text-center"
                  >
                    Отмена
                  </button>
                  <button
                    onClick={modalState.onConfirm}
                    className="flex-1 py-2 text-xs font-semibold text-white bg-pink-600 hover:bg-pink-700 active:scale-95 shadow-xs rounded-xl transition-all cursor-pointer text-center"
                  >
                    Перейти
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setModalState(null)}
                  className="w-full py-2 text-xs font-bold text-white bg-pink-600 hover:bg-pink-700 active:scale-95 shadow-xs rounded-xl transition-all cursor-pointer text-center"
                >
                  Понятно
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно выбора Цикла / Недели в едином стильном дизайне с красивым шрифтом */}
      {pickerModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => setPickerModal(null)}
        >
          <div
            className="w-full max-w-sm bg-pink-50 border-2 border-pink-300 rounded-3xl shadow-2xl p-5 text-slate-800 transition-all transform scale-100 flex flex-col"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Заголовок модального окна выбора */}
            <div className="flex items-center justify-between pb-3 border-b border-pink-200/70 mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-pink-100 border border-pink-200 flex items-center justify-center text-pink-600">
                  {pickerModal === 'cycle' ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-display font-bold text-slate-900 leading-none">
                    {pickerModal === 'cycle' ? 'Выбор тренировочного цикла' : 'Выбор недели'}
                  </h3>
                  <p className="text-[11px] text-pink-700 font-medium mt-1">
                    {pickerModal === 'cycle' ? 'Переключение между мезоциклами' : 'Текущий и прошедшие этапы'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setPickerModal(null)}
                className="w-7 h-7 rounded-full bg-white/80 hover:bg-white text-slate-400 hover:text-slate-700 flex items-center justify-center border border-pink-200/80 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Содержимое выбора ЦИКЛА */}
            {pickerModal === 'cycle' && (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-0.5">
                {Array.from({ length: currentCycle }, (_, i) => i + 1).map((cycleNum) => {
                  const isSelected = cycleNum === viewCycle;
                  const isCurrent = cycleNum === currentCycle;
                  return (
                    <button
                      key={cycleNum}
                      type="button"
                      onClick={() => {
                        setViewCycle(cycleNum);
                        setPickerModal(null);
                      }}
                      className={`w-full text-left p-3 rounded-2xl border transition-all flex items-center justify-between cursor-pointer ${
                        isSelected
                          ? 'bg-pink-600 text-white border-pink-600 shadow-sm'
                          : 'bg-white/80 hover:bg-white text-slate-800 border-pink-200/80 hover:border-pink-300 shadow-2xs'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className={`w-2 h-2 rounded-full ${isSelected ? 'bg-white' : 'bg-pink-400'}`}></span>
                        <div>
                          <span className="font-display font-bold text-sm tracking-wide">Цикл {cycleNum}</span>
                          <span className={`block text-[11px] ${isSelected ? 'text-pink-100' : 'text-slate-500'}`}>
                            {isCurrent ? 'Текущий активный цикл' : 'Архивный мезоцикл'}
                          </span>
                        </div>
                      </div>
                      {isCurrent && (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          isSelected ? 'bg-white/20 text-white' : 'bg-pink-100 text-pink-700'
                        }`}>
                          Актуальный
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Содержимое выбора НЕДЕЛИ */}
            {pickerModal === 'week' && (
              <div className="space-y-1.5 max-h-80 overflow-y-auto pr-0.5">
                {[1, 2, 3, 4, 5, 6].map((weekNum) => {
                  const isSelected = weekNum === viewWeek;
                  const isFutureInCycle = viewCycle === currentCycle && weekNum > currentWeek;
                  const isLocked = isFutureInCycle && !isCurrentWeekComplete;
                  const isCurrent = viewCycle === currentCycle && weekNum === currentWeek;

                  return (
                    <button
                      key={weekNum}
                      type="button"
                      onClick={() => {
                        if (isLocked) {
                          setPickerModal(null);
                          handleWeekChange(weekNum);
                          return;
                        }
                        handleWeekChange(weekNum);
                        setPickerModal(null);
                      }}
                      className={`w-full text-left p-2.5 rounded-2xl border transition-all flex items-center justify-between cursor-pointer ${
                        isSelected
                          ? 'bg-pink-600 text-white border-pink-600 shadow-sm'
                          : isLocked
                          ? 'bg-white/40 text-slate-400 border-pink-100/70 cursor-not-allowed'
                          : 'bg-white/80 hover:bg-white text-slate-800 border-pink-200/80 hover:border-pink-300 shadow-2xs'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${
                          isSelected ? 'bg-white' : isLocked ? 'bg-slate-300' : 'bg-pink-400'
                        }`}></span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            {isLocked && <span className="text-xs">🔒</span>}
                            <span className="font-display font-semibold text-xs tracking-wide truncate">
                              {WEEK_TITLES[weekNum] || `Неделя ${weekNum}`}
                            </span>
                          </div>
                          <span className={`block text-[10px] truncate ${
                            isSelected ? 'text-pink-100' : isLocked ? 'text-slate-400' : 'text-slate-500'
                          }`}>
                            {weekNum === 4
                              ? '50% от недели 3'
                              : weekNum === 6
                              ? 'Пиковая неделя'
                              : isLocked
                              ? 'Требуется завершить предыдущую'
                              : 'Рабочая нагрузка'}
                          </span>
                        </div>
                      </div>

                      {isCurrent && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                          isSelected ? 'bg-white/20 text-white' : 'bg-pink-100 text-pink-700'
                        }`}>
                          тек.
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
