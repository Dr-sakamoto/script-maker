/** 役。作品ごとに cast で定義する（親父・母親・卵…） */
export type Role = string;

export type Side = 'L' | 'R'; // L＝下手、R＝上手
export type PinNo = 1 | 2 | 3;
export type CueOp = 'C.I' | 'F.I' | 'C.O' | 'F.O';

export type Item =
  | { id: string; t: 'line'; w: Role; x: string; n?: string }
  | { id: string; t: 'act'; w?: Role; x: string }
  | { id: string; t: 'light'; on: boolean; fade?: number; p?: PinNo }
  | { id: string; t: 'move'; w: Role; in: true; x: number }
  | { id: string; t: 'move'; w: Role; in: false; side: Side }
  | { id: string; t: 'cue'; n: number; op: CueOp; sec?: number; x?: string }
  | { id: string; t: 'se'; x: string }
  | { id: string; t: 'ma'; s: number };

export type ItemOf<T extends Item['t']> = Extract<Item, { t: T }>;
export type NewItem = Item extends infer I ? (I extends Item ? Omit<I, 'id'> : never) : never;

/**
 * 役の定義。見た目は全員共通（球の頭＋円錐の胴）で、変わるのは名前と色だけ。
 * kind=puppet は舞台を歩く人形、prop は誰かが持つ小道具（声は音源）
 */
export type CastMember = {
  id: Role;
  name: string; // 親父
  short: string; // 父
  mark?: string; // ○ / ●（○●表記用）
  color: string; // 人形の色＝話者の色
  kind: 'puppet' | 'prop';
  holder?: Role; // prop を持っている人形
  home?: Side; // 最初にいる袖
};

export type Doc = {
  id: string;
  unit: string;
  genre: string; // コント
  title: string;
  cast: CastMember[];
  items: Item[];
  /** 音源番号→名前（ネタ管理で登録した音源トラック） */
  sounds?: Record<number, string>;
  updatedAt: number;
};
