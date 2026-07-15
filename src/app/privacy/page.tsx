export const metadata = {
  title: 'Privacy Policy | NewsDash',
  description: 'Privacy policy for the NewsDash WhatsApp assistant and web app.',
};

export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: 720, margin: '40px auto', padding: '0 20px', lineHeight: 1.6 }}>
      <h1>NewsDash Privacy Policy</h1>
      <p>Last updated: July 15, 2026</p>
      <p>
        NewsDash provides a news and markets information service via the web and WhatsApp.
        This policy explains what data we process for that service.
      </p>
      <h2>Data we process</h2>
      <ul>
        <li>WhatsApp phone number and message text you send to the NewsDash bot</li>
        <li>Technical logs needed to operate and secure the service</li>
      </ul>
      <h2>How we use data</h2>
      <ul>
        <li>To answer your questions with news and market information</li>
        <li>To improve reliability and prevent abuse</li>
      </ul>
      <h2>Sharing</h2>
      <p>
        We use Meta WhatsApp Cloud API to send and receive messages, and hosting providers
        (such as Vercel) to run the service. We do not sell your personal data.
      </p>
      <h2>Retention</h2>
      <p>
        Short chat context may be kept temporarily to handle follow-up questions, then expires.
        Operational logs are retained only as long as needed for security and debugging.
      </p>
      <h2>Contact / data deletion</h2>
      <p>
        Email <a href="mailto:falzabibi24@gmail.com">falzabibi24@gmail.com</a> to request deletion
        of your WhatsApp conversation data related to NewsDash.
      </p>
    </main>
  );
}
