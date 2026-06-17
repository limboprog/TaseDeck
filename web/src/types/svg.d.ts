import type { FC, SVGProps } from "react";

declare module "*.svg" {
  const ReactComponent: FC<SVGProps<SVGSVGElement>>;
  export default ReactComponent;
}
