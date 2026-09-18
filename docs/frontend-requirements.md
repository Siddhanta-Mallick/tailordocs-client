# Tailored Resume Frontend Requirements

## Product Scope

Build a persistent history workspace for creating resumes tailored to job descriptions. The backend uses LLM calls and cosine-similarity scoring to assess fit.

The frontend release does not include authentication UI or backend authentication implementation. It must be designed to integrate with user-scoped authenticated APIs when available.

## Baseline Resume

- Users create a baseline resume through form fields corresponding to the canonical resume JSON schema.
- The baseline resume is stored in the database and can be retrieved later.
- PDF and DOCX upload/import are future work and are not part of this release.
- Historical tailoring runs always use the current baseline resume rather than a snapshot of the baseline at generation time.

## Job Description Input

- Users explicitly choose a job-description source: job-posting URL or manually pasted text.
- A URL is submitted to the backend scraping service.
- On successful scraping, display the extracted job description for user verification.
- If the extracted content is unacceptable, users must provide a manually pasted job description.
- If scraping fails, the backend returns an error and users must provide a manually pasted job description.
- Only the final verified job description is submitted for tailoring.

## Tailoring Generation

- Provide an optional free-form instruction field for tailoring constraints, such as areas to emphasize.
- Submit the current baseline resume, verified job description, and optional instruction to the generation endpoint.
- The backend returns the completed generated resume as canonical JSON in one response; streaming and asynchronous polling are out of scope.
- Preserve the user inputs on generation failure, show error details, and allow retry.
- Do not save model instructions in tailoring history.

## Resume Editing And Preview

- The canonical resume JSON schema is available and defines all editable fields and ordering rules.
- Present a field-based editor for existing values only. Adding or removing sections, entries, or bullets is out of scope.
- Keep generated-resume edits local until the user explicitly saves.
- Warn users before leaving or closing the page when local edits are unsaved.
- Resume JSON validation is server-side only. Display server validation errors returned during save or PDF generation.
- Render a responsive, faithful HTML/CSS preview that closely matches Jake's LaTeX resume template. The backend-generated PDF is the canonical output.

## History

- A tailoring run becomes a history item only after explicit Save.
- Save the job URL or final job description, edited resume JSON, and selected metadata.
- Do not save the optional model instruction.
- Saved records must provide view, edit, and PDF-download actions.
- Saved record metadata includes job title, company, created/updated dates, and fit score when supplied by the backend.

## PDF Download

- Submit the current edited resume JSON to the backend for LaTeX and PDF conversion.
- The backend stores generated PDFs in S3 and returns a temporary download URL.
- Preserve local edits and offer retry when PDF conversion fails.

## Required Backend Contracts

- Baseline profile create, retrieve, and update endpoints.
- Job URL scraping endpoint that returns extracted content or a failure response.
- Tailoring-generation endpoint accepting a baseline, verified job description, and optional instruction, and returning canonical resume JSON and fit score.
- Tailoring history save, list, retrieve, and resume-JSON update endpoints.
- PDF-generation endpoint accepting edited resume JSON and returning an expiring S3 URL.
- Consistent server-side validation and error payloads for resume saving and PDF generation.
- User-scoped authenticated API contract before production data handling ships.

## Accepted Tradeoffs

- History cannot precisely reproduce past results after the baseline resume changes, because each run references the current baseline.
- Invalid local edits are detected only after a server request.
- Model instructions cannot be recovered from saved history.

## Approved Workspace Direction

- The selected interface is the Document workshop: an independently scrollable editing panel alongside a persistent, independently scrollable HTML resume preview.
- The editing panel uses three switchable sections: Job description, Edit details, and Custom prompt.
- This layout intentionally supports manually pasted job descriptions only. Job-posting URL scraping remains a backend capability but is not exposed in this workspace direction.
- Edit details exposes the canonical resume JSON fields, including contact links, objective, education, skills, projects, and project bullet points. Users can add education, skill, project, and bullet-point entries; this supersedes the earlier no-add/remove release constraint.
- Changes to resume fields update the HTML preview immediately and remain local until explicitly saved.
- Custom prompts support post-generation refinement requests such as STAR-method rewrites, tone changes, or additional project facts. They are sent to the LLM for refinement and are never stored in tailoring history.
