import { Job } from '../types';
import { jobIdentity } from './jobImport';
import { timestampToDateInput } from './format';

/**
 * The downloadable import template, the AI instruction block, and job export.
 *
 * Export writes the SAME shape the importer reads, so the round trip works:
 * export -> edit (by hand or with an AI) -> import -> updates in place.
 */

/** Paste this to an AI along with the template file. */
export const AI_PROMPT = `You are filling in a job-listing import file for an Indian job portal.

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
- category: exactly one of government, corporate, internship, exam.
- workMode: exactly one of onsite, hybrid, remote, or "".
- Rich text fields (ageLimit, educationalQualification, examDetails,
  studyMaterial, and section content) accept plain text with line breaks, or
  simple HTML: <b> <i> <u> <p> <br> <ul> <ol> <li> <a> <h3> <h4> <blockquote>.
  DO NOT use markdown - **bold** will show as literal asterisks.
- linkButtons: every url must start with https://, mailto: or tel:.
- companyLogo: leave it out unless you have a real image URL.
- customSections: use these for anything that does not fit a standard field
  (selection process, vacancy tables, fee details, important notes). There is
  no limit on how many you add, and they appear in the order you list them.`;

const FIELD_GUIDE: Record<string, string> = {
  refCode: 'REQUIRED. Stable lowercase slug, e.g. "ssc-cgl-2026". Re-importing the same refCode updates that job instead of duplicating it.',
  title: 'REQUIRED for new jobs. Full posting title.',
  category: 'REQUIRED for new jobs. One of: government, corporate, internship, exam.',
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
  ageLimit: 'Rich text. Plain text with line breaks, or simple HTML.',
  educationalQualification: 'Rich text.',
  examDetails: 'Rich text. Exam pattern, marks, duration.',
  studyMaterial: 'Rich text. Preparation resources.',
  customSections: 'List of { "title", "content" }. Unlimited, shown in the order given. Use for anything without a dedicated field.',
  linkButtons: 'List of { "text", "url", "bgColor", "textColor" }. Colours are optional and default to the site purple. url must be https://, mailto: or tel:.',
};

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
export function buildTemplateFile(): string {
  return JSON.stringify(
    {
      _readme: [
        'TecKosh bulk job import template.',
        'Replace the two example entries in "jobs" with your real jobs, then import this file.',
        'You can also paste this whole file to an AI along with the prompt in "_aiPrompt".',
        'Fields not listed in "_fields" are ignored. id, createdAt and createdBy are set automatically.',
      ],
      _aiPrompt: AI_PROMPT,
      _fields: FIELD_GUIDE,
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

export function downloadTemplate(): void {
  downloadJson('teckosh-job-import-template.json', buildTemplateFile());
}

export function downloadJobsExport(jobs: Job[], label: string): void {
  downloadJson('teckosh-jobs-' + label + '-' + stamp() + '.json', buildJobsExport(jobs));
}