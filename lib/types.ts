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
  createdAt?: string;
  updatedAt?: string;
};

