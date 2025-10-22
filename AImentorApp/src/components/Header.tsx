import React from 'react';
import { Home, Heart } from 'lucide-react';

interface HeaderProps {
  courseName: string;
}

export function Header({ courseName }: HeaderProps) {

  return (
    <header className="w-full bg-[#1376C8] text-white shadow-lg sticky top-0 z-50">
      <div className="w-full max-w-7xl mx-auto px-4 py-4 flex items-center justify-between flex-wrap gap-4 relative">
        {/* Left area: logo on desktop, hamburger on mobile (absolute left to avoid clipping) */}
        <div className="flex items-center gap-4">
          <div className="hidden lg:flex w-12 h-12 bg-white rounded-xl flex items-center justify-center transition-transform hover:scale-105">
            <span className="text-2xl">📚</span>
          </div>

          <div className="lg:hidden flex items-center">
            <div className="flex-shrink-0">
              <MobileHamburgerLeft />
            </div>
          </div>

          <div>
            <h1 className="m-0">BiteCode - {courseName}</h1>
            <h2 className="m-0 text-sm opacity-80">AI Mentoring Lesson</h2>
          </div>
        </div>

        {/* Right area: desktop nav only (CSS controlled) */}
        <nav className="hidden lg:flex items-center gap-4">
          <a
            href="https://bitecode.co"
            className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-white/15 transition-all no-underline text-white"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Home size={18} />
            <span>Home</span>
          </a>
          <a
            href="https://buymeacoffee.com/bitecode"
            className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-white/15 transition-all no-underline text-white"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Heart size={18} />
            <span className="hidden sm:inline">Give back to learn more!</span>
            <span className="inline sm:hidden">Support</span>
          </a>
        </nav>

        {/* absolute hamburger removed; mobile hamburger is rendered inline in left area */}
      </div>
    </header>
  );
}

function MobileNavLinks() {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button
        aria-label="Open menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="z-50 pointer-events-auto p-3 rounded-md bg-white text-[#1376C8] border border-white/20 inline-flex items-center justify-center shadow-sm"
      >
        <span className="block w-5">
          <span className="block h-0.5 bg-[#1376C8] rounded-sm my-1" />
          <span className="block h-0.5 bg-[#1376C8] rounded-sm my-1" />
          <span className="block h-0.5 bg-[#1376C8] rounded-sm my-1" />
        </span>
      </button>

      {open && (
        <div className="absolute right-4 top-14 w-56 bg-white text-black rounded-md p-3 shadow-lg z-50">
          <a href="https://bitecode.co" className="flex items-center gap-2 py-2">Home</a>
          <a href="https://buymeacoffee.com/bitecode" className="flex items-center gap-2 py-2">Support</a>
        </div>
      )}
    </>
  );
}

function MobileHamburgerLeft() {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="lg:hidden fixed left-4 top-4 z-[9999]">
      <button
        aria-label="Open menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="z-50 pointer-events-auto p-3 rounded-md bg-white text-[#1376C8] border border-white/20 inline-flex items-center justify-center shadow-sm"
      >
        <span className="block w-5">
          <span className="block h-0.5 bg-[#1376C8] rounded-sm my-1" />
          <span className="block h-0.5 bg-[#1376C8] rounded-sm my-1" />
          <span className="block h-0.5 bg-[#1376C8] rounded-sm my-1" />
        </span>
      </button>

      {open && (
        <div className="fixed left-4 top-16 w-56 bg-white text-black rounded-md p-3 shadow-lg z-[9999]">
          <a href="https://bitecode.co" className="flex items-center gap-2 py-2">Home</a>
          <a href="https://buymeacoffee.com/bitecode" className="flex items-center gap-2 py-2">Support</a>
        </div>
      )}
    </div>
  );
}
