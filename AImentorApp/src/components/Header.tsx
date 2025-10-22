import React from 'react';
import { Home, Heart } from 'lucide-react';

interface HeaderProps {
  courseName: string;
}

export function Header({ courseName }: HeaderProps) {
  const [isLarge, setIsLarge] = React.useState<boolean>(true);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(min-width: 1024px)');
    const update = () => setIsLarge(mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);

  return (
    <header className="w-full bg-[#1376C8] text-white shadow-lg sticky top-0 z-50">
      <div className="w-full max-w-7xl mx-auto px-4 py-4 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center transition-transform hover:scale-105">
            <span className="text-2xl">📚</span>
          </div>
          <div>
            <h1 className="m-0">BiteCode - {courseName}</h1>
            <h2 className="m-0 text-sm opacity-80">AI Mentoring Lesson</h2>
          </div>
        </div>

        <nav className="flex items-center gap-4">
          {/* Render desktop or mobile UI depending on screen size (JS fallback) */}
          {isLarge ? (
            <div className="flex items-center gap-4">
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
            </div>
          ) : (
            <div className="relative">
              <MobileNavLinks />
            </div>
          )}
        </nav>
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
        className="p-2 rounded-md bg-white/10"
      >
        <span className="block w-5">
          <span className="block h-0.5 bg-white rounded-sm my-1" />
          <span className="block h-0.5 bg-white rounded-sm my-1" />
          <span className="block h-0.5 bg-white rounded-sm my-1" />
        </span>
      </button>

      {open && (
        <div className="absolute right-4 mt-12 w-56 bg-white text-black rounded-md p-3 shadow-lg">
          <a href="https://bitecode.co" className="flex items-center gap-2 py-2">Home</a>
          <a href="https://buymeacoffee.com/bitecode" className="flex items-center gap-2 py-2">Support</a>
        </div>
      )}
    </>
  );
}
