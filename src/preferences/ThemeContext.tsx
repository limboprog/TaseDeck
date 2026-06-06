import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { applyColorScheme, type ColorScheme } from "../theme";
import {
  readColorSchemePreference,
  writeColorSchemePreference,
} from "./colorScheme";

type ThemeContextValue = {
  colorScheme: ColorScheme;
  setColorScheme: (scheme: ColorScheme) => void;
  isLight: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [colorScheme, setColorSchemeState] = useState<ColorScheme>(readColorSchemePreference);

  useLayoutEffect(() => {
    applyColorScheme(colorScheme);
  }, [colorScheme]);

  const setColorScheme = useCallback((scheme: ColorScheme) => {
    setColorSchemeState(scheme);
    writeColorSchemePreference(scheme);
  }, []);

  const value = useMemo(
    () => ({
      colorScheme,
      setColorScheme,
      isLight: colorScheme === "light",
    }),
    [colorScheme, setColorScheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeMode(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    return {
      colorScheme: "light",
      setColorScheme: () => {},
      isLight: true,
    };
  }
  return context;
}
