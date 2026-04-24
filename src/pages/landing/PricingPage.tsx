import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import LandingNav from "./LandingNav";
import "../../styles/landing.css";

const soloFeatures = [
  "Unlimited chain-of-title analyses",
  "Choose any AI provider — Claude, GPT-4, or Gemini",
  "Unlimited documents and storage",
  "Real-time progress tracking",
  "Full audit trail",
  "PDF and DOCX report generation",
];

const enterpriseFeatures = [
  "Everything in Solo",
  "Organization-wide seats and roles",
  "Centralized billing and API keys",
  "SSO and custom onboarding",
  "Priority support",
  "Custom integrations and SLAs",
];

export default function PricingPage() {
  return (
    <main className="ls-landing">
      <LandingNav />

      <section className="ls-pricing-hero" aria-label="Pricing">
        <h1 className="ls-pricing-hero-headline">
          Simple, <span className="ls-hero-accent">transparent</span> pricing
        </h1>
        <p className="ls-hero-subhead">
          Pay for the software. Pay AI providers directly for what you use. No
          markup, no surprises.
        </p>
      </section>

      <section className="ls-pricing-grid" aria-label="Plans">
        <article className="ls-pricing-card">
          <header className="ls-pricing-card-head">
            <span className="ls-section-eyebrow">Solo</span>
            <div className="ls-pricing-price-row">
              <span className="ls-pricing-price">$2,000</span>
              <span className="ls-pricing-price-per">/month</span>
            </div>
            <p className="ls-pricing-price-note">+ AI provider fees at cost</p>
          </header>
          <p className="ls-pricing-card-body">
            Everything you need to run chain-of-title work on your own. Bring your
            own API keys and pay providers directly.
          </p>
          <ul className="ls-pricing-list">
            {soloFeatures.map((f) => (
              <li key={f}>
                <Check size={16} strokeWidth={2.5} aria-hidden="true" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <Link to="/login" className="ls-primary-btn ls-pricing-cta">
            Get started
          </Link>
        </article>

        <article className="ls-pricing-card ls-pricing-card-featured">
          <header className="ls-pricing-card-head">
            <span className="ls-section-eyebrow">Enterprise</span>
            <div className="ls-pricing-price-row">
              <span className="ls-pricing-price">Contact us</span>
            </div>
            <p className="ls-pricing-price-note">Custom pricing for your team</p>
          </header>
          <p className="ls-pricing-card-body">
            For firms, lenders, and title companies running at scale. Everything in
            Solo plus organization tools and white-glove support.
          </p>
          <ul className="ls-pricing-list">
            {enterpriseFeatures.map((f) => (
              <li key={f}>
                <Check size={16} strokeWidth={2.5} aria-hidden="true" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <a
            href="mailto:sales@landshark.group?subject=Enterprise%20pricing"
            className="ls-primary-btn ls-pricing-cta"
          >
            Contact sales
          </a>
        </article>
      </section>

      <section className="ls-pricing-note" aria-label="About AI fees">
        <h2 className="ls-pricing-note-title">A note on AI fees</h2>
        <p className="ls-pricing-note-body">
          We don't mark up AI costs. You bring your own Anthropic, OpenAI, or Google
          API key and pay those providers directly. Most analyses cost a few cents
          to a few dollars depending on document length and the model you pick.
        </p>
      </section>

      <footer className="ls-footer-foot">
        &copy; {new Date().getFullYear()} LandShark Group
      </footer>
    </main>
  );
}
