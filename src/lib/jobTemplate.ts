import { Job } from '../types';
import { jobIdentity } from './jobImport';
import { timestampToDateInput } from './format';

/**
 * The downloadable import template, the AI instruction block, and job export.
 *
 * Export writes the SAME shape the importer reads, so the round trip works:
 * export -> edit (by hand or with an AI) -> import -> updates in place.
 *
 * >>> KEEP IN SYNC WITH api/_lib/jobGate.ts <
 *
 * The filter words listed in the prompt below are a HAND-COPY of the
 * UNSELLABLE_TITLE and VAGUE_TITLE patterns in that file. They have already
 * drifted apart once — the patterns were widened and this text was not, so the
 * template documented twenty filter words when the code enforced thirty-seven,
 * and its own example section was silently being dropped.
 *
 * If you edit either pattern there, edit the list here in the same commit.
 */

/** The four ids that exist on a fresh install, used when no list is supplied. */
const FALLBACK_CATEGORY_IDS = ['government', 'corporate', 'internship', 'exam'];

function categoryList(ids?: string[]): string {
  const list = ids && ids.length > 0 ? ids : FALLBACK_CATEGORY_IDS;
  return list.join(', ');
}

/**
 * Paste this to an AI along with the template file, or with an export of your
 * real jobs when refreshing existing content.
 *
 * @param categoryIds The portal's real category ids, so the AI is told the
 *   actual options rather than the original four.
 */
export function buildAiPrompt(categoryIds?: string[]): string {
  return `You are filling in a job-listing import file for an Indian job portal.

Return ONLY a JSON array of job objects. No commentary, no explanation, and no
markdown code fences.

FREE VERSUS PAID — READ THIS FIRST.
This portal has a paywall, and where you put information decides whether a
reader sees it for free or has to pay for it. The split is enforced on the
server: paid fields are removed from the response entirely for a reader without
a subscription, so anything you put in them is genuinely hidden.

  FREE, shown to everyone:
    title, category, companyName, companyLogo, location, salary, experience,
    workMode, skills, notificationDate, applicationStartDate,
    applicationEndDate, examDate, ageLimit, educationalQualification

  PAID, shown only to subscribers:
    examDetails, studyMaterial, customSections, linkButtons

A reader without a subscription sees a panel listing WHAT a listing contains —
"Exam pattern and details", "Study material", the TITLE of each custom section,
and a count of official links. That panel is the entire sales pitch, so the
titles you choose decide whether anyone pays.

THE SELLABILITY FILTER — the part most files get wrong.
A custom section is DROPPED from that panel, silently, in three cases:

  1. Its title CONTAINS any of these words, in any position:

       date, dates, deadline, deadlines, timeline, schedule, window,
       application, apply, stage, status, current, closed, open, live,
       eligibility, age, qualification, qualifications, educational,
       salary, pay scale, stipend, location, venue, work mode, experience,
       vacancy, vacancies, note, notes, disclaimer, attention, caution,
       warning, important

     Every one of these either restates a field the reader already has for
     free, or advertises a caveat, or names a bare fact rather than knowledge.
     A paid row promising "Important Dates" sits on the same screen as the free
     dates, and the only conclusion available to the reader is that the paywall
     is padded.

     This catches more than you expect. "Application Fee" is dropped on
     "application"; call it "Fee Structure" instead. "Post Details and
     Vacancies" is dropped on "vacancies"; call it "Post-wise Reservation
     Breakup". Choose a title that names what the section TEACHES, not what
     it lists.

  2. Its title is one of these generic words ON ITS OWN, with nothing else:
     Post, Posts, Detail, Details, Other, Others, Info, Information, General,
     Misc, Miscellaneous, About, Summary, Overview, Content, Data, Update,
     Updates. A longer title containing one of them is fine as long as it
     passes rule 1 — "Bond Details" is kept, "Details" is not.

  3. Its content is under 25 characters. A perfect title with "05 posts"
     underneath it is a label, not a section.

TITLES THAT WORK, as a guide: Selection Process, Fee Structure, Physical
Standards, Medical Standards, Syllabus Breakdown, Reservation Breakup, Document
Checklist, Exam Centres, Interview Rounds, Training Period, Probation Terms,
Post-wise Reservation Breakup, Marking Scheme.

Dropped sections still render in full for a paying subscriber. They are simply
not advertised as reasons to buy. So a dropped section is not lost — it just
does no work for you.

Rules that follow from all of the above:
- NEVER put information into customSections that already has a free field.
- Do NOT put disclaimers or "verify against the official advertisement" notes
  into customSections. Put such a note at the END of educationalQualification,
  which is free.
- customSections are for SUBSTANTIVE preparation content with no dedicated
  field: selection process, syllabus detail, fee structure, physical or medical
  standards, exam centre lists, reservation breakup, document checklist.
- Give each section a SPECIFIC title and at least two or three real sentences
  of content.
- FEWER REAL SECTIONS BEAT MORE PADDING. If a posting genuinely has no
  preparation depth — many private-sector roles do not — return no
  customSections at all. An empty promise behind a paywall is worse than no
  promise.

Remaining rules:
- Always return an array, even for a single job.
- Use ONLY the field names shown in the template. Do not invent new fields.
- If you do not know a value, LEAVE THE FIELD OUT. Never guess a date, a URL or
  a company name.
- refCode: a short stable lowercase slug identifying the posting, built from
  organisation + role + year, e.g. "ssc-cgl-2026" or "ibps-po-2026-mains".
  ALWAYS include it, and when editing an EXPORTED file keep every refCode
  exactly as it came out — that is what makes a row update the existing job
  instead of creating a duplicate.
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
- onHold / holdLabel / holdNote: DO NOT SET THESE. They mark a finished listing
  that an admin has chosen to keep visible (results pending, counselling under
  way) and are decided in the admin panel, never by you. Omitting them leaves
  any existing hold untouched, which is always the correct behaviour here.
- companyLogo: leave it out unless you have a real image URL.`;
}

/** Default prompt using the built-in category ids. */
export const AI_PROMPT = buildAiPrompt();

function buildFieldGuide(categoryIds?: string[]): Record<string, string> {
  return {
    refCode: 'REQUIRED. Stable lowercase slug, e.g. "ssc-cgl-2026". Re-importing the same refCode updates that job instead of duplicating it. When editing an EXPORTED file, never change these.',
    title: 'FREE. REQUIRED for new jobs. Full posting title.',
    category: 'FREE. REQUIRED for new jobs. One of: ' + categoryList(categoryIds) + '. Use the id exactly as written — an unknown category is rejected.',
    companyName: 'FREE. Organisation or company name.',
    companyLogo: 'FREE. Full https:// image URL. Leave out if you do not have a real one — a letter tile is shown instead.',
    location: 'FREE. e.g. "New Delhi" or "All India".',
    salary: 'FREE. Free text, e.g. "Rs 35,400 - 1,12,400".',
    experience: 'FREE. Free text, e.g. "0-2 years" or "Freshers".',
    workMode: 'FREE. One of: onsite, hybrid, remote, or "".',
    skills: 'FREE. List of strings, e.g. ["Reasoning", "Quantitative Aptitude"].',
    notificationDate: 'FREE. YYYY-MM-DD or null.',
    applicationStartDate: 'FREE. YYYY-MM-DD or null.',
    applicationEndDate: 'FREE. YYYY-MM-DD or null. The last day to apply is inclusive.',
    examDate: 'FREE. YYYY-MM-DD or null. The date of the exam itself. When set, the listing stays live until this day (inclusive) even after applications have closed, and the closed application date is still shown truthfully. For multi-stage exams give the LAST stage you know of. Omit it if there is no exam or the date has not been announced.',
    ageLimit: 'FREE. Rich text. Kept free deliberately: it is how a reader decides whether the listing applies to them at all.',
    educationalQualification: 'FREE. Rich text. Also free for the same reason. Put any "verify against the official advertisement" caveat at the end of this field rather than in a paid section.',
    examDetails: 'PAID. Rich text. Exam pattern, marks, duration, negative marking. This is the description of the exam, not its date — the date goes in examDate.',
    studyMaterial: 'PAID. Rich text. Preparation resources, book lists, previous papers.',
    customSections: 'PAID. List of { "title", "content" }. Titles are the paywall sales pitch, BUT a section is dropped from that pitch when its title CONTAINS any of: date, dates, deadline, timeline, schedule, window, application, apply, stage, status, current, closed, open, live, eligibility, age, qualification, educational, salary, pay scale, stipend, location, venue, work mode, experience, vacancy, vacancies, note, disclaimer, attention, caution, warning, important — or when its title is a bare generic word on its own (Post, Details, Other, Summary, Update...) — or when its content is under 25 characters. Note that "Application Fee" is dropped; use "Fee Structure". Dropped sections still render for subscribers — they just stop selling.',
    linkButtons: 'PAID. List of { "text", "url", "bgColor", "textColor" }. Colours are optional and default to the site purple. url must be https://, mailto: or tel: and must contain the URL only.',
    onHold: 'true or false. OPTIONAL, and normally left out. Marks a listing whose dates have passed but which should stay out of the Expired tab (result pending, counselling under way). LEAVING IT OUT NEVER CHANGES A JOB\'S HOLD STATE, in merge or replace mode — to release jobs in bulk you must say "onHold": false explicitly. Setting it to true REQUIRES holdLabel in the same entry.',
    holdLabel: 'REQUIRED when onHold is true. SHOWN PUBLICLY on the job card in place of the usual status line, e.g. "Result awaited" or "Interview stage". Keep it under ' + String(60) + ' characters — longer labels are shortened. Do not put anything private here.',
    holdNote: 'Optional PRIVATE reminder for admins only, never shown to users, e.g. "chase SSC helpdesk in August". Cleared automatically when the job is released.',
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
    // The caveat lives here, in a FREE field. Paywalling a disclaimer reads as
    // hiding the small print — and a section titled "Please Note" would be
    // dropped from the sales panel anyway.
    educationalQualification: "Bachelor's degree in any discipline from a recognised university.\nFinal-year students may apply provided they produce proof of passing before the document verification stage.\n\nPlease verify all requirements against the official notification before applying.",
    examDetails: '<b>Tier 1</b> - Objective, 100 questions, 200 marks, 60 minutes.<br><b>Tier 2</b> - Paper I compulsory for all posts.<br>Negative marking of 0.50 marks per wrong answer in Tier 1.',
    studyMaterial: '<ul><li>Previous 10 years solved papers</li><li>NCERT Mathematics classes 8-10</li><li>Daily current affairs for the last 12 months</li></ul>',
    /**
     * Both titles clear all three filter rules, which is the point of showing
     * them. "Fee Structure" is deliberately NOT "Application Fee" — that older
     * wording was dropped on the word "application", and an example that fails
     * the rules it demonstrates teaches exactly the wrong thing.
     *
     * Note also what is absent: no "Important Dates" section, because the four
     * date fields above already cover it and are free.
     */
    customSections: [
      {
        title: 'Selection Process',
        content: '1. Tier 1 - Computer Based Examination\n2. Tier 2 - Computer Based Examination\n3. Document Verification\n4. Final merit list',
      },
      {
        title: 'Fee Structure',
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
    // ONE real section with real content, not three padded ones. A
    // private-sector role with no exam has little to sell beyond this, and that
    // is fine — inventing filler to fatten the paywall panel is what loses trust.
    customSections: [
      {
        title: 'Interview Rounds',
        content: 'Online assessment, then technical interview, then HR discussion. The online assessment covers quantitative aptitude, logical reasoning, verbal ability and pseudocode.',
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
        'TO REFRESH YOUR EXISTING JOBS: export them from Manage Jobs, hand that file to an AI together with "_aiPrompt" from here, and import the result. The export uses this exact shape and already carries each job\'s refCode, so rows update in place. Never rewrite a refCode — that is what turns an update into a duplicate.',
        'FREE VERSUS PAID: title, category, company, location, salary, experience, work mode, skills, all four dates, ageLimit and educationalQualification are shown to EVERYONE. examDetails, studyMaterial, customSections and linkButtons are shown only to subscribers, and are removed from the response entirely for anyone else.',
        'THE PAYWALL PANEL: a reader without a subscription sees a list of what a listing contains — the title of each custom section, whether exam details and study material exist, and how many official links there are. Those titles are the sales pitch.',
        'SECTIONS CAN BE DROPPED FROM THAT PANEL. A custom section does not appear when its title CONTAINS any of: date, dates, deadline, timeline, schedule, window, application, apply, stage, status, current, closed, open, live, eligibility, age, qualification, educational, salary, pay scale, stipend, location, venue, work mode, experience, vacancy, vacancies, note, disclaimer, attention, caution, warning, important. Also dropped when the title is a bare generic word on its own ("Post", "Details", "Other", "Summary", "Update"), or when its content is under 25 characters.',
        'THE FILTER CATCHES MORE THAN YOU EXPECT. "Application Fee" is dropped on "application" — use "Fee Structure". "Post Details and Vacancies" is dropped on "vacancies" — use "Post-wise Reservation Breakup". Name a section for what it TEACHES, not for what it lists. Dropped sections still render in full for a subscriber; they simply stop doing any selling.',
        'HOW EXPIRY WORKS: a listing stays live until its examDate when one is set, otherwise until its applicationEndDate. Both days are inclusive. Set examDate on any recruitment decided by an exam and the listing will survive the application deadline instead of expiring on it.',
        'HOLD IS NEVER CLEARED BY OMISSION. A job put On Hold in the admin panel stays held no matter what you import, unless an entry says "onHold": false. That is true in replace mode too, where every other missing field IS cleared - a bulk content refresh must not be able to release a hold by accident. To release in bulk, add "onHold": false to those entries.',
        'MERGE MODE ONLY WRITES FIELDS YOU INCLUDE. To REMOVE bad custom sections from an existing job you must send "customSections" with the corrected array — omitting it leaves the old ones in place.',
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
  /**
   * Hold is emitted ONLY when the job is actually held.
   *
   * Writing "onHold": false on every ordinary row would be noise on an export
   * of 200 jobs, and worse, re-importing it would take the explicit-release
   * path on every single one — pointless writes that also reset holdLabel and
   * heldAt. Omitting it means an unheld job round-trips as a no-op.
   *
   * When the job IS held, both onHold and holdLabel are written together,
   * because the importer rejects one without the other. heldAt rides along for
   * completeness (Backup/Restore keeps the clock) and is ignored on import.
   */
  if (job.onHold) {
    row.onHold = true;
    row.holdLabel = job.holdLabel || '';
    put('holdNote', job.holdNote);
    put('heldAt', job.heldAt);
  }
  /**
   * NOTE ON `locked` AND `contentSummary`: api/jobs.ts attaches both to every
   * job it returns, so they are present on the objects ManageJobs holds. They
   * are deliberately NOT emitted here — this function builds from an explicit
   * field list, so server-supplied display state can never leak into a file and
   * come back as a stored field on re-import.
   */
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