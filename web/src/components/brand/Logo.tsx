import type { SVGProps } from "react";
import LogoSvg from "../../../public/icons/LOGO.svg";

type LogoProps = SVGProps<SVGSVGElement>;

export function Logo({ className, ...props }: LogoProps) {
  return (
    <LogoSvg
      className={className}
      aria-hidden={props["aria-label"] ? undefined : true}
      {...props}
    />
  );
}
