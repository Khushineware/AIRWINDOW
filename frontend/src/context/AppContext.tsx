import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { LocationItem, AirNow, PlanData } from '../types';
import { getNow, isUsingFixtures } from '../api/client';

export interface FormInputs {
  activity: 'running' | 'walking' | 'cycling' | 'sports';
  duration_min: number;
  window_start_time: string; // e.g. '06:00'
  window_end_time: string;   // e.g. '19:00'
  mask: boolean;
  profile: 'adult' | 'child' | 'sensitive';
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'agent';
  text: string;
  tag?: 'ai' | 'template';
  tools_used?: any[];
  timestamp: string;
}

const DEFAULT_FORM_INPUTS: FormInputs = {
  activity: 'running',
  duration_min: 45,
  window_start_time: '06:00',
  window_end_time: '19:00',
  mask: false,
  profile: 'adult',
};

interface AppContextType {
  selectedLocation: LocationItem | null;
  setSelectedLocation: (loc: LocationItem | null) => void;
  planId: string | null;
  currentPlan: PlanData | null;
  setPlan: (plan: PlanData | null) => void;
  formInputs: FormInputs;
  setFormInputs: React.Dispatch<React.SetStateAction<FormInputs>>;
  updateFormInputs: (inputs: Partial<FormInputs>) => void;
  airNow: AirNow | null;
  airNowLoading: boolean;
  airNowError: string | null;
  refetchAirNow: () => Promise<void>;
  chatHistory: ChatMessage[];
  setChatHistory: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  addChatMessage: (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  whatIfDelta: any | null;
  setWhatIfDelta: (delta: any | null) => void;
  resetNewPlan: () => void;
  focusSearchTrigger: number;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const STORAGE_KEY = 'airwindow_shared_state_v1';

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Read initial state from sessionStorage
  const [selectedLocation, setSelectedLocationState] = useState<LocationItem | null>(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.selectedLocation || null;
      }
    } catch {}
    return null;
  });

  const [currentPlan, setCurrentPlanState] = useState<PlanData | null>(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.currentPlan || null;
      }
    } catch {}
    return null;
  });

  const [formInputs, setFormInputs] = useState<FormInputs>(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.formInputs) return parsed.formInputs;
      }
    } catch {}
    return DEFAULT_FORM_INPUTS;
  });

  const [airNow, setAirNow] = useState<AirNow | null>(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.airNow || null;
      }
    } catch {}
    return null;
  });

  const [chatHistory, setChatHistory] = useState<ChatMessage[]>(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.chatHistory || [];
      }
    } catch {}
    return [];
  });

  const [whatIfDelta, setWhatIfDelta] = useState<any | null>(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.whatIfDelta || null;
      }
    } catch {}
    return null;
  });

  const [airNowLoading, setAirNowLoading] = useState<boolean>(false);
  const [airNowError, setAirNowError] = useState<string | null>(null);
  const [focusSearchTrigger, setFocusSearchTrigger] = useState<number>(0);

  const planId = currentPlan?.plan_id || null;

  // Persist to sessionStorage on changes
  useEffect(() => {
    try {
      const stateToSave = {
        selectedLocation,
        currentPlan,
        formInputs,
        airNow,
        chatHistory,
        whatIfDelta,
      };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
    } catch {}
  }, [selectedLocation, currentPlan, formInputs, airNow, chatHistory, whatIfDelta]);

  // Fetch /api/now whenever selectedLocation changes
  const fetchAirNowForLocation = useCallback(async (loc: LocationItem) => {
    if (!loc || typeof loc.lat !== 'number' || typeof loc.lon !== 'number') return;
    setAirNowLoading(true);
    setAirNowError(null);
    try {
      const data = await getNow(loc.lat, loc.lon);
      setAirNow(data);
    } catch (err: any) {
      console.warn('Failed to fetch air now:', err);
      setAirNowError(err.message || 'Data unavailable');
    } finally {
      setAirNowLoading(false);
    }
  }, []);

  const setSelectedLocation = useCallback(
    (loc: LocationItem | null) => {
      setSelectedLocationState(loc);
      if (loc) {
        fetchAirNowForLocation(loc);
      } else {
        setAirNow(null);
      }
    },
    [fetchAirNowForLocation]
  );

  const refetchAirNow = useCallback(async () => {
    if (selectedLocation) {
      await fetchAirNowForLocation(selectedLocation);
    }
  }, [selectedLocation, fetchAirNowForLocation]);

  const setPlan = useCallback((plan: PlanData | null) => {
    setCurrentPlanState(plan);
    if (plan?.location) {
      setSelectedLocationState(plan.location);
    }
    if (plan?.current) {
      setAirNow(plan.current);
    }
  }, []);

  const updateFormInputs = useCallback((updates: Partial<FormInputs>) => {
    setFormInputs((prev) => ({ ...prev, ...updates }));
  }, []);

  const addChatMessage = useCallback((msg: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    const newMsg: ChatMessage = {
      ...msg,
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setChatHistory((prev) => [...prev, newMsg]);
  }, []);

  const resetNewPlan = useCallback(() => {
    // Clear all state back to pristine empty
    setCurrentPlanState(null);
    setSelectedLocationState(null);
    setAirNow(null);
    setAirNowError(null);
    setFormInputs(DEFAULT_FORM_INPUTS);
    setChatHistory([]);
    setWhatIfDelta(null);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {}
    // Trigger location search focus
    setFocusSearchTrigger((prev) => prev + 1);
  }, []);

  return (
    <AppContext.Provider
      value={{
        selectedLocation,
        setSelectedLocation,
        planId,
        currentPlan,
        setPlan,
        formInputs,
        setFormInputs,
        updateFormInputs,
        airNow,
        airNowLoading,
        airNowError,
        refetchAirNow,
        chatHistory,
        setChatHistory,
        addChatMessage,
        whatIfDelta,
        setWhatIfDelta,
        resetNewPlan,
        focusSearchTrigger,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = (): AppContextType => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
