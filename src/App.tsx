import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { PlannerScreen } from './pages/PlannerScreen';
import { LiveAirScreen } from './pages/LiveAirScreen';
import { BestTimeScreen } from './pages/BestTimeScreen';
import { WhyThisTimeScreen } from './pages/WhyThisTimeScreen';
import { TryAChangeScreen } from './pages/TryAChangeScreen';
import { DetailsScreen } from './pages/DetailsScreen';

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <div className="w-full min-h-screen flex flex-col bg-[#F4F7F4] text-[#14211A] selection:bg-[#E4F2E8] antialiased">
          {/* Full-width sticky header */}
          <Header />

          {/* Centred Container with max-width ~1280px and responsive padding */}
          <main className="flex-1 w-full max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
            <Routes>
              <Route path="/" element={<PlannerScreen />} />
              <Route path="/live" element={<LiveAirScreen />} />
              <Route path="/plan/:id" element={<BestTimeScreen />} />
              <Route path="/plan/:id/why" element={<WhyThisTimeScreen />} />
              <Route path="/plan/:id/change" element={<TryAChangeScreen />} />
              <Route path="/details" element={<DetailsScreen />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>

          {/* One-line minimal footer */}
          <Footer />
        </div>
      </AppProvider>
    </BrowserRouter>
  );
}
