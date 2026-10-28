# Production login: options

Going live needs a way to send login codes to real members (docs/GO-LIVE.md, step 0). SMS
through a DLT-registered provider was put aside on 2026-10-28. This compares the
alternatives so the owner can choose. Prices change often: confirm them on the providers'
pages before deciding. Written 2026-10-28.

## What the app needs

Everything on the server identifies a person **by phone number**: the login's phone is
matched to `club_members.phone` (`auth_phone()`, used in 16 places in the database rules:
membership, permissions, devices, help requests). So:

- An option that keeps **phone number + code** fits as it is.
- An option that logs in by **email or Google** has no phone in the login. Every rule would
  have to learn to link an email account to a member's phone (and each member would still
  have to prove their phone once). That is a large change across the backend and the app.

## The options

| | **A. WhatsApp code** | **B. Closed pilot, test numbers** | **C. SMS (DLT)** | **D. Email code** |
|---|---|---|---|---|
| How members log in | Phone number → code arrives on WhatsApp | Phone number → a fixed code you give them privately | Phone number → code by SMS | Email → code by email |
| Fits the phone-based backend | Yes | Yes | Yes | **No** (large rework) |
| App change | Small: ask Supabase to send on WhatsApp; wording on the login screen | None | None | Large |
| Server setup | Twilio (built into Supabase), or Meta's WhatsApp API through Supabase's *Send SMS hook* | Add each number + code in the dashboard | MSG91 + DLT (docs/SMS-SETUP.md) | Custom SMTP (e.g. Resend) |
| Paperwork | Meta Business account, a phone number not already on WhatsApp, display name and message template approval (usually hours to a few days); business verification for higher volumes | None | Business entity + DLT registration: 1–2 weeks, ≈ ₹5,900 one-time | None |
| Cost per login | Meta's *authentication* rate for India, a fraction of a rupee per code (check the INR rate card); Twilio adds its own fee on top | Free | SMS rate, a fraction of a rupee per code | Free up to the provider's free quota (Resend: 100 a day) |
| Members without WhatsApp | Can't log in (rare, but plan a fallback) | — | Everyone with a phone | Need an email address (many members don't use one) |
| Security | Good | **Weak:** anyone who learns a number's code can log in as that member | Good | Good |
| Effort (Claude) | Twilio route: about 1 day including tests. Meta direct: 2–3 days (an Edge Function for the hook) | An hour (a checklist) | Configuration only | Weeks |

## Recommendation

1. **Now, for a first pilot: B (test numbers), only for one or two trusted committees.**
   It costs nothing and needs no paperwork, so the go-live runbook can be exercised for
   real. Give each member their own code privately, keep the group small, and remove the
   numbers when moving to A.
2. **For real launch: A (WhatsApp code).** Committee members already live on WhatsApp, it
   needs no DLT registration, and it keeps the phone-based backend untouched. Start with the
   **Twilio** route (supported by Supabase out of the box, least code); move to Meta's API
   through the Send SMS hook later only if Twilio's fee matters at volume.
3. **Keep C (SMS)** as the fallback for members without WhatsApp, if and when the paperwork
   is done.
4. **Don't do D (email):** it doesn't fit how the app identifies people, and many members
   don't use email.

## If A is chosen: what happens next

| Step | Who |
|---|---|
| Create a Twilio account; set up a WhatsApp sender (Meta Business account, a dedicated number, display name) | You |
| Get the authentication (OTP) message template approved | You (Claude drafts the wording) |
| In Supabase (staging first): Authentication → Phone → provider **Twilio**, with the WhatsApp sender | You / Claude |
| App: send codes on WhatsApp, update the login screen wording (Bengali/English), tests | Claude |
| Test on staging with real phones, then add to the go-live session | You, Claude |

## Sources (checked 2026-10-28)

- Supabase phone login (WhatsApp delivery needs Twilio or Twilio Verify): https://supabase.com/docs/guides/auth/phone-login
- Supabase Send SMS hook (alternate channels such as WhatsApp): https://supabase.com/docs/guides/auth/auth-hooks/send-sms-hook
- Meta WhatsApp pricing (per-message, by category and country; INR rate card): https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing
- Resend free tier (100 emails a day): https://resend.com/docs/knowledge-base/account-quotas-and-limits
