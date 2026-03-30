'use strict';

const { Header, Footer, Paragraph, AlignmentType, TextRun, PageNumber } = require('docx');
const { run } = require('./helpers');

function makeHeader() {
  return new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 200 },
        children: [run('PARTNERSHIP DEED', { bold: true, size: 14 })],
      }),
    ],
  });
}

function makeFooter() {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          run('Page ', { size: 9 }),
          new TextRun({ children: [PageNumber.CURRENT], size: 18 }),
          run(' of ', { size: 9 }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18 }),
        ],
      }),
    ],
  });
}

module.exports = { makeHeader, makeFooter };
