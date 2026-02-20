/**
 * CalendarNav.tsx — Calendar Navigation Modal
 * =============================================
 * A React island that provides month/year-based navigation for the
 * timeline page. Users click the calendar icon button to open a modal
 * overlay, select a month, and the page smooth-scrolls to that section.
 *
 * Features
 * --------
 * - Month/year grid from July 2023 → current month
 * - Highlights months that have timeline content
 * - Keyboard accessible: ESC closes, arrow keys navigate
 * - Click-outside-to-close
 * - Smooth scroll to the selected month's first entry
 *
 * @module components/CalendarNav
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface CalendarNavProps {
  /**
   * Set of "YYYY-MM" strings representing months that have at least
   * one timeline entry. Used to highlight navigable months.
   */
  contentMonths: string[];
}

/** Represents a single month cell in the calendar grid. */
interface MonthCell {
  /** "YYYY-MM" key */
  key: string;
  /** Short month label, e.g. "Jul" */
  label: string;
  /** Full label for screen readers, e.g. "July 2023" */
  ariaLabel: string;
  /** Year number (for section headers) */
  year: number;
  /** Whether this month has timeline content */
  hasContent: boolean;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const MONTH_LABELS_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** First month of the timeline */
const START_YEAR  = 2023;
const START_MONTH = 6; // 0-indexed → July

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Generates an array of MonthCell objects from the start date to the
 * current month, grouped by year.
 */
function generateMonthCells(contentMonthSet: Set<string>): MonthCell[] {
  const cells: MonthCell[] = [];
  const now = new Date();
  const endYear  = now.getFullYear();
  const endMonth = now.getMonth();

  for (let y = START_YEAR; y <= endYear; y++) {
    const firstM = (y === START_YEAR) ? START_MONTH : 0;
    const lastM  = (y === endYear) ? endMonth : 11;

    for (let m = firstM; m <= lastM; m++) {
      const key = `${y}-${String(m + 1).padStart(2, '0')}`;
      cells.push({
        key,
        label:     MONTH_LABELS[m],
        ariaLabel: `${MONTH_LABELS_FULL[m]} ${y}`,
        year:      y,
        hasContent: contentMonthSet.has(key),
      });
    }
  }
  return cells;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function CalendarNav({ contentMonths }: CalendarNavProps): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  // Convert the contentMonths array to a Set for O(1) lookups
  const contentMonthSet = useMemo(() => new Set(contentMonths), [contentMonths]);
  const cells = useMemo(() => generateMonthCells(contentMonthSet), [contentMonthSet]);

  // Group cells by year for display
  const cellsByYear = useMemo(() => {
    const map = new Map<number, MonthCell[]>();
    cells.forEach((cell) => {
      const arr = map.get(cell.year) ?? [];
      arr.push(cell);
      map.set(cell.year, arr);
    });
    return map;
  }, [cells]);

  /* ---------- Keyboard: close on ESC ---------- */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen]);

  /* ---------- Click-outside-to-close ---------- */
  useEffect(() => {
    const handleClick = (e: MouseEvent): void => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      // Delay listener attachment so the opening click doesn't immediately close
      const timer = setTimeout(() => {
        window.addEventListener('click', handleClick);
      }, 0);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('click', handleClick);
      };
    }
  }, [isOpen]);

  /**
   * Smooth-scrolls to the first timeline entry of the selected month.
   * Entries have DOM ids like `month-2023-07`.
   */
  const handleMonthSelect = useCallback(
    (key: string): void => {
      if (isScrolling) return; // debounce rapid clicks

      setIsScrolling(true);
      setIsOpen(false);

      const target = document.getElementById(`month-${key}`);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        // Fallback: set hash so the user can bookmark it
        window.location.hash = `month-${key}`;
      }

      // Re-enable after scroll animation completes
      setTimeout(() => setIsScrolling(false), 600);
    },
    [isScrolling],
  );

  return (
    <>
      {/* ---- Trigger button (fixed on the right side) ---- */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="
          fixed z-50 top-4 right-4 md:top-6 md:right-6
          w-11 h-11 md:w-12 md:h-12
          flex items-center justify-center
          rounded-full border border-white/10
          bg-black/50 backdrop-blur-md
          text-white/80 hover:text-valentine-pink-400
          hover:border-valentine-pink-400/40
          transition-all duration-300
          shadow-lg
        "
        aria-label="Open calendar navigation"
        aria-expanded={isOpen}
      >
        {/* Calendar SVG icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8"  y1="2" x2="8"  y2="6" />
          <line x1="3"  y1="10" x2="21" y2="10" />
        </svg>
      </button>

      {/* ---- Modal overlay ---- */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed inset-0 z-[60] flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* Dark backdrop */}
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

            {/* Modal card */}
            <motion.div
              ref={modalRef}
              className="
                relative z-10 w-full max-w-md max-h-[80vh]
                overflow-y-auto
                bg-[#141414] border border-white/10 rounded-2xl
                p-5 md:p-6
                shadow-2xl
              "
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              transition={{ duration: 0.2 }}
              role="dialog"
              aria-modal="true"
              aria-label="Navigate to a month"
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-display text-white">
                  Jump to Month
                </h2>
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-white/40 hover:text-white transition-colors"
                  aria-label="Close calendar"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="18" y1="6"  x2="6"  y2="18" />
                    <line x1="6"  y1="6"  x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              {/* Year sections */}
              {Array.from(cellsByYear.entries()).map(([year, months]) => (
                <div key={year} className="mb-5 last:mb-0">
                  {/* Year header */}
                  <h3 className="text-sm font-sans text-white/40 uppercase tracking-wider mb-2">
                    {year}
                  </h3>

                  {/* Month grid */}
                  <div className="grid grid-cols-4 gap-2">
                    {months.map((month) => (
                      <button
                        key={month.key}
                        onClick={() => handleMonthSelect(month.key)}
                        disabled={!month.hasContent}
                        className={`
                          py-2 px-3 rounded-lg text-sm font-sans
                          transition-all duration-200
                          ${
                            month.hasContent
                              ? 'text-white hover:bg-valentine-pink-500/20 hover:text-valentine-pink-300 cursor-pointer border border-white/5 hover:border-valentine-pink-500/30'
                              : 'text-white/20 cursor-default border border-transparent'
                          }
                        `}
                        aria-label={month.ariaLabel}
                      >
                        {month.label}
                        {/* Dot indicator for months with content */}
                        {month.hasContent && (
                          <span className="block w-1 h-1 mx-auto mt-1 rounded-full bg-valentine-pink-500" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
