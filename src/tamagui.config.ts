import { defaultConfig } from "@tamagui/config/v5";
import { createTamagui } from "tamagui";
import { colors, surfaces } from "./theme";

const tamaguiThemeBase = {
  background: colors.background,
  backgroundHover: surfaces.control,
  backgroundPress: surfaces.controlHover,
  backgroundFocus: colors.page,
  backgroundStrong: colors.surface,
  color: colors.foreground,
  colorHover: colors.foreground,
  colorPress: colors.muted,
  colorFocus: colors.foreground,
  borderColor: colors.border,
  borderColorHover: colors.border,
  placeholderColor: colors.muted,
  accent: colors.accent,
  accentColor: colors.accent,
};

const appConfig = createTamagui({
  ...defaultConfig,
  themes: {
    ...defaultConfig.themes,
    dark: {
      ...defaultConfig.themes.dark,
      ...tamaguiThemeBase,
    },
    light: {
      ...defaultConfig.themes.light,
      ...tamaguiThemeBase,
    },
  },
});

export type AppConfig = typeof appConfig;

export default appConfig;
