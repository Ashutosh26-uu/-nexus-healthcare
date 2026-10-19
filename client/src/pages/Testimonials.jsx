import { Link } from 'react-router-dom';
import { MessageSquareQuote } from 'lucide-react';
import { PublicPage } from './public/PublicShell';
import { useSeo } from '../seo';

// Testimonials — a placeholder until real patients, doctors and partners share their stories. Nothing here is
// made up: the page says plainly that it's coming soon.
export default function Testimonials() {
  useSeo({ title: 'Testimonials · Nexus Healthcare', description: 'Stories from patients, doctors and partners using Nexus Healthcare — coming soon.', path: '/testimonials' });
  return (
    <PublicPage>
      <section className="pb-hero tm-soon">
        <span className="tm-icon" aria-hidden="true"><MessageSquareQuote size={34} /></span>
        <span className="pb-eyebrow">Testimonials</span>
        <h1>Coming soon</h1>
        <p className="muted">Stories from the patients, doctors, chemists and labs using Nexus Healthcare will appear here.</p>
        <Link to="/" className="btn">Back to home</Link>
      </section>
    </PublicPage>
  );
}
