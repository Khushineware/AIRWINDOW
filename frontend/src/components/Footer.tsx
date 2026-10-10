import React from 'react';

export const Footer: React.FC = () => {
  return (
    <footer className="w-full border-t border-[#D9E4D6] bg-white py-4 text-center">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
        <p className="text-xs text-[#4F6157] font-medium tracking-wide">
          Forecast: CAMS via Open-Meteo · Stations: OpenAQ / CPCB
        </p>
      </div>
    </footer>
  );
};
