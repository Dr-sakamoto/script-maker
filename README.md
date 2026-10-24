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

## 舞台（人形劇で演出をつける）

ネタ一覧・エディタの「つくる」から `/stage?id=<台本id>` を開く。モードは3つ（`&mode=make|write|hand`）。

- **つくる**：人形劇をガチャガチャいじっていたら、いつの間にか台本ができている。舞台を触るだけで、言葉の説明は出さない。
  人形をタップ＝その場で吹き出しを打つ、壁をタップ＝（動き）、吹き出しの（）で「」⇄（）。画面は舞台だけで、台本は出さない（音源名・SE もスピーカーの横で打つ）。
  舞台の隅の記号：・・＝間、♪SE、⛶＝全画面で見る、?＝さわりかた。
- **かく**：台本の速記だけ。Enter＝次の行、Tab／Shift+Tab＝話者、Alt＝「」⇔（）。
- **わたす**：文字台本・音響／照明キュー表・出ハケ表の書き出し。

- **役＝登場人物**：人形の見た目は全員共通（球の頭＋円錐の胴）。変わるのは名前と色だけ。
  色と「人形／〇〇が持つ小道具」は登場人物の設定で選ぶ。舞台上で人形を長押ししても名前と色を変えられる。
- **音源＝登録済みの音源トラック**：番号が一致すれば名前が出る。舞台で付けた音源名は音源リストに書き戻す。
- **はじめて開いた台本**は、これまでのブロック（セリフ・ト書き・音響・照明）から舞台の項目を起こす。
- **全画面で見る（⛶）**：画面いっぱいの3D空間だけ。吹き出し・動き・題・進み具合も3Dの中に出す。触ると再生／停止、Esc か隅の × で戻る。
- 舞台の項目と人形の色はローカル保存（`scripts[].stage`、`characters[].color`）。クラウド同期の対象外。

| 触るもの | 操作 | 台本に入るもの |
|---|---|---|
| 人形 | ドラッグ／袖へ／袖から | 移動／ハケ／出 |
| | タップ／長押し | その場でセリフ／名前と色 |
| 壁（ホリゾント） | タップ | （動き） |
| バトン | タップ／長押し | 明転・暗転／じわ（押した秒数） |
| バトン端の ◎ | タップ | 灯体3つを個別のピンに（1回で戻る） |
| スピーカー | タップ／長押し | 新しい音源の C.I／F.I |
| ♪バッジ | タップ／長押し | その音源の C.O／F.O |

コードは `lib/stage/`（状態計算・尺・編集・書き出し・ネタ管理との橋渡し。UIから切り離した純粋関数）と
`components/stage/`（three.js の舞台と台本ビュー）。`npm test` で単体テストとスナップショットテストを回す。

サンプル『父』は `/stage` の「サンプル『父』を追加して開く」で入る。参考の `chichi.html` がリポジトリに無いため、依頼書の書き出し例から再構成した抜粋。

## この先

台本を「文書」から「タイムライン」に変え、間・音源・照明をデータとして持たせて
デジタル・プレ・リハーサル（通し再生・実尺の確認）に進むための設計要件は
[`docs/rehearsal-data-spec.md`](docs/rehearsal-data-spec.md)。
中長期の順路全体は [pompman `docs/neta-ai-roadmap.md`](https://github.com/Dr-sakamoto/pompman/blob/main/docs/neta-ai-roadmap.md)。

**この段階でツールの成功条件は変えません。** データ収集のために必須入力を増やさないことが前提です。

