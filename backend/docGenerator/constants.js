'use strict';

const { AlignmentType, BorderStyle } = require('docx');

// ─── PAGE CONSTANTS (A4) ─────────────────────────────────────────────────────
const PAGE_W    = 11906;
const PAGE_H    = 16838;
const MAR_TOP   = 1440;
const MAR_BOT   = 1440;
const MAR_LEFT  = 1440;
const MAR_RIGHT = 1440;
const CONTENT_W = PAGE_W - MAR_LEFT - MAR_RIGHT; // 9026

// ─── COLORS ──────────────────────────────────────────────────────────────────
const C = {
  BLACK: '000000',
  NAVY: '1F3864',
  GRAY: '595959',
  LGRAY: 'D9D9D9',
  WHITE: 'FFFFFF',
};

module.exports = {
  PAGE_W, PAGE_H, MAR_TOP, MAR_BOT, MAR_LEFT, MAR_RIGHT, CONTENT_W,
  C,
};
