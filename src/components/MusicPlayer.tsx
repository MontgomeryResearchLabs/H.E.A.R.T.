/**
 * MusicPlayer.tsx — Fixed-position ambient music player for the timeline page.
 *
 * Features:
 *  • Play / Pause toggle
 *  • Skip forward / backward (previous restarts if >3s in, else goes to prior track)
 *  • Click-or-drag scrub bar (pointer events for unified mouse + touch)
 *  • Always-visible floating track-title pill with animated equalizer bars
 *  • Time display (current / duration)
 *  • Auto-advance to next track on end, loops playlist
 *  • Expandable control panel
 *  • Mute toggle
 *
 * Props:
 *   tracks — array of { src: string, title: string }
 *
 * Positioning: fixed bottom-right (bottom-6 right-6 z-[60])
 *
 * Session 4 fix:
 *   The skip-back (previous) button SVG was broken — the triangle path used
 *   an incorrect viewBox/transform combination that caused the left-pointing
 *   arrow to render invisibly or clipped. Replaced with a clean, manually-
 *   authored skip-back icon: vertical bar + left-pointing triangle drawn
 *   directly (no rotation transform needed).
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/* ─── Types ─────────────────────────────────────────────────────────── */

interface Track {
  src: string;
  title: string;
}

interface MusicPlayerProps {
  tracks: Track[];
}

/* ─── Component ─────────────────────────────────────────────────────── */

export default function MusicPlayer({ tracks }: MusicPlayerProps) {
  /* ── State ──────────────────────────────────────────────────────── */
  const [isPlaying, setIsPlaying] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [progress, setProgress] = useState(0);       // 0–1 fraction of track elapsed
  const [currentTime, setCurrentTime] = useState(0);  // seconds
  const [duration, setDuration] = useState(0);         // seconds

  /* ── Refs ───────────────────────────────────────────────────────── */
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number>(0);             // requestAnimationFrame handle
  const scrubBarRef = useRef<HTMLDivElement>(null);
  const isScrubbing = useRef(false);            // true while user drags the scrub bar

  const currentTrack = tracks[currentTrackIndex];

  /* ── Audio element bootstrap ────────────────────────────────────── */
  useEffect(() => {
    const audio = new Audio(currentTrack.src);
    audio.preload = 'metadata';
    audioRef.current = audio;

    /** When metadata loads, grab the duration so we can show it immediately. */
    const onLoadedMetadata = () => setDuration(audio.duration);

    /** Auto-advance: when track ends, go to next (wraps around). */
    const onEnded = () => {
      setCurrentTrackIndex((prev) => (prev + 1) % tracks.length);
    };

    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
      cancelAnimationFrame(rafRef.current);
    };
  }, [currentTrackIndex, tracks]);

  /* ── Play / pause side-effect ───────────────────────────────────── */
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.play().catch(() => setIsPlaying(false));
      startProgressLoop();
    } else {
      audio.pause();
      cancelAnimationFrame(rafRef.current);
    }
  }, [isPlaying, currentTrackIndex]);

  /* ── Mute side-effect ───────────────────────────────────────────── */
  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = isMuted;
  }, [isMuted]);

  /* ── rAF progress loop ─────────────────────────────────────────── */
  /** Continuously reads audio.currentTime to update the scrub bar.
   *  Pauses itself while the user is scrubbing so the bar doesn't fight input. */
  const startProgressLoop = useCallback(() => {
    const tick = () => {
      const audio = audioRef.current;
      if (audio && !isScrubbing.current) {
        const t = audio.currentTime;
        const d = audio.duration || 1;
        setProgress(t / d);
        setCurrentTime(t);
        setDuration(d);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  /* ── Transport controls ─────────────────────────────────────────── */

  const togglePlay = () => setIsPlaying((p) => !p);

  /** Skip to next track (wraps around). */
  const skipNext = () => {
    setCurrentTrackIndex((prev) => (prev + 1) % tracks.length);
    setIsPlaying(true);
  };

  /**
   * Skip to previous track.
   * Standard music-player behaviour: if more than 3 seconds into the current
   * track, restart it instead of going back. Otherwise go to previous track.
   */
  const skipPrev = () => {
    const audio = audioRef.current;
    if (audio && audio.currentTime > 3) {
      // Restart current track
      audio.currentTime = 0;
      setProgress(0);
      setCurrentTime(0);
    } else {
      // Go to previous track (wraps around to end of playlist)
      setCurrentTrackIndex((prev) => (prev - 1 + tracks.length) % tracks.length);
    }
    setIsPlaying(true);
  };

  /* ── Scrub bar interaction (unified pointer events) ─────────────── */

  /** Convert a pointer event's X position into a 0–1 fraction of the scrub bar. */
  const getProgressFromPointer = (clientX: number): number => {
    const bar = scrubBarRef.current;
    if (!bar) return 0;
    const rect = bar.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    isScrubbing.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const p = getProgressFromPointer(e.clientX);
    setProgress(p);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!isScrubbing.current) return;
    const p = getProgressFromPointer(e.clientX);
    setProgress(p);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!isScrubbing.current) return;
    isScrubbing.current = false;
    const p = getProgressFromPointer(e.clientX);
    const audio = audioRef.current;
    if (audio && audio.duration) {
      audio.currentTime = p * audio.duration;
      setCurrentTime(audio.currentTime);
    }
    setProgress(p);
  };

  /* ── Time formatting helper ─────────────────────────────────────── */
  const fmt = (secs: number): string => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  /* ── Bail out if no tracks provided ─────────────────────────────── */
  if (!tracks.length) return null;

  /* ── Render ─────────────────────────────────────────────────────── */
  return (
    <div className="fixed bottom-6 right-6 z-[60] flex flex-col items-end gap-2">

      {/* ── Floating track-title pill (always visible) ──────────── */}
      <div className="bg-white/80 backdrop-blur-md rounded-full px-3 py-1 shadow-lg
                      flex items-center gap-2 max-w-[200px]">
        {/* Animated equalizer bars — only animate while playing */}
        {isPlaying && (
          <div className="flex items-end gap-[2px] h-3">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-[3px] bg-valentine-pink-500 rounded-full"
                animate={{ height: ['4px', '12px', '4px'] }}
                transition={{
                  duration: 0.6,
                  repeat: Infinity,
                  delay: i * 0.15,
                  ease: 'easeInOut',
                }}
              />
            ))}
          </div>
        )}
        <span className="text-xs text-valentine-pink-700 truncate font-body">
          {currentTrack.title}
        </span>
      </div>

      {/* ── Expandable control panel ──────────────────────────────── */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="bg-white/90 backdrop-blur-md rounded-2xl shadow-xl p-3
                       w-[220px] flex flex-col gap-2"
          >
            {/* Scrub bar */}
            <div
              ref={scrubBarRef}
              className="h-2 bg-valentine-pink-100 rounded-full cursor-pointer
                         relative touch-none"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            >
              {/* Filled portion of the bar */}
              <div
                className="absolute inset-y-0 left-0 bg-valentine-pink-500 rounded-full
                           pointer-events-none"
                style={{ width: `${progress * 100}%` }}
              />
              {/* Thumb / handle */}
              <div
                className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full
                           bg-valentine-pink-600 shadow pointer-events-none"
                style={{ left: `calc(${progress * 100}% - 6px)` }}
              />
            </div>

            {/* Time readout */}
            <div className="flex justify-between text-[10px] text-valentine-pink-400 font-body">
              <span>{fmt(currentTime)}</span>
              <span>{fmt(duration)}</span>
            </div>

            {/* Transport controls row */}
            <div className="flex items-center justify-center gap-3">

              {/* ── SKIP-BACK BUTTON (FIXED in Session 4) ───────────
                   Previously broken: the SVG used a right-pointing triangle
                   with a rotate(180) transform, but the transform origin and
                   path coordinates were misaligned, causing the icon to render
                   outside the viewBox.
                   
                   Fix: draw the left-pointing triangle directly using a simple
                   polygon path. No transform needed.
                   
                   Icon anatomy:
                     • A vertical bar on the LEFT (rect x=3)
                     • A left-pointing filled triangle on the RIGHT
                   ──────────────────────────────────────────────────── */}
              <button
                onClick={skipPrev}
                className="text-valentine-pink-600 hover:text-valentine-pink-800
                           transition-colors p-1"
                aria-label="Previous track"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  {/* Vertical bar on the left side */}
                  <rect x="3" y="5" width="3" height="14" rx="1" />
                  {/* Left-pointing triangle — drawn directly, no rotation needed.
                      Points: top-right (20,5) → left-center (9,12) → bottom-right (20,19) */}
                  <path d="M20 5a1 1 0 0 0-1.5-.866l-11 6.35a1 1 0 0 0 0 1.732l11 6.35A1 1 0 0 0 20 17.7V5Z" />
                </svg>
              </button>

              {/* Play / Pause */}
              <button
                onClick={togglePlay}
                className="text-valentine-pink-600 hover:text-valentine-pink-800
                           transition-colors p-1"
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  {isPlaying ? (
                    /* Pause icon: two vertical bars */
                    <>
                      <rect x="6" y="4" width="4" height="16" rx="1" />
                      <rect x="14" y="4" width="4" height="16" rx="1" />
                    </>
                  ) : (
                    /* Play icon: right-pointing triangle */
                    <path d="M8 5.14a1 1 0 0 1 1.5-.866l10 5.86a1 1 0 0 1 0 1.732l-10 5.86A1 1 0 0 1 8 16.86V5.14Z" />
                  )}
                </svg>
              </button>

              {/* Skip-forward button */}
              <button
                onClick={skipNext}
                className="text-valentine-pink-600 hover:text-valentine-pink-800
                           transition-colors p-1"
                aria-label="Next track"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  {/* Right-pointing triangle */}
                  <path d="M4 5a1 1 0 0 1 1.5-.866l11 6.35a1 1 0 0 1 0 1.732l-11 6.35A1 1 0 0 1 4 17.7V5Z" />
                  {/* Vertical bar on the right side */}
                  <rect x="18" y="5" width="3" height="14" rx="1" />
                </svg>
              </button>

              {/* Mute toggle */}
              <button
                onClick={() => setIsMuted((m) => !m)}
                className="text-valentine-pink-400 hover:text-valentine-pink-600
                           transition-colors p-1 ml-1"
                aria-label={isMuted ? 'Unmute' : 'Mute'}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  {isMuted ? (
                    /* Muted icon: speaker with X */
                    <path d="M11 5L6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6"
                          fill="none" stroke="currentColor" strokeWidth="2"
                          strokeLinecap="round" strokeLinejoin="round" />
                  ) : (
                    /* Volume icon: speaker with sound waves */
                    <path d="M11 5L6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14"
                          fill="none" stroke="currentColor" strokeWidth="2"
                          strokeLinecap="round" strokeLinejoin="round" />
                  )}
                </svg>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main toggle button (🎵) ───────────────────────────────── */}
      <button
        onClick={() => setIsExpanded((e) => !e)}
        className="w-12 h-12 rounded-full bg-valentine-pink-500 text-white
                   shadow-lg hover:bg-valentine-pink-600 transition-colors
                   flex items-center justify-center text-xl"
        aria-label="Toggle music player"
      >
        🎵
      </button>
    </div>
  );
}
