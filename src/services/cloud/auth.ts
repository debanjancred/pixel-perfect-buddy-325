// Phone OTP through Supabase Auth (cloud mode). The SMS provider is configured in the
// Supabase project (docs/BACKEND.md); the app only sends the number and the code.
import { ValidationError } from "@/lib/validation";
import { getCloudClient } from "./client";

const e164 = (phone: string) => `+91${phone}`;

export async function cloudRequestOtp(phone: string) {
  const { error } = await getCloudClient().auth.signInWithOtp({ phone: e164(phone) });
  if (error) {
    throw new ValidationError("phone", error.status === 429 ? "err_otpExpired" : "err_otpSend");
  }
}

export async function cloudVerifyOtp(phone: string, token: string) {
  const { error } = await getCloudClient().auth.verifyOtp({
    phone: e164(phone),
    token,
    type: "sms",
  });
  if (error) throw new ValidationError("otp", "err_otpWrong");
}

export async function cloudSignOut() {
  await getCloudClient().auth.signOut();
}
