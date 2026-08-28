# Design System — "Editorial Dark"

Base de diseño compartida, extraída del portafolio de José Luis Sequeira.
Cópiala a cualquier proyecto nuevo para que **todos compartan la misma identidad
visual**.

> Estética: editorial / brutalista oscuro. Fondo casi negro azulado, titulares
> condensados en MAYÚSCULAS, un único azul eléctrico como acento, mucho aire,
> líneas finas como divisores y animaciones de "reveal" con clip-path.

---

## Archivos

| Archivo        | Para qué                                                            |
|----------------|---------------------------------------------------------------------|
| `tokens.css`   | Variables CSS (`--ds-*`), reset, base y clases utilitarias `.ds-*`. |
| `tokens.ts`    | Mismos tokens como objeto `ds` para inline styles en React.         |
| `README.md`    | Esta guía.                                                          |

### Cómo integrarlo

**1. Fuentes** — añade en el `<head>` de tu `index.html`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@300;400;500;700;800;900&family=DM+Sans:ital,wght@0,200;0,300;0,400;0,500;0,600;0,700;1,200;1,300&display=swap"
  rel="stylesheet"
/>
```

**2. Estilos** — copia la carpeta `design-system/` e impórtala una vez:

```ts
// main.tsx / index.tsx
import './design-system/tokens.css'
```

**3. Úsalo** — con variables CSS, clases o el objeto TS:

```css
.mi-titulo { font-family: var(--ds-font-display); color: var(--ds-text-strong); }
```
```tsx
import { ds } from './design-system/tokens'
<button style={dsStyles.btn}>Descargar CV</button>
```

---

## Tokens

### Colores

| Token              | Hex        | Uso                                  |
|--------------------|------------|--------------------------------------|
| `--ds-bg`          | `#07070f`  | Fondo base                           |
| `--ds-surface`     | `#0e0e1a`  | Tarjetas / paneles                   |
| `--ds-border`      | `#141428`  | Divisores y bordes                   |
| `--ds-border-soft` | `#1a1a28`  | Bordes de chips                      |
| `--ds-accent`      | `#1a2fff`  | **Color de marca** (azul eléctrico)  |
| `--ds-text-strong` | `#ffffff`  | Títulos                              |
| `--ds-text`        | `#e2ddd5`  | Cuerpo (blanco cálido)               |
| `--ds-text-muted`  | `#9a9ab2`  | Descripciones                        |
| `--ds-text-faint`  | `#6e6e88`  | Etiquetas / metadatos                |
| `--ds-success`     | `#22c77a`  | Estado "disponible / online"         |

> El acento se usa con alphas: `accent22/33/55` para glows y bordes en hover.
> Para cambiar el color de marca en un proyecto, sólo redefine `--ds-accent`.

### Tipografía

- **Display — `Big Shoulders Display`**: titulares. Siempre `text-transform:
  uppercase`, `font-weight: 900`, `letter-spacing` 1–2px, `line-height` 0.85–0.92.
- **Body — `DM Sans`**: todo lo demás. Etiquetas en mayúsculas con
  `letter-spacing` 2–4px.

**Pesos (legibilidad) — `--ds-fw-*` / `ds.fontWeight.*`:**

| Token            | Valor | Cuándo usarlo                                            |
|------------------|-------|---------------------------------------------------------|
| `--ds-fw-light`  | 300   | **Solo** párrafos ≥ 15px (estética ligera, texto largo) |
| `--ds-fw-regular`| 400   | Texto pequeño y captions — **mínimo** para < 15px       |
| `--ds-fw-medium` | 500   | Etiquetas en MAYÚSCULAS con tracking ancho (eyebrows)   |
| `--ds-fw-strong` | 600   | Etiquetas en **color de acento** sobre fondo oscuro     |
| `--ds-fw-display`| 900   | Titulares display                                       |

> **Regla:** nada por debajo de **400** en texto menor a 15px, y las etiquetas en
> mayúsculas con tracking van en **500** (el tracking + las caps las hace perder
> cuerpo). El peso **200 no se usa**: es ilegible a tamaño pequeño.
>
> **Contraste:** el texto en color de acento (azul) sobre fondo oscuro se percibe
> más delgado por su baja luminancia → súbelo a **600** (`--ds-fw-strong`).

Escala: hero `clamp(56px,7vw,88px)` · h2 `clamp(42px,4vw,56px)` · lead 19 ·
body 17 · desc 15 · sm 13 · label 11.

### Espaciado

Escala base de **4px**: `4 · 8 · 12 · 16 · 24 · 28 · 32 · 48 · 80 · 120`.
Secciones: padding horizontal 48px, vertical 80–120px. Ancho máx. de contenido 1200px.

### Movimiento

- **Reveal de entrada** (firma de la marca): `clip-path 1.6s cubic-bezier(0.65,0,0.15,1)`
  + fade. Se dispara al entrar al viewport (IntersectionObserver, ver patrón abajo).
- **Hover**: transiciones de 0.2s (opacidad, color, borde).

---

## Patrones / recetas

**Encabezado de sección**
```tsx
<span className="ds-sec-label">— Habilidades</span>
```

**Titular con tick de acento**
```tsx
<div style={{ width: 16, height: 1, background: 'var(--ds-accent)' }} />
<h2 className="ds-display" style={{ fontSize: 'var(--ds-fs-h2)' }}>Stack Tecnológico</h2>
<div style={{ width: 32, height: 2, background: 'var(--ds-accent)' }} /> {/* barra bajo el título */}
```

**Divisor entre secciones** — `border-bottom: 1px solid var(--ds-border)` (o
`.ds-rule` / `.ds-rule-blue` para la versión degradada al acento).

**Glow de acento** (fondo de imágenes/hero)
```css
background: radial-gradient(ellipse at center, var(--ds-accent-33) 0%, transparent 60%);
filter: blur(20px);
```

**Reveal al hacer scroll** — animar `clip-path` de `inset(0 100% 0 0)` → `inset(0 0 0 0)`
con `--ds-dur-reveal` y `--ds-ease-reveal`, activado por un IntersectionObserver
(threshold 0, `rootMargin: '0px 0px -20% 0px'`). Ver `fe/src/components/ui/Reveal.tsx`
y `fe/src/hooks/useReveal.ts` para la implementación de referencia.

---

## Reglas de oro

1. **Un solo acento.** Todo color vivo es `--ds-accent`. Nada de segundos colores
   de marca; sólo verde para el estado "disponible".
2. **Titulares siempre en MAYÚSCULAS** con la fuente display condensada.
3. **Líneas finas, no cajas pesadas.** Divisores de 1px, barras de acento de 2–3px.
4. **Aire generoso.** Secciones de pantalla completa, espaciado en múltiplos de 4px.
5. **Movimiento sobrio.** Reveal con clip-path a la entrada; hovers de 0.2s. Nada más.
