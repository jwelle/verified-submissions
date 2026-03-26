import { create } from 'zustand';
import { ScoreAndRouteResponse } from '@workspace/api-client-react';

interface LeadStore {
  result: ScoreAndRouteResponse | null;
  setResult: (result: ScoreAndRouteResponse | null) => void;
  reset: () => void;
}

export const useLeadStore = create<LeadStore>((set) => ({
  result: null,
  setResult: (result) => set({ result }),
  reset: () => set({ result: null }),
}));
