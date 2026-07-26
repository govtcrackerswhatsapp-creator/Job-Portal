import { Job } from '../types';
import { jobIdentity } from './jobImport';
import { timestampToDateInput } from './format';

/**
 * The downloadable import template, the AI instruction block, and job export.
 *
 * Export writes the SAME shape the importer reads, so the round trip works:
 * export -> edit (by hand or with an AI) -> import -> updates in place.
 *
 * CHANGED: the category list is no longer hardcoded into the prompt and field
 * guide. Categories are editable now, so the real ids are passed in and the
 * text is built around them — otherwise the template would tell an AI to use
 * four categories that may have been renamed, and every row would be rejected
 * with an error message listing the wrong options.
 */

/** The four ids that exist on a fresh install, used when no list is supplied. */
const FALLBACK_CATEGORY_IDS = ['government', 'corporate', 'internship', 'exam'];

function categoryList(ids?: string[]): string {
  const list = ids && ids.length > 0 ? ids : FALLBACK_CATEGORY_IDS;
  return list.join(', ');
}

/**
 * Paste this to an AI along with the template file.
 *
 * @param categoryIds The portal's real category ids, so the AI is told the
 *   actual options rather than the original four.
 */
export function buildAiPrompt(categoryIds?: string[]): string {
  return `You are filling in a job-listing import file for an Indian job portal.

Return ONLY a JSON array of job objects. No commentary, no explanation, and no
markdown code fences.

Rules:
- Always return an array, even for a single job.
- Use ONLY the field names shown in the template. Do not invent new fields.
- If you do not know a value, LEAVE THE FIELD OUT. Never guess a date, a URL or
  a company name.
- refCode: a short stable lowercase slug identifying the posting, built from
  organisation + role + year, e.g. "ssc-cgl-2026" or "ibps-po-2026-mains".
  ALWAYS include it. Re-importing the same refCode updates that job instead of
  creating a duplicate, so keep it identical for the same posting.
- Dates must be "YYYY-MM-DD". Omit the field if unknown.
- category: exactly one of ${categoryList(categoryIds)}. Use the id exactly as
  written. A row with an unknown category is rejected on import.
- examDate: the date of the exam itself. Include it whenever the recruitment is
  decided by an exam AND the date has been announced. It keeps the listing live
  until the exam is over, so a closed application window no longer expires the
  job. For a multi-stage exam give the LAST stage you know of. If the date has
  not been announced yet, leave the field out - never guess it.
- workMode: exactly one of onsite, hybrid, remote, or "".
- Rich text fields (ageLimit, educationalQualification, examDetails,
  studyMaterial, and section content) accept plain text with line breaks, or
  simple HTML: <b> <i> <u> <p> <br> <ul> <ol> <li> <a> <h3> <h4> <blockquote>.
  DO NOT use markdown - **bold** will show as literal asterisks.
- linkButtons: every url must start with https://, mailto: or tel:. Put ONLY
  the URL in "url" and the label in "text" - never both in the same field.
- companyLogo: leave it out unless you have a real image URL.
- customSections: use these for anything that does not fit a standard field
  (selection process, vacancy tables, fee details, important notes). There is
  no limit on how many you add, and they appear in the order you list them.`;
}

/** Default prompt using the built-in category ids. */
export const AI_PROMPT = buildAiPrompt();

function buildFieldGuide(categoryIds?: string[]): Record<string, string> {
  return {
    refCode: 'REQUIRED. Stable lowercase slug, e.g. "ssc-cgl-2026". Re-importing the same refCode updates that job instead of duplicating it.',
    title: 'REQUIRED for new jobs. Full posting title.',
    category: 'REQUIRED for new jobs. One of: ' + categoryList(categoryIds) + '. Use the id exactly as written — an unknown category is rejected.',
    companyName: 'Organisation or company name.',
    companyLogo: 'Full https:// image URL. Leave out if you do not have a real one — a letter tile is shown instead.',
    location: 'e.g. "New Delhi" or "All India".',
    salary: 'Free text, e.g. "Rs 35,400 - 1,12,400".',
    experience: 'Free text, e.g. "0-2 years" or "Freshers".',
    workMode: 'One of: onsite, hybrid, remote, or "".',
    skills: 'List of strings, e.g. ["Reasoning", "Quantitative Aptitude"].',
    notificationDate: 'YYYY-MM-DD or null.',
    applicationStartDate: 'YYYY-MM-DD or null.',
    applicationEndDate: 'YYYY-MM-DD or null. The last day to apply is inclusive.',
    examDate: 'YYYY-MM-DD or null. The date of the exam itself. When set, the listing stays live until this day (inclusive) even after applications have closed, and the closed application date is still shown truthfully. For multi-stage exams give the LAST stage you know of. Omit it if there is no exam or the date has not been announced.',
    ageLimit: 'Rich text. Plain text with line breaks, or simple HTML.',
    educationalQualification: 'Rich text.',
    examDetails: 'Rich text. Exam pattern, marks, duration. This is the description of the exam, not its date — the date goes in examDate.',
    studyMaterial: 'Rich text. Preparation resources.',
    customSections: 'List of { "title", "content" }. Unlimited, shown in the order given. Use for anything without a dedicated field.',
    linkButtons: 'List of { "text", "url", "bgColor", "textColor" }. Colours are optional and default to the site purple. url must be https://, mailto: or tel: and must contain the URL only.',
  };
}

const EXAMPLE_JOBS: Record<string, unknown>[] = [
  {
    refCode: 'ssc-cgl-2026',
    title: 'SSC CGL 2026 - Combined Graduate Level Examination',
    category: 'exam',
    companyName: 'Staff Selection Commission',
    location: 'All India',
    salary: 'Rs 35,400 - 1,12,400 (Level 6)',
    experience: 'Freshers',
    workMode: 'onsite',
    skills: ['Quantitative Aptitude', 'General Awareness', 'English Comprehension', 'Reasoning'],
    notificationDate: '2026-06-10',
    applicationStartDate: '2026-06-12',
    applicationEndDate: '2026-07-11',
    // Deliberately months after the application deadline: this is the case
    // examDate exists for. The listing stays live until 15 September while the
    // card honestly reports that applications closed on 11 July.
    examDate: '2026-09-15',
    ageLimit: '18 to 32 years as on 01/08/2026.\nAge relaxation: SC/ST 5 years, OBC 3 years, PwD 10 years.',
    educationalQualification: "Bachelor's degree in any discipline from a recognised university.\nFinal-year students may apply provided they produce proof of passing before the document verification stage.",
    examDetails: '<b>Tier 1</b> - Objective, 100 questions, 200 marks, 60 minutes.<br><b>Tier 2</b> - Paper I compulsory for all posts.<br>Negative marking of 0.50 marks per wrong answer in Tier 1.',
    studyMaterial: '<ul><li>Previous 10 years solved papers</li><li>NCERT Mathematics classes 8-10</li><li>Daily current affairs for the last 12 months</li></ul>',
    customSections: [
      {
        title: 'Selection Process',
        content: '1. Tier 1 - Computer Based Examination\n2. Tier 2 - Computer Based Examination\n3. Document Verification\n4. Final merit list',
      },
      {
        title: 'Application Fee',
        content: 'General / OBC: Rs 100\nSC / ST / PwD / Women: Exempted\nPayment via BHIM UPI, net banking, or debit/credit card.',
      },
    ],
    linkButtons: [
      { text: 'Official Notification', url: 'https://ssc.gov.in', bgColor: '#8b2df2', textColor: '#ffffff' },
      { text: 'Apply Online', url: 'https://ssc.gov.in/apply' },
    ],
  },
  {
    refCode: 'infosys-systems-engineer-2026',
    title: 'Systems Engineer - Fresher Hiring 2026',
    category: 'corporate',
    companyName: 'Infosys',
    location: 'Bengaluru, Pune, Hyderabad',
    salary: 'Rs 3.6 LPA - 4.5 LPA',
    experience: '0-1 years',
    workMode: 'hybrid',
    skills: ['Java', 'SQL', 'Data Structures', 'Communication'],
    notificationDate: '2026-07-01',
    applicationStartDate: '2026-07-01',
    applicationEndDate: '2026-08-20',
    // No examDate: this posting expires on its application deadline, which is
    // the other half of the rule.
    ageLimit: 'No specific age limit.',
    educationalQualification: 'B.E. / B.Tech / M.C.A. with a minimum of 60% aggregate and no active backlogs.',
    customSections: [
      {
        title: 'Interview Rounds',
        content: 'Online assessment, technical interview, then HR discussion.',
      },
    ],
    linkButtons: [
      { text: 'Apply on Careers Portal', url: 'https://www.infosys.com/careers' },
    ],
  },
];

/** The template file contents, as pretty JSON. */
export function buildTemplateFile(categoryIds?: string[]): string {
  return JSON.stringify(
    {
      _readme: [
        'TecKosh bulk job import template.',
        'Replace the two example entries in "jobs" with your real jobs, then import this file.',
        'You can also paste this whole file to an AI along with the prompt in "_aiPrompt".',
        'Fields not listed in "_fields" are ignored. id, createdAt and createdBy are set automatically.',
        'Export uses this exact same shape, so the round trip works: export, edit, re-import, and matching jobs update in place instead of duplicating.',
        'HOW EXPIRY WORKS: a listing stays live until its examDate when one is set, otherwise until its applicationEndDate. Both days are inclusive. Set examDate on any recruitment decided by an exam and the listing will survive the application deadline instead of expiring on it.',
      ],
      _aiPrompt: buildAiPrompt(categoryIds),
      _fields: buildFieldGuide(categoryIds),
      jobs: EXAMPLE_JOBS,
    },
    null,
    2,
  );
}

/** One job in import shape. Omits id / createdAt / createdBy — those are server-controlled. */
export function jobToExportRow(job: Job): Record<string, unknown> {
  const row: Record<string, unknown> = {
    refCode: jobIdentity(job),
    title: job.title || '',
    category: job.category,
  };
  const put = (k: string, v: unknown) => {
    if (v === undefined || v === null || v === '') return;
    if (Array.isArray(v) && v.length === 0) return;
    row[k] = v;
  };
  put('companyName', job.companyName);
  put('companyLogo', job.companyLogo);
  put('location', job.location);
  put('salary', job.salary);
  put('experience', job.experience);
  put('workMode', job.workMode);
  put('skills', job.skills);
  put('notificationDate', timestampToDateInput(job.notificationDate));
  put('applicationStartDate', timestampToDateInput(job.applicationStartDate));
  put('applicationEndDate', timestampToDateInput(job.applicationEndDate));
  // Placed next to the other dates so an exported file reads in timeline order.
  put('examDate', timestampToDateInput(job.examDate ?? null));
  put('ageLimit', job.ageLimit);
  put('educationalQualification', job.educationalQualification);
  put('examDetails', job.examDetails);
  put('studyMaterial', job.studyMaterial);
  put('customSections', job.customSections);
  put('linkButtons', job.linkButtons);
  return row;
}

export function buildJobsExport(jobs: Job[]): string {
  return JSON.stringify({ jobs: jobs.map(jobToExportRow) }, null, 2);
}

/** Same download mechanism BackupRestore uses. */
function downloadJson(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const stamp = () => new Date().toISOString().slice(0, 10);

export function downloadTemplate(categoryIds?: string[]): void {
  downloadJson('teckosh-job-import-template.json', buildTemplateFile(categoryIds));
}

/**
 * @param label   Which tab the export came from, e.g. 'active' or 'expired'.
 * @param rangeLabel Optional date-range slug, e.g. '30d' or '2026-06-01_2026-06-30'.
 *   Included in the filename so successive exports do not overwrite each other
 *   in the downloads folder.
 */
export function downloadJobsExport(jobs: Job[], label: string, rangeLabel?: string): void {
  const parts = ['teckosh-jobs', label];
  if (rangeLabel) parts.push(rangeLabel);
  parts.push(stamp());
  downloadJson(parts.join('-') + '.json', buildJobsExport(jobs));
}