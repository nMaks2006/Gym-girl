import { useState, useEffect } from 'react';
import { exercises } from './db.js';

/**
 * Названия этапов (недель) тренировочного мезоцикла
 */
export const WEEK_TITLES = {
  1: "1 — старт (стартовая)",
  2: "2 — рост",
  3: "3 — рабочая",
  4: "4 — разгрузка (отдых)",
  5: "5 — силовая",
  6: "6 — пиковая"
};

/**
 * Аналог функции MROUND в Excel: округление числа до ближайшего значения, кратного multiple (step).
 * 
 * @param {number|string} number - Исходное число
 * @param {number|string} multiple - Шаг кратности
 * @returns {number}
 */
export function mround(number, multiple) {
  let num = 0;
  if (number !== null && number !== undefined && number !== '') {
    const sanitizedValue = number.toString().replace(',', '.');
    const parsed = parseFloat(sanitizedValue);
    num = isNaN(parsed) ? 0 : parsed;
  }
  let step = 1;
  if (multiple !== null && multiple !== undefined && multiple !== '') {
    const sanitizedStep = multiple.toString().replace(',', '.');
    const parsedStep = parseFloat(sanitizedStep);
    step = isNaN(parsedStep) || parsedStep <= 0 ? 1 : parsedStep;
  }

  const rounded = Math.round(num / step) * step;
  const result = Math.round(rounded * 10000) / 10000;
  return isNaN(result) ? 0 : result;
}

/**
 * Функция расчета следующего веса (1 в 1 копирует формулу из оригинального Excel).
 * 
 * Принимает объект упражнения (или id для поиска в db.js), чтобы получить доступ к его step и maxJump.
 * 
 * @param {Object|string} exerciseOrId - Объект упражнения из db.js (или его id)
 * @param {number|string} prevFact - Фактический вес предыдущей недели
 * @param {string|null} difficulty - Оценка сложности ("очень тяжело" | "тяжело" | "нормально" / "норм" | "легко")
 * @param {number|string} currentWeek - Номер текущей недели (1-6)
 * @param {number|string|null} prevFactWeek3 - Фактический вес за 3-ю неделю (для расчета 5-й недели)
 * @returns {number} Вес на следующую неделю
 */
export function calculateNextWeekPlan(...args) {
  let exerciseOrId = null;
  let prevFact = null;
  let difficulty = null;
  let currentWeek = 1;
  let prevFactWeek3 = null;

  // Распознавание порядка аргументов для максимальной гибкости и обратной совместимости
  if (
    (typeof args[0] === 'object' && args[0] !== null) ||
    (typeof args[0] === 'string' && exercises.some((e) => e.id === args[0]))
  ) {
    [exerciseOrId, prevFact, difficulty, currentWeek, prevFactWeek3] = args;
  } else if (
    (typeof args[2] === 'object' && args[2] !== null) ||
    (typeof args[2] === 'string' && exercises.some((e) => e.id === args[2]))
  ) {
    [prevFact, difficulty, exerciseOrId, currentWeek, prevFactWeek3] = args;
  } else {
    // Совместимость со старым форматом: (prevFact, difficulty, stepKg, maxJumpKg, currentWeek, prevFactWeek3)
    [prevFact, difficulty, , , currentWeek, prevFactWeek3] = args;
    exerciseOrId = { step: args[2], maxJump: args[3] };
  }

  // Поиск упражнения по ID или использование переданного объекта
  let exercise = null;
  if (typeof exerciseOrId === 'object' && exerciseOrId !== null) {
    exercise = exerciseOrId;
  } else if (typeof exerciseOrId === 'string') {
    exercise = exercises.find((e) => e.id === exerciseOrId) || null;
  }

  // Получение step и maxJump из объекта упражнения (с поддержкой alias step_kg / max_jump_kg)
  let rawStep = exercise?.step ?? exercise?.step_kg ?? 1;
  const sanitizedStep = (rawStep ?? '1').toString().replace(',', '.');
  const parsedStep = parseFloat(sanitizedStep);
  const step = isNaN(parsedStep) || parsedStep <= 0 ? 1 : parsedStep;

  let rawJump = exercise?.maxJump ?? exercise?.max_jump_kg ?? 5;
  const sanitizedJump = (rawJump ?? '5').toString().replace(',', '.');
  const parsedJump = parseFloat(sanitizedJump);
  const maxJump = isNaN(parsedJump) || parsedJump <= 0 ? 5 : parsedJump;

  // Безопасный парсинг веса предыдущей недели
  let fact = 0;
  if (prevFact !== null && prevFact !== undefined && prevFact !== '') {
    const sanitizedValue = prevFact.toString().replace(',', '.');
    const numericValue = parseFloat(sanitizedValue);
    fact = isNaN(numericValue) ? 0 : numericValue;
  }

  const diff = String(difficulty || '').toLowerCase().trim();
  const week = Number(currentWeek) || 1;

  // growth (прибавка) считается с использованием exercise.step и exercise.maxJump:
  // Для 1-й недели (новый мезоцикл) и 4-й недели (разгрузка) оценка сложности игнорируется!
  let growth = 0;
  if (week !== 1 && week !== 4) {
    if (diff === "очень тяжело" || diff === "оч. тяж" || diff === "оч. тяж." || diff === "оч тяжело" || diff.startsWith("оч")) {
      growth = -step;
    } else if (diff === "тяжело") {
      growth = 0;
    } else if (diff === "нормально" || diff === "норм") {
      growth = step;
    } else if (diff === "легко") {
      growth = Math.min(2 * step, maxJump);
    }
  }

  // Базовый расчет веса
  let raw = fact;
  if (week === 1) {
    // Старт нового мезоцикла (week === 1): План 1-й недели = Факт 6-й недели * 0.9.
    // Сложность 6-й недели полностью игнорируется (что бы ни было: легко, тяжело или очень тяжело).
    raw = fact * 0.9;
  } else if (week === 4) {
    // Если currentWeek === 4 (Разгрузка): базовый расчет это prevFact * 0.5
    raw = fact * 0.5;
  } else if (week === 5) {
    // Неделя 5 (Силовая): формула расчета такая же, как для 3-й недели (базовый вес + growth в зависимости от сложности)
    let baseW3 = fact;
    if (prevFactWeek3 !== undefined && prevFactWeek3 !== null && prevFactWeek3 !== '') {
      const sanitizedW3 = prevFactWeek3.toString().replace(',', '.');
      const parsedW3 = parseFloat(sanitizedW3);
      if (!isNaN(parsedW3)) {
        baseW3 = parsedW3;
      }
    }
    raw = baseW3 + growth;
  } else {
    // Для всех остальных недель (2, 3, 6): базовый расчет это prevFact + growth
    raw = fact + growth;
  }

  if (isNaN(raw)) {
    raw = step;
  }

  // Округление (аналог MROUND): Math.round(raw / exercise.step) * exercise.step
  const roundedWeight = Math.round(raw / step) * step;

  // Определение минимального допустимого веса:
  // Если пользователь поднял факт меньше шага (например, 1.25 при step 2.5), минимальный вес не должен насильно завышаться.
  const minAllowed = (fact > 0 && fact < step) ? fact : step;
  let clampedResult = Math.max(minAllowed, isNaN(roundedWeight) ? minAllowed : roundedWeight);

  // Защита здравого смысла: при отметках 'очень тяжело' (откат) или 'тяжело' (прибавка 0)
  // расчетный вес ни при каких обстоятельствах не должен стать БОЛЬШЕ исходного факта!
  if (growth <= 0 && fact > 0 && (week === 2 || week === 3 || week === 5 || week === 6)) {
    clampedResult = Math.min(fact, clampedResult);
  }

  const cleanResult = Math.round(clampedResult * 10000) / 10000;
  return isNaN(cleanResult) ? minAllowed : cleanResult;
}

/**
 * Вспомогательная функция для получения схемы повторений из db.js по номеру недели.
 * 
 * @param {Object} exercise - Объект упражнения из базы данных (db.js)
 * @param {number} week - Номер недели (1-6)
 * @returns {string} Схема подходов и повторений (например, "3×15")
 */
export function getScheme(exercise, week) {
  if (!exercise) return '';
  const weekNum = Number(week) || 1;
  const weekKey = `week_${weekNum}`;
  if (exercise.schemes && exercise.schemes[weekKey]) {
    return exercise.schemes[weekKey];
  }
  return '';
}

const STORAGE_KEYS = {
  CURRENT_CYCLE: 'workout_current_cycle',
  CURRENT_WEEK: 'workout_current_week',
  WORKOUT_DATA: 'workout_data'
};

/**
 * Хук для управления бесконечными мезоциклами, состоянием тренировок и сохранением в localStorage.
 */
export function useWorkoutState() {
  const [currentCycle, setCurrentCycleState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CURRENT_CYCLE);
      const parsed = saved ? parseInt(saved, 10) : 1;
      return parsed >= 1 ? parsed : 1;
    } catch (e) {
      console.error("Ошибка при чтении currentCycle из localStorage:", e);
      return 1;
    }
  });

  const [currentWeek, setCurrentWeekState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CURRENT_WEEK);
      const parsed = saved ? parseInt(saved, 10) : 1;
      return parsed >= 1 && parsed <= 6 ? parsed : 1;
    } catch (e) {
      console.error("Ошибка при чтении currentWeek из localStorage:", e);
      return 1;
    }
  });

  const [workoutData, setWorkoutData] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.WORKOUT_DATA);
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      console.error("Ошибка при чтении workoutData из localStorage:", e);
      return {};
    }
  });

  // Состояние режима просмотра (фильтры истории)
  const [viewCycle, setViewCycle] = useState(currentCycle);
  const [viewWeek, setViewWeek] = useState(currentWeek);

  // Автоматическая синхронизация с localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.CURRENT_CYCLE, String(currentCycle));
    } catch (e) {
      console.error("Ошибка при сохранении currentCycle в localStorage:", e);
    }
  }, [currentCycle]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.CURRENT_WEEK, String(currentWeek));
    } catch (e) {
      console.error("Ошибка при сохранении currentWeek в localStorage:", e);
    }
  }, [currentWeek]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.WORKOUT_DATA, JSON.stringify(workoutData));
    } catch (e) {
      console.error("Ошибка при сохранении workoutData в localStorage:", e);
    }
  }, [workoutData]);

  const setWeek = (week) => {
    const validWeek = Math.max(1, Math.min(6, Number(week) || 1));
    setCurrentWeekState(validWeek);
  };

  const setCycle = (cycle) => {
    const validCycle = Math.max(1, Number(cycle) || 1);
    setCurrentCycleState(validCycle);
  };

  /**
   * Завершить текущую неделю и перейти к следующей.
   * Если currentWeek < 6, переходит на следующую неделю.
   * Если currentWeek === 6, переходит на новый цикл (currentCycle + 1), сбрасывает неделю на 1
   * и снижает веса 6-й недели на 10% для стартовой недели нового цикла.
   * После изменения текущего цикла и недели обновляет viewCycle и viewWeek на актуальные значения.
   */
  const completeWeek = () => {
    if (currentWeek < 6) {
      const nextWeek = currentWeek + 1;
      setCurrentWeekState(nextWeek);
      setViewCycle(currentCycle);
      setViewWeek(nextWeek);
    } else {
      const nextCycle = currentCycle + 1;
      setCurrentCycleState(nextCycle);
      setCurrentWeekState(1);
      setViewCycle(nextCycle);
      setViewWeek(1);
    }
  };

  /**
   * Полностью очистить базу данных по весу и сбросить прогресс тренировок
   */
  const resetWorkoutData = () => {
    try {
      localStorage.removeItem(STORAGE_KEYS.WORKOUT_DATA);
      localStorage.removeItem(STORAGE_KEYS.CURRENT_CYCLE);
      localStorage.removeItem(STORAGE_KEYS.CURRENT_WEEK);
    } catch (e) {
      console.error("Ошибка очистки localStorage:", e);
    }
    setWorkoutData({});
    setCurrentCycleState(1);
    setCurrentWeekState(1);
    setViewCycle(1);
    setViewWeek(1);
  };

  /**
   * Обновить факт выполнения упражнения.
   * Ключ для сохранения включает и цикл, и неделю: fact_${cycle}_${week}_${exerciseId}.
   * Защита от NaN: если значение некорректно, сохраняется 0.
   */
  const updateFact = (exerciseId, week = viewWeek, weight, difficulty, cycle = viewCycle) => {
    // Безопасный парсинг с заменой запятой на точку и защитой от NaN
    let numericValue = 0;
    if (weight !== null && weight !== undefined && weight !== '') {
      const sanitizedValue = weight.toString().replace(',', '.');
      const parsed = parseFloat(sanitizedValue);
      // Защита от NaN: если isNaN(numericValue), то сохраняем как 0
      numericValue = isNaN(parsed) ? 0 : parsed;
    } else {
      numericValue = 0;
    }

    if (isNaN(numericValue)) {
      numericValue = 0;
    }

    setWorkoutData((prevData) => {
      const cycleData = prevData[cycle] || {};
      const exerciseData = cycleData[exerciseId] || {};
      const factKey = `fact_${cycle}_${week}_${exerciseId}`;
      const factObj = {
        weight: numericValue,
        difficulty: difficulty || null
      };

      return {
        ...prevData,
        [factKey]: factObj,
        [cycle]: {
          ...cycleData,
          [exerciseId]: {
            ...exerciseData,
            [week]: factObj
          }
        }
      };
    });
  };

  /**
   * Сбросить факт выполнения упражнения (при вводе нового числа, чтобы заново выбрать сложность)
   */
  const removeFact = (exerciseId, week = viewWeek, cycle = viewCycle) => {
    setWorkoutData((prevData) => {
      const factKey = `fact_${cycle}_${week}_${exerciseId}`;
      const nextData = { ...prevData };
      delete nextData[factKey];

      if (nextData[cycle] && nextData[cycle][exerciseId]) {
        const cycleData = { ...nextData[cycle] };
        const exerciseData = { ...cycleData[exerciseId] };
        delete exerciseData[week];
        cycleData[exerciseId] = exerciseData;
        nextData[cycle] = cycleData;
      }

      return nextData;
    });
  };

  /**
   * Получить факт выполнения упражнения для конкретного цикла и недели.
   * Защищает от битых данных в localStorage.
   */
  const getFact = (exerciseId, week = viewWeek, cycle = viewCycle) => {
    try {
      const factKey = `fact_${cycle}_${week}_${exerciseId}`;
      const rawFact = workoutData[factKey] || workoutData[cycle]?.[exerciseId]?.[week] || null;
      if (!rawFact || typeof rawFact !== 'object') return null;

      let weight = null;
      if (rawFact.weight !== null && rawFact.weight !== undefined && rawFact.weight !== '') {
        const sanitizedValue = rawFact.weight.toString().replace(',', '.');
        const parsed = parseFloat(sanitizedValue);
        weight = isNaN(parsed) ? 0 : parsed;
      }

      return {
        ...rawFact,
        weight,
        difficulty: rawFact.difficulty || null
      };
    } catch (e) {
      console.error("Ошибка в getFact:", e);
      return null;
    }
  };

  return {
    WEEK_TITLES,
    currentCycle,
    setCurrentCycle: setCycle,
    setCycle,
    currentWeek,
    setWeek,
    viewCycle,
    setViewCycle: (c) => setViewCycle(Math.max(1, Number(c) || 1)),
    viewWeek,
    setViewWeek: (w) => setViewWeek(Math.max(1, Math.min(6, Number(w) || 1))),
    workoutData,
    updateFact,
    removeFact,
    getFact,
    completeWeek,
    resetWorkoutData,
    calculateNextWeekPlan,
    mround,
    getScheme: (exercise, week = viewWeek) => getScheme(exercise, week)
  };
}

export default useWorkoutState;
