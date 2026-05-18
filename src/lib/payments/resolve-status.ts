import { verifyRazorpayPaymentSignature } from '@/lib/razorpay/verify';

export type PaymentProof = {
  razorpayOrderId?: string | null;
  razorpayPaymentId?: string | null;
  razorpaySignature?: string | null;
  /** Dev only — ignored in production */
  devMockPayment?: boolean;
};

export type ResolvedPayment = {
  status: 'Paid' | 'Pending';
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
};

export async function resolvePaymentStatus(
  tournamentFee: number,
  proof: PaymentProof
): Promise<ResolvedPayment> {
  if (tournamentFee <= 0) {
    return { status: 'Paid', razorpayOrderId: null, razorpayPaymentId: null };
  }

  const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = proof;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  const isProd = process.env.NODE_ENV === 'production';

  if (!secret) {
    if (isProd) {
      throw new Error('Payment gateway is not configured.');
    }
    if (
      proof.devMockPayment === true &&
      process.env.ALLOW_DEV_MOCK_PAYMENT === 'true' &&
      razorpayOrderId &&
      razorpayPaymentId
    ) {
      return {
        status: 'Paid',
        razorpayOrderId,
        razorpayPaymentId,
      };
    }
    throw new Error('Payment gateway is not configured.');
  }

  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    throw new Error('Payment verification data is missing.');
  }

  const valid = verifyRazorpayPaymentSignature(
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
    secret
  );

  if (!valid) {
    throw new Error('Payment verification failed. Invalid signature.');
  }

  return {
    status: 'Paid',
    razorpayOrderId,
    razorpayPaymentId,
  };
}
