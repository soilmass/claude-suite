# Tailwind v4 @theme token shape (the design-tokens output)

CSS-first. Lives in the global stylesheet. No JS token objects, no tailwind.config
source (CLAUDE.md). OKLCH source values for perceptual evenness.

```css
@import "tailwindcss";

@theme {
  /* palette — OKLCH, full ramps per role */
  --color-bg:            oklch(1 0 0);
  --color-surface:       oklch(0.98 0.005 256);
  --color-fg:            oklch(0.2 0.02 256);
  --color-muted:         oklch(0.55 0.02 256);
  --color-border:        oklch(0.9 0.01 256);
  --color-primary:       oklch(0.62 0.19 256);
  --color-primary-fg:    oklch(0.98 0.01 256);   /* contrast-checked against --color-primary */
  --color-accent:        oklch(0.7 0.17 320);
  --color-destructive:   oklch(0.58 0.22 27);

  /* modular type scale — ratio 1.25, 1rem base */
  --text-xs:   0.64rem;
  --text-sm:   0.8rem;
  --text-base: 1rem;
  --text-lg:   1.25rem;
  --text-xl:   1.5625rem;
  --text-2xl:  1.953rem;
  --text-3xl:  2.441rem;
  /* fluid display step — clamp(min, preferred, max): scales with the viewport between the bounds */
  --text-display: clamp(2.441rem, 1.8rem + 3.2vw, 3.815rem);

  /* line-height — tight for headings, open for body (this skill owns type tokens post-fold) */
  --leading-tight:   1.15;   /* headings / display */
  --leading-snug:    1.3;    /* subheads, short UI labels */
  --leading-normal:  1.6;    /* body copy — 1.5–1.7 keeps long-form readable */

  /* measure — cap line length so body text stays in the 60–75ch readable band */
  --measure: 68ch;

  /* spacing — 8pt system (0.5rem = 8px base step) */
  --spacing-1: 0.5rem;   /*  8px */
  --spacing-2: 1rem;     /* 16px */
  --spacing-3: 1.5rem;   /* 24px */
  --spacing-4: 2rem;     /* 32px */
  --spacing-6: 3rem;     /* 48px */
  --spacing-8: 4rem;     /* 64px */

  /* motion */
  --duration-fast:   120ms;
  --duration-base:   200ms;
  --duration-slow:   320ms;
  --ease-standard:   cubic-bezier(0.2, 0, 0, 1);
  --ease-emphasized: cubic-bezier(0.3, 0, 0, 1);
}

/* dark mode — NOT a naive invert; values re-chosen for perceptual parity */
@media (prefers-color-scheme: dark) {
  @theme {
    --color-bg:      oklch(0.18 0.015 256);
    --color-surface: oklch(0.22 0.02 256);
    --color-fg:      oklch(0.96 0.01 256);
    --color-muted:   oklch(0.7 0.02 256);
    --color-border:  oklch(0.32 0.02 256);
    /* primary/accent re-tuned for contrast on the dark bg, re-checked */
  }
}
```

Every fg/bg pair above that co-occurs (fg-on-bg, primary-fg-on-primary, muted-on-bg,
border visibility) is run through `contrast.mjs` before this block is considered done.
