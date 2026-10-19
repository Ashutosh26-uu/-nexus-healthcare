// Seed data for the Nexus Healthcare proof of concept.
// Pilot district: Barabanki (UP), with network partners across India.
const bcrypt = require('bcryptjs');

const DEMO_PASSWORD = 'Demo@123';

const day = 24 * 60 * 60 * 1000;
let now = Date.now();
const ago = (d, h = 0) => new Date(now - d * day - h * 3600000).toISOString();
const ahead = (d, h = 0) => new Date(now + d * day + h * 3600000).toISOString();

function demoSeed() {
  now = Date.now(); // relative to this seeding — a reset after days of uptime must not put "upcoming" visits in the past
  const hash = bcrypt.hashSync(DEMO_PASSWORD, 8);

  const facilities = [
    // Hospitals
    { id: 'fac_h1', type: 'hospital', opdFee: 10, hours: '24×7 emergency · OPD 8:00 – 14:00', name: 'District Hospital Barabanki', district: 'Barabanki', state: 'Uttar Pradesh', pincode: '225001', verified: true, departments: ['General Medicine', 'Pediatrics', 'Obstetrics', 'Orthopedics', 'Emergency'], equipment: ['ICU', 'Ventilators', 'X-Ray', 'Dialysis'], phone: '05248-222001' },
    { id: 'fac_h2', type: 'hospital', opdFee: 50, hours: '24×7 trauma & emergency', name: 'KGMU Trauma Centre', district: 'Lucknow', state: 'Uttar Pradesh', pincode: '226003', verified: true, departments: ['Emergency', 'Cardiology', 'Neurology', 'Surgery'], equipment: ['ICU', 'Ventilators', 'CT', 'MRI', 'Cath Lab'], phone: '0522-2257450' },
    { id: 'fac_h3', type: 'hospital', opdFee: 400, hours: 'OPD 9:00 – 20:00 · 24×7 emergency', name: 'Sanjeevani Multispeciality', district: 'Patna', state: 'Bihar', pincode: '800001', verified: true, departments: ['General Medicine', 'Cardiology', 'Pediatrics'], equipment: ['ICU', 'CT', 'Dialysis'], phone: '0612-2201100' },
    { id: 'fac_h4', type: 'hospital', opdFee: 800, hours: 'OPD 8:00 – 20:00 · 24×7 emergency', name: 'Narayana Health City', district: 'Bengaluru Urban', state: 'Karnataka', pincode: '560099', verified: true, departments: ['Cardiology', 'Oncology', 'Neurology', 'Pediatrics'], equipment: ['ICU', 'Ventilators', 'CT', 'MRI', 'Cath Lab'], phone: '080-71222222' },
    { id: 'fac_h5', type: 'hospital', opdFee: 0, hours: 'OPD 9:00 – 14:00', name: 'CHC Fatehpur', district: 'Barabanki', state: 'Uttar Pradesh', pincode: '225305', verified: false, departments: ['General Medicine', 'Obstetrics'], equipment: ['Oxygen'], phone: '05248-290011' },
    // A doctor-owned clinic (the owner lists every doctor who practises there)
    { id: 'fac_c1', type: 'hospital', subtype: 'clinic', opdFee: 300, hours: 'Mon–Sat 10:00 – 14:00 · 17:00 – 20:00', name: 'Verma Family Clinic', address: 'Station Road, near Kotwali', district: 'Barabanki', state: 'Uttar Pradesh', pincode: '225001', verified: true, departments: ['General Medicine', 'Dermatology', 'Pediatrics'], phone: '05248-225566', ownerDoctorId: 'doc_6', lat: 26.944, lng: 81.201, partner: true },
    // Labs
    { id: 'fac_l1', reviewStats: { count: 186, sum: 846 }, testsDoneBase: 4210, type: 'lab', tests: ['58410-2', '7905-3', '4548-4', '2093-3', '1558-6', '70569-9', '5762-1', '11524-6'], name: 'Barabanki Diagnostics', district: 'Barabanki', state: 'Uttar Pradesh', pincode: '225001', verified: true, phone: '05248-221188', hours: '7:00 – 21:00', priceFactor: 1, tatFactor: 1, homeCollection: true, nabl: true, reportVia: ['App', 'WhatsApp', 'Printed copy'],
      collectors: [{ id: 'col_1', name: 'Raju Prasad', phone: '9876500151', active: true }, { id: 'col_2', name: 'Seema Yadav', phone: '9876500152', active: true }],
      packages: [
        { id: 'pkg_l1_full', name: 'Full body check-up', codes: ['58410-2', '4548-4', '2093-3', '1558-6'], price: 999, description: 'Blood count, 3-month sugar, fasting sugar and cholesterol — a yearly check in one visit.', active: true },
        { id: 'pkg_l1_dm', name: 'Diabetes panel', codes: ['4548-4', '1558-6'], price: 449, description: 'HbA1c and fasting sugar — for anyone with diabetes or a family history of it.', active: true },
        { id: 'pkg_l1_fever', name: 'Fever panel', codes: ['58410-2', '7905-3', '70569-9', '5762-1'], price: 1199, description: 'Fever for 3+ days? Checks for dengue, malaria and typhoid with a blood count.', active: true },
      ] },
    { id: 'fac_l3', reviewStats: { count: 92, sum: 350 }, testsDoneBase: 9800, type: 'lab', name: 'District Hospital Lab, Barabanki', district: 'Barabanki', state: 'Uttar Pradesh', pincode: '225001', verified: true, phone: '05248-222010', hours: '8:00 – 14:00', priceFactor: 0.25, tatFactor: 2, homeCollection: false, nabl: false, government: true, tests: ['58410-2', '1558-6', '70569-9', '5762-1', '7905-3'], reportVia: ['App', 'Collect at counter'] },
    { id: 'fac_d1', reviewStats: { count: 74, sum: 341 }, testsDoneBase: 1650, type: 'lab', subtype: 'diagnostic', name: 'Barabanki Imaging & Diagnostic Centre', district: 'Barabanki', state: 'Uttar Pradesh', pincode: '225001', verified: true, phone: '05248-224400', hours: '8:00 – 20:00', priceFactor: 1, tatFactor: 1, homeCollection: false, nabl: true, tests: ['36643-5', '24558-9', '11524-6', '58410-2'], reportVia: ['App', 'Printed films', 'WhatsApp'] },
    { id: 'fac_l4', reviewStats: { count: 131, sum: 615 }, testsDoneBase: 2890, type: 'lab', name: 'CarePlus Pathology, Nawabganj', district: 'Barabanki', state: 'Uttar Pradesh', pincode: '225001', verified: true, phone: '05248-230455', hours: '6:30 – 22:00', priceFactor: 1.2, tatFactor: 0.6, homeCollection: true, nabl: true, tests: ['58410-2', '7905-3', '4548-4', '2093-3', '1558-6', '70569-9', '5762-1'], reportVia: ['App', 'WhatsApp', 'Email'],
      collectors: [{ id: 'col_3', name: 'Imran Khan', phone: '9876500153', active: true }],
      packages: [
        { id: 'pkg_l4_full', name: 'Full body check-up', codes: ['58410-2', '4548-4', '2093-3', '1558-6'], price: 1199, description: 'Four core blood tests, report the same day.', active: true },
        { id: 'pkg_l4_heart', name: 'Heart health check', codes: ['2093-3', '1558-6'], price: 599, description: 'Cholesterol and fasting sugar — the two numbers that matter most for your heart.', active: true },
      ] },
    { id: 'fac_l2', type: 'lab', name: 'PathCare Lucknow', district: 'Lucknow', state: 'Uttar Pradesh', pincode: '226010', verified: false, phone: '0522-4001234', priceFactor: 1.1, homeCollection: true },
    // Pharmacies
    { id: 'fac_p1', type: 'pharmacy', name: 'Jan Aushadhi Kendra, Civil Lines', district: 'Barabanki', state: 'Uttar Pradesh', pincode: '225001', verified: true, hours: '8:00 – 21:00', distanceKm: 1.2, phone: '98390 11223', priceFactor: 0.45, generic: true },
    { id: 'fac_p2', type: 'pharmacy', name: 'Gupta Medical Store', district: 'Barabanki', state: 'Uttar Pradesh', pincode: '225003', verified: true, hours: '9:00 – 22:00', distanceKm: 3.8, phone: '94150 44556', priceFactor: 0.92, delivery: true },
    { id: 'fac_p5', type: 'pharmacy', name: 'Sharma Medical Hall', district: 'Barabanki', state: 'Uttar Pradesh', pincode: '225001', verified: true, hours: '8:30 – 22:30', distanceKm: 2.1, phone: '94155 67890', priceFactor: 0.95, delivery: true },
    { id: 'fac_p3', type: 'pharmacy', name: 'Apollo Pharmacy Hazratganj', district: 'Lucknow', state: 'Uttar Pradesh', pincode: '226001', verified: true, hours: '24 hours', distanceKm: 29, phone: '0522-4022000', priceFactor: 1, delivery: true },
    { id: 'fac_p4', type: 'pharmacy', name: 'Shree Ram Medicos', district: 'Patna', state: 'Bihar', pincode: '800001', verified: false, hours: '9:00 – 21:00', distanceKm: 540, phone: '93341 22110', priceFactor: 0.9 },
    // Warehouses
    { id: 'fac_w1', type: 'warehouse', name: 'UP State Drug Store, Lucknow', district: 'Lucknow', state: 'Uttar Pradesh', pincode: '226012', verified: true },
    { id: 'fac_w2', type: 'warehouse', name: 'MedLink Distributors, Kanpur', district: 'Kanpur Nagar', state: 'Uttar Pradesh', pincode: '208001', verified: true },
    // Kiosks
    { id: 'fac_k1', type: 'kiosk', name: 'E-Clinic · Dewa PHC', district: 'Barabanki', state: 'Uttar Pradesh', pincode: '225301', verified: true, status: 'online', uptime: 99.2, devices: { bp: 'ok', spo2: 'ok', thermometer: 'ok', scale: 'ok', glucometer: 'ok', printer: 'ok', camera: 'ok' }, version: '1.4.2', visitsToday: 23 },
    { id: 'fac_k2', type: 'kiosk', name: 'E-Clinic · Barabanki Railway Station', district: 'Barabanki', state: 'Uttar Pradesh', pincode: '225001', verified: true, status: 'online', uptime: 97.8, devices: { bp: 'ok', spo2: 'ok', thermometer: 'ok', scale: 'ok', glucometer: 'fault', printer: 'ok', camera: 'ok' }, version: '1.4.2', visitsToday: 41 },
    { id: 'fac_k3', type: 'kiosk', name: 'E-Clinic · Haidergarh', district: 'Barabanki', state: 'Uttar Pradesh', pincode: '225124', verified: true, status: 'offline', uptime: 88.5, devices: { bp: 'ok', spo2: 'ok', thermometer: 'ok', scale: 'ok', glucometer: 'ok', printer: 'paper_low', camera: 'ok' }, version: '1.4.1', visitsToday: 0 },
    { id: 'fac_k4', type: 'kiosk', name: 'E-Clinic · Ramnagar', district: 'Barabanki', state: 'Uttar Pradesh', pincode: '225204', verified: false, status: 'online', uptime: 100, devices: { bp: 'ok', spo2: 'ok', thermometer: 'ok', scale: 'ok', glucometer: 'ok', printer: 'ok', camera: 'ok' }, version: '1.4.2', visitsToday: 7 },
  ];

  const users = [
    { id: 'u_pat1', name: 'Sunita Devi', email: 'patient@omnicare.in', phone: '9876500001', role: 'patient', status: 'active', region: { state: 'Uttar Pradesh', district: 'Barabanki' } },
    { id: 'u_pat2', name: 'Ramesh Yadav', email: 'ramesh@omnicare.in', phone: '9876500002', role: 'patient', status: 'active', region: { state: 'Uttar Pradesh', district: 'Barabanki' } },
    { id: 'u_pat3', name: 'Farhan Ali', email: 'farhan@omnicare.in', phone: '9876500003', role: 'patient', status: 'active', region: { state: 'Uttar Pradesh', district: 'Barabanki' } },
    { id: 'u_care1', name: 'Anil Kumar', email: 'caregiver@omnicare.in', phone: '9876500010', role: 'caregiver', status: 'active', region: { state: 'Uttar Pradesh', district: 'Barabanki' } },
    { id: 'u_kiosk1', name: 'Pooja Verma (ASHA)', email: 'kiosk@omnicare.in', phone: '9876500020', role: 'kiosk_operator', facilityId: 'fac_k1', status: 'active', region: { state: 'Uttar Pradesh', district: 'Barabanki' } },
    { id: 'u_doc1', name: 'Dr. Meera Iyer', email: 'doctor@omnicare.in', phone: '9876500030', role: 'doctor', status: 'active', region: { state: 'Uttar Pradesh', district: 'Lucknow' } },
    { id: 'u_doc2', name: 'Dr. Arjun Mehta', email: 'arjun@omnicare.in', phone: '9876500031', role: 'doctor', status: 'active', region: { state: 'Uttar Pradesh', district: 'Barabanki' } },
    { id: 'u_doc3', name: 'Dr. Kavya Reddy', email: 'kavya@omnicare.in', phone: '9876500032', role: 'doctor', status: 'active', region: { state: 'Karnataka', district: 'Bengaluru Urban' } },
    { id: 'u_doc4', name: 'Dr. Sanjay Mishra', email: 'sanjay@omnicare.in', phone: '9876500033', role: 'doctor', status: 'active', region: { state: 'Bihar', district: 'Patna' } },
    { id: 'u_doc5', name: 'Dr. Nisha Kapoor', email: 'nisha@omnicare.in', phone: '9876500034', role: 'doctor', status: 'pending', region: { state: 'Uttar Pradesh', district: 'Lucknow' } },
    { id: 'u_doc6', name: 'Dr. Rakesh Verma', email: 'rakesh@omnicare.in', phone: '9876500035', role: 'doctor', status: 'active', region: { state: 'Uttar Pradesh', district: 'Barabanki' } },
    { id: 'u_hosp1', name: 'Rajiv Saxena', email: 'hospital@omnicare.in', phone: '9876500040', role: 'hospital_admin', facilityId: 'fac_h1', status: 'active', region: { state: 'Uttar Pradesh', district: 'Barabanki' } },
    { id: 'u_lab1', name: 'Neha Singh', email: 'lab@omnicare.in', phone: '9876500050', role: 'lab_tech', facilityId: 'fac_l1', status: 'active', region: { state: 'Uttar Pradesh', district: 'Barabanki' } },
    // Reporting pathologist at the same lab: signs reports before patients see them.
    { id: 'u_lab2', name: 'Dr. Alok Srivastava', email: 'pathologist@omnicare.in', phone: '9876500051', role: 'lab_tech', labRole: 'pathologist', regNo: 'UPMC-48213', facilityId: 'fac_l1', status: 'active', region: { state: 'Uttar Pradesh', district: 'Barabanki' } },
    { id: 'u_pharm1', name: 'Vikas Gupta', email: 'pharmacy@omnicare.in', phone: '9876500060', role: 'pharmacist', facilityId: 'fac_p1', status: 'active', region: { state: 'Uttar Pradesh', district: 'Barabanki' } },
    { id: 'u_dist1', name: 'Harish Agarwal', email: 'distributor@omnicare.in', phone: '9876500070', role: 'distributor', facilityId: 'fac_w1', status: 'active', region: { state: 'Uttar Pradesh', district: 'Lucknow' } },
    { id: 'u_rider1', name: 'Manoj Kushwaha', email: 'rider@omnicare.in', phone: '9876500080', role: 'delivery', status: 'active', region: { state: 'Uttar Pradesh', district: 'Barabanki' } },
    { id: 'u_gov1', name: 'Dr. A. K. Tripathi (CMO)', email: 'official@omnicare.in', phone: '9876500090', role: 'official', scope: 'district', status: 'active', region: { state: 'Uttar Pradesh', district: 'Barabanki' } },
    { id: 'u_gov2', name: 'Shalini Rao, IAS', email: 'national@omnicare.in', phone: '9876500091', role: 'official', scope: 'national', status: 'active', region: { state: 'Delhi', district: 'New Delhi' } },
    { id: 'u_admin1', name: 'Nexus Ops Team', email: 'admin@omnicare.in', phone: '9876500099', role: 'super_admin', status: 'active', region: { state: 'Uttar Pradesh', district: 'Lucknow' } },
  ].map((u) => ({ ...u, passwordHash: hash, createdAt: ago(60) }));

  const patients = [
    { id: 'OC-2041-7783', userId: 'u_pat1', name: 'Sunita Devi', dob: '1984-03-12', gender: 'Female', language: 'Hindi', bloodGroup: 'B+', allergies: ['Penicillin'], conditions: ['Type 2 Diabetes', 'Hypertension'], currentMeds: ['Metformin 500mg', 'Amlodipine 5mg'], emergencyContacts: [{ name: 'Anil Kumar', relation: 'Husband', phone: '9876500010' }], abha: '91-4421-7783-0021', address: 'House 14, Ward 7, Civil Lines', aadhaarLast4: '4821', country: 'IN', pincode: '225001', district: 'Barabanki', state: 'Uttar Pradesh', vaccinations: [{ name: 'COVID-19 (Booster)', date: '2023-01-14' }, { name: 'Tetanus', date: '2021-08-02' }], guardianUserId: 'u_care1', createdAt: ago(58) },
    { id: 'OC-2041-9015', userId: null, relation: 'Son', name: 'Aarav Kumar', dob: '2017-06-21', gender: 'Male', language: 'Hindi', bloodGroup: 'B+', allergies: [], conditions: ['Asthma (mild)'], currentMeds: ['Salbutamol inhaler (SOS)'], emergencyContacts: [{ name: 'Sunita Devi', relation: 'Mother', phone: '9876500001' }], abha: '', pincode: '225001', district: 'Barabanki', state: 'Uttar Pradesh', vaccinations: [{ name: 'MMR', date: '2018-07-10' }], guardianUserId: 'u_pat1', createdAt: ago(50) },
    { id: 'OC-2041-3320', userId: null, relation: 'Mother-in-law', name: 'Kamla Devi', dob: '1949-11-02', gender: 'Female', language: 'Awadhi', bloodGroup: 'O+', allergies: ['Sulfa drugs'], conditions: ['Osteoarthritis', 'Hypertension'], currentMeds: ['Telmisartan 40mg'], emergencyContacts: [{ name: 'Sunita Devi', relation: 'Daughter-in-law', phone: '9876500001' }], abha: '', pincode: '225001', district: 'Barabanki', state: 'Uttar Pradesh', vaccinations: [], guardianUserId: 'u_pat1', createdAt: ago(50) },
    { id: 'OC-2041-5521', userId: 'u_pat2', name: 'Ramesh Yadav', dob: '1971-09-30', gender: 'Male', language: 'Hindi', bloodGroup: 'A+', allergies: [], conditions: ['COPD'], currentMeds: ['Tiotropium inhaler'], emergencyContacts: [{ name: 'Geeta Yadav', relation: 'Wife', phone: '9876511122' }], abha: '91-5521-0091-1123', address: 'Village Dewa, near PHC', govIds: [{ type: 'Ayushman Bharat (PM-JAY) card', number: 'PMJAY-UP-5521009', addedAt: ago(40) }], country: 'IN', pincode: '225301', district: 'Barabanki', state: 'Uttar Pradesh', vaccinations: [], createdAt: ago(40) },
    { id: 'OC-2041-6610', userId: 'u_pat3', name: 'Farhan Ali', dob: '1996-01-17', gender: 'Male', language: 'Urdu', bloodGroup: 'O-', allergies: ['Ibuprofen'], conditions: [], currentMeds: [], emergencyContacts: [{ name: 'Zoya Ali', relation: 'Sister', phone: '9876522233' }], abha: '', pincode: '225003', district: 'Barabanki', state: 'Uttar Pradesh', vaccinations: [], createdAt: ago(20) },
    { id: 'OC-2041-1187', userId: null, name: 'Lakshmi Prasad', dob: '1962-05-05', gender: 'Female', language: 'Hindi', bloodGroup: 'AB+', allergies: [], conditions: ['Type 2 Diabetes'], currentMeds: ['Glimepiride 1mg'], emergencyContacts: [{ name: 'Mohan Prasad', relation: 'Son', phone: '9876533344' }], abha: '', pincode: '225301', district: 'Barabanki', state: 'Uttar Pradesh', vaccinations: [], createdAt: ago(3) },
  ];

  const doctors = [
    { id: 'doc_1', patientsLifetime: 12000, reviewStats: { count: 212, sum: 1018, satisfied: 201 }, userId: 'u_doc1', name: 'Dr. Meera Iyer', specialty: 'General Medicine', qualification: 'MBBS, MD (Medicine)', regNo: 'UPMC-48211', languages: ['Hindi', 'English', 'Tamil'], verified: true, online: true, district: 'Lucknow', state: 'Uttar Pradesh', rating: 4.8, consultsDone: 1284, earnings: 186400, fee: 200, maxPerHour: 6, experience: 11, engagement: 'eclinic_partner', eClinicIds: ['fac_k1', 'fac_k2'], presenceClinicId: 'fac_k1', presenceSince: ago(0, 1), profileComplete: true,
      myMedicines: [{ id: 'med_demo1', name: 'Pantoprazole', strength: '40 mg', form: 'Tablet', dose: '1 tablet', timing: { morning: 1, afternoon: 0, evening: 0, night: 0 }, food: 'empty stomach', sos: false, days: 14, note: '30 min before breakfast' }] },
    { id: 'doc_2', patientsLifetime: 3000, reviewStats: { count: 140, sum: 658, satisfied: 129 }, userId: 'u_doc2', name: 'Dr. Arjun Mehta', specialty: 'Pediatrics', qualification: 'MBBS, DCH', regNo: 'UPMC-51092', languages: ['Hindi', 'English'], verified: true, online: true, district: 'Barabanki', state: 'Uttar Pradesh', rating: 4.7, consultsDone: 642, earnings: 91200, fee: 250, maxPerHour: 5, experience: 7, facilityId: 'fac_h1', profileComplete: true, slots: { Mon: [9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20], Tue: [9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20], Wed: [9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20], Thu: [9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20], Fri: [9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20], Sat: [9, 10, 11, 12], Sun: [] } },
    { id: 'doc_3', patientsLifetime: 35000, reviewStats: { count: 320, sum: 1568, satisfied: 310 }, userId: 'u_doc3', name: 'Dr. Kavya Reddy', specialty: 'Cardiology', qualification: 'MBBS, MD, DM (Cardiology)', regNo: 'KMC-77310', languages: ['English', 'Kannada', 'Telugu', 'Hindi'], verified: true, online: true, district: 'Bengaluru Urban', state: 'Karnataka', rating: 4.9, consultsDone: 2210, earnings: 512000, fee: 500, maxPerHour: 4, experience: 15, facilityId: 'fac_h4', profileComplete: true, slots: { Mon: [10, 11, 12], Tue: [10, 11, 12], Wed: [10, 11, 12], Thu: [10, 11, 12], Fri: [10, 11, 12], Sat: [], Sun: [] } },
    { id: 'doc_4', patientsLifetime: 12000, reviewStats: { count: 90, sum: 414, satisfied: 80 }, userId: 'u_doc4', name: 'Dr. Sanjay Mishra', specialty: 'General Medicine', qualification: 'MBBS', regNo: 'BMC-30018', languages: ['Hindi', 'Bhojpuri', 'English'], verified: true, online: false, district: 'Patna', state: 'Bihar', rating: 4.6, consultsDone: 830, earnings: 102300, fee: 150, maxPerHour: 8, experience: 9, engagement: 'eclinic_partner', eClinicIds: ['fac_k3'], profileComplete: true },
    { id: 'doc_6', patientsLifetime: 12000, reviewStats: { count: 64, sum: 294, satisfied: 58 }, userId: 'u_doc6', name: 'Dr. Rakesh Verma', specialty: 'General Medicine', qualification: 'MBBS, MD (Medicine)', regNo: 'UPMC-39920', languages: ['Hindi', 'English', 'Awadhi'], verified: true, online: false, district: 'Barabanki', state: 'Uttar Pradesh', country: 'IN', address: 'Station Road, Barabanki', rating: 4.6, consultsDone: 410, earnings: 52000, fee: 300, maxPerHour: 6, experience: 14, facilityId: 'fac_c1', ownsFacilityId: 'fac_c1', engagement: 'own_clinic', profileComplete: true, slots: { Mon: [10, 11, 12, 13, 17, 18, 19], Tue: [10, 11, 12, 13, 17, 18, 19], Wed: [10, 11, 12, 13, 17, 18, 19], Thu: [10, 11, 12, 13, 17, 18, 19], Fri: [10, 11, 12, 13, 17, 18, 19], Sat: [10, 11, 12, 13], Sun: [] } },
    { id: 'doc_7', patientsLifetime: 3000, reviewStats: { count: 38, sum: 171, satisfied: 33 }, userId: null, listedBy: 'u_doc6', invite: { email: 'anjali.verma@example.com', phone: null }, name: 'Dr. Anjali Verma', specialty: 'Dermatology', qualification: 'MBBS, MD (Dermatology)', regNo: 'UPMC-55102', languages: ['Hindi', 'English'], verified: true, online: false, district: 'Barabanki', state: 'Uttar Pradesh', country: 'IN', rating: 4.5, consultsDone: 0, earnings: 0, fee: 400, maxPerHour: 4, experience: 6, facilityId: 'fac_c1', engagement: 'clinic', profileComplete: true, slots: { Mon: [17, 18, 19], Tue: [], Wed: [17, 18, 19], Thu: [], Fri: [17, 18, 19], Sat: [10, 11, 12], Sun: [] } },
    { id: 'doc_8', patientsLifetime: 12000, reviewStats: { count: 51, sum: 224, satisfied: 44 }, userId: null, listedBy: 'u_hosp1', invite: { email: null, phone: '+919876500111' }, name: 'Dr. S. Chauhan', specialty: 'Orthopedics', qualification: 'MBBS, MS (Ortho)', regNo: 'UPMC-41877', languages: ['Hindi', 'English'], verified: true, online: false, district: 'Barabanki', state: 'Uttar Pradesh', country: 'IN', rating: 4.4, consultsDone: 0, earnings: 0, fee: 10, maxPerHour: 8, experience: 18, facilityId: 'fac_h1', engagement: 'clinic', profileComplete: true, slots: { Mon: [9, 10, 11, 12, 13, 14], Tue: [9, 10, 11, 12, 13, 14], Wed: [9, 10, 11, 12, 13, 14], Thu: [9, 10, 11, 12, 13, 14], Fri: [9, 10, 11, 12, 13, 14], Sat: [9, 10, 11], Sun: [] } },
    { id: 'doc_5', userId: 'u_doc5', name: 'Dr. Nisha Kapoor', specialty: 'Dermatology', qualification: 'MBBS, MD (Dermatology)', regNo: 'UPMC-60123', languages: ['Hindi', 'English', 'Punjabi'], verified: false, online: false, district: 'Lucknow', state: 'Uttar Pradesh', rating: 0, consultsDone: 0, earnings: 0, fee: 400, maxPerHour: 4, experience: 5 },
  ];

  const consults = [
    { id: 'con_101', patientId: 'OC-2041-7783', doctorId: 'doc_1', kioskId: null, status: 'completed', mode: 'video', type: 'scheduled', triage: { level: 'routine', score: 32, symptoms: 'Sugar levels high in morning, tiredness', note: 'Known T2DM. Fasting glucose 168 at home. No red flags.', specialty: 'General Medicine' }, vitals: { bp: '138/86', pulse: 82, spo2: 98, temp: 98.4, weight: 68, sugar: 168 }, createdAt: ago(21), scheduledAt: ago(21), completedAt: ago(21), notes: 'Increase Metformin to 500mg BD. Diet counselling. Repeat HbA1c in 3 months.', diagnosis: 'Type 2 Diabetes — suboptimal control', messages: [] },
    { id: 'con_102', patientId: 'OC-2041-9015', doctorId: 'doc_2', kioskId: null, status: 'completed', mode: 'video', type: 'instant', triage: { level: 'doctor_now', score: 58, symptoms: 'Wheezing at night, cough for 3 days', note: 'Asthmatic child, nocturnal wheeze, SpO2 96%.', specialty: 'Pediatrics' }, vitals: { pulse: 104, spo2: 96, temp: 99.1 }, createdAt: ago(9), completedAt: ago(9), notes: 'Mild exacerbation. Continue inhaler with spacer. Review in 1 week if not better.', diagnosis: 'Mild asthma exacerbation', messages: [] },
    { id: 'con_103', patientId: 'OC-2041-7783', doctorId: 'doc_1', kioskId: null, status: 'scheduled', mode: 'video', type: 'scheduled', triage: { level: 'routine', score: 25, symptoms: 'Follow-up for diabetes and BP', note: 'Scheduled follow-up.', specialty: 'General Medicine' }, vitals: null, createdAt: ago(2), scheduledAt: ahead(1, 3), messages: [] },
    { id: 'con_104', patientId: 'OC-2041-5521', doctorId: 'doc_1', kioskId: 'fac_k1', status: 'queued', mode: 'video', type: 'instant', triage: { level: 'doctor_now', score: 71, symptoms: 'Breathing difficulty on walking, cough with yellow sputum for 5 days', note: 'COPD patient, SpO2 93% at kiosk, low-grade fever. Possible infective exacerbation. No chest pain.', specialty: 'General Medicine' }, vitals: { bp: '132/84', pulse: 96, spo2: 93, temp: 100.2, weight: 61 }, createdAt: ago(0, 0.3), messages: [], routedFrom: 'Barabanki (local)' },
    { id: 'con_105', patientId: 'OC-2041-1187', doctorId: 'doc_1', kioskId: 'fac_k2', status: 'queued', mode: 'video', type: 'instant', triage: { level: 'routine', score: 38, symptoms: 'Burning feet, numbness at night', note: 'Diabetic, possible peripheral neuropathy. Vitals stable.', specialty: 'General Medicine' }, vitals: { bp: '128/80', pulse: 78, spo2: 98, temp: 98.2, sugar: 212 }, createdAt: ago(0, 0.15), messages: [], routedFrom: 'Barabanki (local)' },
    { id: 'con_106', patientId: 'OC-2041-6610', doctorId: 'doc_1', kioskId: null, status: 'queued', mode: 'chat', type: 'instant', triage: { level: 'self_care', score: 18, symptoms: 'Mild throat pain since yesterday', note: 'No fever, no breathlessness. Self-care likely sufficient.', specialty: 'General Medicine' }, vitals: null, createdAt: ago(0, 0.05), messages: [], routedFrom: 'Overflow · Patna corridor' },
  ];

  const prescriptions = [
    { id: 'rx_501', consultId: 'con_101', patientId: 'OC-2041-7783', doctorId: 'doc_1', items: [{ drug: 'Metformin 500mg', dose: '1 tablet', freq: 'Twice daily after meals', days: 90 }, { drug: 'Amlodipine 5mg', dose: '1 tablet', freq: 'Once daily morning', days: 90 }], advice: 'Walk 30 min daily. Avoid sugar and maida.', status: 'collected', pharmacyId: 'fac_p1', fulfilment: 'pickup', createdAt: ago(21), signature: 'Dr. Meera Iyer · UPMC-48211' },
    { id: 'rx_502', consultId: 'con_102', patientId: 'OC-2041-9015', doctorId: 'doc_2', items: [{ drug: 'Salbutamol inhaler 100mcg', dose: '2 puffs', freq: 'When needed (max 4×/day)', days: 30 }, { drug: 'Budesonide inhaler 200mcg', dose: '1 puff', freq: 'Twice daily', days: 30 }], advice: 'Use spacer. Avoid dust and smoke.', status: 'sent', pharmacyId: 'fac_p1', fulfilment: 'delivery', createdAt: ago(1), signature: 'Dr. Arjun Mehta · UPMC-51092' },
  ];

  const labOrders = [
    { id: 'lab_301', patientId: 'OC-2041-7783', doctorId: 'doc_1', labId: 'fac_l1', tests: [{ code: '4548-4', name: 'HbA1c' }, { code: '2093-3', name: 'Lipid profile' }], status: 'reported', pincode: '225001', createdAt: ago(20), reportedAt: ago(19), critical: false, results: [{ name: 'HbA1c', value: '8.1', unit: '%', range: '4.0 – 5.6', flag: 'high' }, { name: 'Total Cholesterol', value: '196', unit: 'mg/dL', range: '< 200', flag: 'normal' }, { name: 'LDL', value: '128', unit: 'mg/dL', range: '< 100', flag: 'high' }] },
    { id: 'lab_305', needsBooking: true, patientId: 'OC-2041-7783', doctorId: 'doc_1', labId: 'fac_l1', tests: [{ code: '58410-2', name: 'Complete Blood Count (CBC)' }, { code: '1558-6', name: 'Fasting Blood Sugar' }], status: 'ordered', pincode: '225001', createdAt: ago(0, 3), critical: false, results: [] },
    { id: 'lab_302', patientId: 'OC-2041-5521', doctorId: 'doc_1', labId: 'fac_l1', tests: [{ code: '58410-2', name: 'Complete Blood Count' }, { code: '7905-3', name: 'Dengue NS1 Antigen' }], status: 'processing', pincode: '225301', createdAt: ago(0, 5), critical: false, results: [] },
    { id: 'lab_303', patientId: 'OC-2041-6610', doctorId: 'doc_2', labId: 'fac_l1', tests: [{ code: '7905-3', name: 'Dengue NS1 Antigen' }], status: 'ordered', pincode: '225003', createdAt: ago(0, 2), critical: false, results: [] },
    { id: 'lab_304', patientId: 'OC-2041-1187', doctorId: 'doc_1', labId: 'fac_l1', tests: [{ code: '1558-6', name: 'Fasting Blood Sugar' }], status: 'collected', pincode: '225301', createdAt: ago(0, 1), critical: false, results: [] },
  ];

  const drugMaster = [
    'Paracetamol 500mg', 'Paracetamol 650mg', 'Metformin 500mg', 'Amlodipine 5mg', 'Telmisartan 40mg', 'Azithromycin 500mg', 'Amoxicillin 500mg', 'Amoxicillin-Clavulanate 625mg', 'Cetirizine 10mg', 'Pantoprazole 40mg', 'ORS sachet', 'Zinc 20mg', 'Salbutamol inhaler 100mcg', 'Budesonide inhaler 200mcg', 'Ibuprofen 400mg', 'Insulin Glargine 100IU/ml', 'Atorvastatin 10mg', 'Glimepiride 1mg', 'Doxycycline 100mg', 'Artemether-Lumefantrine', 'Platelet count kit', 'Dengue NS1 rapid kit', 'Prednisolone 10mg', 'Ondansetron 4mg', 'Cotrimoxazole 960mg', 'Pregabalin 75mg', 'Vitamin B12 1500mcg', 'Aspirin 75mg', 'Clopidogrel 75mg', 'Losartan 50mg',
  ];

  let inv = 0;
  const stock = (facilityId, drug, qty, expiryDays, safetyStock = 20) => ({ id: `inv_${++inv}`, facilityId, drug, batch: `B${(2400 + inv * 7).toString()}`, expiry: ahead(expiryDays).slice(0, 10), qty, safetyStock, updatedAt: ago(0, inv % 12) });
  const inventory = [
    stock('fac_p1', 'Paracetamol 500mg', 840, 300), stock('fac_p1', 'Metformin 500mg', 410, 420), stock('fac_p1', 'Amlodipine 5mg', 260, 380), stock('fac_p1', 'Azithromycin 500mg', 38, 200), stock('fac_p1', 'ORS sachet', 55, 500, 80), stock('fac_p1', 'Salbutamol inhaler 100mcg', 12, 250, 10), stock('fac_p1', 'Budesonide inhaler 200mcg', 0, 250, 5), stock('fac_p1', 'Cetirizine 10mg', 300, 40), stock('fac_p1', 'Pantoprazole 40mg', 190, 600), stock('fac_p1', 'Amoxicillin 500mg', 140, 25), stock('fac_p1', 'Telmisartan 40mg', 120, 410), stock('fac_p1', 'Zinc 20mg', 220, 330), stock('fac_p1', 'Dengue NS1 rapid kit', 6, 160, 15), stock('fac_p1', 'Pregabalin 75mg', 60, 300),
    stock('fac_p2', 'Paracetamol 650mg', 500, 280), stock('fac_p2', 'Budesonide inhaler 200mcg', 14, 300, 5), stock('fac_p2', 'Insulin Glargine 100IU/ml', 18, 120, 5), stock('fac_p2', 'Azithromycin 500mg', 90, 210), stock('fac_p2', 'ORS sachet', 300, 520, 80), stock('fac_p2', 'Atorvastatin 10mg', 200, 400), stock('fac_p2', 'Vitamin B12 1500mcg', 140, 380),
    stock('fac_p3', 'Insulin Glargine 100IU/ml', 60, 200), stock('fac_p3', 'Artemether-Lumefantrine', 80, 340), stock('fac_p3', 'Platelet count kit', 40, 220), stock('fac_p3', 'Dengue NS1 rapid kit', 120, 200), stock('fac_p3', 'Clopidogrel 75mg', 300, 500),
    stock('fac_p5', 'Paracetamol 500mg', 400, 300), stock('fac_p5', 'Paracetamol 650mg', 260, 320), stock('fac_p5', 'Pantoprazole 40mg', 180, 400), stock('fac_p5', 'Cetirizine 10mg', 220, 300), stock('fac_p5', 'Amoxicillin 500mg', 150, 260), stock('fac_p5', 'Azithromycin 500mg', 60, 240), stock('fac_p5', 'ORS sachet', 200, 500, 40), stock('fac_p5', 'Amlodipine 5mg', 120, 380), stock('fac_p5', 'Metformin 500mg', 300, 420),
    stock('fac_p4', 'Paracetamol 500mg', 1000, 300), stock('fac_p4', 'Doxycycline 100mg', 200, 350),
    stock('fac_w1', 'Paracetamol 500mg', 25000, 500, 2000), stock('fac_w1', 'ORS sachet', 18000, 600, 2000), stock('fac_w1', 'Dengue NS1 rapid kit', 2400, 240, 200), stock('fac_w1', 'Platelet count kit', 900, 260, 100), stock('fac_w1', 'Budesonide inhaler 200mcg', 600, 330, 50), stock('fac_w1', 'Insulin Glargine 100IU/ml', 800, 180, 80), stock('fac_w1', 'Metformin 500mg', 40000, 700, 3000), stock('fac_w1', 'Azithromycin 500mg', 6000, 400, 500),
    stock('fac_w2', 'Amoxicillin 500mg', 12000, 400, 1000), stock('fac_w2', 'ORS sachet', 9000, 550, 1000), stock('fac_w2', 'Artemether-Lumefantrine', 3000, 300, 300),
  ];

  const beds = [
    ...[['general', 120, 96], ['icu', 12, 11], ['oxygen', 40, 31], ['pediatric', 30, 22]].map(([type, total, occupied]) => ({ facilityId: 'fac_h1', type, total, occupied, updatedAt: ago(0, 1) })),
    ...[['general', 400, 388], ['icu', 60, 58], ['oxygen', 120, 104], ['pediatric', 60, 41]].map(([type, total, occupied]) => ({ facilityId: 'fac_h2', type, total, occupied, updatedAt: ago(0, 0.5) })),
    ...[['general', 150, 92], ['icu', 20, 9], ['oxygen', 50, 21], ['pediatric', 25, 12]].map(([type, total, occupied]) => ({ facilityId: 'fac_h3', type, total, occupied, updatedAt: ago(0, 2) })),
    ...[['general', 600, 470], ['icu', 120, 88], ['oxygen', 200, 120], ['pediatric', 80, 51]].map(([type, total, occupied]) => ({ facilityId: 'fac_h4', type, total, occupied, updatedAt: ago(0, 0.2) })),
    ...[['general', 30, 14], ['icu', 0, 0], ['oxygen', 6, 2], ['pediatric', 4, 1]].map(([type, total, occupied]) => ({ facilityId: 'fac_h5', type, total, occupied, updatedAt: ago(1) })),
  ];

  const roster = [
    { id: 'ros_1', facilityId: 'fac_h1', name: 'Dr. P. K. Srivastava', department: 'General Medicine', shift: '08:00 – 16:00', onDuty: true, teleconsult: true },
    { id: 'ros_2', facilityId: 'fac_h1', name: 'Dr. Ritu Pandey', department: 'Obstetrics', shift: '08:00 – 16:00', onDuty: true, teleconsult: false },
    { id: 'ros_3', facilityId: 'fac_h1', name: 'Dr. Imran Khan', department: 'Emergency', shift: '16:00 – 00:00', onDuty: false, teleconsult: false },
    { id: 'ros_4', facilityId: 'fac_h1', name: 'Dr. Arjun Mehta', department: 'Pediatrics', shift: '10:00 – 18:00', onDuty: true, teleconsult: true },
    { id: 'ros_5', facilityId: 'fac_h1', name: 'Dr. S. Chauhan', department: 'Orthopedics', shift: '09:00 – 15:00', onDuty: true, teleconsult: false },
  ];

  const referrals = [
    { id: 'ref_1', patientId: 'OC-2041-3320', patientName: 'Kamla Devi', age: 76, fromDoctorId: 'doc_1', fromName: 'Dr. Meera Iyer (teleconsult)', toFacilityId: 'fac_h1', bedType: 'general', reason: 'Fall at home, suspected hip fracture. Needs X-ray and ortho review.', urgency: 'doctor_now', status: 'pending', eta: '40 min', createdAt: ago(0, 0.4) },
    { id: 'ref_2', patientId: 'OC-2041-5521', patientName: 'Ramesh Yadav', age: 55, fromDoctorId: 'doc_1', fromName: 'Dr. Meera Iyer (teleconsult)', toFacilityId: 'fac_h1', bedType: 'oxygen', reason: 'COPD exacerbation, SpO2 91% on room air.', urgency: 'emergency', status: 'accepted', eta: '25 min', createdAt: ago(3) },
  ];

  const opdSlots = [
    { id: 'opd_1', facilityId: 'fac_h1', department: 'General Medicine', date: ahead(1).slice(0, 10), time: '10:00', capacity: 30, booked: 22 },
    { id: 'opd_2', facilityId: 'fac_h1', department: 'Pediatrics', date: ahead(1).slice(0, 10), time: '11:00', capacity: 20, booked: 9 },
    { id: 'opd_3', facilityId: 'fac_h1', department: 'Orthopedics', date: ahead(2).slice(0, 10), time: '09:30', capacity: 15, booked: 15 },
  ];

  const transfers = [
    { id: 'tr_1', drug: 'Budesonide inhaler 200mcg', qty: 40, fromId: 'fac_w1', toId: 'fac_p1', status: 'requested', reason: 'Out of stock at Jan Aushadhi Kendra; active prescription rx_502', createdAt: ago(0, 1) },
    { id: 'tr_2', drug: 'Dengue NS1 rapid kit', qty: 200, fromId: 'fac_w1', toId: 'fac_p1', status: 'dispatched', reason: 'Outbreak advisory — dengue rising in 225001', courierId: 'u_rider1', createdAt: ago(0, 6) },
    { id: 'tr_3', drug: 'Insulin Glargine 100IU/ml', qty: 10, fromId: 'fac_p3', toId: 'fac_p2', status: 'requested', reason: 'Low stock, cold chain', createdAt: ago(0, 3) },
  ];

  const deliveries = [
    { id: 'del_1', kind: 'prescription', refId: 'rx_502', pickup: 'Jan Aushadhi Kendra, Civil Lines', drop: 'Sunita Devi · Ward 7, Civil Lines, Barabanki', courierId: 'u_rider1', status: 'assigned', coldChain: false, otp: '4821', items: 'Salbutamol inhaler ×1, Budesonide inhaler ×1', distanceKm: 2.4, createdAt: ago(0, 0.5) },
    { id: 'del_2', kind: 'transfer', refId: 'tr_2', pickup: 'UP State Drug Store, Lucknow', drop: 'Jan Aushadhi Kendra, Civil Lines, Barabanki', courierId: 'u_rider1', status: 'in_transit', coldChain: false, otp: '7730', items: 'Dengue NS1 rapid kit ×200', distanceKm: 31, createdAt: ago(0, 6) },
    { id: 'del_3', kind: 'transfer', refId: 'tr_old', pickup: 'Apollo Pharmacy Hazratganj', drop: 'Gupta Medical Store, Barabanki', courierId: 'u_rider1', status: 'delivered', coldChain: true, otp: '1190', items: 'Insulin Glargine ×6', distanceKm: 33, createdAt: ago(2), deliveredAt: ago(2) },
  ];

  const alerts = [
    { id: 'al_1', type: 'outbreak', disease: 'Dengue', district: 'Barabanki', state: 'Uttar Pradesh', pincode: '225001', confidence: 0.86, multiplier: 3.4, cases: 41, baseline: 12, status: 'open', message: 'Dengue NS1 positives 3.4× seasonal baseline in pin 225001 over the last 7 days.', createdAt: ago(0, 4), actions: [] },
    { id: 'al_2', type: 'shortage', disease: null, drug: 'Budesonide inhaler 200mcg', district: 'Barabanki', state: 'Uttar Pradesh', pincode: '225001', confidence: 0.9, status: 'open', message: '3 transfer requests for Budesonide inhaler in 48h — possible regional shortage.', createdAt: ago(0, 8), actions: [] },
    { id: 'al_3', type: 'overload', disease: null, district: 'Lucknow', state: 'Uttar Pradesh', pincode: '226003', confidence: 0.78, status: 'open', message: 'Lucknow ICU occupancy at 97%, average teleconsult wait 46 min (threshold 30).', createdAt: ago(0, 2), actions: [] },
    { id: 'al_4', type: 'outbreak', disease: 'Influenza-like illness', district: 'Patna', state: 'Bihar', pincode: '800001', confidence: 0.64, multiplier: 2.1, cases: 88, baseline: 42, status: 'confirmed', message: 'ILI symptom reports 2.1× baseline at Patna kiosks.', createdAt: ago(3), actions: [{ at: ago(3), by: 'Shalini Rao, IAS', action: 'Confirmed; stock advisory sent' }] },
  ];

  const corridors = [
    { id: 'cor_1', from: 'Patna, Bihar', to: 'Bengaluru Urban, Karnataka', reason: 'ILI surge — overflow teleconsults', status: 'active', patientsRouted: 214, createdAt: ago(3), openedBy: 'Shalini Rao, IAS' },
  ];

  const consents = [
    { id: 'cst_1', patientId: 'OC-2041-7783', granteeType: 'doctor', granteeId: 'doc_1', granteeName: 'Dr. Meera Iyer', scope: ['history', 'prescriptions', 'labs', 'allergies'], purpose: 'Ongoing diabetes care', start: ago(21), expiry: ahead(69), status: 'active' },
    { id: 'cst_2', patientId: 'OC-2041-7783', granteeType: 'hospital', granteeId: 'fac_h2', granteeName: 'KGMU Trauma Centre', scope: ['history', 'labs'], purpose: 'Records request for cardiology referral', start: null, expiry: null, status: 'pending', requestedAt: ago(0, 3) },
    { id: 'cst_3', patientId: 'OC-2041-7783', granteeType: 'doctor', granteeId: 'doc_3', granteeName: 'Dr. Kavya Reddy', scope: ['history', 'prescriptions'], purpose: 'Second opinion — chest discomfort', start: ago(60), expiry: ago(30), status: 'expired' },
    { id: 'cst_4', patientId: 'OC-2041-5521', granteeType: 'doctor', granteeId: 'doc_1', granteeName: 'Dr. Meera Iyer', scope: ['history', 'prescriptions', 'labs', 'allergies'], purpose: 'Kiosk teleconsult', start: ago(0, 0.3), expiry: ahead(1), status: 'active' },
    { id: 'cst_5', patientId: 'OC-2041-1187', granteeType: 'doctor', granteeId: 'doc_1', granteeName: 'Dr. Meera Iyer', scope: ['history', 'prescriptions', 'labs', 'allergies'], purpose: 'Kiosk teleconsult', start: ago(0, 0.15), expiry: ahead(1), status: 'active' },
  ];

  const audit = [
    { id: 'aud_1', actorId: 'u_doc1', actorName: 'Dr. Meera Iyer', role: 'doctor', action: 'viewed_records', patientId: 'OC-2041-7783', recordType: 'history', reason: 'Teleconsult', at: ago(21) },
    { id: 'aud_2', actorId: 'u_doc1', actorName: 'Dr. Meera Iyer', role: 'doctor', action: 'created_prescription', patientId: 'OC-2041-7783', recordType: 'prescription', reason: 'rx_501', at: ago(21) },
    { id: 'aud_3', actorId: 'u_lab1', actorName: 'Neha Singh', role: 'lab_tech', action: 'uploaded_report', patientId: 'OC-2041-7783', recordType: 'lab', reason: 'lab_301', at: ago(19) },
    { id: 'aud_4', actorId: 'u_doc3', actorName: 'Dr. Kavya Reddy', role: 'doctor', action: 'viewed_records', patientId: 'OC-2041-7783', recordType: 'history', reason: 'Second opinion', at: ago(45) },
    { id: 'aud_5', actorId: 'u_hosp1', actorName: 'Dr. Imran Khan', role: 'doctor', action: 'break_glass', patientId: 'OC-2041-3320', recordType: 'critical', reason: 'Unconscious on arrival after fall — needed allergy and medication list', at: ago(6), reviewed: false },
  ];

  const notifications = [
    { id: 'n_1', userId: 'u_pat1', title: 'Follow-up tomorrow', body: 'Video consult with Dr. Meera Iyer tomorrow. We will remind you 15 minutes before.', at: ago(0, 2), read: false },
    { id: 'n_2', userId: 'u_pat1', title: 'Dengue alert in your area', body: 'Dengue cases are rising around pin 225001. Use mosquito nets, empty standing water, and see a doctor for high fever.', at: ago(0, 4), read: false, kind: 'alert' },
    { id: 'n_3', userId: 'u_pat1', title: 'Record access request', body: 'KGMU Trauma Centre has asked to see your history and lab reports.', at: ago(0, 3), read: false, kind: 'consent' },
  ];

  const advisories = [
    { id: 'adv_1', title: 'Dengue precautions — monsoon 2026', body: 'Empty coolers and pots weekly, use nets, wear full sleeves. Visit an E-Clinic if fever lasts over 2 days.', languages: ['Hindi', 'English', 'Awadhi'], region: 'Barabanki', status: 'published', createdAt: ago(2) },
    { id: 'adv_2', title: 'Heatwave advisory', body: 'Drink ORS, avoid going out between 12 and 4 pm, watch elders and children for dizziness.', languages: ['Hindi', 'English'], region: 'Uttar Pradesh', status: 'draft', createdAt: ago(10) },
  ];

  const aiConfig = {
    version: 4,
    triage: { redFlags: ['chest pain', 'breathless', 'can\'t breathe', 'unconscious', 'seizure', 'fits', 'stroke', 'face drooping', 'slurred speech', 'heavy bleeding', 'vomiting blood', 'suicidal', 'severe burn', 'snake bite', 'poison'], spo2Emergency: 90, tempHigh: 102.5 },
    routing: { urgency: 40, specialty: 30, language: 20, waitPenalty: 3, distancePenalty: 10 },
    outbreak: { multiplier: 3, minTests: 10 },
    supply: { radiusSteps: ['5 km', 'district', 'state', 'national'], preferNearExpiry: true },
    history: [
      { version: 1, at: ago(90), by: 'Nexus Ops Team', note: 'Initial rule set signed off by medical advisor' },
      { version: 2, at: ago(60), by: 'Nexus Ops Team', note: 'Added snake bite & poisoning to red flags' },
      { version: 3, at: ago(30), by: 'Nexus Ops Team', note: 'Language weight 15 → 20 after pilot feedback' },
      { version: 4, at: ago(7), by: 'Nexus Ops Team', note: 'Outbreak multiplier 2.5 → 3 to cut false alerts' },
    ],
  };

  const translations = [
    { key: 'welcome', en: 'Welcome', hi: 'स्वागत है', ta: 'வரவேற்கிறோம்', bn: 'স্বাগতম' },
    { key: 'see_doctor_now', en: 'See a doctor now', hi: 'अभी डॉक्टर से मिलें', ta: 'இப்போது மருத்துவரை பாருங்கள்', bn: 'এখনই ডাক্তার দেখান' },
    { key: 'emergency', en: 'Emergency', hi: 'आपातकाल', ta: 'அவசரம்', bn: 'জরুরি' },
  ];

  // Region-level aggregate numbers for the command center map.
  const regions = [
    { state: 'Uttar Pradesh', code: 'UP', districts: ['Barabanki', 'Lucknow', 'Kanpur Nagar'], kiosks: 18, doctorsOnline: 142, population: 241, x: 47, y: 34 },
    { state: 'Bihar', code: 'BR', districts: ['Patna', 'Gaya'], kiosks: 9, doctorsOnline: 61, population: 128, x: 62, y: 38 },
    { state: 'Karnataka', code: 'KA', districts: ['Bengaluru Urban', 'Mysuru'], kiosks: 6, doctorsOnline: 210, population: 68, x: 36, y: 74 },
    { state: 'Maharashtra', code: 'MH', districts: ['Mumbai', 'Pune'], kiosks: 4, doctorsOnline: 260, population: 126, x: 30, y: 56 },
    { state: 'Rajasthan', code: 'RJ', districts: ['Jaipur', 'Jodhpur'], kiosks: 3, doctorsOnline: 74, population: 81, x: 26, y: 33 },
    { state: 'Tamil Nadu', code: 'TN', districts: ['Chennai', 'Madurai'], kiosks: 2, doctorsOnline: 188, population: 77, x: 42, y: 84 },
    { state: 'West Bengal', code: 'WB', districts: ['Kolkata'], kiosks: 2, doctorsOnline: 97, population: 99, x: 70, y: 46 },
    { state: 'Delhi', code: 'DL', districts: ['New Delhi'], kiosks: 1, doctorsOnline: 302, population: 21, x: 37, y: 26 },
  ];

  return {
    meta: { seededAt: new Date().toISOString(), demoPassword: DEMO_PASSWORD },
    users, patients, doctors, facilities, consults, prescriptions, labOrders, drugMaster, inventory,
    beds, roster, referrals, opdSlots, transfers, deliveries, alerts, corridors, consents, audit,
    notifications, advisories, aiConfig, translations, regions, records: [], payments: [], otps: {},
    pharmacyReturns: [], purchaseOrders: [],
    reviews: [
      { id: 'rev_1', doctorId: 'doc_1', consultId: 'con_101', patientId: 'OC-2041-7783', stars: 5, text: 'Explained my sugar report very patiently, in Hindi. Medicines worked.', name: 'Sunita D', at: ago(20) },
      { id: 'rev_2', doctorId: 'doc_2', consultId: 'con_102', patientId: 'OC-2041-9015', stars: 5, text: 'Very gentle with my son. Wheezing settled in 2 days.', name: 'Sunita D', at: ago(8) },
      { id: 'rev_3', doctorId: 'doc_6', consultId: null, patientId: null, stars: 4, text: 'Clinic was clean and on time. Had to wait 15 minutes.', name: 'Mohan P', at: ago(12) },
      { id: 'rev_4', doctorId: 'doc_6', consultId: null, patientId: null, stars: 5, text: 'Dr. Verma listens properly and never pushes unnecessary tests.', name: 'Geeta Y', at: ago(30) },
    ],
    medOrders: [
      { id: 'mo_demo1', orderNo: 'MO-418203', patientId: 'OC-2041-5521', userId: 'u_pat2', rxId: null, rxFileId: null, source: 'other', items: [{ drug: 'Paracetamol 500mg', qty: 10, unit: 'tablet', unitPrice: 0.45, lineTotal: 4.5 }, { drug: 'ORS sachet', qty: 6, unit: 'sachet', unitPrice: 9.45, lineTotal: 56.7 }], pharmacyId: 'fac_p1', candidates: [], fulfilment: 'pickup', address: null, medicines: 61.2, deliveryFee: 0, total: 61.2, advance: 0, balance: 61.2, advancePaid: 0, status: 'requested', otp: '5590', createdAt: ago(0, 0.2), note: '' },
    ],
    careTransfers: [],
    credits: [], // Nexus credit ledger (credits.js)
    vitalsLog: [],
    monitorAlerts: [], carePlans: [], bills: [], gtinMap: [], // remote-monitoring alerts (monitoring.js)
  };
}

// DATA_MODE=demo  → the Barabanki pilot with demo accounts (password Demo@123) — for showing investors.
// DATA_MODE=live  → a clean network for a real launch: reference data only + one super-admin from env.
// Production defaults to live; development defaults to demo.
const dataMode = () => (process.env.DATA_MODE || (process.env.NODE_ENV === 'production' ? 'live' : 'demo')).toLowerCase();

function liveSeed({ withAdmin = true } = {}) {
  const full = demoSeed();
  const crypto = require('crypto');
  const empty = ['gtinMap', 'bills', 'carePlans', 'reviews', 'medOrders', 'careTransfers', 'payments', 'patients', 'doctors', 'facilities', 'consults', 'prescriptions', 'labOrders', 'inventory', 'beds', 'roster', 'referrals', 'opdSlots', 'transfers', 'deliveries', 'alerts', 'corridors', 'consents', 'audit', 'notifications', 'advisories', 'regions', 'records', 'pharmacyReturns', 'purchaseOrders', 'credits', 'vitalsLog', 'monitorAlerts'];
  // The rule set is reference data, but the demo's change history ("signed off by medical advisor", "after
  // pilot feedback") never happened on a live network: start at v1 with one honest entry (and a snapshot,
  // so an admin can roll back to the defaults).
  const { history: _demoHistory, ...rules } = full.aiConfig;
  const now0 = new Date().toISOString();
  full.aiConfig = { ...rules, version: 1, history: [{ version: 1, at: now0, by: 'System', note: 'Default rule set installed — not yet reviewed by a medical advisor', snapshot: { triage: rules.triage, routing: rules.routing, outbreak: rules.outbreak } }] };
  if (full.wallets) full.wallets = {};
  if (!withAdmin) { const shape = { ...full, users: [], otps: {} }; for (const k of empty) shape[k] = []; return shape; }
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  let password = process.env.ADMIN_PASSWORD || '';
  if (!email) throw new Error('DATA_MODE=live needs ADMIN_EMAIL (and ideally ADMIN_PASSWORD) in the environment to create the first admin.');
  if (password.length < 10) {
    // Never print a super-admin password into production logs (hosted log viewers keep them, and more people
    // can read them than should hold that account) — require it to be set instead.
    if (process.env.NODE_ENV === 'production') throw new Error('DATA_MODE=live needs ADMIN_PASSWORD (10+ characters) in the environment to create the first admin.');
    password = crypto.randomBytes(12).toString('base64url');
    console.warn(`[seed] ADMIN_PASSWORD missing or short — generated one for ${email}: ${password}  (development only; change it after first sign-in)`);
  }
  const now = new Date().toISOString();
  const admin = { id: 'u_admin', name: process.env.ADMIN_NAME || 'Nexus Healthcare Admin', email, phone: process.env.ADMIN_PHONE || '', role: 'super_admin', status: 'active', region: { state: '', district: '' }, passwordHash: bcrypt.hashSync(password, 10), createdAt: now };
  const out = { ...full, meta: { seededAt: now, mode: 'live' }, users: [admin], otps: {} };
  for (const k of empty) out[k] = [];
  return out;
}

module.exports = function seed() {
  return dataMode() === 'live' ? liveSeed() : demoSeed();
};
module.exports.dataMode = dataMode;
// Collections only (no admin, no demo rows) — used to add collections introduced after a database was created.
module.exports.shape = () => (dataMode() === 'live' ? liveSeed({ withAdmin: false }) : demoSeed());
