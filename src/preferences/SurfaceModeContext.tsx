import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  readLiquidGlassPreference,
  writeLiquidGlassPreference,
} from "./surfaceMode";

type SurfaceModeContextValue = {
  liquidGlass: boolean;
  setLiquidGlass: (enabled: boolean) => void;
};

const SurfaceModeContext = createContext<SurfaceModeContextValue | null>(null);

export function SurfaceModeProvider({ children }: { children: ReactNode }) {
  const [liquidGlass, setLiquidGlassState] = useState(readLiquidGlassPreference);

  const setLiquidGlass = useCallback((enabled: boolean) => {
    setLiquidGlassState(enabled);
    writeLiquidGlassPreference(enabled);
  }, []);

  const value = useMemo(
    () => ({ liquidGlass, setLiquidGlass }),
    [liquidGlass, setLiquidGlass],
  );

  return (
    <SurfaceModeContext.Provider value={value}>{children}</SurfaceModeContext.Provider>
  );
}

export function useSurfaceMode(): SurfaceModeContextValue {
  const context = useContext(SurfaceModeContext);
  if (!context) {
    return {
      liquidGlass: false,
      setLiquidGlass: () => {},
    };
  }
  return context;
}
