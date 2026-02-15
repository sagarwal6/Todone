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
        <p className="text-on-surface-variant text-sm mb-8">Last updated: February 15, 2026</p>

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
              Todone will never send emails, create calendar events, or modify contacts
              through the Google API on your behalf. Todone&apos;s use of Google data is governed
              by the{' '}
              <a href="https://developers.google.com/terms/api-services-user-data-policy" className="text-primary underline" target="_blank" rel="noopener noreferrer">Google API Services User Data Policy</a>,
              including the Limited Use requirements.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-medium text-on-surface mb-3">3. AI-Generated Content</h2>
            <p>
              Todone uses AI (Anthropic Claude, Google Gemini) to research tasks and prepare
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
              <li>Exceed reasonable usage limits (rate limits are enforced per account)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-medium text-on-surface mb-3">6. Limitation of Liability</h2>
            <p>
              Todone is provided &quot;as is&quot; without warranties of any kind. We are not
              liable for any damages arising from your use of the service, including but not
              limited to actions taken based on AI-generated content. Always verify important
              information independently.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-medium text-on-surface mb-3">7. Termination</h2>
            <p>
              You may stop using Todone at any time by signing out and revoking Google access.
              We may suspend or terminate your access if you violate these terms or if required
              by law. Upon termination, you can request deletion of all your data via your
              account settings or by contacting{' '}
              <a href="mailto:support@todone.app" className="text-primary underline">support@todone.app</a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-medium text-on-surface mb-3">8. Age Requirement</h2>
            <p>
              You must be at least 13 years old to use Todone. By using the service, you
              represent that you meet this age requirement.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-medium text-on-surface mb-3">9. Changes</h2>
            <p>
              We may update these terms from time to time. If we make material changes, we
              will notify you by email or by a prominent notice within the app at least 30 days
              before the changes take effect. Continued use of Todone after the effective date
              constitutes acceptance of the updated terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-medium text-on-surface mb-3">10. Contact</h2>
            <p>
              Questions about these terms? Contact us at{' '}
              <a href="mailto:support@todone.app" className="text-primary underline">support@todone.app</a>.
            </p>
          </section>

        </div>
      </div>
    </div>
  );
}
