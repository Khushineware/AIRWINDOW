import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Flame,
  Footprints,
  Bike,
  Trophy,
  MapPin,
  Clock,
  Sparkles,
  ArrowRight,
  SlidersHorizontal,
  Compass,
  Zap,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RotateCcw,
} from 'lucide-react';
import { getLocations, reverseGeocode, createPlan } from '../api/client';
import { LocationItem } from '../types';
import { useApp } from '../context/AppContext';

const ACTIVITIES = [
  { id: 'running', label: 'Running', icon: Flame, desc: '40 L/min' },
  { id: 'walking', label: 'Walking', icon: Footprints, desc: '20 L/min' },
  { id: 'cycling', label: 'Cycling', icon: Bike, desc: '30 L/min' },
  { id: 'sports', label: 'Sports', icon: Trophy, desc: '35 L/min' },
] as const;

const DURATIONS = [15, 30, 45, 60, 90] as const;

// Quick-pick shortcut city queries (they query the geocoder when clicked)
const QUICK_PICK_CITIES = ['Nagpur', 'Mumbai', 'Bengaluru', 'Delhi', 'Kolkata', 'Hyderabad'];

export const PlannerScreen: React.FC = () => {
  const navigate = useNavigate();
  const {
    selectedLocation,
    setSelectedLocation,
    setPlan,
    formInputs,
    updateFormInputs,
    focusSearchTrigger,
  } = useApp();

  // Search input state
  const [searchQuery, setSearchQuery] = useState(selectedLocation?.full_address || selectedLocation?.name || '');
  const [searchResults, setSearchResults] = useState<LocationItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);

  // Geolocation state
  const [geoState, setGeoState] = useState<{
    status: 'idle' | 'locating' | 'granted' | 'denied' | 'unavailable' | 'timeout' | 'outside';
    message?: string;
  }>({ status: 'idle' });

  // More options collapsed state
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [usualTime, setUsualTime] = useState<string>('18:00');

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchDebounceRef = useRef<any>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Focus search input when triggered (e.g. from New Plan button)
  useEffect(() => {
    if (focusSearchTrigger > 0) {
      setSearchQuery('');
      setSearchResults([]);
      setShowDropdown(false);
      setErrorMessage(null);
      setGeoState({ status: 'idle' });
      searchInputRef.current?.focus();
    }
  }, [focusSearchTrigger]);

  // Synchronize searchQuery with selectedLocation changes if needed
  useEffect(() => {
    if (selectedLocation) {
      setSearchQuery(selectedLocation.full_address || selectedLocation.name);
    } else {
      setSearchQuery('');
    }
  }, [selectedLocation]);

  // Debounced geocoding search (300ms, min 3 chars)
  const performSearch = async (queryText: string) => {
    const clean = queryText.trim();
    if (clean.length < 3) {
      setSearchResults([]);
      setIsSearching(false);
      setSearchError(null);
      return;
    }

    setIsSearching(true);
    setSearchError(null);
    try {
      const results = await getLocations(clean);
      setSearchResults(results);
      setSelectedIndex(-1);
      setShowDropdown(true);
    } catch (err: any) {
      setSearchError(err.message || 'Geocoding failed. Please check connection.');
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    setErrorMessage(null);

    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    if (val.trim().length >= 3) {
      searchDebounceRef.current = setTimeout(() => {
        performSearch(val);
      }, 300);
    } else {
      setSearchResults([]);
      setShowDropdown(false);
    }
  };

  // Keyboard navigation for search dropdown
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown || searchResults.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < searchResults.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : searchResults.length - 1));
    } else if (e.key === 'Enter') {
      if (selectedIndex >= 0 && selectedIndex < searchResults.length) {
        e.preventDefault();
        handleSelectLocation(searchResults[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  };

  const handleSelectLocation = (loc: LocationItem) => {
    setSelectedLocation(loc);
    setSearchQuery(loc.full_address || loc.name);
    setShowDropdown(false);
    setSearchResults([]);
    setErrorMessage(null);
    setGeoState({ status: 'idle' });
  };

  const handleQuickPick = (cityName: string) => {
    setSearchQuery(cityName);
    setShowDropdown(true);
    performSearch(cityName);
  };

  // "Use My Location" via navigator.geolocation (10s timeout, high accuracy)
  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setGeoState({
        status: 'unavailable',
        message: 'Geolocation is not supported by your browser.',
      });
      searchInputRef.current?.focus();
      return;
    }

    setGeoState({ status: 'locating', message: 'Detecting GPS coordinates in India...' });
    setErrorMessage(null);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;

        // Check if within India coordinates (Lat 6-37, Lon 68-98)
        if (lat < 6.0 || lat > 37.0 || lon < 68.0 || lon > 98.0) {
          setGeoState({
            status: 'outside',
            message: `Your GPS location (${lat.toFixed(2)}°N, ${lon.toFixed(2)}°E) is outside India coverage.`,
          });
          return;
        }

        try {
          const locItem = await reverseGeocode(lat, lon);
          handleSelectLocation(locItem);
          setGeoState({
            status: 'granted',
            message: `Located: ${locItem.name}`,
          });
        } catch (err: any) {
          // If reverse geocoding fails, fallback to coordinates
          const fallbackLoc: LocationItem = {
            name: `Location (${lat.toFixed(2)}°N, ${lon.toFixed(2)}°E)`,
            admin: 'India',
            full_address: `Latitude: ${lat.toFixed(4)}, Longitude: ${lon.toFixed(4)}, India`,
            lat: Math.round(lat * 10000) / 10000,
            lon: Math.round(lon * 10000) / 10000,
          };
          handleSelectLocation(fallbackLoc);
          setGeoState({ status: 'granted' });
        }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setGeoState({
            status: 'denied',
            message: 'Location access was denied. Please type your city or locality manually.',
          });
          searchInputRef.current?.focus();
        } else if (err.code === err.TIMEOUT) {
          setGeoState({
            status: 'timeout',
            message: 'Location request timed out. Please type your location manually.',
          });
          searchInputRef.current?.focus();
        } else {
          setGeoState({
            status: 'unavailable',
            message: 'GPS location is currently unavailable. Please type your location.',
          });
          searchInputRef.current?.focus();
        }
      },
      {
        timeout: 10000,
        enableHighAccuracy: true,
      }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLocation) {
      setErrorMessage('Please select a valid location in India before creating a plan.');
      searchInputRef.current?.focus();
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const today = new Date().toISOString().substring(0, 10);
      const planRes = await createPlan({
        location: selectedLocation,
        activity: formInputs.activity,
        duration_min: formInputs.duration_min,
        window_start: `${today}T${formInputs.window_start_time}:00`,
        window_end: `${today}T${formInputs.window_end_time}:00`,
        profile: formInputs.profile,
        usual_time: showMoreOptions ? `${today}T${usualTime}:00` : undefined,
        mask: formInputs.mask,
      });

      setPlan(planRes);
      navigate(`/plan/${planRes.plan_id}`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to generate schedule. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full py-8 sm:py-12 space-y-8">
      {/* Page Title & Subhead */}
      <div className="space-y-3 max-w-[75ch]">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#E4F2E8] border border-[#1F7A4C]/20 text-[#1F7A4C] text-xs font-mono font-semibold uppercase tracking-wider">
          <Sparkles className="w-3.5 h-3.5" />
          <span>India Clean Air Window Planner</span>
        </div>

        <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-[#14211A] leading-[1.15]">
          When should you go outside?
        </h1>

        <p className="text-base sm:text-lg text-[#4F6157] max-w-[65ch] leading-relaxed">
          Breathing rates multiply pollution intake during exercise. We calculate the exact time window with the lowest inhaled particulate dose for your day.
        </p>
      </div>

      {/* Two-Column Layout (>=1024px) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Planner Form (7 cols) */}
        <div className="lg:col-span-7 bg-white border border-[#D9E4D6] rounded-3xl p-6 sm:p-8 shadow-xs">
          <form onSubmit={handleSubmit} className="space-y-7">
            {/* 1. Location Input */}
            <div className="space-y-2 relative" ref={dropdownRef}>
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-[#14211A] flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-[#1F7A4C]" />
                  <span>Where in India?</span>
                </label>
                <button
                  type="button"
                  onClick={handleUseMyLocation}
                  disabled={geoState.status === 'locating'}
                  className="text-xs font-medium text-[#1F7A4C] hover:text-[#155C39] hover:underline transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  {geoState.status === 'locating' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Compass className="w-3.5 h-3.5" />
                  )}
                  <span>{geoState.status === 'locating' ? 'Locating...' : 'Use my location'}</span>
                </button>
              </div>

              <div className="relative">
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={handleSearchChange}
                  onKeyDown={handleKeyDown}
                  onFocus={() => {
                    if (searchResults.length > 0) setShowDropdown(true);
                  }}
                  placeholder="Type address, locality, landmark, city, or PIN code in India..."
                  className="w-full bg-[#F4F7F4]/60 border border-[#D9E4D6] rounded-xl px-4 py-3.5 text-base text-[#14211A] placeholder-[#4F6157]/60 focus:outline-none focus:border-[#1F7A4C] focus:bg-[#FFFFFF] transition-all"
                />
                {isSearching && (
                  <div className="absolute right-4 top-4 flex items-center gap-1.5 text-xs font-mono text-[#4F6157]">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#1F7A4C]" />
                    <span>Searching India...</span>
                  </div>
                )}
              </div>

              {/* Geolocation Feedback Message */}
              {geoState.message && (
                <div
                  className={`text-xs p-2.5 rounded-xl flex items-center gap-2 ${
                    geoState.status === 'granted'
                      ? 'bg-[#E4F2E8] text-[#1F7A4C]'
                      : 'bg-[#FFF5E6] text-[#A65100]'
                  }`}
                >
                  {geoState.status === 'granted' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{geoState.message}</span>
                </div>
              )}

              {/* Quick Popular City Chips (fill the search with geocoded result) */}
              <div className="flex items-center gap-2 flex-wrap pt-1">
                <span className="text-xs font-mono text-[#4F6157]">Popular:</span>
                {QUICK_PICK_CITIES.map((cityName) => (
                  <button
                    key={cityName}
                    type="button"
                    onClick={() => handleQuickPick(cityName)}
                    className="text-xs font-mono px-2.5 py-1 rounded-lg bg-[#F4F7F4] hover:bg-[#E4F2E8] text-[#14211A] border border-[#D9E4D6] transition-colors cursor-pointer"
                  >
                    {cityName}
                  </button>
                ))}
              </div>

              {/* Autocomplete Dropdown */}
              {showDropdown && (
                <div className="absolute z-30 left-0 right-0 mt-1 bg-[#FFFFFF] border border-[#D9E4D6] rounded-xl shadow-lg max-h-60 overflow-y-auto divide-y divide-[#D9E4D6]">
                  {searchResults.length > 0 ? (
                    searchResults.map((loc, idx) => (
                      <button
                        type="button"
                        key={`${loc.lat}-${loc.lon}-${idx}`}
                        onClick={() => handleSelectLocation(loc)}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        className={`w-full text-left px-4 py-3 text-sm text-[#14211A] transition-colors cursor-pointer flex flex-col gap-0.5 ${
                          selectedIndex === idx ? 'bg-[#E4F2E8]' : 'hover:bg-[#F4F7F4]'
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <span className="font-semibold text-[#14211A]">{loc.name}</span>
                          <span className="text-[#4F6157] font-mono text-xs">{loc.admin}</span>
                        </div>
                        {loc.full_address && (
                          <span className="text-xs text-[#4F6157] truncate max-w-full">
                            {loc.full_address}
                          </span>
                        )}
                      </button>
                    ))
                  ) : searchError ? (
                    <div className="p-4 text-xs text-[#A65100] flex items-center justify-between">
                      <span>{searchError}</span>
                      <button
                        type="button"
                        onClick={() => performSearch(searchQuery)}
                        className="font-semibold underline flex items-center gap-1 cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" /> Retry
                      </button>
                    </div>
                  ) : (
                    !isSearching && (
                      <div className="p-4 text-xs font-mono text-[#4F6157] text-center">
                        No results found in India. Try another locality or city name.
                      </div>
                    )
                  )}
                </div>
              )}
            </div>

            {/* 2. Activity Selector */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-[#14211A]">
                Activity
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {ACTIVITIES.map((act) => {
                  const Icon = act.icon;
                  const isSelected = formInputs.activity === act.id;
                  return (
                    <button
                      key={act.id}
                      type="button"
                      onClick={() => updateFormInputs({ activity: act.id })}
                      className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between h-22 ${
                        isSelected
                          ? 'border-[#1F7A4C] bg-[#E4F2E8] shadow-xs ring-1 ring-[#1F7A4C]'
                          : 'border-[#D9E4D6] bg-[#FFFFFF] hover:border-[#1F7A4C]/50 hover:bg-[#F4F7F4]'
                      }`}
                    >
                      <Icon className={`w-5 h-5 ${isSelected ? 'text-[#1F7A4C]' : 'text-[#4F6157]'}`} />
                      <div>
                        <div className={`text-sm font-semibold ${isSelected ? 'text-[#1F7A4C]' : 'text-[#14211A]'}`}>
                          {act.label}
                        </div>
                        <div className="text-[11px] font-mono text-[#4F6157]">
                          {act.desc}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3. Duration Selector */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-sm font-semibold text-[#14211A]">
                  Duration
                </label>
                <span className="text-xs font-mono font-semibold text-[#1F7A4C]">
                  {formInputs.duration_min} minutes
                </span>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {DURATIONS.map((dur) => {
                  const isSelected = formInputs.duration_min === dur;
                  return (
                    <button
                      key={dur}
                      type="button"
                      onClick={() => updateFormInputs({ duration_min: dur })}
                      className={`py-2 rounded-xl text-xs sm:text-sm font-mono font-medium border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[#1F7A4C] text-white border-[#1F7A4C] shadow-xs'
                          : 'bg-[#FFFFFF] text-[#14211A] border-[#D9E4D6] hover:bg-[#F4F7F4]'
                      }`}
                    >
                      {dur}m
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 4. Time Window Sliders / Selectors */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-[#14211A] flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-[#1F7A4C]" />
                <span>Available Window Today</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <span className="text-xs font-mono text-[#4F6157]">Earliest Start</span>
                  <input
                    type="time"
                    value={formInputs.window_start_time}
                    onChange={(e) => updateFormInputs({ window_start_time: e.target.value })}
                    className="w-full bg-[#F4F7F4]/60 border border-[#D9E4D6] rounded-xl px-3 py-2.5 font-mono text-sm text-[#14211A] focus:outline-none focus:border-[#1F7A4C]"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-mono text-[#4F6157]">Latest End</span>
                  <input
                    type="time"
                    value={formInputs.window_end_time}
                    onChange={(e) => updateFormInputs({ window_end_time: e.target.value })}
                    className="w-full bg-[#F4F7F4]/60 border border-[#D9E4D6] rounded-xl px-3 py-2.5 font-mono text-sm text-[#14211A] focus:outline-none focus:border-[#1F7A4C]"
                  />
                </div>
              </div>
            </div>

            {/* 5. More Options Accordion */}
            <div className="border-t border-[#D9E4D6] pt-4">
              <button
                type="button"
                onClick={() => setShowMoreOptions(!showMoreOptions)}
                className="text-xs font-medium text-[#4F6157] hover:text-[#14211A] flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>{showMoreOptions ? 'Hide additional parameters' : 'More options (Sensitivity profile, mask, usual time)'}</span>
              </button>

              {showMoreOptions && (
                <div className="mt-4 p-4 rounded-2xl bg-[#F4F7F4]/60 border border-[#D9E4D6] space-y-4 text-xs">
                  <div className="space-y-1.5">
                    <label className="font-semibold text-[#14211A]">Physiological Profile</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['adult', 'child', 'sensitive'] as const).map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => updateFormInputs({ profile: p })}
                          className={`py-1.5 rounded-lg border font-mono capitalize transition-all cursor-pointer ${
                            formInputs.profile === p
                              ? 'bg-[#1F7A4C] text-white border-[#1F7A4C]'
                              : 'bg-white text-[#14211A] border-[#D9E4D6]'
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div>
                      <div className="font-semibold text-[#14211A]">N95 / Anti-pollution Mask</div>
                      <div className="text-[11px] text-[#4F6157]">Assumes ~33% effective particulate filtration factor</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={formInputs.mask}
                      onChange={(e) => updateFormInputs({ mask: e.target.checked })}
                      className="w-4 h-4 text-[#1F7A4C] rounded border-[#D9E4D6] focus:ring-[#1F7A4C]"
                    />
                  </div>

                  <div className="space-y-1 pt-1">
                    <label className="font-semibold text-[#14211A]">Your Usual Time (for baseline comparison)</label>
                    <input
                      type="time"
                      value={usualTime}
                      onChange={(e) => setUsualTime(e.target.value)}
                      className="w-full bg-white border border-[#D9E4D6] rounded-xl px-3 py-2 font-mono text-xs text-[#14211A]"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Error Message */}
            {errorMessage && (
              <div className="p-3.5 rounded-xl bg-[#FFF5E6] border border-[#FF9900]/30 text-xs text-[#A65100] flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-4 px-6 rounded-2xl bg-[#1F7A4C] hover:bg-[#155C39] text-white font-semibold text-base transition-all shadow-sm hover:shadow flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Computing Cleanest Window...</span>
                </>
              ) : (
                <>
                  <span>Find My Cleanest Window</span>
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Right Column: Selected Location Summary + "How Dose Works" Card (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Selected Location Summary (Only shown once location is selected) */}
          {selectedLocation ? (
            <div className="bg-white border border-[#D9E4D6] rounded-3xl p-6 shadow-xs space-y-3">
              <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-[#1F7A4C] font-semibold">
                <MapPin className="w-4 h-4" />
                <span>Selected Location</span>
              </div>

              <div>
                <h3 className="font-serif text-lg font-bold text-[#14211A]">
                  {selectedLocation.name}
                </h3>
                <p className="text-xs text-[#4F6157] mt-1 leading-relaxed">
                  {selectedLocation.full_address || `${selectedLocation.name}, ${selectedLocation.admin || 'India'}`}
                </p>
              </div>

              <div className="pt-2 border-t border-[#D9E4D6] flex justify-between items-center text-xs font-mono text-[#4F6157]">
                <span>Lat: {selectedLocation.lat.toFixed(4)}°N</span>
                <span>Lon: {selectedLocation.lon.toFixed(4)}°E</span>
              </div>
            </div>
          ) : (
            <div className="bg-white/80 border border-dashed border-[#D9E4D6] rounded-3xl p-6 text-center space-y-2">
              <MapPin className="w-8 h-8 text-[#4F6157]/40 mx-auto" />
              <h3 className="font-serif text-base font-semibold text-[#14211A]">
                No Location Selected
              </h3>
              <p className="text-xs text-[#4F6157] max-w-[32ch] mx-auto leading-relaxed">
                Search an address or pick a city to calibrate local particulate forecasts.
              </p>
            </div>
          )}

          {/* How Dose Works Explainer */}
          <div className="bg-white border border-[#D9E4D6] rounded-3xl p-6 shadow-xs space-y-3">
            <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.06em] text-[#1F7A4C] font-semibold">
              <Zap className="w-4 h-4" />
              <span>How Dose Works</span>
            </div>
            <h3 className="font-serif text-lg font-bold text-[#14211A]">
              Dose = Concentration × Inhaled Volume
            </h3>
            <p className="text-xs text-[#4F6157] leading-relaxed">
              When exercising outdoors, your lungs pump far more air. Running inhales twice as much air as walking in the exact same air quality (40 L/min vs 20 L/min). Timing your activity during clean hours can reduce your inhaled pollution by over 40%.
            </p>
            <div className="pt-2 border-t border-[#D9E4D6] text-[11px] font-mono text-[#4F6157]">
              Formula: Dose (µg) = PM2.5 × Ventilation Rate × Duration
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
