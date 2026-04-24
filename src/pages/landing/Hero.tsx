import { Link } from "react-router-dom";
import { ChevronDown } from "lucide-react";

export default function Hero() {
  return (
    <section className="ls-hero" aria-label="Hero">
      <h1 className="ls-hero-headline">
        Title productivity{" "}
        <span className="ls-hero-accent">faster than ever before</span>
      </h1>
      <p className="ls-hero-subhead">
        Chain-of-title research, document management, and AI analysis — all in one
        quiet, modern workspace.
      </p>
      <div className="ls-hero-cta-row">
        <Link to="/pricing" className="ls-primary-btn">
          See pricing
        </Link>
      </div>
      <ChevronDown className="ls-hero-cue" size={24} aria-hidden="true" />
    </section>
  );
}
