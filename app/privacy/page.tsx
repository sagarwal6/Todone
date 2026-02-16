import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy - Todone',
  description: 'How Todone handles your data',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-surface">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <Link href="/" className="text-primary text-sm mb-8 inline-block">&larr; Back to Todone</Link>

        <h1 className="text-3xl font-medium text-on-surface mb-2">Privacy Policy</h1>
        <p className="text-on-surface-variant text-sm mb-8">Last updated: February 16, 2026</p>

        <div className="space-y-8 text-on-surface/90 text-[15px] leading-relaxed">

          <section>
            <h2 className="text-xl font-medium text-on-surface mb-3">What Todone Does</h2>
            <p>
              Todone is an AI-powered task assistant that connects to your Google Workspace
              (Gmail, Calendar, Contacts) to help you get things done. You add tasks; Todone
              researches and prepares actions, always requiring your confirmation before anything
              is sent or created.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-medium text-on-surface mb-3">What Data We Access</h2>
            <p className="mb-3">When you sign in with Google, Todone requests <strong>read-only</strong> access to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Gmail</strong> (read-only) — search and read emails to help with your tasks</li>
              <li><strong>Google Calendar</strong> (read-only) — view events and check availability</li>
              <li><strong>Google Contacts</strong> (read-only) — look up contact information</li>
              <li><strong>Profile info</strong> — your name and email for your account</li>
            </ul>
            <p className="mt-3">
              Todone currently <strong>does not</strong> send emails, create calendar events, or modify your
              contacts through the API. Write actions (replying to email, creating events) open
              Google&apos;s native interface for you to complete yourself. If write capabilities are
              added in the future, they will require your explicit consent.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-medium text-on-surface mb-3">How Your Data Is Used</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Email and calendar content</strong> is read transiently to complete your tasks.
                Full email bodies are not intended for permanent storage — only task summaries and metadata
                (sender, subject, date) are retained. Temporary caching may occur during processing.
              </li>
              <li>
                <strong>AI processing:</strong> To complete tasks, email and calendar data may be sent
                to third-party AI service providers for analysis. Before sending,
                we make best-effort attempts to automatically redact sensitive personal identifiers
                (such as Social Security numbers, credit card numbers, bank account details, and passwords)
                before sending, though no redaction system is perfect.
              </li>
              <li>
                <strong>No AI model training:</strong> Google user data (emails, calendar events,
                contacts) is never used to train, improve, or build generalized AI or machine learning
                models. AI processing is performed solely to complete your individual tasks.
                We only use AI providers whose API terms prohibit using your data for model training.
              </li>
              <li>
                <strong>No human review:</strong> Under normal operations, your data is processed by AI only.
                Todone team members do not read your emails or calendar events unless required to
                resolve a technical issue you report, and only with your permission.
              </li>
              <li>
                <strong>No selling or sharing:</strong> Your data is never sold, rented, or shared with
                third parties for advertising, marketing, retargeting, or credit-worthiness purposes.
              </li>
              <li>
                <strong>Data transfer restrictions:</strong> Google user data may only be transferred
                to third parties in the following circumstances: (a) to provide or improve user-facing
                features with your explicit consent (e.g., sending redacted data to AI service providers
                to complete your tasks), (b) for security purposes such as investigating
                abuse, (c) to comply with applicable laws or regulations, or (d) as part of a merger,
                acquisition, or asset sale with prior user notice. All other transfers are prohibited.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-medium text-on-surface mb-3">What We Store</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Account profile:</strong> Name, email, preferences</li>
              <li><strong>OAuth tokens:</strong> Encrypted at rest to maintain your Google connection</li>
              <li><strong>Tasks and messages:</strong> Your task list and conversation history, stored until you delete them</li>
              <li><strong>Agent execution logs:</strong> Records of what tools were used for each task (auto-deleted periodically)</li>
              <li><strong>Audit log:</strong> Action records for security compliance (auto-deleted periodically)</li>
            </ul>
            <p className="mt-3">
              We do <strong>not</strong> store full email bodies, full calendar event details, or
              contact records in our database.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-medium text-on-surface mb-3">Data Security</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>OAuth tokens are encrypted at rest using industry-standard encryption</li>
              <li>All data is transmitted over HTTPS</li>
              <li>Database access is restricted so users can only access their own data</li>
              <li>Best-effort automatic redaction of sensitive personal identifiers before AI processing</li>
              <li>On sign-out, OAuth tokens are revoked with Google and deleted from our database</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-medium text-on-surface mb-3">Your Rights</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Access:</strong> You can view all your stored data (tasks, messages) within the app</li>
              <li><strong>Deletion:</strong> You can delete your account and all associated data at any time from your account settings</li>
              <li><strong>Revocation:</strong> You can revoke Todone&apos;s access to your Google account at any time via <a href="https://myaccount.google.com/permissions" className="text-primary underline" target="_blank" rel="noopener noreferrer">Google Account Permissions</a></li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-medium text-on-surface mb-3">Third-Party Services</h2>
            <p className="mb-3">Todone uses the following categories of third-party services to operate. The specific providers may change over time; we will update this policy accordingly.</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Google OAuth</strong> — authentication and API access (<a href="https://policies.google.com/privacy" className="text-primary underline" target="_blank" rel="noopener noreferrer">Google Privacy Policy</a>)</li>
              <li><strong>AI service providers</strong> — task execution and research assistance; receive redacted email/calendar data; we only use providers whose API terms prohibit long-term storage of your data or using it for model training</li>
              <li><strong>Database hosting provider</strong> — stores your account, tasks, and messages; data encrypted at rest</li>
              <li><strong>Application hosting provider</strong> — serves the web application</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-medium text-on-surface mb-3">Children&apos;s Privacy</h2>
            <p>
              Todone is not directed at children under the age of 13. We do not knowingly collect
              personal information from children under 13. Because Todone requires a Google account
              to sign in, and Google requires users to be at least 13 years old to create an account,
              this age requirement is enforced at the authentication level. If you believe a child
              under 13 has provided us with personal information, please{' '}
              <a href="CONTACT_FORM_URL" className="text-primary underline" target="_blank" rel="noopener noreferrer">contact us</a>{' '}
              and we will delete it promptly.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-medium text-on-surface mb-3">Google API Services Disclosure</h2>
            <p>
              Todone&apos;s use and transfer to any other app of information received from Google APIs
              will adhere to the{' '}
              <a href="https://developers.google.com/terms/api-services-user-data-policy" className="text-primary underline" target="_blank" rel="noopener noreferrer">Google API Services User Data Policy</a>,
              including the Limited Use requirements.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-medium text-on-surface mb-3">Changes to This Policy</h2>
            <p>
              We may update this policy from time to time. If we make material changes to how we
              use Google user data, we will notify you by email or by a prominent notice within the
              app with reasonable advance notice before the changes take effect. Continued use of Todone after
              the effective date constitutes acceptance of the updated policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-medium text-on-surface mb-3">Contact</h2>
            <p>
              For privacy questions or data deletion requests,{' '}
              <a href="CONTACT_FORM_URL" className="text-primary underline" target="_blank" rel="noopener noreferrer">contact us</a>.
            </p>
          </section>

        </div>
      </div>
    </div>
  );
}
