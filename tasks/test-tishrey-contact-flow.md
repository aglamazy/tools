# Verify Tishrey contact-form admin notification end-to-end

**Created:** 2026-04-29
**Priority:** low
**Quadrant:** schedule
**Tags:** tishrey, qa, follow-up
**Repo:** aglamazo (verification task — actual project at `/home/yaakov/develop/Aglamaz/Tishrey`)

## Description

Follow-up verification of the email-notification work done on Tishrey on 2026-04-29. Pick this up on a later day to confirm the live behavior, separate from the implementation session.

Context: on 2026-04-29 we (a) added a reusable `src/services/email.ts` to Tishrey using nodemailer + the y25131@gmail.com SMTP sender, (b) wired `POST /api/contact` to notify business admin (suzi.aglamaz@gmail.com) on every form submission while still writing to Firestore for history, (c) configured tech-admin notifications (yaakov.aglamaz@gmail.com) for SMTP failures. The bouncing public address `tishrey.center@gmail.com` is a separate, unresolved decision (don't conflate).

## Acceptance Criteria

- [ ] Submit a real contact form at https://tishrey-center.co.il/#contact
- [ ] Confirm suzi.aglamaz@gmail.com receives the notification within ~1 minute, with submitter's name/phone/email/message readable in the body
- [ ] Confirm Reply-To on that email goes back to the submitter (not to y25131)
- [ ] Confirm the submission is also stored in Firestore `contactSubmissions` (admin panel `/admin` shows it)
- [ ] Force a failure case: temporarily break `SMTP_PASS` on Vercel, submit a form, confirm:
  - User still gets a 200 response (send failure does not block submission)
  - The submission still lands in Firestore
  - yaakov.aglamaz@gmail.com gets the tech-admin alert (or, if SMTP is fully broken, a Vercel function log captures it)
- [ ] Restore `SMTP_PASS`, submit one more time to confirm normal flow resumes
- [ ] Decide separately: what public-facing email address should replace the bouncing `tishrey.center@gmail.com` displayed on the site (suzi's personal Gmail is not a great public-facing answer — needs Agla + Suzi alignment)
