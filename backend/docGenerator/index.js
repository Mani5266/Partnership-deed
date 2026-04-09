'use strict';

const { Document, Packer, AlignmentType } = require('docx');
const constants = require('./constants');
const helpers   = require('./helpers');
const { sigTable } = require('./tables');
const { formatDate } = require('./dateUtils');

// Ordinal labels for parties
const ORDINAL_LABELS = [
  'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh',
  'Eighth', 'Ninth', 'Tenth', 'Eleventh', 'Twelfth', 'Thirteenth',
  'Fourteenth', 'Fifteenth', 'Sixteenth', 'Seventeenth', 'Eighteenth',
  'Nineteenth', 'Twentieth',
];

function getPartyLabel(index) {
  return ORDINAL_LABELS[index] || `${index + 1}th`;
}

/**
 * Build the complete Partnership Deed document content.
 * Supports dynamic N-partners with backward compatibility for legacy 2-partner payloads.
 * @param {Object} d - Validated form data
 * @returns {Paragraph[]} Array of docx paragraphs/tables
 */
function buildDeedContent(d) {
  const { run, p, blank, docTitle, body, clauseHead, bullet, labelValue } = helpers;

  const date = formatDate(d.deedDate) || 'the _______ day of _______ 20___';

  // ── Resolve partners array (supports both new and legacy format) ──
  let partners;
  if (d.partners && Array.isArray(d.partners) && d.partners.length >= 2) {
    partners = d.partners.map(pt => ({
      name: pt.name || '_______________',
      fatherName: pt.fatherName || '_______________',
      age: pt.age || '___',
      address: pt.address || '_______________',
      relation: pt.relation || 'S/O',
      capital: pt.capital ?? '___',
      profit: pt.profit ?? '___',
      isManagingPartner: pt.isManagingPartner || false,
      isBankAuthorized: pt.isBankAuthorized || false,
    }));
  } else {
    // Legacy 2-partner format
    partners = [
      {
        name: d.partner1Name || '_______________',
        fatherName: d.partner1FatherName || '_______________',
        age: d.partner1Age || '___',
        address: d.partner1Address || '_______________',
        relation: d.partner1Relation || 'S/O',
        capital: d.partner1Capital ?? '___',
        profit: d.partner1Profit ?? '___',
        isManagingPartner: false,
        isBankAuthorized: false,
      },
      {
        name: d.partner2Name || '_______________',
        fatherName: d.partner2FatherName || '_______________',
        age: d.partner2Age || '___',
        address: d.partner2Address || '_______________',
        relation: d.partner2Relation || 'S/O',
        capital: d.partner2Capital ?? '___',
        profit: d.partner2Profit ?? '___',
        isManagingPartner: false,
        isBankAuthorized: false,
      },
    ];
  }

  const bizName = d.businessName || '_______________';
  const nature = d.natureOfBusiness || '_______________';
  const objectives = d.businessObjectives || '_______________';
  const regAddr = d.registeredAddress || '_______________';
  const interestRate = d.interestRate || '12';
  const noticePeriod = d.noticePeriod || '3';
  const accountingYear = d.accountingYear || '31st March';
  const bankOp = d.bankOperation || 'jointly';
  const additionalPoints = d.additionalPoints || '';

  const content = [];

  // ─── TITLE ────────────────────────────────────────────────────────────────
  content.push(...blank(2));
  content.push(docTitle('PARTNERSHIP DEED'));
  content.push(...blank(1));

  // ─── PREAMBLE ─────────────────────────────────────────────────────────────
  content.push(body([
    run('This Deed of Partnership is made and executed on ', { size: 11 }),
    run(date, { bold: true, size: 11 }),
    run(', by and between:', { size: 11 }),
  ]));

  content.push(...blank(1));

  // ─── PARTNER INTRODUCTIONS (Dynamic N-partners) ───────────────────────────
  partners.forEach((pt, i) => {
    content.push(body([
      run(pt.name, { bold: true, size: 11 }),
      run(` ${pt.relation} `, { size: 11 }),
      run(pt.fatherName, { bold: true, size: 11 }),
      run(` Aged `, { size: 11 }),
      run(String(pt.age), { bold: true, size: 11 }),
      run(` Years, residing at `, { size: 11 }),
      run(pt.address, { size: 11 }),
      run('.', { size: 11 }),
    ]));

    const label = getPartyLabel(i);
    content.push(body([
      run('(Hereinafter called as the ', { size: 11 }),
      run(`"${label} Party"`, { bold: true, italic: true, size: 11 }),
      run(')', { size: 11 }),
    ]));

    // Add "AND" between partners (except after the last one)
    if (i < partners.length - 1) {
      content.push(...blank(1));
      content.push(p('AND', {
        bold: true, size: 11, align: AlignmentType.CENTER,
      }));
      content.push(...blank(1));
    }
  });

  content.push(...blank(1));

  // ─── WHEREAS CLAUSES ─────────────────────────────────────────────────────
  content.push(body([
    run('WHEREAS ', { bold: true, size: 11 }),
    run('the parties here have mutually decided to start a partnership business of ', { size: 11 }),
    run(nature, { bold: true, size: 11 }),
    run(' under the name and style as ', { size: 11 }),
    run(`M/s. ${bizName}`, { bold: true, size: 11 }),
    run('.', { size: 11 }),
  ]));

  content.push(...blank(1));

  content.push(body([
    run('AND WHEREAS ', { bold: true, size: 11 }),
    run('it is felt expedient to reduce the terms and conditions agreed upon by the above said continuing partners into writing to avoid any misunderstandings amongst the partners at a future date.', { size: 11 }),
  ]));

  content.push(...blank(2));

  // ─── NOW THIS DEED WITNESSETH ─────────────────────────────────────────────
  content.push(p('NOW THIS DEED OF PARTNERSHIP WITNESSETH AS FOLLOWS:', {
    bold: true, size: 12, align: AlignmentType.CENTER, before: 200, after: 200,
  }));

  content.push(...blank(1));

  // ─── CLAUSE 1: Name & Commencement ────────────────────────────────────────
  content.push(clauseHead(1, 'Name and Commencement'));
  content.push(body([
    run('The partnership business shall be carried on under the name and style as ', { size: 11 }),
    run(`M/s. ${bizName}`, { bold: true, size: 11 }),
    run('. The partnership firm shall come into existence with effect from ', { size: 11 }),
    run(date, { bold: true, size: 11 }),
    run('.', { size: 11 }),
  ]));

  // ─── CLAUSE 2: Duration ───────────────────────────────────────────────────
  content.push(clauseHead(2, 'Duration'));
  if (d.partnershipDuration === 'fixed' && d.partnershipStartDate && d.partnershipEndDate) {
    const startDate = formatDate(d.partnershipStartDate) || d.partnershipStartDate;
    const endDate = formatDate(d.partnershipEndDate) || d.partnershipEndDate;
    content.push(body([
      run('The duration of the partnership shall be for a fixed period commencing from ', { size: 11 }),
      run(startDate, { bold: true, size: 11 }),
      run(' and ending on ', { size: 11 }),
      run(endDate, { bold: true, size: 11 }),
      run(', unless terminated earlier by mutual consent of all the partners or by operation of law.', { size: 11 }),
    ]));
  } else {
    content.push(body('The duration of the firm shall be at WILL of the partners.'));
  }

  // ─── CLAUSE 3: Place of Business ──────────────────────────────────────────
  content.push(clauseHead(3, 'Principal Place of Business'));
  content.push(body([
    run('The Principal place of business of the firm shall be at ', { size: 11 }),
    run(regAddr, { bold: true, size: 11 }),
    run('.', { size: 11 }),
  ]));

  // ─── CLAUSE 4: Objectives ────────────────────────────────────────────────
  content.push(clauseHead(4, 'Objectives of Partnership'));
  content.push(body('The objective of partnership is to carry on the following business:'));
  content.push(...blank(1));
  content.push(body(objectives, { indent: 360 }));

  // ─── CLAUSE 5: Capital Contribution (Dynamic N-partners) ─────────────────
  content.push(clauseHead(5, 'Capital Contribution of the Partners'));
  content.push(body('The total capital contribution of the partners in the firm shall be in the following proportions:'));
  partners.forEach((pt, i) => {
    const label = getPartyLabel(i);
    content.push(bullet([
      run(`${label} Party (${pt.name}): `, { bold: true, size: 11 }),
      run(`${pt.capital}%`, { size: 11 }),
    ]));
  });

  // ─── CLAUSE 6: Managing Partners (Dynamic — based on selections) ──────────
  content.push(clauseHead(6, 'Managing Partners'));

  // Determine managing partners: use selected ones, or fall back to all partners
  const managingPartners = partners
    .map((pt, i) => ({ ...pt, _index: i }))
    .filter(pt => pt.isManagingPartner);
  const effectiveManagingPartners = managingPartners.length > 0 ? managingPartners : partners.map((pt, i) => ({ ...pt, _index: i }));

  // Build the dynamic "Party of the First Part X & Second Part Y & ..." text
  const managingPartnerRuns = [];
  managingPartnerRuns.push(run('The parties ', { size: 11 }));
  effectiveManagingPartners.forEach((pt, i) => {
    if (i > 0) {
      managingPartnerRuns.push(run(' & ', { size: 11 }));
    }
    managingPartnerRuns.push(run(pt.name, { bold: true, size: 11 }));
    managingPartnerRuns.push(run(` (${getPartyLabel(pt._index)} Party)`, { size: 11 }));
  });
  managingPartnerRuns.push(run(` shall be the managing partner${effectiveManagingPartners.length > 1 ? 's' : ''} and ${effectiveManagingPartners.length > 1 ? 'are' : 'is'} authorized and empowered to do the following acts, deeds and things on behalf of the firm:`, { size: 11 }));
  content.push(body(managingPartnerRuns));

  const managingPowers = [
    'To manage the business of the partnership firm with a power to appoint remuneration, etc. They shall also have the power to dispense with the service of such personnel that are not required.',
    'To negotiate any business transactions and enter into agreements on behalf of the firm and to enter into all/any contracts and sub-contracts on either way. To enter to the sale and purchase agreements relating to the objective of the business.',
    'To enter into correspondence with government departments, quasi-govt departments, public and private organizations, individuals, etc regarding the partnership business.',
    'To incur all expenses necessary for the conduct of the business.',
    'To borrow moneys against credit of partnership, if necessary by hypothecating or creating a charge upon the assets of the partnership.',
    'To be in custody of all account books, documents, negotiable instruments and all other documents pertaining to the business.',
    'To look after the proper upkeep of books of accounts required for the business and to supervise the same at regular intervals.',
    'To open bank account/accounts in the name of the partnership firm.',
    'To put all the monies, cheques etc., which are not immediately required for the conduct of the business into the bank account, opened for the Partnership business.',
    'To do all other acts and things that are necessary for carrying on the business.',
  ];

  for (const power of managingPowers) {
    content.push(bullet(power));
  }

  content.push(...blank(1));

  content.push(body([
    run('The managing partners are empowered to borrow money as and when found necessary for the business from any nationalized or schedule bank/banks or any other financial institutions from time to time and execute necessary actions at all the times.', { size: 11 }),
  ]));

  // ─── CLAUSE 7: Additional Points ─────────────────────────────────────────
  if (additionalPoints.trim()) {
    content.push(clauseHead(7, 'Additional Terms'));
    content.push(body(additionalPoints));
  }

  const nextClause = additionalPoints.trim() ? 8 : 7;

  // ─── CLAUSE: Banking (Dynamic partners — based on bank authorization) ──────
  content.push(clauseHead(nextClause, 'Banking'));

  // Determine bank-authorized partners
  const bankAuthPartners = partners
    .map((pt, i) => ({ ...pt, _index: i }))
    .filter(pt => pt.isBankAuthorized);

  // Connector: "and" for jointly (both must sign), "or" for either (any one can sign)
  const bankConnector = bankOp === 'either' ? ' or ' : ' and ';

  if (bankAuthPartners.length > 0) {
    // Use specifically authorized partners
    const bankingRuns = [];
    bankingRuns.push(run('The firm shall maintain one or more banking accounts (e.g., current accounts, overdrafts, cash credit, etc.) as may be decided by the partners from time to time. The said bank accounts shall be operated by ', { size: 11 }));

    bankAuthPartners.forEach((pt, i) => {
      if (i > 0 && i < bankAuthPartners.length - 1) {
        bankingRuns.push(run(', ', { size: 11 }));
      } else if (i === bankAuthPartners.length - 1 && bankAuthPartners.length > 1) {
        bankingRuns.push(run(bankConnector, { size: 11 }));
      }
      bankingRuns.push(run(pt.name, { bold: true, size: 11 }));
      bankingRuns.push(run(` (${getPartyLabel(pt._index)} Party)`, { size: 11 }));
    });

    if (bankOp === 'either') {
      bankingRuns.push(run(`, ${bankAuthPartners.length === 1 ? 'who is' : 'either of whom is'} independently authorized for all bank-related transactions including the issuance and authorization of cheques, demand drafts, and any other banking instruments on behalf of the firm.`, { size: 11 }));
    } else {
      bankingRuns.push(run(`, who ${bankAuthPartners.length === 1 ? 'is' : 'are jointly'} authorized for all bank-related transactions including the issuance and authorization of cheques, demand drafts, and any other banking instruments on behalf of the firm. No transaction shall be deemed valid unless signed by all the above-named authorized partners.`, { size: 11 }));
    }
    content.push(body(bankingRuns));
  } else if (bankOp === 'jointly') {
    const bankingRuns = [];
    bankingRuns.push(run('The firm shall maintain one or more banking accounts (e.g., current accounts, overdrafts, cash credit, etc.) as may be decided by the partners from time to time. The said bank accounts shall be operated jointly by ', { size: 11 }));

    partners.forEach((pt, i) => {
      if (i > 0 && i < partners.length - 1) {
        bankingRuns.push(run(', ', { size: 11 }));
      } else if (i === partners.length - 1 && partners.length > 1) {
        bankingRuns.push(run(' and ', { size: 11 }));
      }
      bankingRuns.push(run(pt.name, { bold: true, size: 11 }));
      bankingRuns.push(run(` (${getPartyLabel(i)} Party)`, { size: 11 }));
    });

    bankingRuns.push(run('. The signatures of all partners shall be jointly required for the issuance and authorization of cheques or any other banking transactions. No transaction shall be deemed valid unless signed by all partners.', { size: 11 }));
    content.push(body(bankingRuns));
  } else {
    content.push(body([
      run('The firm shall maintain one or more banking accounts as may be decided by the partners from time to time. The said bank accounts may be operated by any partner independently.', { size: 11 }),
    ]));
  }

  // ─── CLAUSE: Authorized Signatory ─────────────────────────────────────────
  content.push(clauseHead(nextClause + 1, 'Authorized Signatory'));
  content.push(body('The partners, upon mutual consent of all the partners of this partnership deed appoint any another individual as the authorized signatory for entering into the agreements relating to sale and purchase of the land or/and building.'));

  // ─── CLAUSE: Working Partners & Remuneration ──────────────────────────────
  content.push(clauseHead(nextClause + 2, 'Working Partners and Remuneration'));
  content.push(body('That all the partners shall be working partners of the firm and shall be bound to devote full time and attention to the partnership business and shall be actively engaged in conducting the affairs of the firm and therefore it has been agreed to pay salary/remuneration for the services rendered as per the provisions under section 40(b) of the Income Tax Act, 1961.'));

  content.push(body('For the purpose of above calculation of the remuneration shall be on the basis of profit as shown by the books and computed as provided in section 20 to 44D of chapter IV of the Income Tax Act, 1961 as increased by the aggregate of remuneration paid or payable to the partners of the firm if such remuneration has been deducted while computing the net profit.'));

  // ─── CLAUSE: Interest on Capital ──────────────────────────────────────────
  content.push(clauseHead(nextClause + 3, 'Interest on Capital'));
  content.push(body([
    run(`That the interest at the rate of ${interestRate}% per annum or as may be prescribed u/s.40(b)(iv) of the Income Tax Act, 1961 or may be any other applicable provisions as may be in force in the Income tax assessment of partnership firm for the relevant accounting year shall be payable to the partners on the amount standing to the credit of the account of the partners. Such interest shall be calculated and credited to the account of each partner at the close of the accounting year.`, { size: 11 }),
  ]));

  // ─── CLAUSE: Books of Accounts ────────────────────────────────────────────
  content.push(clauseHead(nextClause + 4, 'Books of Accounts'));
  content.push(body([
    run('The books of accounts of the partnership shall be maintained at the principal place of business and the same shall be closed on the ', { size: 11 }),
    run(accountingYear, { bold: true, size: 11 }),
    run(' every year to arrive at the profit or loss for the period ending and to draw the profit and loss account and the balance sheet to know the financial position of the firm as on date.', { size: 11 }),
  ]));

  // ─── CLAUSE: Profit & Loss Sharing (Dynamic N-partners) ──────────────────
  content.push(clauseHead(nextClause + 5, 'Profit and Loss Sharing'));
  content.push(body('That the share of the profits or losses of partnership business after taking into account all business and incidental expenses will be as follows:'));

  partners.forEach((pt, i) => {
    content.push(bullet([
      run(`${pt.name}`, { bold: true, size: 11 }),
      run(` (${getPartyLabel(i)} Party) - ${pt.profit}%`, { size: 11 }),
    ]));
  });

  // ─── CLAUSE: Retirement ───────────────────────────────────────────────────
  content.push(clauseHead(nextClause + 6, 'Retirement'));
  content.push(body([
    run(`Any partner desirous of retiring from the partnership during its continuance can exercise his/her right by giving ${noticePeriod} calendar months' notice to the other partner(s).`, { size: 11 }),
  ]));

  // ─── CLAUSE: Death, Retirement or Insolvency ──────────────────────────────
  content.push(clauseHead(nextClause + 7, 'Death, Retirement or Insolvency'));
  content.push(body('Death, retirement or insolvency of any of the partners shall not dissolve the partnership. Further in case of death of any of the partners of the firm, the legal heirs as the case may be, shall be entitled to the capital account balance with the share of profit or loss up to the date of death of the partner only. The goodwill of the partnership business shall not be valued in the above circumstances.'));

  // ─── CLAUSE: Arbitration ──────────────────────────────────────────────────
  content.push(clauseHead(nextClause + 8, 'Arbitration'));
  content.push(body('Any dispute that may arise between the partners shall be referred to an arbitrator whose award shall be final and binding on the parties MUTATIS MUTANDIS. The appointment of the arbitrator shall be on mutual consent.'));

  // ─── CLAUSE: Applicable Law ───────────────────────────────────────────────
  content.push(clauseHead(nextClause + 9, 'Applicable Law'));
  content.push(body('The provision of the Partnership Act, 1932 as in vogue from time to time shall apply to this partnership except as otherwise stated above.'));

  // ─── CLAUSE: Amendments ───────────────────────────────────────────────────
  content.push(clauseHead(nextClause + 10, 'Amendments'));
  content.push(body('Any of the terms of this Deed may be amended, abandoned or otherwise be dealt with according to the necessities of the business and convenience of the partners and they shall be reduced to writing on Rs. 100/- stamp paper which shall have the same effect as if embodied in this Deed.'));

  content.push(...blank(3));

  // ─── IN WITNESS WHEREOF ───────────────────────────────────────────────────
  content.push(body([
    run('IN WITNESS WHEREOF ', { bold: true, size: 11 }),
    run('the parties hereto have set hands on this the ', { size: 11 }),
    run(date, { bold: true, size: 11 }),
    run('.', { size: 11 }),
  ]));

  content.push(...blank(4));

  // ─── SIGNATURE TABLE (Dynamic N-partners) ─────────────────────────────────
  const witnessLines = [
    'WITNESSES',
    '',
    '1. ________________________',
    '',
    '',
    '',
    '2. ________________________',
  ];

  const partnerSigLines = ['Partners', ''];
  partners.forEach((pt, i) => {
    partnerSigLines.push(`${i + 1}. ${pt.name}`);
    partnerSigLines.push(`   (${getPartyLabel(i)} Party)`);
    if (i < partners.length - 1) {
      partnerSigLines.push('');
      partnerSigLines.push('');
    }
  });

  content.push(sigTable(witnessLines, partnerSigLines));

  return content;
}

/**
 * Main function to generate the complete Partnership Deed document.
 * @param {Object} d - Validated form data
 * @returns {Promise<Buffer>} - The generated Word document as a buffer
 */
async function generateDoc(d) {
  const { PAGE_W, PAGE_H, MAR_TOP, MAR_RIGHT, MAR_BOT, MAR_LEFT } = constants;

  const pageProps = {
    page: {
      size: { width: PAGE_W, height: PAGE_H },
      margin: { top: MAR_TOP, right: MAR_RIGHT, bottom: MAR_BOT, left: MAR_LEFT, header: 708, footer: 708 },
    },
  };

  const children = buildDeedContent(d);

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: 'Calibri', size: 22, color: '000000' } },
      },
    },
    sections: [{
      properties: pageProps,
      children,
    }],
  });

  return Packer.toBuffer(doc);
}

module.exports = { generateDoc };
