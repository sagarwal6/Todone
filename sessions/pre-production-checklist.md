# Pre-Production Checklist

> Complete before submitting for Google Cloud security review.

## Google Cloud Console
- [ ] Set privacy policy URL on OAuth consent screen
- [ ] Set terms of service URL on OAuth consent screen
- [ ] Set app homepage URL on OAuth consent screen
- [ ] Verify authorized redirect URIs match production domain
- [ ] Verify OAuth scopes match code (`gmail.readonly`, `calendar.readonly`, `contacts.readonly`, `userinfo.email`, `userinfo.profile`)
- [ ] Verify domain ownership in Google Search Console

## Google App Verification
- [ ] Write scope justification for each sensitive/restricted scope (why the app needs it)
- [ ] Record video demo showing how each scope is used in the app
- [ ] Submit app for verification (moves out of "Testing" mode)
- [ ] **Restricted scope (`gmail.readonly`)**: Schedule annual security assessment with Google-empanelled assessor

## Content Placeholders
- [ ] Create Google Form for privacy/support contact — replace `CONTACT_FORM_URL` placeholders in `/app/privacy/page.tsx` and `/app/terms/page.tsx`
- [ ] Before public launch: update policy/terms change notice period from "reasonable advance notice" to a specific timeframe (e.g., 30 days)
- [ ] When feedback feature is built: add disclosure to privacy policy about collecting task, messages, and agent data with feedback submissions
- [ ] When adding write scopes: update privacy policy and terms (currently says "does not" send/create/modify)
- [ ] When adding new integrations: update privacy policy data access section and terms
- [ ] Before public launch: review all policy/terms language for accuracy against current features

## Code Cleanup
- [ ] Review remaining `console.log` statements in `lib/scan/metadata.ts` (debug `[SCAN]` logs)
- [ ] Add `public/robots.txt` (disallow crawling of API routes)

## Deployment
- [ ] Set all production environment variables (see `.env.local.example` and `CLAUDE.md`)
- [ ] `NEXTAUTH_URL` set to production URL (currently `localhost:3000`)
- [ ] Run Supabase migrations on production (`010_data_retention.sql`, `011_performance_indexes.sql`)
- [ ] Verify `pg_cron` extension is enabled on production Supabase
- [ ] Confirm `ENCRYPTION_SECRET` is set and matches any existing encrypted tokens

## Smoke Test (post-deploy)
- [ ] Sign in with Google — only readonly scopes on consent screen
- [ ] Create a task, run agent, verify Gmail/Calendar access works
- [ ] Visit `/privacy` and `/terms` — pages load
- [ ] Account menu: Privacy, Terms, Sign out, Delete account all work
- [ ] Delete test account — verify data removed
- [ ] Security headers present (`curl -I <url>`)
- [ ] PWA install and post-OAuth redirect (`/auth/complete`)

## References
- [Sensitive scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification)
- [Restricted scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)
- [Verification requirements](https://support.google.com/cloud/answer/13464321)
