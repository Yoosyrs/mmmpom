import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import initSqlJs from 'sql.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.join(__dirname, '..');
export const DATA_DIR = process.env.SKILLVERSE_DATA_DIR || path.join(ROOT, 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'skillverse.db');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student',
  bio TEXT NOT NULL DEFAULT '',
  headline TEXT NOT NULL DEFAULT '',
  avatar_url TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  instructor_status TEXT NOT NULL DEFAULT 'none',
  instructor_application TEXT NOT NULL DEFAULT '',
  instructor_applied_at TEXT,
  plan TEXT NOT NULL DEFAULT 'free',
  plan_renews_at TEXT,
  privacy_profile TEXT NOT NULL DEFAULT 'public',
  privacy_projects TEXT NOT NULL DEFAULT 'public',
  privacy_certificates TEXT NOT NULL DEFAULT 'public',
  suspended INTEGER NOT NULL DEFAULT 0,
  commission_rate INTEGER NOT NULL DEFAULT 20,
  price_authorized INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  user_agent TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS password_resets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS email_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'transactional',
  status TEXT NOT NULL DEFAULT 'queued',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT 'spark',
  gradient TEXT NOT NULL DEFAULT 'aurora',
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS subcategories (
  slug TEXT PRIMARY KEY,
  category_slug TEXT NOT NULL REFERENCES categories(slug) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  cover_gradient TEXT NOT NULL DEFAULT 'aurora',
  category_slug TEXT NOT NULL,
  subcategory_slug TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'principiante',
  duration_minutes INTEGER NOT NULL DEFAULT 0,
  language TEXT NOT NULL DEFAULT 'Español',
  instructor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft',
  price_cents INTEGER NOT NULL DEFAULT 0,
  is_premium INTEGER NOT NULL DEFAULT 0,
  is_demo INTEGER NOT NULL DEFAULT 0,
  review_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT
);

CREATE TABLE IF NOT EXISTS lessons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 1,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'texto',
  content TEXT NOT NULL DEFAULT '',
  video_url TEXT NOT NULL DEFAULT '',
  duration_minutes INTEGER NOT NULL DEFAULT 10,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS resources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  lesson_id INTEGER REFERENCES lessons(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'enlace',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quizzes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  pass_score INTEGER NOT NULL DEFAULT 70,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quiz_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 1,
  prompt TEXT NOT NULL,
  options TEXT NOT NULL,
  correct_index INTEGER NOT NULL,
  explanation TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id INTEGER NOT NULL,
  score INTEGER NOT NULL,
  passed INTEGER NOT NULL,
  answers TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS enrollments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  last_lesson_id INTEGER,
  completed_at TEXT,
  UNIQUE(user_id, course_id)
);

CREATE TABLE IF NOT EXISTS lesson_progress (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  course_id INTEGER NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  seconds INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(user_id, lesson_id)
);

CREATE TABLE IF NOT EXISTS certificates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  recipient_name TEXT NOT NULL,
  score INTEGER,
  issued_at TEXT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0,
  revoked_reason TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category_slug TEXT NOT NULL,
  link TEXT NOT NULL DEFAULT '',
  cover_url TEXT NOT NULL DEFAULT '',
  challenge_id INTEGER,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  stored_name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'post',
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  group_id INTEGER REFERENCES groups(id) ON DELETE SET NULL,
  challenge_id INTEGER,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  accepted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reactions (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  target_id INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'like',
  created_at TEXT NOT NULL,
  PRIMARY KEY(user_id, target_type, target_id)
);

CREATE TABLE IF NOT EXISTS groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category_slug TEXT NOT NULL,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'miembro',
  joined_at TEXT NOT NULL,
  PRIMARY KEY(group_id, user_id)
);

CREATE TABLE IF NOT EXISTS challenges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category_slug TEXT NOT NULL,
  deadline TEXT,
  reward TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'activo',
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS follows (
  follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY(follower_id, following_id)
);

CREATE TABLE IF NOT EXISTS skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category_slug TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_skills (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_id INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  level TEXT NOT NULL DEFAULT 'aprendiendo',
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL,
  PRIMARY KEY(user_id, skill_id)
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  reference TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  amount_cents INTEGER NOT NULL DEFAULT 0,
  platform_fee_cents INTEGER NOT NULL DEFAULT 0,
  instructor_id INTEGER,
  provider TEXT NOT NULL DEFAULT 'stripe',
  provider_ref TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'incomplete',
  provider TEXT NOT NULL DEFAULT 'stripe',
  provider_ref TEXT NOT NULL DEFAULT '',
  started_at TEXT NOT NULL,
  current_period_end TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '',
  category_slug TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  target_id INTEGER NOT NULL,
  reason TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS ai_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'tutor',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_courses_cat ON courses(category_slug, status);
CREATE INDEX IF NOT EXISTS idx_lessons_course ON lessons(course_id, position);
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id);
CREATE INDEX IF NOT EXISTS idx_projects_created ON projects(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_user ON ai_messages(user_id, created_at);
`;

let db = null;
let saveTimer = null;

export function nowIso() {
  return new Date().toISOString();
}

export async function initDb() {
  const SQL = await initSqlJs({
    locateFile: (file) => path.join(ROOT, 'node_modules', 'sql.js', 'dist', file),
  });
  db = fs.existsSync(DB_FILE) ? new SQL.Database(fs.readFileSync(DB_FILE)) : new SQL.Database();
  db.run('PRAGMA foreign_keys = ON');
  db.run(SCHEMA);
  migrate();
  flush();
  return db;
}

function ensureColumn(table, column, definition) {
  const columns = all(`PRAGMA table_info(${table})`);
  if (!columns.some((row) => row.name === column)) {
    db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

// Small forward-only migrations for databases created by earlier versions.
function migrate() {
  ensureColumn('users', 'price_authorized', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('users', 'commission_rate', 'INTEGER NOT NULL DEFAULT 20');
  ensureColumn('courses', 'is_demo', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('posts', 'is_demo', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('projects', 'is_demo', 'INTEGER NOT NULL DEFAULT 0');
}

export function all(sql, params = []) {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    return rows;
  } finally {
    stmt.free();
  }
}

export function get(sql, params = []) {
  return all(sql, params)[0] || null;
}

export function run(sql, params = []) {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params);
    stmt.step();
  } finally {
    stmt.free();
  }
  const changes = db.getRowsModified();
  schedulePersist();
  return changes;
}

export function insert(sql, params = []) {
  run(sql, params);
  const row = get('SELECT last_insert_rowid() AS id');
  return row ? Number(row.id) : null;
}

export function tx(fn) {
  db.run('BEGIN');
  try {
    const result = fn();
    db.run('COMMIT');
    schedulePersist();
    return result;
  } catch (error) {
    try {
      db.run('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw error;
  }
}

export function persistNow() {
  flush();
}

function schedulePersist() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    flush();
  }, 120);
  if (typeof saveTimer.unref === 'function') saveTimer.unref();
}

export function flush() {
  if (!db) return;
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  const data = db.export();
  const tmp = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmp, Buffer.from(data));
  fs.renameSync(tmp, DB_FILE);
  db.run('PRAGMA foreign_keys = ON');
}

export function dbFile() {
  return DB_FILE;
}
