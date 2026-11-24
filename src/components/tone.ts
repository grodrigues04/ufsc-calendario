import type { Tone } from '@/lib/model'

export const TONE_TEXT: Record<Tone, string> = {
  good: 'text-good',
  warn: 'text-warn',
  bad: 'text-bad',
  neutral: 'text-muted-foreground',
}

export const TONE_BG: Record<Tone, string> = {
  good: 'bg-good',
  warn: 'bg-warn',
  bad: 'bg-bad',
  neutral: 'bg-muted-foreground/40',
}

export const TONE_SOFT: Record<Tone, string> = {
  good: 'bg-good/12 text-good',
  warn: 'bg-warn/14 text-warn',
  bad: 'bg-bad/12 text-bad',
  neutral: 'bg-secondary text-muted-foreground',
}

export const TONE_STROKE: Record<Tone, string> = {
  good: 'stroke-good',
  warn: 'stroke-warn',
  bad: 'stroke-bad',
  neutral: 'stroke-muted-foreground/40',
}

/** Shared springs: short, no bounce on data, a little bounce on controls. */
export const SPRING_DATA = { type: 'spring', bounce: 0, duration: 0.7 } as const
export const SPRING_UI = { type: 'spring', bounce: 0.18, duration: 0.42 } as const
export const EASE_OUT = [0.22, 1, 0.36, 1] as const
