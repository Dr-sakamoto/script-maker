import { jsPDF } from 'jspdf';
import type { Performer, ScriptBlock } from './types';

export function generateScriptPdf(
  unitName: string,
  scriptTitle: string,
  performers: Performer[],
  characters: Array<{ name: string; performerId: string; costume?: string }>,
  blocks: ScriptBlock[],
  tools?: string,
  bringIns?: string,
  costumes?: string
) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const leftMargin = 20;
  const rightMargin = 190;
  const pageHeight = 277;
  let y = 20;

  pdf.setFontSize(18);
  pdf.text('台本', leftMargin, y);
  y += 10;

  pdf.setFontSize(12);
  pdf.text(`ユニット：${unitName}`, leftMargin, y);
  y += 8;
  pdf.text(`タイトル：${scriptTitle}`, leftMargin, y);
  y += 8;

  const performerNames = performers.map((p) => p.name).join(' / ');
  pdf.text(`演者：${performerNames || '未設定'}`, leftMargin, y);
  y += 8;

  const characterNames = characters.map((c) => c.name).join(' / ');
  pdf.text(`登場人物：${characterNames || '未設定'}`, leftMargin, y);
  y += 8;

  if (tools) {
    pdf.text(`使用道具：${tools}`, leftMargin, y);
    y += 8;
  }
  if (bringIns) {
    pdf.text(`持ち込み物：${bringIns}`, leftMargin, y);
    y += 8;
  }

  const charCostumes = characters
    .filter((c) => c.costume)
    .map((c) => {
      const p = performers.find((perf) => perf.id === c.performerId);
      return `${c.name}${p ? ` (${p.name})` : ''}：${c.costume}`;
    })
    .join(' / ');

  if (charCostumes) {
    pdf.text(`衣装：${charCostumes}`, leftMargin, y);
    y += 8;
  } else if (costumes) {
    pdf.text(`衣装：${costumes}`, leftMargin, y);
    y += 8;
  }

  pdf.setLineWidth(0.3);
  pdf.line(leftMargin, y, rightMargin, y);
  y += 10;

  pdf.setFontSize(11);

  blocks.forEach((block) => {
    let blockLines: string[] = [];

    switch (block.type) {
      case 'dialogue':
        blockLines.push(`○「${block.text}」`);
        break;
      case 'stage':
        blockLines.push(`○（${block.text}）`);
        break;
      case 'sound':
        blockLines.push(`【音響】${block.text}`);
        break;
      case 'light':
        blockLines.push(`【照明】${block.text}`);
        break;
    }

    const wrapped = pdf.splitTextToSize(blockLines.join('\n'), rightMargin - leftMargin - 10);

    if (y + wrapped.length * 6 > pageHeight) {
      pdf.addPage();
      y = 20;
    }

    pdf.text(wrapped, leftMargin, y);
    y += wrapped.length * 6 + 4;
  });

  pdf.save(`${scriptTitle || 'script'}.pdf`);
}

