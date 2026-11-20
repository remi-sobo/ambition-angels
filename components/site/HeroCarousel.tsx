"use client";
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from "react";

const slides = [
  { career: "Software Engineer", img: "software-engineer-scene", alt: "A student at her locker imagining herself writing code at a studio desk" },
  { career: "Registered Nurse", img: "registered-nurse-scene", alt: "A student at his locker imagining himself as a nurse checking a patient chart" },
  { career: "Commercial Pilot", img: "pilot-scene", alt: "A student at her locker imagining herself flying a plane" },
  { career: "Chef", img: "chef-scene", alt: "A student at his locker imagining himself plating a dish in a restaurant kitchen" },
  { career: "Architect", img: "architect-scene", alt: "A student at her locker imagining herself presenting a building model" },
  { career: "Game Designer", img: "game-designer-scene", alt: "A student at his locker imagining himself designing a video game" },
  { career: "Electrician", img: "electrician-scene", alt: "A student at her locker imagining herself wiring an electrical panel" },
];

const AUTO_MS = 5000;

/** Home hero art: swipe (or use the arrows and dots) through students picturing
 *  different careers. Native scroll-snap does the swiping, so it works by touch,
 *  trackpad and keyboard. It advances by itself until someone interacts, and
 *  never when the visitor prefers reduced motion. */
export default function HeroCarousel() {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [auto, setAuto] = useState(true);
  const stop = useCallback(() => setAuto(false), []);

  const go = useCallback((i: number) => {
    const el = track.current;
    if (!el) return;
    const n = (i + slides.length) % slides.length;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ left: n * el.clientWidth, behavior: reduce ? "auto" : "smooth" });
  }, []);

  const onScroll = () => {
    const el = track.current;
    if (el && el.clientWidth) setIndex(Math.round(el.scrollLeft / el.clientWidth));
  };

  useEffect(() => {
    if (!auto || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = window.setInterval(() => {
      if (!document.hidden) go(index + 1);
    }, AUTO_MS);
    return () => window.clearInterval(t);
  }, [auto, index, go]);

  return (
    <div className="aa-hero-carousel" role="group" aria-roledescription="carousel" aria-label="Students picturing different careers" onPointerDown={stop} onKeyDown={stop} onWheel={stop} onMouseEnter={stop}>
      <div className="aa-hero-carousel__frame">
      <div ref={track} className="aa-hero-carousel__track" onScroll={onScroll} tabIndex={0}>
        {slides.map((s, i) => (
          <div key={s.img} className="aa-hero-carousel__slide" role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${slides.length}: ${s.career}`}>
            <img src={`/images/site/illus/${s.img}.webp`} alt={s.alt} loading={i === 0 ? "eager" : "lazy"} draggable={false} />
          </div>
        ))}
      </div>
      <span className="aa-hero-carousel__caption" aria-hidden="true">{slides[index]?.career}</span>
      <button type="button" className="aa-hero-carousel__arrow aa-hero-carousel__arrow--prev" aria-label="Previous career" onClick={() => go(index - 1)}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
      </button>
      <button type="button" className="aa-hero-carousel__arrow aa-hero-carousel__arrow--next" aria-label="Next career" onClick={() => go(index + 1)}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
      </button>
      </div>
      <div className="aa-hero-carousel__dots">
        {slides.map((s, i) => (
          <button key={s.img} type="button" aria-label={`Show ${s.career}`} aria-current={i === index ? "true" : undefined} onClick={() => go(i)} />
        ))}
      </div>
    </div>
  );
}
