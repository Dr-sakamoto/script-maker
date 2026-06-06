# 芸人向け台本制作ツール（MVP）

Next.js と Supabase で実装した、芸人・学生芸人向けの台本制作専用エディタです。

## 主な機能

- ユニット登録（ユニット名、所属大学）
- 演者登録（芸名、学年）
- ネタ作成（タイトル、ネタ種別、登場人物、音源管理）
- **4種類ブロック**：セリフ、ト書き、音響、照明
- **ショートカット**：Enter / Tab / Shift+Tab / Alt
- **キューパレット**：音響（C.I, F.I, C.O, F.O）、照明（明転, 暗転, 徐々明転, 徐々暗転）
- PDF 出力（NOROSHI提出レベル）
- クラウド保存（Supabase）

## UI フロー

1. **全体ページ** → ユニット一覧
2. **ユニット登録** → 演者登録
3. **ネタ作成** → 基本情報 + 登場人物 + 音源登録
4. **ネタ編集** → 3カラム（左：基本情報、中央：台本本文、右：キューパレット）
5. **PDF 出力**

## ブロック種別

### セリフ
```
○「こんにちは」
```

### ト書き
```
○（舞台中央へ）
```

### 音響
```
【音響】C.I
```

### 照明
```
【照明】明転
```

## ショートカット

| キー | 動作 |
|------|------|
| Enter | 新規行生成 |
| Tab | 次の登場人物に切り替え |
| Shift+Tab | 前の登場人物に切り替え |
| Alt | セリフ ⇔ ト書き切り替え |

## セットアップ

1. 依存関係をインストール

```bash
npm install
```

2. `.env.local` を作成し、Supabase の設定を入力

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

3. Supabase に以下のテーブルを作成

```sql
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
  performer_id uuid references performers(id)
);

-- 音源（ユニットごと）
create table sounds (
  id uuid primary key,
  unit_id uuid not null references units(id) on delete cascade,
  "index" integer not null,
  name text not null,
  unique(unit_id, "index")
);
```

4. 開発サーバーを起動

```bash
npm run dev
```

## デプロイ

- Vercel に接続してデプロイ
- `NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_ANON_KEY` を Vercel 環境変数として追加

## 技術スタック

- **フロントエンド**: Next.js 14, React 18, TypeScript, Tailwind CSS
- **バックエンド**: Supabase (PostgreSQL)
- **デプロイ**: Vercel

## MVP 成功条件

「芸人が 1 時間台本を書いたとき、Word に戻りたくなくなること」を最重要成功指標とします。

