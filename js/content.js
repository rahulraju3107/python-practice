// Loads the curriculum and module files and indexes them by ID.
let curriculum = null;
const lessons = new Map();   // lessonId -> { lesson, module }
const exercises = new Map(); // exerciseId -> { ex, lesson, module }
let ordered = [];            // every exercise in curriculum order

async function getJson(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Could not load ${path} (${res.status})`);
  return res.json();
}

export async function loadContent(base = 'content/') {
  curriculum = await getJson(base + 'curriculum.json');
  const loaded = await Promise.all(curriculum.modules.map(async (m) => {
    if (!m.file) return null;
    try { return await getJson(base + m.file); } catch (err) { console.warn(err); return null; }
  }));
  lessons.clear();
  exercises.clear();
  ordered = [];
  curriculum.modules.forEach((module, i) => {
    const data = loaded[i];
    for (const lesson of data?.lessons || []) {
      lessons.set(lesson.id, { lesson, module });
      for (const ex of lesson.exercises || []) {
        exercises.set(ex.id, { ex, lesson, module });
        ordered.push(ex);
      }
    }
  });
  return { curriculum, files: loaded };
}

export const getCurriculum = () => curriculum;
export const findLesson = (id) => lessons.get(id) || null;
export const findExercise = (id) => exercises.get(id) || null;
export const allExercises = () => ordered;
export const allLessons = () => [...lessons.values()];

/** Module for any lesson or exercise ID, read from its "m01" prefix. */
export function moduleOfKey(key) {
  const id = String(key).split('-')[0];
  return curriculum.modules.find((m) => m.id === id) || null;
}

export function moduleExercises(moduleId) {
  return ordered.filter((ex) => ex.id.startsWith(moduleId + '-'));
}

/** Title and link for a note key (a lesson ID or an exercise ID). */
export function describeKey(key) {
  const ex = exercises.get(key);
  if (ex) return { title: `${ex.lesson.title}: ${ex.ex.title}`, href: `#/ex/${key}` };
  const lesson = lessons.get(key);
  if (lesson) return { title: lesson.lesson.title, href: `#/lesson/${key}` };
  return { title: key, href: null };
}

export function allSkills() {
  return [...new Set(ordered.flatMap((ex) => ex.skills || []))].sort();
}

/** The next lesson that has content, in curriculum order. */
export function nextLesson(lessonId) {
  const ids = curriculum.modules.flatMap((m) => m.lessons.map((l) => l.id)).filter((id) => lessons.has(id));
  const next = ids[ids.indexOf(lessonId) + 1];
  return next ? lessons.get(next).lesson : null;
}
