export type NetaType = '漫才' | 'コント' | 'ピン';
export type CueTriggerType = 'dialogue' | 'action' | 'time' | 'undefined';
export type BlockType = 'dialogue' | 'stage' | 'sound' | 'light';

export type Performer = {
  id: string;
  name: string;
  grade?: string;
};

export type Unit = {
  id: string;
  name: string;
  university?: string;
  performers: Performer[];
};

export type Character = {
  id: string;
  name: string;
  performerId: string;
  costume?: string;
  /** 舞台（/stage）の人形の色。未指定なら登場順に自動 */
  color?: string;
  /** 'prop' は他の役が持つ小道具（声は音源）。未指定は人形 */
  kind?: 'puppet' | 'prop';
  /** 小道具を持っている役の id */
  holder?: string;
};

export type Sound = {
  id: string;
  unitId: string;
  index: number;
  name: string;
};

export type Cue = {
  fadeDuration?: number; // default: 4
  triggerType: CueTriggerType;
  triggerText?: string;
};

export type ScriptBlock = {
  id: string;
  type: BlockType;
  speaker?: string;
  text: string;
  cue?: Cue;
};

import type { Item as StageItem } from './stage/types';

export type ScriptItem = {
  id: string;
  unitId: string;
  title: string;
  netaType: NetaType;
  characters: Character[];
  sounds: Sound[];
  blocks: ScriptBlock[];
  tools?: string;
  bringIns?: string;
  costumes?: string;
  /** 舞台（/stage）で触って作った台本。未作成なら blocks から起こす */
  stage?: StageItem[];
  createdAt?: string;
  updatedAt?: string;
};

