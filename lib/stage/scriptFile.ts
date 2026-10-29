import { parseItems } from './io';
import { parseScriptText, type ImportResult } from './importText';
import type { CastMember } from './types';

/**
 * 台本ファイルの読み込み。.json（この画面の書き出し）・.docx（Word）・.txt（メモ帳など）。
 * 文章はどれも parseScriptText で舞台の項目に落とし込む。
 */
export const SCRIPT_FILE_ACCEPT = '.json,.txt,.text,.md,.docx,application/json,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw');
  const out = new Response(new Blob([new Uint8Array(data)]).stream().pipeThrough(ds));
  return new Uint8Array(await out.arrayBuffer());
}

/** zip の中のファイルを1つ取り出す（docx 用の最小限） */
export async function unzipEntry(buf: ArrayBuffer, name: string): Promise<Uint8Array | null> {
  const b = new Uint8Array(buf);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 0xffff); i--)
    if (u32(b, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0) throw new Error('Word（.docx）のファイルとして読めない');
  const count = u16(b, eocd + 10);
  let p = u32(b, eocd + 16);
  const dec = new TextDecoder();
  for (let k = 0; k < count && u32(b, p) === 0x02014b50; k++) {
    const method = u16(b, p + 10);
    const size = u32(b, p + 20);
    const nl = u16(b, p + 28);
    const el = u16(b, p + 30);
    const cl = u16(b, p + 32);
    const local = u32(b, p + 42);
    if (dec.decode(b.subarray(p + 46, p + 46 + nl)) === name) {
      const start = local + 30 + u16(b, local + 26) + u16(b, local + 28);
      const data = b.subarray(start, start + size);
      if (method === 0) return data;
      if (method === 8) return inflateRaw(data);
      throw new Error('この圧縮形式の .docx は読めない');
    }
    p += 46 + nl + el + cl;
  }
  return null;
}

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unescape = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (all, e: string) =>
    e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENT[e] ?? all),
  );

/** Word の本文（word/document.xml）を、段落ごとの行にする */
export function docxXmlToText(xml: string): string {
  const body = xml.replace(/<w:(?:del|instrText)\b[\s\S]*?<\/w:(?:del|instrText)>/g, '');
  const paras = body.match(/<w:p\b[\s\S]*?<\/w:p>|<w:p\b[^>]*\/>/g) ?? [];
  return paras
    .map((p) =>
      [...p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:(tab|br|cr)\b[^>]*\/>/g)]
        .map((m) => (m[2] === 'tab' ? '\t' : m[2] ? '\n' : unescape(m[1])))
        .join(''),
    )
    .join('\n');
}

export async function docxToText(buf: ArrayBuffer): Promise<string> {
  const xml = await unzipEntry(buf, 'word/document.xml');
  if (!xml) throw new Error('Word の本文が見つからない');
  return docxXmlToText(new TextDecoder().decode(xml));
}

/** 文字コードは UTF-8 → だめなら Shift_JIS（古いメモ帳・Word のテキスト保存） */
export function decodeText(buf: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('shift_jis').decode(buf);
  }
}

export type FileImport = ImportResult & { kind: 'json' | 'text' };

export async function readScriptFile(file: File, cast: CastMember[]): Promise<FileImport> {
  const name = file.name.toLowerCase();
  const buf = await file.arrayBuffer();
  if (name.endsWith('.json')) return { kind: 'json', items: parseItems(decodeText(buf)), cast, added: [] };
  if (name.endsWith('.doc')) throw new Error('古い Word（.doc）は読めない。.docx で保存し直すか、本文をコピーして貼り付けてください');
  if (name.endsWith('.pdf')) throw new Error('PDF は読めない。本文をコピーして貼り付けてください');
  const text = name.endsWith('.docx') ? await docxToText(buf) : decodeText(buf);
  return { kind: 'text', ...parseScriptText(text, cast) };
}
