'use strict';

const { Table, TableRow, TableCell, Paragraph, WidthType, BorderStyle } = require('docx');
const { CONTENT_W } = require('./constants');
const { noBorders, run } = require('./helpers');

/**
 * Create a two-column signature table with no visible borders.
 * @param {string[]} leftLines - Lines for the left column
 * @param {string[]} rightLines - Lines for the right column
 * @returns {Table}
 */
function sigTable(leftLines, rightLines) {
  function col(lines, w) {
    return new TableCell({
      borders: noBorders(),
      width: { size: w, type: WidthType.DXA },
      margins: { top: 60, bottom: 60, left: 0, right: 0 },
      children: lines.map(l =>
        new Paragraph({ spacing: { before: 40, after: 40 }, children: [run(l, { size: 11 })] })
      ),
    });
  }
  const half = Math.floor(CONTENT_W / 2);
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [half, CONTENT_W - half],
    borders: { ...noBorders(), insideH: { style: BorderStyle.NIL }, insideV: { style: BorderStyle.NIL } },
    rows: [new TableRow({ children: [col(leftLines, half), col(rightLines, CONTENT_W - half)] })],
  });
}

module.exports = { sigTable };
