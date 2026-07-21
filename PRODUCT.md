# Product

## Register

product

## Users

Robotics, AR, and 3D dataset teams — perception/ML engineers who need dense depth maps
for large RGB image collections and want the source images and derived depth maps kept
together as a training-ready dataset. Their context: they have (or are collecting) scenes
of images, they want depth without standing up GPU infrastructure or paying per-call API
fees, and they need the result addressable from a training pipeline. They care about
where the data lives, how it's indexed, and how much it costs to store as it grows.

## Product Purpose

A focused full-stack app (Next.js 16 + React 19 + Tailwind v4 + shadcn/ui frontend,
FastAPI backend) that runs **Depth Anything V2 locally** over images stored in Backblaze
B2 and writes co-located depth artifacts + a per-job `manifest.jsonl` index back to the
same bucket. It ships a Depth Jobs surface, a scoped Pairs Library, and a dashboard that
foregrounds the **write-amplification** story (source vs depth bytes). Success = a team
can ingest a scene, run a job, and read matched image→depth pairs straight from B2 — with
zero external API keys and cheap, S3-addressable storage as the dataset doubles in size.

## Brand Personality

Confident, precise, quietly professional. Voice is direct and free of hype. The interface
should feel like a modern perception/ML tool — considered, calm, trustworthy — that gets
out of the way of the data. Craft shows through restraint and correctness, not through a
loud identity.

## Anti-references

- **Generic AI/SaaS slop.** No gradient text, hero-metric templates, identical
  icon-card grids, tracked uppercase eyebrows, or decorative glassmorphism. These are
  the exact 2026 AI tells this kit exists to help builders avoid.
- **Over-branded / loud.** No heavy brand-color drenching, decorative motion, or flashy
  effects. It is scaffolding to be rebranded, not a hero page.
- **Toy / prototype feel.** No missing states, inconsistent components, or placeholder
  polish. Must read as production-grade.
- **Enterprise-drab.** No Bootstrap-era gray boxes or dense-but-lifeless admin-panel
  look. Considered, like modern dev tools (Linear, GitHub Primer, Stripe).

## Design Principles

- **The data is the product.** Every screen serves understanding the dataset — jobs,
  pairs, and the source-vs-depth storage split. Chrome never competes with the artifacts.
- **Tokens over hard-coded style.** Identity lives in tokens (`globals.css`); screens are
  built from the shared UI kit so restyling is a token swap, not a rewrite.
- **Earned familiarity over novelty.** Use standard, trusted affordances (top bar +
  side nav, command palette, data tables). The tool disappears into the task.
- **Every state is designed.** Default, hover, focus, active, disabled, loading (skeleton),
  empty (teaches the interface), and error (says what's wrong + offers retry) — never
  half-shipped.
- **Consistency is the feature.** One button vocabulary, one form-control set, one icon
  style across every screen. Divergence is a bug.

## Accessibility & Inclusion

Target **WCAG 2.1 AA**. Body text ≥ 4.5:1, large/bold text ≥ 3:1, visible focus
indicators on every interactive element, full keyboard navigation, correct semantic
landmarks and heading order, labelled form controls, and a `prefers-reduced-motion`
alternative for every animation. Full light and dark theme parity.
