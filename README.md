# 芸人向け台本制作ツール（MVP）

Next.js と Supabase で実装した、芸人・学生芸人向けの台本制作専用エディタです。

## 主な機能

- ユニット登録（ユニット名、所属大学）／演者登録（芸名、学年）
- ネタ作成（タイトル、ネタ種別、登場人物、音源管理）
- **台本づくりは1つの画面（`/stage`）に集約**：つくる（人形劇をいじる）・かく（速記）・わたす（書き出し・印刷）
- 印刷・PDF 出力（NOROSHI提出用。コントは「本文｜きっかけと音響・照明」の2列）
- PWA（ホーム画面に追加・圏外でも開く）
- クラウド保存（Supabase。本文は blocks の形で同期）

## UI フロー

1. **全体ページ** → ユニット一覧
2. **ユニット登録** → 演者登録
3. **ネタ作成** → 基本情報 ＋ 登場人物 ＋ 音源登録 → そのまま「つくる」へ
4. **台本づくり（`/stage`）** → つくる ⇄ かく ⇄ わたす
5. **印刷・PDF**（わたす）

## 登録のしかた（「わたす」の「表紙・配役・音源」）

ネタ作成で入れた配役・衣装・使用道具・持ち込み物・音源トラックは、「わたす」で直せる。
役の追加は人形箱／小道具箱の「＋」。台本で使っている役は消せない。

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

ネタ一覧の「つくる／かく／わたす」から `/stage?id=<台本id>` を開く。モードは3つ（`&mode=make|write|hand`）。

台本の本体は舞台の項目（`scripts[].stage`）。これまでのブロック形式（`blocks`）は、保存のたびに舞台の項目から起こし直している（クラウドの `blocks` 列と、これまでの形を読む側のため）。

- **つくる**：人形劇をガチャガチャいじっていたら、いつの間にか台本ができている。画面は舞台と、そのまわりの道具だけ（台本は出さない）。
  - 中央＝舞台：人形をタップ＝その場で吹き出しを打つ、ドラッグ＝移動、袖へ＝ハケ、長押し＝名前と色。壁をタップ＝（動き）。灯体をタップ＝ピン
  - 大道具：机と椅子は最初から上手の袖にある。掴んで床の上を奥行きまで自由に動かし、タップで出る黄色いつまみを回すと向きが変わる（15度きざみ）。袖や箱に戻すと片付ける
  - 左上＝音源プレーヤー：網を叩く＝新しい音源（C.I）、画面で名前を打つ、॥＝止める（C.O）、SE
  - 右上＝照明卓：明転・暗転・じわ明・じわ暗（じわは3秒。秒数やフェードは「かく」のチップで変える）
  - 左下＝人形箱：引っぱり出す＝出、舞台から入れる＝ハケ
  - 右下＝小道具箱：引っぱり出す＝置く、人形の上に落とす＝持たせる、舞台から入れる＝片付ける。
    ＋で足すとき ✋（手に持つ＝小道具）か ▭（置くだけ＝大道具。持参の物は点線の円）を選ぶ
  - 下＝時間軸：・・＝間、⏮ ↺ ▷ ↻ ⏭、⛶＝全画面で見る
- **かく**：台本の速記だけ。Enter＝次の行、Tab／Shift+Tab＝話者、Alt＝「」⇔（）。
- **わたす**：文字台本・音響／照明キュー表・出ハケ表の書き出し、印刷・PDF、表紙・配役・音源の登録。

- **役＝登場人物**：人形の見た目は全員共通（球の頭＋円錐の胴）。変わるのは名前と色だけ。
  色と「人形／〇〇が持つ小道具」は登場人物の設定で選ぶ。舞台上で人形を長押ししても名前と色を変えられる。
- **音源＝登録済みの音源トラック**：番号が一致すれば名前が出る。舞台で付けた音源名は音源リストに書き戻す。
- **はじめて開いた台本**は、これまでのブロック（セリフ・ト書き・音響・照明）から舞台の項目を起こす。
- **全画面で見る（⛶）**：画面いっぱいの3D空間だけ。吹き出し・動き・題・進み具合も3Dの中に出す。触ると再生／停止、Esc か隅の × で戻る。
- 舞台の項目と人形の色はローカル保存（`scripts[].stage`、`characters[].color`）。クラウドへは、本文を blocks に起こしたもの・登場人物・音源だけを送る（`lib/cloud.ts`）。

| 触るもの | 操作 | 台本に入るもの |
|---|---|---|
| 人形 | ドラッグ／袖や人形箱へ／人形箱から | 移動／ハケ／出 |
| | タップ／長押し | その場でセリフ／名前と色 |
| 壁（ホリゾント） | タップ | （動き） |
| 照明卓 | 明転・暗転／じわ明・じわ暗 | 全体の明暗（じわは3秒） |
| 灯体 | タップ | そのピンの点灯／消灯 |
| 音源プレーヤーの網 | タップ | 新しい音源の C.I |
| 音源プレーヤーの ॥ | タップ | その音源の C.O |
| 小道具 | 小道具箱から／へ・人形の上へ | 置く／片付ける・持つ（受け取る） |
| 大道具 | 床の上をドラッグ・つまみを回す | 置く・動かす（奥行きと向きも）／片付ける |

コードは `lib/stage/`（状態計算・尺・編集・書き出し・ネタ管理との橋渡し。UIから切り離した純粋関数）と
`components/stage/`（three.js の舞台と台本ビュー）。`npm test` で単体テストとスナップショットテストを回す。

サンプル『父』は `/stage` の「サンプル『父』を追加して開く」で入る。参考の `chichi.html` がリポジトリに無いため、依頼書の書き出し例から再構成した抜粋。

## この先

台本を「文書」から「タイムライン」に変え、間・音源・照明をデータとして持たせて
デジタル・プレ・リハーサル（通し再生・実尺の確認）に進むための設計要件は
[`docs/rehearsal-data-spec.md`](docs/rehearsal-data-spec.md)。
中長期の順路全体は [pompman `docs/neta-ai-roadmap.md`](https://github.com/Dr-sakamoto/pompman/blob/main/docs/neta-ai-roadmap.md)。

**この段階でツールの成功条件は変えません。** データ収集のために必須入力を増やさないことが前提です。

