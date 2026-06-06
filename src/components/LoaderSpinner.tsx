import { BiLoaderAlt } from "../icons";
import { colors } from "../theme";

type LoaderSpinnerProps = {
  size?: number;
  /** Accessible label when the spinner is the only loading indicator. */
  ariaLabel?: string;
};

export function LoaderSpinner({ size = 22, ariaLabel = "Loading" }: LoaderSpinnerProps) {
  return (
    <>
      <BiLoaderAlt
        size={size}
        color={colors.accent}
        style={{ animation: "tase-spin 0.85s linear infinite" }}
        aria-label={ariaLabel}
      />
      <style>{`
        @keyframes tase-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}
