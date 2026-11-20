import type { CSSProperties, ReactNode } from "react";

/** Frame for a product screen drawn at a fixed design width `w`. The single
 *  child is scaled to the frame's real width in CSS (see .aa-fit in
 *  app/site.css), so the mock stays crisp at any size with no script. */
export default function Fit({ w, style, children }: { w: number; style?: CSSProperties; children: ReactNode }) {
  return (
    <div className="aa-fit" style={{ ...style, ["--fit-w" as string]: `${w}px` }}>
      {children}
    </div>
  );
}
