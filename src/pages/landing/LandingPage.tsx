import { Link } from "react-router-dom";
import { Sparkles, FileText, Activity, ShieldCheck } from "lucide-react";
import LandingNav from "./LandingNav";
import Hero from "./Hero";
import FeatureSection from "./FeatureSection";
import "../../styles/landing.css";

export default function LandingPage() {
  return (
    <main className="ls-landing">
      <LandingNav />
      <Hero />

      <FeatureSection
        icon={Sparkles}
        eyebrow="AI Analysis"
        title="Chain of title, solved."
        body="Run a full chain-of-title analysis against Claude, GPT-4, or Gemini from one interface. No copy-paste, no prompt engineering — just documents in, analysis out."
      />

      <FeatureSection
        icon={FileText}
        eyebrow="Documents"
        title="Every deed, in its place."
        body="Upload, search, and organize deeds, mortgages, and title documents with automatic PDF metadata extraction. Drag, drop, and find it again in seconds."
      />

      <FeatureSection
        icon={Activity}
        eyebrow="Live Progress"
        title="Watch the work happen."
        body="Follow each analysis step by step. Cancel when you need to, refresh without losing your place, and know exactly what the AI is doing at every moment."
      />

      <FeatureSection
        icon={ShieldCheck}
        eyebrow="Audit Trail"
        title="Nothing slips through."
        body="Every upload, edit, download, and analysis is logged — who did it, when, and why. Transparency your compliance team will actually thank you for."
      />

      <section className="ls-footer-cta" aria-label="Get started">
        <h2 className="ls-footer-headline">Ready to modernize title?</h2>
        <Link to="/login" className="ls-primary-btn">
          Sign in to get started
        </Link>
      </section>

      <footer className="ls-footer-foot">
        &copy; {new Date().getFullYear()} LandShark Group
      </footer>
    </main>
  );
}
