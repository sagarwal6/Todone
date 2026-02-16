import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Service - Todone',
  description: 'Terms of service for Todone',
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-surface">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <Link href="/" className="text-primary text-sm mb-8 inline-block">&larr; Back to Todone</Link>

        <h1 className="text-3xl font-medium text-on-surface mb-2">Terms of Service</h1>
        <p className="text-on-surface-variant text-sm mb-8">Last updated: February 16, 2026</p>

        <div className="space-y-8 text-on-surface/90 text-[15px] leading-relaxed">

          <section>
            <h2 className="text-xl font-medium text-on-surface mb-3">1. Service Description</h2>
            <p>
              Todone is an AI-powered task assistant that connects to your Google Workspace
              to help you research and complete tasks. The service is provided as-is.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-medium text-on-surface mb-3">2. Google Account Access</h2>
            <p>
              By signing in with Google, you grant Todone read-only access to your Gmail,
              Calendar, and Contacts. You can revoke this access at any time via{' '}
              <a href="https://myaccount.google.com/permissions" className="text-primary underline" target="_blank" rel="noopener noreferrer">Google Account Permissions</a>.
              Todone currently does not send emails, create calendar events, or modify contacts
              through the Google API on your behalf. If this changes, updated scopes will require
              your explicit consent via Google&apos;s authorization flow. Todone&apos;s use of Google data is governed
              by the{' '}
              <a href="https://developers.google.com/terms/api-services-user-data-policy" className="text-primary underline" target="_blank" rel="noopener noreferrer">Google API Services User Data Policy</a>,
              including the Limited Use requirements.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-medium text-on-surface mb-3">3. AI-Generated Content</h2>
            <p>
              Todone uses third-party AI services to research tasks and prepare
              drafts. AI-generated content may contain errors. You are responsible for reviewing
              and verifying all information before acting on it. Todone always requires your
              explicit confirmation before any action is taken (sending emails, creating events).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-medium text-on-surface mb-3">4. Your Data</h2>
            <p>
              You retain ownership of all your data. See our{' '}
              <Link href="/privacy" className="text-primary underline">Privacy Policy</Link>{' '}
              for details on how data is accessed, used, and stored. You can delete your
              account and all associated data at any time.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-medium text-on-surface mb-3">5. Acceptable Use</h2>
            <p>You agree not to:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>Use Todone for any unlawful purpose</li>
              <li>Attempt to access other users&apos; data</li>
              <li>Reverse-engineer or exploit the service</li>
              <li>Exceed reasonable usage limits</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-medium text-on-surface mb-3">6. Usage Limits &amp; Pricing</h2>
            <p>
              Todone enforces per-account usage limits (rate limits) to ensure fair access and
              manage operating costs. These limits may change over time. If you exceed your
              usage limit, access to AI features may be temporarily restricted until the limit resets.
            </p>
            <p className="mt-3">
              Todone is currently available at no cost during the early access period. We reserve
              the right to introduce paid plans in the future. If we do, you will be notified in
              advance and will not be charged without your explicit consent. Free access may be
              subject to reduced usage limits compared to paid plans.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-medium text-on-surface mb-3">7. Limitation of Liability</h2>
            <p>
              Todone is provided &quot;as is&quot; without warranties of any kind. We are not
              liable for any damages arising from your use of the service, including but not
              limited to actions taken based on AI-generated content. Always verify important
              information independently.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-medium text-on-surface mb-3">8. Termination</h2>
            <p>
              You may stop using Todone at any time by signing out and revoking Google access.
              We may suspend or terminate your access if you violate these terms or if required
              by law. Upon termination, you can request deletion of all your data via your
              account settings or by{' '}
              <a href="CONTACT_FORM_URL" className="text-primary underline" target="_blank" rel="noopener noreferrer">contacting us</a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-medium text-on-surface mb-3">9. Age Requirement</h2>
            <p>
              You must be at least 13 years old to use Todone. By using the service, you
              represent that you meet this age requirement.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-medium text-on-surface mb-3">10. Changes</h2>
            <p>
              We may update these terms from time to time. If we make material changes, we
              will notify you by email or by a prominent notice within the app with reasonable
              advance notice before the changes take effect. Continued use of Todone after the effective date
              constitutes acceptance of the updated terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-medium text-on-surface mb-3">11. Contact</h2>
            <p>
              Questions about these terms?{' '}
              <a href="CONTACT_FORM_URL" className="text-primary underline" target="_blank" rel="noopener noreferrer">Contact us</a>.
            </p>
          </section>

        </div>
      </div>
    </div>
  );
}
