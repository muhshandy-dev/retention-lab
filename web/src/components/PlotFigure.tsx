import * as Plot from "@observablehq/plot";
import { useEffect, useRef, useState } from "react";

export interface Palette {
  plum: string;
  ochre: string;
  neutral: string;
  ink: string;
  ink2: string;
  line: string;
  surface: string;
  seq0: string;
  seq1: string;
}

export function readPalette(): Palette {
  const s = getComputedStyle(document.documentElement);
  const v = (name: string) => s.getPropertyValue(name).trim();
  return {
    plum: v("--plum"), ochre: v("--ochre"), neutral: v("--neutral"), ink: v("--ink"),
    ink2: v("--ink-2"), line: v("--line"), surface: v("--surface"), seq0: v("--seq-0"),
    seq1: v("--seq-1"),
  };
}

/** Renders an Observable Plot figure at the container width; re-renders on resize and theme. */
export function PlotFigure({ render, label, theme, minWidth = 320 }: {
  render: (width: number, p: Palette) => Element;
  label: string;
  theme: string;
  minWidth?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || width === 0) return;
    const fig = render(Math.max(minWidth, width), readPalette());
    // The wrapper carries the accessible name; the same numbers are in a table next to it.
    fig.setAttribute("aria-hidden", "true");
    el.replaceChildren(fig);
    return () => fig.remove();
  }, [render, width, theme, minWidth]);

  return <div className="figure" ref={ref} role="img" aria-label={label} tabIndex={0} />;
}

/**
 * Category labels for horizontal dot/bar charts. Wide screens use a left axis; narrow screens
 * put each label above its row so long Indonesian labels are never clipped.
 */
export function categoryAxis(width: number, labels: string[], p: Palette, wideMargin = 220) {
  const narrow = width < 600;
  return {
    narrow,
    marginLeft: narrow ? 12 : wideMargin,
    rowHeight: narrow ? 52 : 40,
    marks: narrow
      ? [
        Plot.axisY({ ticks: [], label: null }),
        Plot.text(labels, { y: (d: string) => d, text: (d: string) => d, frameAnchor: "left",
          textAnchor: "start", dy: -15, fill: p.ink2 }),
      ]
      : [Plot.axisY({ label: null, tickSize: 0 })],
  };
}
