// ── DOCX HELPER FUNCTIONS ───────────────────────────────────────────────────
// Ported from backend/docGenerator/helpers.js → TypeScript

import {
  Paragraph,
  TextRun,
  AlignmentType,
  UnderlineType,
  BorderStyle,
  type IRunOptions,
  type IBorderOptions,
  type IParagraphOptions,
} from 'docx';
import { C } from './constants';

// ── Types ───────────────────────────────────────────────────────────────────

export interface RunOptions {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  size?: number;
  font?: string;
  color?: string;
}

export interface ParagraphOptions extends RunOptions {
  align?: (typeof AlignmentType)[keyof typeof AlignmentType];
  before?: number;
  after?: number;
  indent?: number;
  numbering?: IParagraphOptions['numbering'];
}

// ── BORDER HELPERS ──────────────────────────────────────────────────────────

export function singleBorder(
  color = 'auto',
  sz = 4
): IBorderOptions {
  return { style: BorderStyle.SINGLE, size: sz, color };
}

export function allBorders(
  color = 'auto',
  sz = 4
): Record<'top' | 'bottom' | 'left' | 'right', IBorderOptions> {
  const b = singleBorder(color, sz);
  return { top: b, bottom: b, left: b, right: b };
}

export function noBorders(): Record<
  'top' | 'bottom' | 'left' | 'right',
  IBorderOptions
> {
  const b: IBorderOptions = { style: BorderStyle.NIL, size: 0, color: 'auto' };
  return { top: b, bottom: b, left: b, right: b };
}

// ── RUN BUILDER ─────────────────────────────────────────────────────────────

export function run(text: string | number, opts: RunOptions = {}): TextRun {
  const runOpts: IRunOptions = {
    text: String(text ?? ''),
    bold: opts.bold || false,
    italics: opts.italic || false,
    underline: opts.underline ? { type: UnderlineType.SINGLE } : undefined,
    size: (opts.size || 11) * 2,
    font: opts.font || 'Calibri',
    color: opts.color || C.BLACK,
  };
  return new TextRun(runOpts);
}

// ── PARAGRAPH BUILDER ───────────────────────────────────────────────────────

export function p(
  children: string | TextRun | (string | TextRun)[],
  opts: ParagraphOptions = {}
): Paragraph {
  const items = Array.isArray(children) ? children : [children];
  const runs = items.map((item) =>
    typeof item === 'string' ? run(item, opts) : item
  );

  return new Paragraph({
    alignment: opts.align || AlignmentType.LEFT,
    spacing: { before: opts.before ?? 80, after: opts.after ?? 80 },
    indent: opts.indent ? { left: opts.indent } : undefined,
    numbering: opts.numbering || undefined,
    children: runs,
  });
}

// ── BLANK LINE ──────────────────────────────────────────────────────────────

export function blank(n = 1): Paragraph[] {
  return Array.from(
    { length: n },
    () => new Paragraph({ children: [new TextRun('')] })
  );
}

// ── DOCUMENT TITLE ──────────────────────────────────────────────────────────

export function docTitle(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 200, after: 200 },
    children: [run(text, { bold: true, size: 18, underline: true })],
  });
}

// ── BOLD LABEL + VALUE ──────────────────────────────────────────────────────

export function labelValue(
  label: string,
  value: string,
  opts: ParagraphOptions = {}
): Paragraph {
  return p(
    [
      run(label, { bold: true, size: 11 }),
      run(value, { size: 11, ...opts }),
    ],
    { before: opts.before ?? 80, after: opts.after ?? 80 }
  );
}

// ── CLAUSE HEADING ──────────────────────────────────────────────────────────

export function clauseHead(num: number, title: string): Paragraph {
  return p(
    [
      run(`${num}.  `, { bold: true, size: 11 }),
      run(title, { bold: true, size: 11 }),
    ],
    { before: 160, after: 60 }
  );
}

// ── BODY TEXT ────────────────────────────────────────────────────────────────

export function body(
  runsOrText: string | TextRun[],
  opts: ParagraphOptions = {}
): Paragraph {
  const children =
    typeof runsOrText === 'string'
      ? [run(runsOrText, { size: 11 })]
      : runsOrText;

  return new Paragraph({
    alignment: opts.align || AlignmentType.JUSTIFIED,
    spacing: { before: opts.before ?? 80, after: opts.after ?? 80 },
    indent: opts.indent ? { left: opts.indent } : undefined,
    children,
  });
}

// ── BULLET POINT ────────────────────────────────────────────────────────────

export function bullet(
  text: string | TextRun[],
  _opts: ParagraphOptions = {}
): Paragraph {
  const children =
    typeof text === 'string' ? [run(text, { size: 11 })] : text;

  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { before: 40, after: 40 },
    indent: { left: 720, hanging: 360 },
    children: [run('\u2022  ', { size: 11 }), ...children],
  });
}
