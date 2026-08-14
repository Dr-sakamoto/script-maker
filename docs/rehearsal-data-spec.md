# 台本をデータにするための設計要件（デジタル・プレ・リハーサルの準備）

## 0. このドキュメントの位置づけ

中長期の順路は [pompman `docs/neta-ai-roadmap.md`](https://github.com/Dr-sakamoto/pompman/blob/main/docs/neta-ai-roadmap.md) にある。
ここに書くのは **script-maker 側で、後から戻せない決定**だけ。

「後から足せるもの」は書かない。**足せないから今やるもの**だけを並べてある。

---

## 1. 大原則（ここを外すと全部が無駄になる）

1. **成功条件は変えない。** 「芸人が1時間台本を書いたとき、Wordに戻りたくなくなること」。
   データのために使い勝手を落としたら、そのツールからは1件もデータが出ない。
2. **データ収集のために必須入力を1つも増やさない。** 欄は作る。値は既定値で埋める。
   **直したくなった人だけが直す**形にする。
3. **入力させるのではなく、再生させて直させる。** 「間を秒数で入れてください」は誰もやらない。
   「再生したら間が詰まっていて気持ち悪いので伸ばした」は勝手に起きる。**後者だけがデータになる。**

---

## 2. いまの姿と、足りないもの

| いまの姿 | 何が問題か |
|---|---|
| `scripts.blocks` は jsonb に**順序だけ** | 時間の概念が無い。間を置く場所が無く、再生もできない |
| 保存は上書き。バージョンが無い | 「このテイクはどの台本に対するものか」が後から言えない |
| `cue.triggerText` が自由文（`lib/types.ts`） | 台本を直すと、キューがどの行に付いていたか失われる。機械が解決できない |
| 想定時間 = 文字数 ÷ 話速（`app/page.tsx:713`） | **間がゼロの見積もり**。実尺と必ず乖離する。学生大会は尺で失格になる |
| 音源は `index` と `name` だけ | 再生に必要な実体が無い |
| 認証が無い（localStorage + Supabase 直書き、RLS無し） | 台本が誰のものか DB に無い＝**誰の同意で取ったデータか**が言えない |
| AI由来かどうかの列が無い | pompman は `answers.is_ai` を最初から入れてある。後から ALTER するとデータ移行が面倒 |

---

## 3. Phase 1 で入れる欄

**UIは変えない。** 欄を用意し、既定値で埋めるところまで。

### 3.1 テーブル

```sql
-- 台本のバージョン（上書きしない。テイクはここを指す）
create table script_versions (
  id          uuid primary key,
  script_id   uuid not null references scripts(id) on delete cascade,
  version     integer not null,
  blocks      jsonb not null,        -- そのときの本文まるごと（スナップショット）
  created_at  timestamptz not null default now(),
  unique (script_id, version)
);

-- テイク（1回の上演。デジタルリハ / 稽古 / 本番）
create table takes (
  id                uuid primary key,
  script_version_id uuid not null references script_versions(id),
  kind              text not null,     -- 'digital' | 'rehearsal' | 'live'
  performed_at      timestamptz not null default now(),
  duration_ms       integer,           -- 実尺。想定時間との差がそのまま資産
  audience_size     integer,           -- 分かるときだけ
  venue             text,
  audio_url         text,              -- 同意が取れているときだけ（§6）
  note              text
);

-- 笑い（テイクの中の時刻。台本の行に紐づける）
create table laugh_events (
  id        bigserial primary key,
  take_id   uuid not null references takes(id) on delete cascade,
  at_ms     integer not null,                  -- テイク開始からの経過
  block_id  text,                              -- どの行か。後から埋めてよい
  strength  smallint,                          -- 1..3 程度。分からなければ null
  source    text not null default 'tap'        -- 'tap' | 'audio'
);

-- 間の選好（デジタルリハで「こっちのほうがいい」を選んだログ）
create table pause_picks (
  id                bigserial primary key,
  script_version_id uuid not null references script_versions(id),
  block_id          text not null,
  chosen_ms         integer not null,
  rejected_ms       integer not null,
  voter_id          uuid not null,             -- 絶対に落とさない
  created_at        timestamptz not null default now()
);
```

`pause_picks.voter_id` は pompman の `picks.voter_id` と同じ理由で落とさない。
**混ぜるのは学習時であって保存時ではない。** 落とした瞬間に「この人のテンポ」を二度と分離できなくなる。

`laugh_events` を1テイク1スコアにしないのが、この設計でいちばん重要な一点。
4分のネタに点数を1つ付けた瞬間、**どの行が効いたのかを知る手段が永久に失われる**。

### 3.2 `blocks` の中身（`lib/types.ts`）

```ts
export type ScriptBlock = {
  id: string;
  type: BlockType;
  speaker?: string;
  text: string;
  cue?: Cue;
  pauseBeforeMs?: number;    // 未指定は undefined。再生時は既定値を使う
  source?: 'human' | 'ai';   // pompman の is_ai と同じ理由で最初から置く
  modelVer?: string;         // source === 'ai' のときだけ
};

export type Cue = {
  fadeDuration?: number;
  triggerType: CueTriggerType;
  triggerText?: string;      // 表示用。人が読む文言はそのまま残す
  triggerBlockId?: string;   // 機械用。どの行で発火するか
  triggerOffsetMs?: number;  // 「音源開始から9秒後」の 9000
};
```

`triggerText` は消さない。**PDFに焼いたとき人間が読むのはこちら**で、当日オペを回すのは人間だから。
足すのは `triggerBlockId` のほう。**表示は文言、実行は参照**、と役割を分ける。

### 3.3 認証と所有

`units` / `scripts` に `owner_id` を持たせ、Supabase Auth を入れる。RLSも入れる。
これはデータの話ではなく**同意の話**で、誰の同意で取ったデータかが行に紐付いていないと、
貯めても学習に使えない。

---

## 4. Phase 1 でやらないこと

- 再生機能そのもの（Phase 2）
- 録音（Phase 3）
- AIによる講評・生成（Phase 4）
- 音源ファイルのアップロード（Phase 2 で要る。いまは名前と番号だけで足りている）
- 間の入力UI（**作らない。** 間は再生して直すときに入る。入力欄として置くと必ず空欄のままになる）

---

## 5. 再生の設計メモ（Phase 2 に入る前に）

- **尺は2つ出す。** 「文字数÷話速」を*間ゼロの下限*として残したまま、間を足した実尺を並べる。
  2つ並べると乖離そのものが見えて、どこで伸びているかが分かる。
- **TTSは第一版ならブラウザのWeb Speechで足りる。** Phase 2 の目的は尺とキュー位置の確認で、
  可笑しみの再現ではない。間・ピッチを細かく制御できるモデル（StyleTTS2 等、
  pompman `docs/comedy-ai-design.md` §4）に差し替えるのは、間の選好を取り始めるときで間に合う。
- **照明は音が出せないので、画面の色を変えるかタイムライン上にバーを出す**で足りる。
- **要件は「1操作で頭から通し再生できること」。** 部分再生は後。
  通しで再生できないと尺が読めず、尺が読めないと使われない。

---

## 6. 同意（実装前に決める）

pompman `docs/odai-mvp-spec.md` §7 と同じものが要る。加えて台本側には録音があるので1項多い。

- 台本・間・テイクのデータを本プロジェクトのAI学習に利用すること
- **録音は共演者・観客など第三者の音声を含む**こと。誰の同意で録るのか、観客の笑い声をどう扱うのか
- 学習済みモデルおよびデータを外部に公開しないこと
- 退会時のデータの取り扱い

**録音の項が決まるまで、Phase 3 はタップログだけで始める。**
笑った時刻を人がタップするだけなら第三者の音声を一切持たないので、この議論を待たずに前に進める。
