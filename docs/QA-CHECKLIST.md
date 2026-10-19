# Real-device checklist

Automated checks run in desktop Chrome at a 360px phone viewport (`npm run qa`). These need
real phones. Tick each on **one Android phone (Chrome)** and **one iPhone (Safari)**; note
the model and OS version. Use the sample club unless a step says otherwise.

## Install & offline (SPEC 5.2)
- [ ] Android: Chrome menu → *Install app*. Icon is the red Durga-eyes icon, not cropped or
      with black corners; it opens full-screen with the red status bar.
- [ ] iPhone: Share → *Add to Home Screen*. Name shows "পুজো খাতা".
- [ ] Open once online, then turn on airplane mode, close and reopen: the app opens, the
      orange "অফলাইন মোড" banner shows, and the dashboard numbers are there.
- [ ] Still offline: collect a chanda. It saves, and the header shows "১টি সিঙ্কের অপেক্ষায়".
- [ ] Turn airplane mode off: within a few seconds "সব সিঙ্ক হয়েছে" appears.

## Camera & photos (SPEC 3.1)
- [ ] Add expense → *ছবি তুলুন*: the rear camera opens; the photo appears in the preview.
- [ ] iPhone: pick a photo taken with the default camera setting (HEIC). It is either
      accepted or shows "ছবিটি খোলা যায়নি…" — never a blank or a freeze.
- [ ] Open the saved expense → photo opens full screen; pinch-zoom works; ✕ at the bottom closes it.

## Sharing (SPEC 2.2, 4.1)
- [ ] Receipt → *হোয়াটসঅ্যাপ*: WhatsApp opens with the receipt text (Bengali renders, no
      link inside). With a household phone number it opens that chat directly.
- [ ] Receipt → *ছবি*: Android shows the share sheet with the PNG; iPhone shows the share
      sheet or downloads it.
- [ ] Receipt → *প্রিন্ট*: the print preview shows only the receipt, on a white page.
- [ ] Accounts → *স্টোরি কার্ড*: image shares/downloads and looks right in WhatsApp Status.

## Language, numbers, dark mode
- [ ] Switch to English and back; numbers switch between ১২,৫০০ and 12,500 as set.
- [ ] Turn on dark mode, close and reopen: no white flash on opening.
- [ ] Bengali text is crisp (Hind Siliguri), with no boxes or broken conjuncts.

## Touch & layout
- [ ] Every button is easy to hit with a thumb; nothing overlaps the bottom bar or the
      "add" buttons.
- [ ] Open Add member / Add expense / Collect a sheet field: the keyboard never covers the field
      being typed in or the Save button (Android Chrome and iPhone Safari).
- [ ] With the phone's text size set to large, screens still fit (no text cut off).
- [ ] Rotate to landscape and back: nothing breaks.

## Cloud mode (only once a Supabase project is connected — docs/BACKEND.md)
- [ ] Login sends a real 6-digit SMS (or use a test number); the "auto-fill 1234" button is gone.
- [ ] Phone A creates a club and adds phone B as collector. B logs in and sees the club.
- [ ] B collects offline; on reconnect, A sees it after pulling down (open the app / pull to refresh).
- [ ] B (collector) cannot add expenses; A (admin) can. A voids B's entry; B sees it struck through.
- [ ] Open `/club/<slug>/accounts` on a third phone that never logged in: totals show,
      no names or phone numbers.
