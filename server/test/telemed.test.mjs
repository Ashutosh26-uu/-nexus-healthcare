// Telemedicine Practice Guidelines: no narcotic / psychotropic medicines in a teleconsultation, mode on the Rx.
import { createRequire } from 'node:module';
import { call, check, demo, done } from './lib.mjs';

const telemed = createRequire(import.meta.url)('../telemed.js');
check(telemed.prohibitedIn([{ drug: 'Tramadol 50mg' }, { drug: 'Paracetamol 500mg' }, { drug: 'Alprazolam 0.25mg' }]).map((h) => h.substance).join() === 'tramadol,alprazolam', 'narcotic and psychotropic generics recognised');
check(telemed.prohibitedIn([{ drug: 'Codeinex syrup' }]).length === 0, 'whole words only — no false match inside another name');
check(!telemed.isRemote({ visitType: 'clinic', mode: 'in_person' }) && telemed.isRemote({ visitType: 'video', mode: 'audio' }) && telemed.isRemote({ kioskId: 'k', mode: 'video' }), 'clinic visits are in person; video, audio, chat and E-Clinic visits are remote');
check(telemed.modeOf({ mode: 'chat', visitType: 'video' }) === 'Teleconsultation · text chat' && telemed.modeOf(null) === 'In-person visit', 'mode labels for the prescription');

const doctor = await demo('doctor');
// con_105: a queued E-Clinic (kiosk) video consult of the demo doctor.
let r = await call('POST', '/prescriptions/check', doctor, { patientId: 'OC-2041-1187', consultId: 'con_105', items: [{ drug: 'Tramadol 50mg' }, { drug: 'Paracetamol 500mg' }] });
const tm = (r.j || []).filter((w) => w.type === 'telemedicine');
check(r.s === 200 && tm.length === 1 && /Tramadol/.test(tm[0].msg) && tm[0].severity === 'high', 'composer warns while typing a prohibited medicine', tm[0]?.msg?.slice(0, 60));
r = await call('POST', '/consults/con_105/complete', doctor, { diagnosis: 'Peripheral neuropathy', items: [{ drug: 'Alprazolam 0.25mg', dose: '1 tab', freq: 'OD', days: 5 }] });
check(r.s === 400 && r.j.code === 'TELEMED_PROHIBITED', 'a teleconsultation can\'t be completed with it', r.j.error?.slice(0, 60));
const home = (await call('GET', '/doctor/home', doctor)).j;
const still = JSON.stringify(home).includes('con_105');
check(still, 'the consult stays open for the doctor to fix');

const patient = await demo('patient');
r = await call('GET', '/prescriptions/rx_501', patient);
check(r.s === 200 && r.j.consultMode === 'Teleconsultation · video', 'prescription shows how the consultation happened', r.j.consultMode);
done();
