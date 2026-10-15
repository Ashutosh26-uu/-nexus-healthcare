// Offline geography: district centroids for distance ranking and "use my location".
// Coordinates from the device are matched against this table on our own server — they are
// never sent to a third-party geocoding service.

const DISTRICTS = [
  // Uttar Pradesh (pilot state)
  { district: 'Barabanki', state: 'Uttar Pradesh', lat: 26.93, lng: 81.19, pin: '225001' },
  { district: 'Lucknow', state: 'Uttar Pradesh', lat: 26.85, lng: 80.95, pin: '226001' },
  { district: 'Kanpur Nagar', state: 'Uttar Pradesh', lat: 26.45, lng: 80.33, pin: '208001' },
  { district: 'Ayodhya', state: 'Uttar Pradesh', lat: 26.79, lng: 82.20, pin: '224001' },
  { district: 'Sitapur', state: 'Uttar Pradesh', lat: 27.57, lng: 80.68, pin: '261001' },
  { district: 'Raebareli', state: 'Uttar Pradesh', lat: 26.23, lng: 81.23, pin: '229001' },
  { district: 'Gonda', state: 'Uttar Pradesh', lat: 27.13, lng: 81.96, pin: '271001' },
  { district: 'Bahraich', state: 'Uttar Pradesh', lat: 27.57, lng: 81.60, pin: '271801' },
  { district: 'Sultanpur', state: 'Uttar Pradesh', lat: 26.26, lng: 82.07, pin: '228001' },
  { district: 'Unnao', state: 'Uttar Pradesh', lat: 26.55, lng: 80.49, pin: '209801' },
  { district: 'Hardoi', state: 'Uttar Pradesh', lat: 27.40, lng: 80.13, pin: '241001' },
  { district: 'Varanasi', state: 'Uttar Pradesh', lat: 25.32, lng: 82.97, pin: '221001' },
  { district: 'Prayagraj', state: 'Uttar Pradesh', lat: 25.44, lng: 81.85, pin: '211001' },
  { district: 'Gorakhpur', state: 'Uttar Pradesh', lat: 26.76, lng: 83.37, pin: '273001' },
  { district: 'Agra', state: 'Uttar Pradesh', lat: 27.18, lng: 78.01, pin: '282001' },
  { district: 'Meerut', state: 'Uttar Pradesh', lat: 28.98, lng: 77.71, pin: '250001' },
  { district: 'Ghaziabad', state: 'Uttar Pradesh', lat: 28.67, lng: 77.45, pin: '201001' },
  { district: 'Gautam Buddha Nagar', state: 'Uttar Pradesh', lat: 28.54, lng: 77.39, pin: '201301' },
  // Other states
  { district: 'Patna', state: 'Bihar', lat: 25.59, lng: 85.14, pin: '800001' },
  { district: 'Gaya', state: 'Bihar', lat: 24.79, lng: 85.00, pin: '823001' },
  { district: 'Muzaffarpur', state: 'Bihar', lat: 26.12, lng: 85.39, pin: '842001' },
  { district: 'Bengaluru Urban', state: 'Karnataka', lat: 12.97, lng: 77.59, pin: '560001' },
  { district: 'Mysuru', state: 'Karnataka', lat: 12.30, lng: 76.64, pin: '570001' },
  { district: 'New Delhi', state: 'Delhi', lat: 28.61, lng: 77.21, pin: '110001' },
  { district: 'Mumbai', state: 'Maharashtra', lat: 19.08, lng: 72.88, pin: '400001' },
  { district: 'Pune', state: 'Maharashtra', lat: 18.52, lng: 73.86, pin: '411001' },
  { district: 'Nagpur', state: 'Maharashtra', lat: 21.15, lng: 79.09, pin: '440001' },
  { district: 'Kolkata', state: 'West Bengal', lat: 22.57, lng: 88.36, pin: '700001' },
  { district: 'Chennai', state: 'Tamil Nadu', lat: 13.08, lng: 80.27, pin: '600001' },
  { district: 'Coimbatore', state: 'Tamil Nadu', lat: 11.02, lng: 76.96, pin: '641001' },
  { district: 'Hyderabad', state: 'Telangana', lat: 17.39, lng: 78.49, pin: '500001' },
  { district: 'Visakhapatnam', state: 'Andhra Pradesh', lat: 17.69, lng: 83.22, pin: '530001' },
  { district: 'Jaipur', state: 'Rajasthan', lat: 26.91, lng: 75.79, pin: '302001' },
  { district: 'Ahmedabad', state: 'Gujarat', lat: 23.02, lng: 72.57, pin: '380001' },
  { district: 'Bhopal', state: 'Madhya Pradesh', lat: 23.26, lng: 77.41, pin: '462001' },
  { district: 'Indore', state: 'Madhya Pradesh', lat: 22.72, lng: 75.86, pin: '452001' },
  { district: 'Raipur', state: 'Chhattisgarh', lat: 21.25, lng: 81.63, pin: '492001' },
  { district: 'Ranchi', state: 'Jharkhand', lat: 23.34, lng: 85.31, pin: '834001' },
  { district: 'Bhubaneswar', state: 'Odisha', lat: 20.30, lng: 85.82, pin: '751001' },
  { district: 'Guwahati', state: 'Assam', lat: 26.14, lng: 91.74, pin: '781001' },
  { district: 'Thiruvananthapuram', state: 'Kerala', lat: 8.52, lng: 76.94, pin: '695001' },
  { district: 'Chandigarh', state: 'Chandigarh', lat: 30.73, lng: 76.78, pin: '160001' },
  { district: 'Dehradun', state: 'Uttarakhand', lat: 30.32, lng: 78.03, pin: '248001' },
];

// E-Clinics and facilities with a known exact spot (others fall back to their district centroid).
const PLACES = {
  fac_k1: { lat: 27.05, lng: 81.17 }, // Dewa PHC
  fac_k2: { lat: 26.92, lng: 81.20 }, // Barabanki railway station
  fac_k3: { lat: 26.80, lng: 81.12 }, // Haidergarh
  fac_k4: { lat: 26.98, lng: 81.40 }, // Ramnagar
  fac_p1: { lat: 26.935, lng: 81.195 }, // Jan Aushadhi, Civil Lines
  fac_p2: { lat: 26.912, lng: 81.170 }, // Gupta Medical
  fac_p5: { lat: 26.948, lng: 81.205 }, // Sharma Medical Hall
  fac_l1: { lat: 26.931, lng: 81.188 }, // Barabanki Diagnostics
  fac_l3: { lat: 26.927, lng: 81.183 }, // District Hospital lab
  fac_l4: { lat: 26.900, lng: 81.230 }, // CarePlus, Nawabganj
  fac_d1: { lat: 26.940, lng: 81.180 }, // Imaging & diagnostic centre
  fac_h1: { lat: 26.927, lng: 81.183 }, // District Hospital Barabanki
};

const norm = (s) => String(s || '').trim().toLowerCase();
const byDistrict = (district, state) => DISTRICTS.find((d) => norm(d.district) === norm(district) && (!state || norm(d.state) === norm(state)))
  || DISTRICTS.find((d) => norm(d.district) === norm(district));

function km(a, b) {
  if (!a || !b) return null;
  const R = 6371;
  const r = (x) => (x * Math.PI) / 180;
  const dLat = r(b.lat - a.lat);
  const dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

function nearestDistrict(lat, lng) {
  let best = null;
  for (const d of DISTRICTS) {
    const dist = km({ lat, lng }, d);
    if (!best || dist < best.distanceKm) best = { ...d, distanceKm: dist };
  }
  return best;
}

const validCoord = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

// Where is this facility / doctor / patient?
function pointOf(entity) {
  if (!entity) return null;
  if (validCoord(entity.lat, entity.lng)) return { lat: entity.lat, lng: entity.lng };
  if (entity.id && PLACES[entity.id]) return PLACES[entity.id];
  const d = byDistrict(entity.district, entity.state);
  return d ? { lat: d.lat, lng: d.lng } : null;
}

module.exports = { DISTRICTS, km, nearestDistrict, pointOf, validCoord, byDistrict };
