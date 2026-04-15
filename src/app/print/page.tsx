// -- Print Page ---------------------------------------------------------------
// Print-optimized view: reads deed ID from URL, fetches deed data,
// renders formatted deed HTML, and auto-triggers window.print().
// Opened in a new tab by useGenerate.openPrintView().

'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { dbGetDeedById } from '@/lib/db';
import { escapeHTML, fmtDate, safeNumber } from '@/lib/utils';
import { getPartyLabel } from '@/types';
import type { Deed, Partner } from '@/types';

// ── Build deed HTML from payload + child tables ────────────────────────────

function buildDeedHTML(deed: Deed): string {
  const payload = deed.payload || {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = payload as Record<string, any>;

  // Partners — prefer child table data, fall back to payload
  const partners: Partner[] =
    deed._partners && deed._partners.length > 0
      ? deed._partners.map((pr) => ({
          name: pr.name || '',
          relation: pr.relation || 'S/O',
          fatherName: pr.father_name || '',
          age: pr.age || '',
          address: pr.address || '',
          capital: pr.capital_pct ?? 0,
          profit: pr.profit_pct ?? 0,
          isManagingPartner: pr.is_managing_partner ?? false,
          isBankAuthorized: pr.is_bank_authorized ?? false,
        }))
      : (p.partners as Partner[]) || [];

  const businessName = p.businessName || '_______________';
  const deedDate = p.deedDate || '';
  const natureOfBusiness = p.natureOfBusiness || '_______________';
  const businessObjectives = p.businessObjectives || '_______________';
  const interestRate = p.interestRate || '12';
  const noticePeriod = p.noticePeriod || '3';
  const accountingYear = p.accountingYear || '31st March';
  const bankOperation = p.bankOperation || 'jointly';
  const additionalPoints = p.additionalPoints || '';
  const partnershipDuration = p.partnershipDuration || 'at_will';
  const partnershipStartDate = p.partnershipStartDate || '';
  const partnershipEndDate = p.partnershipEndDate || '';

  // Registered address — prefer child table
  let registeredAddress = p.registeredAddress || '_______________';
  if (deed._address) {
    const a = deed._address;
    const parts = [a.door_no, a.building_name, a.area, a.district, a.state, a.pincode].filter(Boolean);
    if (parts.length > 0) registeredAddress = parts.join(', ');
  }

  const biz = escapeHTML(businessName);
  const date = fmtDate(deedDate) || 'the _______ day of _______ 20___';
  const addr = escapeHTML(registeredAddress);
  const nature = escapeHTML(natureOfBusiness);
  const objectives = escapeHTML(businessObjectives);
  const rate = escapeHTML(interestRate);
  const notice = escapeHTML(noticePeriod);
  const acctYear = escapeHTML(accountingYear);
  const bankOp = bankOperation;
  const addlPts = additionalPoints;

  // Partner intros
  const partnerIntros = partners
    .map((pt, i) => {
      const name = escapeHTML(pt.name || '_______________');
      const rel = escapeHTML(pt.relation || 'S/O');
      const father = escapeHTML(pt.fatherName || '_______________');
      const age = escapeHTML(String(pt.age || '___'));
      const address = escapeHTML(pt.address || '_______________');
      const label = getPartyLabel(i);
      let h = `<p><strong>${name}</strong> ${rel} <strong>${father}</strong> Aged <strong>${age}</strong> Years, residing at ${address}.</p>`;
      h += `<p>(Hereinafter called as the <strong><em>&ldquo;${label} Party&rdquo;</em></strong>)</p>`;
      if (i < partners.length - 1) {
        h += `<p style="text-align:center"><strong>AND</strong></p>`;
      }
      return h;
    })
    .join('\n');

  // Capital bullets
  const capitalBullets = partners
    .map((pt, i) => {
      const name = escapeHTML(pt.name || '_______________');
      const label = getPartyLabel(i);
      const cap = escapeHTML(String(safeNumber(pt.capital) || '___'));
      return `<li><strong>${label} Party (${name}):</strong> ${cap}%</li>`;
    })
    .join('\n');

  // Profit bullets
  const profitBullets = partners
    .map((pt, i) => {
      const name = escapeHTML(pt.name || '_______________');
      const label = getPartyLabel(i);
      const prof = escapeHTML(String(safeNumber(pt.profit) || '___'));
      return `<li><strong>${name}</strong> (${label} Party) - ${prof}%</li>`;
    })
    .join('\n');

  // Duration
  let durationText = 'The duration of the firm shall be at WILL of the partners.';
  if (partnershipDuration === 'fixed' && partnershipStartDate && partnershipEndDate) {
    durationText = `The duration of the partnership shall be for a fixed period commencing from <strong>${fmtDate(partnershipStartDate)}</strong> and ending on <strong>${fmtDate(partnershipEndDate)}</strong>, unless terminated earlier by mutual consent of all the partners or by operation of law.`;
  }

  // Managing Partners
  const managingPartnersList = partners
    .map((pt, i) => ({ ...pt, _index: i }))
    .filter((pt) => pt.isManagingPartner);
  const effectiveManagingPartners =
    managingPartnersList.length > 0
      ? managingPartnersList
      : partners.map((pt, i) => ({ ...pt, _index: i }));

  const managingPartnersText = effectiveManagingPartners
    .map((pt, i) => {
      const sep = i > 0 ? ' &amp; ' : '';
      return `${sep}<strong>${escapeHTML(pt.name || 'N/A')}</strong> (${getPartyLabel(pt._index)} Party)`;
    })
    .join('');

  const pluralMgr = effectiveManagingPartners.length > 1;

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
  const managingPowersList = managingPowers.map((mp) => `<li>${mp}</li>`).join('\n');

  // Banking
  const bankAuthPartners = partners
    .map((pt, i) => ({ ...pt, _index: i }))
    .filter((pt) => pt.isBankAuthorized);
  const bankConnector = bankOp === 'either' ? ' or ' : ' and ';

  let bankingText = '';
  if (bankAuthPartners.length > 0) {
    const bankNames = bankAuthPartners
      .map((pt, i) => {
        let sep = '';
        if (i > 0 && i < bankAuthPartners.length - 1) sep = ', ';
        else if (i === bankAuthPartners.length - 1 && bankAuthPartners.length > 1) sep = bankConnector;
        return `${sep}<strong>${escapeHTML(pt.name || 'N/A')}</strong> (${getPartyLabel(pt._index)} Party)`;
      })
      .join('');
    if (bankOp === 'either') {
      bankingText = `The firm shall maintain one or more banking accounts as may be decided by the partners from time to time. The said bank accounts shall be operated by ${bankNames}, ${bankAuthPartners.length === 1 ? 'who is' : 'either of whom is'} independently authorized for all bank-related transactions including the issuance and authorization of cheques, demand drafts, and any other banking instruments on behalf of the firm.`;
    } else {
      bankingText = `The firm shall maintain one or more banking accounts as may be decided by the partners from time to time. The said bank accounts shall be operated by ${bankNames}, who ${bankAuthPartners.length === 1 ? 'is' : 'are jointly'} authorized for all bank-related transactions including the issuance and authorization of cheques, demand drafts, and any other banking instruments on behalf of the firm. No transaction shall be deemed valid unless signed by all the above-named authorized partners.`;
    }
  } else {
    bankingText =
      'The firm shall maintain one or more banking accounts as may be decided by the partners from time to time. The said bank accounts may be operated by any partner independently.';
  }

  const nextClause = addlPts.trim() ? 8 : 7;

  const partnerSigRows = partners
    .map((pt, i) => `<p>${i + 1}. ${escapeHTML(pt.name || '________________________')}</p><p style="margin-left:1em">(${getPartyLabel(i)} Party)</p>`)
    .join('');

  return `
    <h1 style="text-align:center; font-size:16pt; text-decoration:underline; text-transform:uppercase; font-weight:bold; margin-bottom:0.5em;">Partnership Deed</h1>

    <p>This Deed of Partnership is made and executed on <strong>${date}</strong>, by and between:</p>

    ${partnerIntros}

    <br>

    <p><strong>WHEREAS</strong> the parties here have mutually decided to start a partnership business of <strong>${nature}</strong> under the name and style as <strong>M/s. ${biz}</strong>.</p>

    <p><strong>AND WHEREAS</strong> it is felt expedient to reduce the terms and conditions agreed upon by the above said continuing partners into writing to avoid any misunderstandings amongst the partners at a future date.</p>

    <br>

    <p style="text-align:center; font-weight:bold; font-size:12pt; margin:1.5em 0 1em;">NOW THIS DEED OF PARTNERSHIP WITNESSETH AS FOLLOWS:</p>

    <p><strong>1. Name and Commencement</strong></p>
    <p>The partnership business shall be carried on under the name and style as <strong>M/s. ${biz}</strong>. The partnership firm shall come into existence with effect from <strong>${date}</strong>.</p>

    <p><strong>2. Duration</strong></p>
    <p>${durationText}</p>

    <p><strong>3. Principal Place of Business</strong></p>
    <p>The Principal place of business of the firm shall be at <strong>${addr}</strong>.</p>

    <p><strong>4. Objectives of Partnership</strong></p>
    <p>The objective of partnership is to carry on the following business:</p>
    <p style="margin-left:2em">${objectives}</p>

    <p><strong>5. Capital Contribution of the Partners</strong></p>
    <p>The total capital contribution of the partners in the firm shall be in the following proportions:</p>
    <ul>${capitalBullets}</ul>

    <p><strong>6. Managing Partners</strong></p>
    <p>The parties ${managingPartnersText} shall be the managing partner${pluralMgr ? 's' : ''} and ${pluralMgr ? 'are' : 'is'} authorized and empowered to do the following acts, deeds and things on behalf of the firm:</p>
    <ol>${managingPowersList}</ol>
    <p>The managing partners are empowered to borrow money as and when found necessary for the business from any nationalized or schedule bank/banks or any other financial institutions from time to time and execute necessary actions at all the times.</p>

    ${addlPts.trim() ? `
    <p><strong>7. Additional Terms</strong></p>
    <p>${escapeHTML(addlPts)}</p>
    ` : ''}

    <p><strong>${nextClause}. Banking</strong></p>
    <p>${bankingText}</p>

    <p><strong>${nextClause + 1}. Authorized Signatory</strong></p>
    <p>The partners, upon mutual consent of all the partners of this partnership deed appoint any another individual as the authorized signatory for entering into the agreements relating to sale and purchase of the land or/and building.</p>

    <p><strong>${nextClause + 2}. Working Partners and Remuneration</strong></p>
    <p>That all the partners shall be working partners of the firm and shall be bound to devote full time and attention to the partnership business and shall be actively engaged in conducting the affairs of the firm and therefore it has been agreed to pay salary/remuneration for the services rendered as per the provisions under section 40(b) of the Income Tax Act, 1961.</p>

    <p><strong>${nextClause + 3}. Interest on Capital</strong></p>
    <p>That the interest at the rate of ${rate}% per annum or as may be prescribed u/s.40(b)(iv) of the Income Tax Act, 1961 shall be payable to the partners on the amount standing to the credit of the account of the partners.</p>

    <p><strong>${nextClause + 4}. Books of Accounts</strong></p>
    <p>The books of accounts of the partnership shall be maintained at the principal place of business and the same shall be closed on the <strong>${acctYear}</strong> every year.</p>

    <p><strong>${nextClause + 5}. Profit and Loss Sharing</strong></p>
    <p>That the share of the profits or losses of partnership business after taking into account all business and incidental expenses will be as follows:</p>
    <ul>${profitBullets}</ul>

    <p><strong>${nextClause + 6}. Retirement</strong></p>
    <p>Any partner desirous of retiring from the partnership during its continuance can exercise his/her right by giving ${notice} calendar months&rsquo; notice to the other partner(s).</p>

    <p><strong>${nextClause + 7}. Death, Retirement or Insolvency</strong></p>
    <p>Death, retirement or insolvency of any of the partners shall not dissolve the partnership.</p>

    <p><strong>${nextClause + 8}. Arbitration</strong></p>
    <p>Any dispute that may arise between the partners shall be referred to an arbitrator whose award shall be final and binding on the parties MUTATIS MUTANDIS.</p>

    <p><strong>${nextClause + 9}. Applicable Law</strong></p>
    <p>The provision of the Partnership Act, 1932 as in vogue from time to time shall apply to this partnership except as otherwise stated above.</p>

    <p><strong>${nextClause + 10}. Amendments</strong></p>
    <p>Any of the terms of this Deed may be amended, abandoned or otherwise be dealt with according to the necessities of the business and convenience of the partners and they shall be reduced to writing on Rs. 100/- stamp paper.</p>

    <br><br>

    <p><strong>IN WITNESS WHEREOF</strong> the parties hereto have set hands on this the <strong>${date}</strong>.</p>

    <table style="width:100%; margin-top:2em; border-collapse:collapse;">
      <tr>
        <td style="vertical-align:top; width:50%; padding:0 1em;">
          <p><strong>WITNESSES</strong></p><br>
          <p>1. ________________________</p><br>
          <p>2. ________________________</p>
        </td>
        <td style="vertical-align:top; width:50%; padding:0 1em;">
          <p><strong>Partners</strong></p><br>
          ${partnerSigRows}
        </td>
      </tr>
    </table>
  `;
}

// ── Print Page Inner ────────────────────────────────────────────────────────

function PrintPageInner() {
  const searchParams = useSearchParams();
  const deedId = searchParams.get('id');
  const [deed, setDeed] = useState<Deed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!deedId) {
      setError('No deed ID provided.');
      setLoading(false);
      return;
    }

    dbGetDeedById(deedId)
      .then((d) => {
        setDeed(d);
        setLoading(false);
      })
      .catch((err) => {
        setError(err?.message || 'Failed to load deed.');
        setLoading(false);
      });
  }, [deedId]);

  // Auto-trigger print after deed is loaded
  useEffect(() => {
    if (!deed || loading || error) return;
    // Short delay to let the browser render
    const timer = setTimeout(() => window.print(), 500);
    return () => clearTimeout(timer);
  }, [deed, loading, error]);

  const html = useMemo(() => {
    if (!deed) return '';
    return buildDeedHTML(deed);
  }, [deed]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white font-body">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="mt-3 text-sm text-navy-500">Loading deed...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white font-body">
        <div className="text-center">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-red-500 text-xl font-bold">!</span>
          </div>
          <h1 className="text-lg font-bold text-navy-900 mb-2">Error</h1>
          <p className="text-sm text-navy-500">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Print-only styles */}
      <style jsx global>{`
        @media print {
          body {
            margin: 0;
            padding: 0;
          }
          .print-toolbar {
            display: none !important;
          }
          .print-content {
            padding: 0 !important;
            max-width: 100% !important;
            border: none !important;
            box-shadow: none !important;
          }
        }
        @media screen {
          .print-content {
            max-width: 800px;
            margin: 0 auto;
            padding: 40px;
            line-height: 1.7;
            font-size: 12pt;
            color: #1a1a2e;
            font-family: 'DM Serif Display', 'Georgia', serif;
          }
          .print-content p {
            margin: 0.5em 0;
          }
          .print-content h1 {
            font-family: 'DM Serif Display', 'Georgia', serif;
          }
          .print-content ul, .print-content ol {
            margin: 0.5em 0;
            padding-left: 2em;
          }
          .print-content li {
            margin: 0.3em 0;
          }
          .print-content table {
            margin-top: 2em;
          }
        }
      `}</style>

      {/* Screen-only toolbar */}
      <div className="print-toolbar bg-navy-50 border-b border-navy-100 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-accent rounded-lg flex items-center justify-center text-navy-900 font-black text-sm">
            O
          </div>
          <span className="font-bold text-navy-800">Partnership Deed - Print Preview</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.print()}
            className="px-5 py-2.5 bg-accent text-white font-semibold rounded-lg text-sm hover:bg-accent-dark transition-colors"
          >
            Print / Save as PDF
          </button>
          <button
            onClick={() => window.close()}
            className="px-5 py-2.5 border border-navy-200 text-navy-600 rounded-lg text-sm hover:bg-navy-50 transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      {/* Deed content */}
      <div
        className="print-content"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </>
  );
}

// ── Export with Suspense wrapper ─────────────────────────────────────────────

export default function PrintPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-white font-body">
          <div className="text-center">
            <div className="inline-block w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <p className="mt-3 text-sm text-navy-500">Loading...</p>
          </div>
        </div>
      }
    >
      <PrintPageInner />
    </Suspense>
  );
}
