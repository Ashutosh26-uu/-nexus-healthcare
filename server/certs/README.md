# UIDAI public certificates — Aadhaar Secure QR verification

`server/aadhaarQr.js` loads every `.cer` here and checks a scanned Aadhaar Secure QR's RSA-SHA256 signature
against each. These are UIDAI's **public** certificates (no secrets). Only add files downloaded from UIDAI's
own domain.

Source page: https://uidai.gov.in/en/data-and-download (section "Offline e-KYC public key certificates —
for validating the digital signature of Aadhaar Paperless Offline e-KYC and Secure QR Code").
Files are served from `https://backend.uidai.gov.in/get/files/media/document/2026-07/<file>`.
Downloaded 2026-10-17.

| File | UIDAI table | Subject CN | Valid | SHA-256 of file |
|---|---|---|---|---|
| uidai_offline_publickey_2026.cer | Paperless Offline e-KYC | DS Unique Identification Authority of India 06 | 2026-02-03 → 2029-02-03 | 1ea1c3468af581964056203264d470c14b890f928aea72eff611637d88f36a26 |
| uidai_offline_publickey_17022026.cer | Paperless Offline e-KYC | DS Unique Identification Authority of India 05 | 2024-02-21 → 2026-02-16 | 68607e079d81ecbf7368b07b1ab5317f1f006934016feef9393cbbb7b9dd49f7 |
| uidai_offline_publickey_26022021.cer | Paperless Offline e-KYC | DS UNIQUE IDENTIFICATION AUTHORITY OF INDIA 05 | 2021-02-26 → 2024-02-27 | 288475ef50ac1e73550f487062ef6a8a9580310dd1e312d069faaa1331e4847f |
| uidai_offline_publickey_29032019.cer | Paperless Offline e-KYC | DS UNIQUE IDENTIFICATION AUTHORITY OF INDIA 04 | 2019-03-15 → 2021-02-28 | 89208e69e3da86679e0d7e0cc6e31cfc2f0d6b6d6ac996694ef631044bcd180d |
| uidai_offline_publickey_26022019.cer | Paperless Offline e-KYC | DS UNIQUE IDENTIFICATION AUTHORITY OF INDIA 03 | 2017-04-27 → 2019-04-09 | b6696efb937378db01a1f3306cc9aa6e309d6e9337921d5ba207274f798bb857 |
| uidai_12_06_18_cer.cer | Secure QR Code | DS UNIQUE IDENTIFICATION AUTHORITY OF INDIA 7 | 2018-06-08 → 2021-06-07 | 3e6a1503f302a7c33b182dd20e0a6853eef77bbb24acc98c91cf16f678d8a977 |
| uidai_prod_cdup.cer | Secure QR Code | DS UNIQUE IDENTIFICATION AUTHORITY OF INDIA 4 | 2017-06-08 → 2020-06-07 | d69bc1630b3dd70c262ad293eea5ecfbff99f3d757c98daa2a53b81925a695fe |

Certificate (DER) SHA-256 fingerprint of the current key, `uidai_offline_publickey_2026.cer`:
`E0:30:4B:9E:61:EE:36:40:EC:DD:AE:2D:B4:B6:17:F2:E2:67:8F:57:DB:C2:82:6C:2F:86:AC:5C:04:F2:77:DF`
(issuer: (n)Code Solutions Sub-CA for DSC 2022).

Expired certificates are kept on purpose: a card printed years ago still carries a QR signed with the key of
that time, and an expired signing certificate doesn't make an old signature fake.

When UIDAI publishes a new key, download it from the page above, check the subject is UIDAI, add it here with
a new row, and restart. Re-check fingerprints with:

    node -e "const c=require('crypto'),f=require('fs');for(const n of f.readdirSync('.'))if(n.endsWith('.cer'))console.log(n,new c.X509Certificate(f.readFileSync(n)).fingerprint256)"

## Test key (development only)

`AADHAAR_TEST_PUBKEY` (a PEM string, or a path to a PEM file) adds a throwaway key so tests can sign fake
Secure-QR payloads. It is ignored whenever `NODE_ENV=production` — checked at start-up and again on every
verification — so production only ever trusts the UIDAI files above.
