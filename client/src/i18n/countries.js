// ISO code | dial code | name | national number length hint
const RAW = `IN|91|India|10
AF|93|Afghanistan|9
AL|355|Albania|9
DZ|213|Algeria|9
AD|376|Andorra|6
AO|244|Angola|9
AR|54|Argentina|10
AM|374|Armenia|8
AU|61|Australia|9
AT|43|Austria|10
AZ|994|Azerbaijan|9
BH|973|Bahrain|8
BD|880|Bangladesh|10
BY|375|Belarus|9
BE|32|Belgium|9
BZ|501|Belize|7
BJ|229|Benin|8
BT|975|Bhutan|8
BO|591|Bolivia|8
BA|387|Bosnia and Herzegovina|8
BW|267|Botswana|8
BR|55|Brazil|11
BN|673|Brunei|7
BG|359|Bulgaria|9
BF|226|Burkina Faso|8
BI|257|Burundi|8
KH|855|Cambodia|9
CM|237|Cameroon|9
CA|1|Canada|10
CV|238|Cape Verde|7
CF|236|Central African Republic|8
TD|235|Chad|8
CL|56|Chile|9
CN|86|China|11
CO|57|Colombia|10
KM|269|Comoros|7
CG|242|Congo|9
CD|243|Congo (DRC)|9
CR|506|Costa Rica|8
CI|225|Côte d'Ivoire|10
HR|385|Croatia|9
CU|53|Cuba|8
CY|357|Cyprus|8
CZ|420|Czechia|9
DK|45|Denmark|8
DJ|253|Djibouti|8
DO|1|Dominican Republic|10
EC|593|Ecuador|9
EG|20|Egypt|10
SV|503|El Salvador|8
GQ|240|Equatorial Guinea|9
ER|291|Eritrea|7
EE|372|Estonia|8
SZ|268|Eswatini|8
ET|251|Ethiopia|9
FJ|679|Fiji|7
FI|358|Finland|9
FR|33|France|9
GA|241|Gabon|8
GM|220|Gambia|7
GE|995|Georgia|9
DE|49|Germany|11
GH|233|Ghana|9
GR|30|Greece|10
GT|502|Guatemala|8
GN|224|Guinea|9
GW|245|Guinea-Bissau|9
GY|592|Guyana|7
HT|509|Haiti|8
HN|504|Honduras|8
HK|852|Hong Kong|8
HU|36|Hungary|9
IS|354|Iceland|7
ID|62|Indonesia|11
IR|98|Iran|10
IQ|964|Iraq|10
IE|353|Ireland|9
IL|972|Israel|9
IT|39|Italy|10
JM|1|Jamaica|10
JP|81|Japan|10
JO|962|Jordan|9
KZ|7|Kazakhstan|10
KE|254|Kenya|9
KW|965|Kuwait|8
KG|996|Kyrgyzstan|9
LA|856|Laos|10
LV|371|Latvia|8
LB|961|Lebanon|8
LS|266|Lesotho|8
LR|231|Liberia|9
LY|218|Libya|9
LT|370|Lithuania|8
LU|352|Luxembourg|9
MO|853|Macau|8
MG|261|Madagascar|9
MW|265|Malawi|9
MY|60|Malaysia|10
MV|960|Maldives|7
ML|223|Mali|8
MT|356|Malta|8
MR|222|Mauritania|8
MU|230|Mauritius|8
MX|52|Mexico|10
MD|373|Moldova|8
MC|377|Monaco|8
MN|976|Mongolia|8
ME|382|Montenegro|8
MA|212|Morocco|9
MZ|258|Mozambique|9
MM|95|Myanmar|9
NA|264|Namibia|9
NP|977|Nepal|10
NL|31|Netherlands|9
NZ|64|New Zealand|9
NI|505|Nicaragua|8
NE|227|Niger|8
NG|234|Nigeria|10
KP|850|North Korea|10
MK|389|North Macedonia|8
NO|47|Norway|8
OM|968|Oman|8
PK|92|Pakistan|10
PS|970|Palestine|9
PA|507|Panama|8
PG|675|Papua New Guinea|8
PY|595|Paraguay|9
PE|51|Peru|9
PH|63|Philippines|10
PL|48|Poland|9
PT|351|Portugal|9
QA|974|Qatar|8
RO|40|Romania|9
RU|7|Russia|10
RW|250|Rwanda|9
SA|966|Saudi Arabia|9
SN|221|Senegal|9
RS|381|Serbia|9
SC|248|Seychelles|7
SL|232|Sierra Leone|8
SG|65|Singapore|8
SK|421|Slovakia|9
SI|386|Slovenia|8
SO|252|Somalia|8
ZA|27|South Africa|9
KR|82|South Korea|10
SS|211|South Sudan|9
ES|34|Spain|9
LK|94|Sri Lanka|9
SD|249|Sudan|9
SR|597|Suriname|7
SE|46|Sweden|9
CH|41|Switzerland|9
SY|963|Syria|9
TW|886|Taiwan|9
TJ|992|Tajikistan|9
TZ|255|Tanzania|9
TH|66|Thailand|9
TL|670|Timor-Leste|8
TG|228|Togo|8
TT|1|Trinidad and Tobago|10
TN|216|Tunisia|8
TR|90|Turkey|10
TM|993|Turkmenistan|8
UG|256|Uganda|9
UA|380|Ukraine|9
AE|971|United Arab Emirates|9
GB|44|United Kingdom|10
US|1|United States|10
UY|598|Uruguay|8
UZ|998|Uzbekistan|9
VE|58|Venezuela|10
VN|84|Vietnam|9
YE|967|Yemen|9
ZM|260|Zambia|9
ZW|263|Zimbabwe|9`;

const flag = (iso) => iso.toUpperCase().replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));

export const COUNTRIES = RAW.split('\n').map((l) => {
  const [iso, dial, name, len] = l.split('|');
  return { iso, dial: `+${dial}`, name, len: Number(len), flag: flag(iso) };
});

export function guessCountry() {
  try {
    const saved = localStorage.getItem('oc_country');
    if (saved) return COUNTRIES.find((c) => c.iso === saved) || COUNTRIES[0];
  } catch { /* ignore */ }
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  const region = (navigator.language || '').split('-')[1];
  if (tz === 'Asia/Kolkata' || tz === 'Asia/Calcutta') return COUNTRIES[0];
  return COUNTRIES.find((c) => c.iso === region) || COUNTRIES[0];
}
