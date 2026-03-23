import React, { createContext, useContext, useState } from 'react';

type MoodContextValue = {
  mood: string | null;
  setMood: (mood: string | null) => void;
};

const MoodContext = createContext<MoodContextValue>({
  mood: null,
  setMood: () => {},
});

export function MoodProvider({ children }: { children: React.ReactNode }) {
  const [mood, setMood] = useState<string | null>(null);
  return <MoodContext.Provider value={{ mood, setMood }}>{children}</MoodContext.Provider>;
}

export function useMood() {
  return useContext(MoodContext);
}
