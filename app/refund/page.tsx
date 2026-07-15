import Link from "next/link";

// Refund & cancellation policy. Required by Razorpay merchant compliance
// (Indian payment gateways refuse to onboard without a public refund
// page), Google Ads landing-page policy, and standard consumer trust.
//
// Policy summary — the numbers matter, keep them in sync with billing code:
//   - 7-day no-questions-asked refund on the FIRST paid subscription
//   - Annual plans prorated (unused months × monthly price × 0.85)
//   - Wallet top-ups are non-refundable once credited but usable forever
//     up to 12 months per lot (see core/billing/wallet.ts)
//   - Chargebacks trigger account suspension + a ₹1,500 dispute fee
//     (Razorpay passes their fee through and we add clerical cost)

export const metadata = {
  title: "Refund & Cancellation — DecodeCreator",
  description:
    "7-day no-questions-asked refund on new subscriptions. Wallet top-ups are non-refundable. Chargebacks trigger account review.",
};

const SUPPORT_EMAIL = "support.decodecreator@gmail.com";
const EFFECTIVE_DATE = "July 15, 2026";
const CHARGEBACK_FEE_INR = "₹1,500";
const CHARGEBACK_FEE_USD = "$25";

export default function RefundPage() {
  return (
    <article className="container max-w-3xl py-12 space-y-8">
      <header className="space-y-2">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          DecodeCreator
        </div>
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
          Refund &amp; Cancellation Policy
        </h1>
        <p className="text-sm text-muted-foreground">
          Effective {EFFECTIVE_DATE}. Plain terms — we&apos;d rather refund a
          confused customer than lose their trust.
        </p>
      </header>

      <Callout>
        <b>Short version:</b> New subscription unhappy in the first 7 days —
        full refund, no questions. Annual plan cancelled mid-cycle — prorated
        refund of unused months (less 15% processing). Wallet top-ups are
        used-as-you-go and not refundable, but the credits never expire early
        (12 months per top-up).
      </Callout>

      <Section title="1. Subscription refunds (monthly &amp; annual)">
        <p>
          <b>First-time paid subscription — 7-day money back.</b> If you
          subscribe for the first time and decide DecodeCreator isn&apos;t for
          you within 7 calendar days of the initial charge, email us and
          we&apos;ll refund the full amount to the original payment method. No
          form, no survey, no retention call.
        </p>
        <p>
          <b>Renewals.</b> Recurring renewals are non-refundable once
          processed. Cancel any time from your{" "}
          <Link href="/account" className="underline">
            account page
          </Link>{" "}
          — you keep access until the end of the current billing period.
        </p>
        <p>
          <b>Annual plans mid-cycle.</b> If you cancel an annual plan mid-term
          (after the first 7 days), you can request a prorated refund of the
          <b> unused whole months</b> at the equivalent monthly rate, less a
          15% processing/gateway fee. Example: paid ₹15,999 for annual Pro
          (equivalent ₹1,333/month), cancelled after month 4 → 8 unused
          months × ₹1,333 × 0.85 = <b>₹9,064 refunded</b>. Partial months
          are not refunded.
        </p>
        <p>
          <b>Downgrades.</b> Downgrading takes effect at the next renewal.
          The unused portion of the current tier is not refunded but you
          keep the higher tier until renewal.
        </p>
      </Section>

      <Section title="2. Wallet top-ups (pay-as-you-go API credits)">
        <p>
          Wallet credits (see{" "}
          <Link href="/developer" className="underline">
            /developer
          </Link>
          ) are <b>non-refundable once credited</b> to your account. In
          exchange:
        </p>
        <List
          items={[
            "Credits never expire early — each top-up lot is valid for 12 months from the date it was credited (FIFO deduction).",
            "Unused credits carry through subscription changes — cancelling your subscription does not consume or invalidate wallet credits.",
            "If the API is unavailable and a scan fails on our side, the credit is refunded to your wallet automatically (visible in your wallet history as source=\"refund:tool-fail:*\").",
          ]}
        />
        <p>
          <b>Fraudulent or unauthorized top-up?</b> Email us within 48 hours
          of the charge with the Razorpay payment ID — we&apos;ll void the
          credits and refund the payment provided they haven&apos;t been
          spent.
        </p>
      </Section>

      <Section title="3. How to request a refund">
        <List
          items={[
            `Email ${SUPPORT_EMAIL} from the address on your DecodeCreator account.`,
            "Include: the Razorpay payment ID (starts with pay_) and a one-line reason (it doesn't need to be a good reason — we log it for product feedback, not gatekeeping).",
            "We reply within 2 business days. Approved refunds are issued to the original payment method within 5–7 business days after processing on Razorpay's side.",
            "For UPI/wallet payments, refunds arrive same day. For credit/debit cards, refunds typically post within 5–10 business days depending on your bank.",
          ]}
        />
      </Section>

      <Section title="4. Cancellation">
        <p>
          You can cancel your subscription at any time — no phone call, no
          retention flow. Go to{" "}
          <Link href="/account" className="underline">
            Account
          </Link>{" "}
          → Subscription → Cancel. Cancellation takes effect at the end of
          your current billing period; you keep full access until then.
        </p>
        <p>
          Deleting your DecodeCreator account also cancels any active
          subscription. See the{" "}
          <Link href="/privacy" className="underline">
            Privacy Policy
          </Link>{" "}
          for the account-deletion process.
        </p>
      </Section>

      <Section title="5. Chargebacks and payment disputes">
        <p>
          <b>Please email us before initiating a chargeback.</b> Chargebacks
          filed with your bank when we&apos;d have happily refunded you
          directly cost us the disputed amount plus a Razorpay dispute fee,
          plus staff time — and take 30–90 days to resolve versus a 24-hour
          email reply.
        </p>
        <p>
          If a chargeback is initiated without contacting us first,{" "}
          <b>we will</b>:
        </p>
        <List
          items={[
            "Suspend the affected account immediately (API keys revoked, scans blocked) until the dispute is resolved.",
            `Bill a ${CHARGEBACK_FEE_INR} / ${CHARGEBACK_FEE_USD} dispute administration fee if the chargeback is upheld against us but the service was in fact delivered (i.e. scans ran, credits were consumed, or the subscription period was actively used).`,
            "Contest the chargeback with Razorpay using our usage logs, API request records, and scan history from the disputed period.",
            "Permanently ban the account and any related accounts from the platform if the chargeback is found to be fraudulent (services used then charged back).",
          ]}
        />
        <p>
          We will NOT dispute a chargeback where you contacted support first
          and we failed to resolve the issue within 5 business days — that
          case is on us and you should keep the chargeback.
        </p>
      </Section>

      <Section title="6. Service outages and failed scans">
        <p>
          If our system is the reason a scan or API call fails (upstream
          provider outage, our server error, incorrect result), you are{" "}
          <b>automatically refunded</b> the credit(s) charged — no action
          needed. The refund appears in your wallet history within seconds.
        </p>
        <p>
          If an entire day of our service is unavailable to you (verifiable
          in our status logs) and you are on a monthly/annual plan, you can
          request a prorated 1-day service credit added to your wallet.
        </p>
      </Section>

      <Section title="7. What we won't refund">
        <List
          items={[
            "Scans that returned accurate but disappointing data (e.g. \"the account you scanned has real followers\" — we can't refund the truth).",
            "Wallet credits that have been spent on completed API calls.",
            "Subscription renewals after the 7-day money-back window on the FIRST subscription.",
            "Third-party fees (Razorpay's payment gateway fees on approved refunds are eaten by us; on chargebacks they are billed as described in Section 5).",
          ]}
        />
      </Section>

      <Section title="8. Changes to this policy">
        <p>
          If we change refund terms, existing paid subscriptions and unused
          wallet credits are honored under the policy that was in effect
          when you paid. New charges after the policy change use the new
          terms. We&apos;ll email you before material changes take effect.
        </p>
      </Section>

      <Section title="9. Contact">
        <p>
          All refund requests, disputes, and questions:{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="underline">
            {SUPPORT_EMAIL}
          </a>
          . We reply within 2 business days, usually within 24 hours.
        </p>
        <p className="pt-4 text-xs">
          Related policies:{" "}
          <Link href="/terms" className="underline">
            Terms of Service
          </Link>
          {" · "}
          <Link href="/privacy" className="underline">
            Privacy Policy
          </Link>
          {" · "}
          <Link href="/cookies" className="underline">
            Cookie Policy
          </Link>
        </p>
      </Section>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="list-disc pl-6 space-y-1.5">
      {items.map((it) => (
        <li key={it}>{it}</li>
      ))}
    </ul>
  );
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm leading-relaxed">
      {children}
    </div>
  );
}
