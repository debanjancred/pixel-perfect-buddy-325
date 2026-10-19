# Real SMS OTP: MSG91 + DLT checklist

Until this is done, only Supabase **test numbers** can log in (docs/BACKEND.md §3). In India
every business SMS must go out under a DLT-registered **entity**, **header** (sender ID) and
**template**; an unregistered or mismatched message is blocked by the operator. Plan for
**1–2 weeks** end to end. Fees and times below come from provider guides; confirm them on
the portal when you register.

Owner column: **You** = paperwork only you can do · **Claude** = code and configuration.

## 1. Decide the basics (You, 1 hour)

- [ ] **Entity name:** the business that sends the SMS. DLT registers businesses, not
      individuals: a proprietorship, LLP or company. If you have no registered business yet,
      ask MSG91 support which documents they accept for a proprietorship before paying.
- [ ] **Header (sender ID):** 6 letters that recipients see, e.g. `PJKHTA` or `PUJOKH`.
      Pick two in case the first is taken.
- [ ] **OTP message text** (template), final wording, for example:
      `{#var#} is your Pujo Khata login code. It is valid for 10 minutes. Do not share it with anyone.`
      Keep the variable exactly as `{#var#}`. Keep it English-only, or register a separate
      Bengali template too (Unicode SMS costs more per message).

## 2. Register the entity on a DLT portal (You, 3–7 working days)

- [ ] Choose **one** portal: Jio TrueConnect, Airtel DLT, Vodafone Idea (ViLPower), BSNL
      or Tata. The registration is shared across operators.
- [ ] Have ready (scanned PDFs):
  - [ ] PAN of the business (or of the proprietor, for a proprietorship)
  - [ ] Proof of business: GST certificate, Udyam/MSME certificate, or certificate of
        incorporation, as the portal accepts
  - [ ] Authorisation letter on the business letterhead, naming the authorised person
        (the portal provides the format)
  - [ ] ID proof of the authorised person
- [ ] Register as **Principal Entity (PE)** / "Enterprise", verify by OTP, pay the one-time
      fee (≈ ₹5,900 incl. GST on the first portal).
- [ ] Note the **PE ID** (Principal Entity ID) once approved.

## 3. Register the header and template (You, 1–3 working days each)

- [ ] **Header:** type *Transactional / Service*; enter the 6-letter sender ID → note
      approval.
- [ ] **Content template:** type **Service Implicit** (OTP), category *OTP*, linked to the
      header, with the exact text from step 1 → note the **Template ID**.
- [ ] Check that the approved text matches what will be sent **character for character**
      (spaces and full stops included). Any difference gets the SMS blocked.

## 4. Set up MSG91 (You, 1 day)

- [ ] Create an account at msg91.com and complete KYC.
- [ ] Add the DLT details: **PE ID**, **header**, and the **template** with its **DLT
      Template ID**.
- [ ] Create the OTP template in MSG91 with the same text and its variable; note MSG91's
      **template / flow ID**.
- [ ] Buy a small SMS pack for the pilot (OTP SMS is roughly ₹0.15–0.25 each; check the
      current price).
- [ ] Note the **Auth Key** (API key). Put it, and the template ID, in `.env`:
      `MSG91_AUTH_KEY=…` and `MSG91_TEMPLATE_ID=…` (never `VITE_`-prefixed).
- [ ] Send yourself one test SMS from the MSG91 dashboard to confirm it arrives.

## 5. Connect it to Supabase (Claude, about 1 hour, after your yes)

- [ ] An Edge Function `send-sms` that receives Supabase's **Send SMS Hook** (phone + OTP)
      and calls MSG91's OTP API with the template ID; it verifies the hook's signing secret
      and checks MSG91's response body, not just the status code.
- [ ] Test it on **staging** with your own phone, then turn the hook on in **production**
      (Authentication → Auth Hooks → Send SMS), with the MSG91 key as a function secret.
- [ ] Set the OTP expiry (Authentication → Providers → Phone) to match the message
      (10 minutes = 600 seconds).
- [ ] Turn on CAPTCHA (Cloudflare Turnstile) for OTP requests, with the small app change it
      needs, so bots can't run up the SMS bill.
- [ ] Raise "Rate limit for sending SMS messages" to about 2× the logins expected in the
      busiest hour.
- [ ] Remove the test numbers you no longer need.

## Keep a record (You)

| Item | Value | Date approved |
|---|---|---|
| DLT portal | | |
| PE ID | | |
| Header | | |
| DLT Template ID | | |
| MSG91 template / flow ID | | |

Renew anything the portal marks with an expiry, and register a new template **before**
changing the message text.
