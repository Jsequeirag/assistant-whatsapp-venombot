/* =====================================================================
   DESIGN SYSTEM — "Sequeira / Editorial Dark"
   Tokens en TypeScript para proyectos React que usan inline styles.
   Uso:
       import { ds } from '../design-system/tokens'
       <h1 style={{ fontFamily: ds.font.display, color: ds.color.textStrong }}>
   ===================================================================== */

export const ds = {
  color: {
    // Fondos
    bg:           '#07070f',
    surface:      '#0e0e1a',
    surfaceGlass: 'rgba(7, 7, 15, 0.7)',

    // Bordes
    border:       '#141428',
    borderSoft:   '#1a1a28',

    // Acento (azul de marca) + variantes alpha
    accent:       '#1a2fff',
    accent55:     '#1a2fff55',
    accent33:     '#1a2fff33',
    accent22:     '#1a2fff22',

    // Texto
    textStrong:   '#ffffff',
    text:         '#e2ddd5',
    textMuted:    '#9a9ab2',
    textMuted2:   '#8a8aa0',
    textFaint:    '#6e6e88',

    // Estado
    success:      '#22c77a',
  },

  font: {
    display: 'Big Shoulders Display, sans-serif', // titulares UPPERCASE condensados
    body:    'DM Sans, sans-serif',               // cuerpo + etiquetas
  },

  // Pesos semánticos — REGLA DE LEGIBILIDAD:
  //   · texto < 15px         → mínimo fw.regular (400)
  //   · etiquetas MAYÚSCULAS → fw.medium (500)
  //   · fw.light (300) SOLO para párrafos >= 15px
  //   · el peso 200 NO se usa (ilegible en tamaños pequeños)
  //   · texto en ACENTO sobre fondo oscuro → strong (600), se ve más delgado
  fontWeight: {
    light:   300,
    regular: 400,
    medium:  500,
    strong:  600,
    display: 900,
  },

  fontSize: {
    hero:  'clamp(56px, 7vw, 88px)',
    h2:    'clamp(42px, 4vw, 56px)',
    stat:  36,
    lead:  19,
    body:  17,
    desc:  15,
    sm:    13,
    xs:    12,
    label: 11,
  },

  tracking: {     // letter-spacing en px
    label: 4,
    caps:  2,
    tight: 1,
  },

  lineHeight: {
    hero: 0.85,
    head: 0.92,
    lead: 1.5,
    body: 1.85,
  },

  space: {        // escala base 4px
    1: 4, 2: 8, 3: 12, 4: 16, 6: 24, 7: 28, 8: 32, 12: 48, 20: 80, 30: 120,
  },

  layout: {
    maxContent:  1200,
    padSectionX: 48,
    padSectionY: 80,
  },

  motion: {
    easeReveal: 'cubic-bezier(0.65, 0, 0.15, 1)',
    durReveal:  '1.6s',
    durHover:   '0.2s',
  },
} as const

/* ---- Helpers de estilo reutilizables (presets para inline styles) ---- */

export const dsStyles = {
  // Etiqueta de sección "— Sección"
  secLabel: {
    fontFamily: ds.font.body,
    fontWeight: ds.fontWeight.medium,
    fontSize: ds.fontSize.label,
    letterSpacing: ds.tracking.label,
    textTransform: 'uppercase',
    color: ds.color.accent,
  },

  // Titular display
  display: {
    fontFamily: ds.font.display,
    fontWeight: 900,
    textTransform: 'uppercase',
    color: ds.color.textStrong,
    lineHeight: ds.lineHeight.head,
    letterSpacing: 1,
  },

  // Tarjeta base
  card: {
    background: ds.color.surface,
    border: `1px solid ${ds.color.border}`,
    transition: `border-color ${ds.motion.durHover}`,
  },

  // Botón primario
  btn: {
    background: ds.color.accent,
    color: '#fff',
    fontFamily: ds.font.display,
    fontWeight: 700,
    fontSize: ds.fontSize.sm,
    letterSpacing: ds.tracking.caps,
    textTransform: 'uppercase',
    padding: '12px 28px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    transition: `opacity ${ds.motion.durHover}`,
    cursor: 'pointer',
  },

  // Chip / tag
  tag: {
    fontFamily: ds.font.body,
    fontWeight: ds.fontWeight.regular,
    fontSize: ds.fontSize.xs,
    letterSpacing: ds.tracking.caps,
    textTransform: 'uppercase',
    color: ds.color.textMuted2,
    padding: '5px 12px',
    border: `1px solid ${ds.color.borderSoft}`,
  },
} as const

export type DS = typeof ds
