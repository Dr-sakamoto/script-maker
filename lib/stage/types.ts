import type { Performer } from '../types';

/** 役。作品ごとに cast で定義する（親父・母親・卵…） */
export type Role = string;

export type Side = 'L' | 'R'; // L＝下手、R＝上手
export type PinNo = 1 | 2 | 3;
export type CueOp = 'C.I' | 'F.I' | 'C.O' | 'F.O';

export type Item =
  | { id: string; t: 'line'; w: Role; x: string; n?: string }
  | { id: string; t: 'act'; w?: Role; x: string }
  | { id: string; t: 'light'; on: boolean; fade?: number; p?: PinNo }
  | { id: string; t: 'move'; w: Role; in: true; x: number; z?: number; r?: number } // z＝奥行き（大道具）、r＝向き（度）
  | { id: string; t: 'move'; w: Role; in: false; side: Side }
  | { id: string; t: 'cue'; n: number; op: CueOp; sec?: number; x?: string }
  | { id: string; t: 'se'; x: string }
  | { id: string; t: 'ma'; s: number }
  | { id: string; t: 'hold'; w: Role; by: Role }; // 小道具 w を人形 by が持つ

export type ItemOf<T extends Item['t']> = Extract<Item, { t: T }>;
export type NewItem = Item extends infer I ? (I extends Item ? Omit<I, 'id'> : never) : never;

/**
 * 役の定義。見た目は全員共通（球の頭＋円錐の胴）で、変わるのは名前と色だけ。
 * kind=puppet は舞台を歩く人形、prop は手に持てる小道具、set は置くだけの大道具
 */
export type CastMember = {
  id: Role;
  name: string; // 親父
  short: string; // 父
  mark?: string; // ○ / ●（○●表記用）
  color: string; // 人形の色＝話者の色
  kind: 'puppet' | 'prop' | 'set'; // set＝大道具（手に持たない。机・椅子・持参の物）
  holder?: Role; // 最初から prop を持っている人形
  shape?: 'desk' | 'chair' | 'free'; // 大道具の形。free は点線の円
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
  /** 表紙・配役まわり（ネタ管理の登録。「わたす」で直す） */
  performers?: Performer[];
  university?: string;
  tools?: string;
  bringIns?: string;
  costumes?: string;
  /** 役ごとの配役（演者）と衣装 */
  assign?: Record<Role, { performerId: string; costume: string }>;
  updatedAt: number;
};
