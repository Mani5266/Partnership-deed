'use strict';

const {
  Paragraph, TextRun, AlignmentType, UnderlineType, BorderStyle
} = require('docx');
const { C } = require('./constants');

// ─── BORDER HELPERS ──────────────────────────────────────────────────────────

function singleBorder(color = 'auto', sz = 4) {
  return { style: BorderStyle.SINGLE, size: sz, color };
}

function allBorders(color = 'auto', sz = 4) {
  const b = singleBorder(color, sz);
  return { top: b, bottom: b, left: b, right: b };
}

function noBorders() {
  const b = { style: BorderStyle.NIL, size: 0, color: 'auto' };
  return { top: b, bottom: b, left: b, right: b };
}

// ─── RUN BUILDER ─────────────────────────────────────────────────────────────

function run(text, opts = {}) {
  return new TextRun({
    text:      String(text ?? ''),
    bold:      opts.bold || false,
    italics:   opts.italic || false,
    underline: opts.underline ? { type: UnderlineType.SINGLE } : undefined,
    size:      (opts.size || 11) * 2,
    font:      opts.font || 'Calibri',
    color:     opts.color || C.BLACK,
  });
}

// ─── PARAGRAPH BUILDER ───────────────────────────────────────────────────────

function p(children, opts = {}) {
  const runs = [];
  const items = Array.isArray(children) ? children : [children];
  for (const item of items) {
    if (typeof item === 'string') {
      runs.push(run(item, opts));
    } else {
      runs.push(item);
    }
  }
  return new Paragraph({
    alignment:  opts.align || AlignmentType.LEFT,
    spacing:    { before: opts.before ?? 80, after: opts.after ?? 80 },
    indent:     opts.indent ? { left: opts.indent } : undefined,
    numbering:  opts.numbering || undefined,
    children:   runs,
  });
}

// ─── BLANK LINE ──────────────────────────────────────────────────────────────

function blank(n = 1) {
  return Array.from({ length: n }, () => new Paragraph({ children: [new TextRun('')] }));
}

// ─── DOCUMENT TITLE ──────────────────────────────────────────────────────────

function docTitle(text) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 200, after: 200 },
    children: [run(text, { bold: true, size: 18, underline: true })],
  });
}

// ─── BOLD LABEL + VALUE ─────────────────────────────────────────────────────

function labelValue(label, value, opts = {}) {
  return p([
    run(label, { bold: true, size: 11 }),
    run(value, { size: 11, ...opts }),
  ], { before: opts.before ?? 80, after: opts.after ?? 80 });
}

// ─── CLAUSE HEADING ──────────────────────────────────────────────────────────

function clauseHead(num, title) {
  return p([
    run(`${num}.  `, { bold: true, size: 11 }),
    run(title, { bold: true, size: 11 }),
  ], { before: 160, after: 60 });
}

// ─── BODY TEXT ────────────────────────────────────────────────────────────────

function body(runs_or_text, opts = {}) {
  const children = typeof runs_or_text === 'string'
    ? [run(runs_or_text, { size: 11 })]
    : runs_or_text;
  return new Paragraph({
    alignment: opts.align || AlignmentType.JUSTIFIED,
    spacing:   { before: opts.before ?? 80, after: opts.after ?? 80 },
    indent:    opts.indent ? { left: opts.indent } : undefined,
    children,
  });
}

// ─── BULLET POINT ────────────────────────────────────────────────────────────

function bullet(text, opts = {}) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { before: 40, after: 40 },
    indent: { left: 720, hanging: 360 },
    children: [
      run('\u2022  ', { size: 11 }),
      ...(typeof text === 'string' ? [run(text, { size: 11 })] : text),
    ],
  });
}

module.exports = {
  singleBorder, allBorders, noBorders,
  run, p, blank, docTitle, labelValue, clauseHead, body, bullet
};
