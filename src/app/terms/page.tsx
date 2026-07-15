export const metadata = {
  title: 'Terms of Service | NewsDash',
  description: 'Terms of service for the NewsDash WhatsApp assistant and web app.',
};

export default function TermsPage() {
  return (
    <main style={{ maxWidth: 720, margin: '40px auto', padding: '0 20px', lineHeight: 1.6 }}>
      <h1>NewsDash Terms of Service</h1>
      <p>Last updated: July 15, 2026</p>
      <p>
        By using NewsDash (web or WhatsApp), you agree to use the service for lawful
        informational purposes only.
      </p>
      <h2>Service</h2>
      <p>
        NewsDash provides automated summaries and live data references from public sources.
        Information may be incomplete or delayed and is not financial advice.
      </p>
      <h2>Acceptable use</h2>
      <ul>
        <li>Do not abuse, spam, or attempt to disrupt the service</li>
        <li>Do not use the bot for illegal activity</li>
      </ul>
      <h2>Contact</h2>
      <p>
        Questions: <a href="mailto:falzabibi24@gmail.com">falzabibi24@gmail.com</a>
      </p>
    </main>
  );
}
