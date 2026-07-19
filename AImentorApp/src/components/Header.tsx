import * as React from "react";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";

import bitecodeLogo from "./img/bitecode-logo.webp";

interface HeaderProps {
  courseName: string;
}

export function Header({ courseName }: HeaderProps) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const NavLinks = () => (
    <>
      <a
        href="https://bitecode.co"
        className="header-nav-link"
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => setIsOpen(false)}
      >
        <span>Home</span>
      </a>
      <a
        href="https://www.bitecode.co/courses"
        className="header-nav-link"
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => setIsOpen(false)}
      >
        <span>Courses</span>
      </a>
      <a
        href="https://www.bitecode.co/home/feedback"
        className="header-nav-link"
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => setIsOpen(false)}
      >
        <span>Contact</span>
      </a>
      <a
        href="https://www.bitecode.co/home/legal-terms-privacy"
        className="header-nav-link"
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => setIsOpen(false)}
      >
        <span>Legal &amp; Privacy</span>
      </a>
      <a
        href="https://buymeacoffee.com/bitecode"
        className="header-nav-link"
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => setIsOpen(false)}
      >
        <span>Donate</span>
      </a>
    </>
  );

  return (
    <header className="app-header">
      <div className="app-header-inner">
        <div className="header-desktop">
          <div className="header-brand">
            <div className="header-logo header-logo-desktop" aria-label="BiteCode">
              <img src={bitecodeLogo} alt="" />
              <span>BiteCode</span>
            </div>
            <div>
              <h1 className="header-title">{courseName}</h1>
              <h2 className="header-subtitle">AI Mentor lesson</h2>
            </div>
          </div>

          <nav className="header-nav" aria-label="Primary navigation">
            <NavLinks />
          </nav>
        </div>

        <div className="header-mobile">
          <div className="header-brand header-brand-mobile">
            <div className="header-logo header-logo-mobile" aria-label="BiteCode">
              <img src={bitecodeLogo} alt="" />
              <span>BiteCode</span>
            </div>
            <div>
              <h1 className="header-title header-title-mobile">
                {courseName}
              </h1>
              <h2 className="header-subtitle header-subtitle-mobile">
                AI Mentor lesson
              </h2>
            </div>
          </div>

          <button
            type="button"
            className="header-menu-button"
            aria-label="Open navigation menu"
            aria-controls="mobile-navigation"
            aria-expanded={isOpen}
            onClick={() => setIsOpen(true)}
          >
            <Menu size={24} />
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="mobile-menu-layer" role="presentation">
          <button
            type="button"
            className="mobile-menu-overlay"
            aria-label="Close navigation menu"
            onClick={() => setIsOpen(false)}
          />
          <aside
            id="mobile-navigation"
            className="mobile-menu-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
          >
            <div className="mobile-menu-header">
              <div className="header-logo header-logo-mobile" aria-label="BiteCode">
                <img src={bitecodeLogo} alt="" />
              </div>
              <div className="mobile-menu-title">
                <div>BiteCode</div>
                <span>{courseName}</span>
              </div>
              <button
                type="button"
                className="header-menu-button mobile-menu-close"
                aria-label="Close navigation menu"
                onClick={() => setIsOpen(false)}
              >
                <X size={22} />
              </button>
            </div>
            <nav className="mobile-menu-nav" aria-label="Mobile navigation">
              <NavLinks />
            </nav>
          </aside>
        </div>
      )}
    </header>
  );
}
