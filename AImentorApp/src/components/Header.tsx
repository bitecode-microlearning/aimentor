import * as React from "react";
import { useState } from "react";
import { Home, Heart, Menu, X } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from './ui/sheet';
import { Button } from './ui/button';

interface HeaderProps {
  courseName: string;
}

export function Header({ courseName }: HeaderProps) {
  const [isOpen, setIsOpen] = useState(false);

  const NavLinks = () => (
    <>
      <a 
        href="https://bitecode.co" 
        className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-white/15 transition-all no-underline text-white"
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => setIsOpen(false)}
      >
        <Home size={18} />
        <span>Home</span>
      </a>
      <a 
        href="https://buymeacoffee.com/bitecode" 
        className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-white/15 transition-all no-underline text-white"
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => setIsOpen(false)}
      >
        <Heart size={18} />
        <span>Give back to learn more!</span>
      </a>
    </>
  );

  return (
    <header className="w-full bg-[#1376C8] text-white shadow-lg sticky top-0 z-50">
      <div className="w-full max-w-7xl mx-auto px-4 py-4">
        {/* Desktop View */}
        <div className="hidden md:flex items-center justify-between">
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
            <NavLinks />
          </nav>
        </div>

        {/* Mobile View - Logo + Hamburger */}
        <div className="flex md:hidden items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center">
              <span className="text-xl">📚</span>
            </div>
            <div>
              <h1 className="m-0 text-base">BiteCode - {courseName}</h1>
              <h2 className="m-0 text-xs opacity-80">AI Mentoring Lesson</h2>
            </div>
          </div>
          
          <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon"
                className="text-white hover:bg-white/15"
              >
                <Menu size={24} />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="bg-[#1376C8] text-white border-l border-white/20">
              <SheetHeader>
                <SheetTitle className="text-white flex items-center gap-3">
                  <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center">
                    <span className="text-xl">📚</span>
                  </div>
                  <div className="text-left">
                    <div>BiteCode</div>
                    <div className="text-sm opacity-80">{courseName}</div>
                  </div>
                </SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-2 mt-8">
                <NavLinks />
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
