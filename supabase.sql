-- Supabase schema for 台本制作ツール MVP

-- ユニット情報
create table units (
  id uuid primary key,
  name text not null,
  university text,
  created_at timestamptz default now()
);

-- 演者情報
create table performers (
  id uuid primary key,
  unit_id uuid not null references units(id) on delete cascade,
  name text not null,
  grade text,
  created_at timestamptz default now()
);

-- 台本情報
create table scripts (
  id uuid primary key,
  unit_id uuid not null references units(id) on delete cascade,
  title text not null,
  neta_type text not null,
  tools text,
  bring_ins text,
  costumes text,
  blocks jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 登場人物（台本ごと）
create table characters (
  id uuid primary key,
  script_id uuid not null references scripts(id) on delete cascade,
  name text not null,
  performer_id uuid references performers(id),
  costume text
);

-- 音源（ユニットごと）
create table sounds (
  id uuid primary key,
  unit_id uuid not null references units(id) on delete cascade,
  "index" integer not null,
  name text not null,
  unique(unit_id, "index")
);
