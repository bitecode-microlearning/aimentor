import React from 'react';
import { APP_VERSION } from '../config/appVersion';
import bitecodeLogo from './img/bitecode-logo.webp';

export function Footer() {
  return (
    <footer className="mentor-footer">
      <div className="mentor-footer-brand">
        <div className="mentor-footer-logo">
          <img src={bitecodeLogo} alt="" />
          <strong>BiteCode</strong>
        </div>
        <p>Build the knowledge and habits behind better software.</p>
        <span>AI Mentor App {APP_VERSION}</span>
      </div>
      <nav className="mentor-footer-links" aria-label="Footer navigation">
        <a href="https://www.bitecode.co/">Home</a>
        <a href="https://www.bitecode.co/courses">Learning paths</a>
        <a href="https://www.bitecode.co/home/feedback">Contact</a>
        <a href="https://www.bitecode.co/home/legal-terms-privacy">Legal &amp; Privacy</a>
        <a href="https://buymeacoffee.com/bitecode" target="_blank" rel="noreferrer">Donate</a>
      </nav>
    </footer>
  );
}
