import React, { useState } from 'react';
import { NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Wind,
  MapPin,
  Menu,
  X,
  PlusCircle,
} from 'lucide-react';
import { useApp } from '../context/AppContext';

export const Header: React.FC = () => {
  const routerLocation = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const {
    selectedLocation,
    airNow,
    airNowLoading,
    airNowError,
    planId,
    resetNewPlan,
  } = useApp();

  const hasPlan = Boolean(planId);

  const bestTimeHref = hasPlan ? `/plan/${planId}` : '#';
  const whyHref = hasPlan ? `/plan/${planId}/why` : '#';
  const changeHref = hasPlan ? `/plan/${planId}/change` : '#';

  const isBestTimeActive =
    routerLocation.pathname.startsWith('/plan/') &&
    !routerLocation.pathname.includes('/why') &&
    !routerLocation.pathname.includes('/change');
  const isWhyActive = routerLocation.pathname.includes('/why');
  const isChangeActive = routerLocation.pathname.includes('/change');

  const handleNewPlan = (e: React.MouseEvent) => {
    e.preventDefault();
    setMobileMenuOpen(false);
    resetNewPlan();
    navigate('/');
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-[#FFFFFF]/95 backdrop-blur-md border-b border-[#D9E4D6] transition-all">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
        {/* Left: AirWindow Wordmark with INDIA tag */}
        <Link
          to="/"
          className="flex items-center gap-2.5 group whitespace-nowrap shrink-0"
        >
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#1F7A4C] to-[#155C39] text-white flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform">
            <Wind className="w-5 h-5 text-[#E4F2E8]" />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-serif text-2xl font-bold tracking-tight text-[#14211A] group-hover:text-[#1F7A4C] transition-colors">
              AirWindow
            </span>
            <span className="text-[10px] font-mono tracking-wider px-2 py-0.5 rounded-full bg-[#E4F2E8] text-[#1F7A4C] font-bold uppercase">
              India
            </span>
          </div>
        </Link>

        {/* Centre Nav: Single-line (no wrapping), visible >= 1100px */}
        <nav className="hidden min-[1100px]:flex items-center gap-1 text-sm font-medium whitespace-nowrap">
          {/* 1. Planner */}
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `px-3 py-1.5 rounded-lg text-xs lg:text-sm font-medium transition-all ${
                isActive
                  ? 'bg-[#E4F2E8] text-[#1F7A4C] font-semibold'
                  : 'text-[#4F6157] hover:text-[#14211A] hover:bg-black/5'
              }`
            }
          >
            Planner
          </NavLink>

          {/* 2. Live Air */}
          <NavLink
            to="/live"
            className={({ isActive }) =>
              `px-3 py-1.5 rounded-lg text-xs lg:text-sm font-medium transition-all ${
                isActive
                  ? 'bg-[#E4F2E8] text-[#1F7A4C] font-semibold'
                  : 'text-[#4F6157] hover:text-[#14211A] hover:bg-black/5'
              }`
            }
          >
            Live Air
          </NavLink>

          {/* 3. Best Time (Disabled until plan exists) */}
          {hasPlan ? (
            <Link
              to={bestTimeHref}
              className={`px-3 py-1.5 rounded-lg text-xs lg:text-sm font-medium transition-all ${
                isBestTimeActive
                  ? 'bg-[#E4F2E8] text-[#1F7A4C] font-semibold'
                  : 'text-[#4F6157] hover:text-[#14211A] hover:bg-black/5'
              }`}
            >
              Best Time
            </Link>
          ) : (
            <span
              title="Create a plan first"
              className="px-3 py-1.5 rounded-lg text-xs lg:text-sm text-[#4F6157]/45 cursor-not-allowed font-medium select-none"
            >
              Best Time
            </span>
          )}

          {/* 4. Why This Time (Disabled until plan exists) */}
          {hasPlan ? (
            <Link
              to={whyHref}
              className={`px-3 py-1.5 rounded-lg text-xs lg:text-sm font-medium transition-all ${
                isWhyActive
                  ? 'bg-[#E4F2E8] text-[#1F7A4C] font-semibold'
                  : 'text-[#4F6157] hover:text-[#14211A] hover:bg-black/5'
              }`}
            >
              Why This Time
            </Link>
          ) : (
            <span
              title="Create a plan first"
              className="px-3 py-1.5 rounded-lg text-xs lg:text-sm text-[#4F6157]/45 cursor-not-allowed font-medium select-none"
            >
              Why This Time
            </span>
          )}

          {/* 5. Try a Change (Disabled until plan exists) */}
          {hasPlan ? (
            <Link
              to={changeHref}
              className={`px-3 py-1.5 rounded-lg text-xs lg:text-sm font-medium transition-all ${
                isChangeActive
                  ? 'bg-[#E4F2E8] text-[#1F7A4C] font-semibold'
                  : 'text-[#4F6157] hover:text-[#14211A] hover:bg-black/5'
              }`}
            >
              Try a Change
            </Link>
          ) : (
            <span
              title="Create a plan first"
              className="px-3 py-1.5 rounded-lg text-xs lg:text-sm text-[#4F6157]/45 cursor-not-allowed font-medium select-none"
            >
              Try a Change
            </span>
          )}

          {/* 6. Forecast Accuracy */}
          <NavLink
            to="/details"
            className={({ isActive }) =>
              `px-3 py-1.5 rounded-lg text-xs lg:text-sm font-medium transition-all ${
                isActive
                  ? 'bg-[#E4F2E8] text-[#1F7A4C] font-semibold'
                  : 'text-[#4F6157] hover:text-[#14211A] hover:bg-black/5'
              }`
            }
          >
            Forecast Accuracy
          </NavLink>
        </nav>

        {/* Right: Location Pill + New Plan Button + Hamburger (< 1100px) */}
        <div className="flex items-center gap-2.5 shrink-0">
          {/* Location Pill */}
          <div
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#F4F7F4] border border-[#D9E4D6] text-xs transition-all"
            title={selectedLocation ? (selectedLocation.full_address || selectedLocation.name) : 'No location selected'}
          >
            <MapPin className={`w-3.5 h-3.5 shrink-0 ${selectedLocation ? 'text-[#1F7A4C]' : 'text-[#4F6157]'}`} />
            
            {selectedLocation ? (
              <>
                <span className="font-medium text-[#14211A] max-w-[120px] md:max-w-[150px] truncate">
                  {selectedLocation.name}
                </span>
                <span className="text-[#D9E4D6]">|</span>
                {airNowLoading ? (
                  <span className="inline-block w-14 h-3 bg-[#D9E4D6] rounded animate-pulse" />
                ) : airNowError ? (
                  <span className="font-mono text-[11px] text-[#A65100]">Data unavailable</span>
                ) : airNow ? (
                  <span className="font-mono text-[11px] text-[#4F6157] whitespace-nowrap">
                    <span className="w-2 h-2 inline-block rounded-full bg-[#00B050] animate-pulse mr-1" />
                    {airNow.stations_used} stations · {airNow.updated_minutes_ago}m ago
                  </span>
                ) : (
                  <span className="font-mono text-[11px] text-[#4F6157]">Awaiting data</span>
                )}
              </>
            ) : (
              <span className="font-medium text-[#4F6157]">Select location</span>
            )}
          </div>

          {/* New Plan Button */}
          <button
            type="button"
            onClick={handleNewPlan}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#1F7A4C] hover:bg-[#155C39] text-white text-xs font-semibold transition-colors shadow-2xs whitespace-nowrap cursor-pointer"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>New Plan</span>
          </button>

          {/* Hamburger Button on screens < 1100px */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="min-[1100px]:hidden p-2 rounded-xl text-[#14211A] hover:bg-[#F4F7F4] transition-colors"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile / Narrow Drawer (< 1100px) */}
      {mobileMenuOpen && (
        <div className="min-[1100px]:hidden border-t border-[#D9E4D6] bg-white px-4 py-4 space-y-2 shadow-lg">
          {/* Location banner in mobile menu */}
          <div className="px-3 py-2 rounded-xl bg-[#F4F7F4] border border-[#D9E4D6] text-xs flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 truncate">
              <MapPin className="w-3.5 h-3.5 text-[#1F7A4C] shrink-0" />
              <span className="font-medium text-[#14211A] truncate" title={selectedLocation?.full_address}>
                {selectedLocation ? selectedLocation.name : 'Select location'}
              </span>
            </div>
            {airNow && (
              <span className="font-mono text-[10px] text-[#4F6157] shrink-0">
                {airNow.stations_used} stations · {airNow.updated_minutes_ago}m ago
              </span>
            )}
          </div>

          <NavLink
            to="/"
            end
            onClick={() => setMobileMenuOpen(false)}
            className={({ isActive }) =>
              `block px-3 py-2 rounded-xl text-sm font-medium ${
                isActive ? 'bg-[#E4F2E8] text-[#1F7A4C] font-semibold' : 'text-[#14211A] hover:bg-[#F4F7F4]'
              }`
            }
          >
            Planner
          </NavLink>

          <NavLink
            to="/live"
            onClick={() => setMobileMenuOpen(false)}
            className={({ isActive }) =>
              `block px-3 py-2 rounded-xl text-sm font-medium ${
                isActive ? 'bg-[#E4F2E8] text-[#1F7A4C] font-semibold' : 'text-[#14211A] hover:bg-[#F4F7F4]'
              }`
            }
          >
            Live Air
          </NavLink>

          {hasPlan ? (
            <Link
              to={bestTimeHref}
              onClick={() => setMobileMenuOpen(false)}
              className={`block px-3 py-2 rounded-xl text-sm font-medium ${
                isBestTimeActive ? 'bg-[#E4F2E8] text-[#1F7A4C] font-semibold' : 'text-[#14211A] hover:bg-[#F4F7F4]'
              }`}
            >
              Best Time
            </Link>
          ) : (
            <span className="block px-3 py-2 rounded-xl text-sm text-[#4F6157]/45 cursor-not-allowed select-none">
              Best Time (Create a plan first)
            </span>
          )}

          {hasPlan ? (
            <Link
              to={whyHref}
              onClick={() => setMobileMenuOpen(false)}
              className={`block px-3 py-2 rounded-xl text-sm font-medium ${
                isWhyActive ? 'bg-[#E4F2E8] text-[#1F7A4C] font-semibold' : 'text-[#14211A] hover:bg-[#F4F7F4]'
              }`}
            >
              Why This Time
            </Link>
          ) : (
            <span className="block px-3 py-2 rounded-xl text-sm text-[#4F6157]/45 cursor-not-allowed select-none">
              Why This Time (Create a plan first)
            </span>
          )}

          {hasPlan ? (
            <Link
              to={changeHref}
              onClick={() => setMobileMenuOpen(false)}
              className={`block px-3 py-2 rounded-xl text-sm font-medium ${
                isChangeActive ? 'bg-[#E4F2E8] text-[#1F7A4C] font-semibold' : 'text-[#14211A] hover:bg-[#F4F7F4]'
              }`}
            >
              Try a Change
            </Link>
          ) : (
            <span className="block px-3 py-2 rounded-xl text-sm text-[#4F6157]/45 cursor-not-allowed select-none">
              Try a Change (Create a plan first)
            </span>
          )}

          <NavLink
            to="/details"
            onClick={() => setMobileMenuOpen(false)}
            className={({ isActive }) =>
              `block px-3 py-2 rounded-xl text-sm font-medium ${
                isActive ? 'bg-[#E4F2E8] text-[#1F7A4C] font-semibold' : 'text-[#14211A] hover:bg-[#F4F7F4]'
              }`
            }
          >
            Forecast Accuracy
          </NavLink>
        </div>
      )}
    </header>
  );
};
