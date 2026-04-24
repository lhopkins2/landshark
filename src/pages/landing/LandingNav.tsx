import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

export default function LandingNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav className={`ls-nav${scrolled ? " scrolled" : ""}`}>
      <Link to="/home" className="ls-nav-brand" aria-label="LandShark home">
        <img
          src="/landshark-icon.png"
          alt=""
          className="ls-nav-logo"
          aria-hidden="true"
        />
        <span>LandShark</span>
      </Link>
      <Link to="/login" className="ls-nav-signin">
        Sign in
      </Link>
    </nav>
  );
}
