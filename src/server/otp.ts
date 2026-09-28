import "server-only";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { db } from "@/server/db";
import { HttpError, badRequest } from "@/server/api/http";

/**
 * Phone + 4-digit OTP for the mobile app (UAE numbers only).
 *
 * With `DEV_OTP_CODE` set, that code is issued for every phone and nothing is
 * sent. Otherwise the code goes through `sendSms` — wire a provider there.
 */

export const UAE_PHONE = /^\+9715\d{8}$/;
const OTP_TTL_MS = 5 * 60_000;
const RESEND_AFTER_MS = 30_000;
const MAX_ATTEMPTS = 5;

const hash = (phone: string, code: string) =>
  createHash("sha256").update(`${phone}:${code}:${process.env.MOBILE_JWT_SECRET}`).digest("hex");

async function sendSms(phone: string, text: string) {
  // No SMS provider in phase 1.
  console.info(`[otp] SMS to ${phone}: ${text}`);
}

export async function requestOtp(phone: string) {
  if (!UAE_PHONE.test(phone)) throw badRequest("Enter a UAE mobile number");
  const last = await db.otpChallenge.findFirst({
    where: { phone },
    orderBy: { createdAt: "desc" },
  });
  // The resend cooldown only matters when a real SMS is sent.
  if (!process.env.DEV_OTP_CODE && last && Date.now() - last.createdAt.getTime() < RESEND_AFTER_MS) {
    throw new HttpError(429, "Please wait before requesting another code");
  }
  const code = process.env.DEV_OTP_CODE || String(randomInt(0, 10_000)).padStart(4, "0");
  await db.otpChallenge.create({
    data: { phone, codeHash: hash(phone, code), expiresAt: new Date(Date.now() + OTP_TTL_MS) },
  });
  if (!process.env.DEV_OTP_CODE) await sendSms(phone, `Your Laundry code is ${code}`);
}

/** Returns true and consumes the challenge when `code` is right. */
export async function verifyOtp(phone: string, code: string): Promise<boolean> {
  const challenge = await db.otpChallenge.findFirst({
    where: { phone, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!challenge || challenge.attempts >= MAX_ATTEMPTS) return false;
  const expected = Buffer.from(challenge.codeHash, "hex");
  const actual = Buffer.from(hash(phone, code), "hex");
  if (expected.length === actual.length && timingSafeEqual(expected, actual)) {
    await db.otpChallenge.deleteMany({ where: { phone } });
    return true;
  }
  await db.otpChallenge.update({
    where: { id: challenge.id },
    data: { attempts: { increment: 1 } },
  });
  return false;
}
