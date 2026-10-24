import { useState } from 'react';
import { LayoutGrid, Siren, MessageCircleHeart, Users, Type } from 'lucide-react';
import { Button, Modal } from '../../components/ui';

const SEEN = 'oc_welcome_seen';
const seen = () => { try { return localStorage.getItem(SEEN) === '1'; } catch { return true; } };

// Shown once, on a patient's first visit: where things are, in four lines. Never again after "Got it".
export default function WelcomeTips({ name }) {
  const [open, setOpen] = useState(() => !seen());
  const close = () => { setOpen(false); try { localStorage.setItem(SEEN, '1'); } catch { /* ignore */ } };
  return (
    <Modal open={open} onClose={close} title={name ? `Welcome, ${name}` : 'Welcome to Sehatra'} subtitle="Five things to know — it takes ten seconds."
      footer={<Button block onClick={close}>Got it</Button>}>
      <ul className="pt-welcome">
        <li><span className="pt-ic-tile green"><LayoutGrid size={18} /></span><span><strong>Home, Doctor, Medicines and Reports</strong> are always one tap away. On a phone, everything else is under <strong>More</strong>.</span></li>
        <li><span className="pt-ic-tile clay"><Siren size={18} /></span><span>In an emergency, <strong>press and hold the red SOS button</strong>. It opens 108 and alerts your family.</span></li>
        <li><span className="pt-ic-tile sky"><MessageCircleHeart size={18} /></span><span><strong>Ask Saathi</strong> (the green button) anything about your health or the app — type or speak, in your language.</span></li>
        <li><span className="pt-ic-tile sun"><Users size={18} /></span><span>Looking after a parent or child? <strong>Add them under Family</strong>, then switch between profiles from the top bar.</span></li>
        <li><span className="pt-ic-tile sky"><Type size={18} /></span><span>Text too small? Turn on <strong>Bigger text &amp; read aloud</strong> in Settings — every page gets a Listen button.</span></li>
      </ul>
    </Modal>
  );
}
