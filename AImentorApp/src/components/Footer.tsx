import React from 'react';
import { Heart, Code, Zap } from 'lucide-react';

export function Footer() {
  return (
    <footer className="w-full bg-white text-[#666] border-t border-[#E0E0E0] py-6 mt-auto">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span>&copy; 2025 BiteCode Academy. All rights reserved.</span>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 text-sm">
              <Code size={16} className="text-[#1376C8]" />
              <span>Learn.</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Zap size={16} className="text-[#00CE8D]" />
              <span>Practice.</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Heart size={16} className="text-[#1376C8]" />
              <span>Repeat.</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
