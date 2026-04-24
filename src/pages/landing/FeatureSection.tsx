import type { LucideIcon } from "lucide-react";
import { useReveal } from "./useReveal";

interface FeatureSectionProps {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  body: string;
}

export default function FeatureSection({
  icon: Icon,
  eyebrow,
  title,
  body,
}: FeatureSectionProps) {
  const ref = useReveal<HTMLElement>();

  return (
    <section ref={ref} className="ls-section ls-reveal">
      <div className="ls-section-inner">
        <div className="ls-section-icon" aria-hidden="true">
          <Icon size={24} strokeWidth={1.75} />
        </div>
        <span className="ls-section-eyebrow">{eyebrow}</span>
        <h2 className="ls-section-title">{title}</h2>
        <p className="ls-section-body">{body}</p>
      </div>
    </section>
  );
}
