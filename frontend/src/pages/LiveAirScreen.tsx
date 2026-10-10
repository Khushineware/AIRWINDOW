import React, { useState, useEffect } from 'react';
import {
  MapPin,
  Radio,
  Clock,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { getTrust, isUsingFixtures, isBackendConfigured } from '../api/client';
import { TrustResponse } from '../types';
import { CPCB_COLORS, CPCB_BG_LIGHT, CPCB_TEXT_DARK, CPCB_ADVISORIES } from '../utils/cpcb';
import { useApp } from '../context/AppContext';

export const LiveAirScreen: React.FC = () => {
  const navigate = useNavigate();
  const { selectedLocation, airNow, airNowLoading, airNowError, refetchAirNow } = useApp();

  const [trustData, setTrustData] = useState<TrustResponse | null>(null);
  const [trustLoading, setTrustLoading] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const usingFixtures = isUsingFixtures();
  const backendConnected = isBackendConfigured();

  useEffect(() => {
    if (!selectedLocation) return;
    let active = true;
    setTrustLoading(true);

    getTrust(selectedLocation.lat, selectedLocation.lon)
      .then((res) => {
        if (active) setTrustData(res);
      })
      .catch((err) => console.warn('Failed to load trust data:', err))
      .finally(() => {
        if (active) setTrustLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedLocation?.lat, selectedLocation?.lon]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetchAirNow();
    if (selectedLocation) {
      try {
        const res = await getTrust(selectedLocation.lat, selectedLocation.lon);
        setTrustData(res);
      } catch {}
    }
    setIsRefreshing(false);
  };

  // If no location is selected, show empty state prompt
  if (!selectedLocation) {
    return (
      <div className="w-full py-16 flex flex-col items-center justify-center text-center space-y-5">
        <div className="w-16 h-16 rounded-3xl bg-[#E4F2E8] border border-[#1F7A4C]/20 flex items-center justify-center text-[#1F7A4C]">
          <Radio className="w-8 h-8" />
        </div>
        <div className="space-y-2 max-w-[45ch]">
          <h2 className="font-serif text-2xl sm:text-3xl font-bold text-[#14211A]">
            Choose a location to see live air quality
          </h2>
          <p className="text-sm text-[#4F6157] leading-relaxed">
            Select a city, locality, or landmark in India on the Planner to view real-time PM2.5 readings, CPCB categorization, and active ground monitoring stations.
          </p>
        </div>
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-[#1F7A4C] hover:bg-[#155C39] text-white font-semibold text-sm transition-all shadow-sm"
        >
          <span>Go to Planner</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    );
  }

  const cpcbCat = airNow?.category || 'Moderate';
  const cpcbColor = CPCB_COLORS[cpcbCat] || '#FF9900';
  const cpcbBg = CPCB_BG_LIGHT[cpcbCat] || '#FFF5E6';
  const cpcbText = CPCB_TEXT_DARK[cpcbCat] || '#A65100';

  const stations = airNow?.stations || trustData?.stations || [];

  return (
    <div className="w-full py-8 sm:py-12 space-y-8">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#E4F2E8] border border-[#1F7A4C]/20 text-[#1F7A4C] text-xs font-mono font-semibold uppercase tracking-wider mb-2">
            <Radio className="w-3.5 h-3.5" />
            <span>Real-Time CAAQMS Monitor · India</span>
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight text-[#14211A]">
            Live Air Quality & Stations
          </h1>
          <p className="text-sm text-[#4F6157] mt-1 max-w-[65ch]">
            Continuous ambient air quality data for <strong className="text-[#14211A]">{selectedLocation.name}</strong> from CPCB, SPCB, and OpenAQ ground sensors.
          </p>
        </div>

        {/* Sample notification tag if not live */}
        {(!backendConnected || usingFixtures) && (
          <div className="bg-[#FFF5E6] border border-[#FF9900]/30 px-3.5 py-2 rounded-xl text-xs font-mono text-[#A65100] flex items-center gap-2 self-start md:self-auto">
            <AlertTriangle className="w-4 h-4 shrink-0 text-[#FF9900]" />
            <span>SAMPLE DATA · Fixture Mode</span>
          </div>
        )}
      </div>

      {/* Selected Location Banner with Refresh Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-white border border-[#D9E4D6] shadow-2xs">
        <div className="flex items-center gap-2.5">
          <MapPin className="w-4 h-4 text-[#1F7A4C] shrink-0" />
          <div>
            <span className="font-semibold text-sm text-[#14211A]">{selectedLocation.name}</span>
            <span className="text-xs text-[#4F6157] ml-2">
              {selectedLocation.full_address || `${selectedLocation.lat.toFixed(2)}°N, ${selectedLocation.lon.toFixed(2)}°E`}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Link
            to="/"
            className="text-xs font-medium text-[#1F7A4C] hover:underline px-2.5 py-1.5"
          >
            Change Location
          </Link>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing || airNowLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#D9E4D6] bg-[#F4F7F4] hover:bg-[#E4F2E8] text-xs font-mono text-[#14211A] transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-[#1F7A4C]' : ''}`} />
            <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* Two Column Layout (>=1024px) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Live Reading & Advisory (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white border border-[#D9E4D6] rounded-3xl p-6 sm:p-8 shadow-xs space-y-6">
            <div className="flex items-center justify-between border-b border-[#D9E4D6] pb-4">
              <div>
                <span className="text-xs font-mono uppercase tracking-wider text-[#4F6157]">
                  Current Ground PM2.5
                </span>
                <div className="text-xs text-[#4F6157]">Near {selectedLocation.name}</div>
              </div>
              <span className="text-xs font-mono text-[#00B050] bg-[#E6F8ED] px-2.5 py-1 rounded-full font-semibold">
                LIVE READING
              </span>
            </div>

            {/* Big Reading Display */}
            <div className="space-y-3">
              <div className="flex items-baseline gap-3">
                <span className="text-6xl sm:text-7xl font-mono font-bold tracking-tight text-[#14211A]">
                  {airNowLoading ? '...' : airNow?.pm25 ?? '—'}
                </span>
                <span className="text-sm font-mono text-[#4F6157]">µg/m³ PM2.5</span>
              </div>

              <div>
                <span
                  className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold font-mono tracking-wider uppercase shadow-2xs"
                  style={{
                    backgroundColor: cpcbBg,
                    color: cpcbText,
                    border: `1px solid ${cpcbColor}40`,
                  }}
                >
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cpcbColor }} />
                  <span>CPCB: {airNowLoading ? 'Loading' : cpcbCat}</span>
                </span>
              </div>
            </div>

            {/* Health & Exercise Advisory */}
            <div className="p-4 rounded-2xl bg-[#F4F7F4] space-y-2 text-xs">
              <div className="font-semibold text-[#14211A] flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-[#1F7A4C]" />
                <span>CPCB Exercise Advisory</span>
              </div>
              <p className="text-[#4F6157] leading-relaxed">
                {CPCB_ADVISORIES[cpcbCat]}
              </p>
            </div>

            {/* Metadata Footer */}
            <div className="pt-2 border-t border-[#D9E4D6] flex justify-between items-center text-xs font-mono text-[#4F6157]">
              <span>
                {airNow?.stations_used ?? stations.length} continuous station(s)
              </span>
              <span>Updated {airNow?.updated_minutes_ago ?? 10}m ago</span>
            </div>
          </div>

          {/* Quick CTA to Planner */}
          <div className="p-6 rounded-3xl bg-gradient-to-br from-[#1F7A4C] to-[#155C39] text-white shadow-xs space-y-3">
            <h3 className="font-serif text-lg font-bold">
              Find the cleanest window today
            </h3>
            <p className="text-xs text-[#E4F2E8] leading-relaxed">
              Don't guess when to exercise. Our schedule optimizer computes the exact sliding time window with minimal particulate dose in {selectedLocation.name}.
            </p>
            <Link
              to="/"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-[#1F7A4C] font-semibold text-xs hover:bg-[#E4F2E8] transition-colors"
            >
              <span>Build Activity Plan</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* Right Column: Nearby Ground Monitoring Stations (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white border border-[#D9E4D6] rounded-3xl p-6 sm:p-8 shadow-xs space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#D9E4D6] pb-4">
              <div>
                <h2 className="font-serif text-lg font-bold text-[#14211A]">
                  Continuous Monitoring Stations (CAAQMS)
                </h2>
                <p className="text-xs text-[#4F6157] mt-0.5">
                  Ground stations within 25 km of {selectedLocation.name}
                </p>
              </div>

              <div className="text-right text-xs font-mono text-[#4F6157]">
                <Clock className="w-3.5 h-3.5 inline mr-1 text-[#1F7A4C]" />
                <span>
                  {airNow ? `Updated ${airNow.updated_minutes_ago}m ago` : 'Real-time feed'}
                </span>
              </div>
            </div>

            {/* Station List */}
            {trustLoading ? (
              <div className="py-12 text-center text-xs font-mono text-[#4F6157] space-y-2">
                <RefreshCw className="w-6 h-6 animate-spin text-[#1F7A4C] mx-auto" />
                <p>Loading nearby monitoring stations...</p>
              </div>
            ) : stations.length > 0 ? (
              <div className="divide-y divide-[#D9E4D6] border border-[#D9E4D6] rounded-2xl overflow-hidden bg-white">
                {stations.map((st) => {
                  const isLive = st.status === 'LIVE';
                  const stationReading = ('pm25' in st ? (st as any).pm25 : undefined) ?? airNow?.pm25;
                  return (
                    <div
                      key={st.name}
                      className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#F4F7F4]/50 transition-colors"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-[#14211A]">{st.name}</span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider uppercase ${
                              isLive
                                ? 'bg-[#E4F2E8] text-[#1F7A4C] border border-[#1F7A4C]/30'
                                : 'bg-[#FFF5E6] text-[#A65100] border border-[#FF9900]/30'
                            }`}
                          >
                            {st.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs font-mono text-[#4F6157]">
                          <span>{st.distance_km.toFixed(1)} km away</span>
                          {st.last_reading && (
                            <>
                              <span>·</span>
                              <span>
                                Reading: {new Date(st.last_reading).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {stationReading !== undefined && (
                        <div className="sm:text-right shrink-0">
                          <div className="text-xl font-mono font-bold text-[#14211A]">
                            {stationReading}
                            <span className="text-xs font-normal text-[#4F6157] ml-1">µg/m³</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-8 text-center border border-dashed border-[#D9E4D6] rounded-2xl space-y-2">
                <Radio className="w-8 h-8 text-[#4F6157]/40 mx-auto" />
                <h4 className="font-semibold text-sm text-[#14211A]">
                  No continuous ground monitors within 25 km
                </h4>
                <p className="text-xs text-[#4F6157] max-w-[42ch] mx-auto leading-relaxed">
                  AirWindow is using direct numerical CAMS atmospheric chemistry modeling for {selectedLocation.name} with standard confidence.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
