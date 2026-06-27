# PCB Enclosure Generator

Parametric, snap-fit, 3D-printable electronics enclosure generator. Give it a board's
dimensions, component keep-out volumes, and the ports you need; it generates a correctly
sized **body + lid** and exports them as **STL** and editable **OpenSCAD** source.

Built in the browser — React + Vite, with [manifold-3d](https://github.com/elalish/manifold)
(WebAssembly CSG) as the geometry kernel.

> Status: core generation pipeline is complete and unit-tested (body/lid sizing, port
> cut-outs auto-placed from keep-outs, OpenLock-style snap clips, STL + OpenSCAD export).
> **Not yet validated on a physical print** — snap-fit tolerances still need tuning against
> a real printer. A cantilever joint option, a validation/diagnostics UI, lid vents, and
> batch export are planned.

## How it works

The whole pipeline is built around a small backend-neutral **CSG intermediate
representation (IR)** — 7 node types (`box`, `cyl`, `translate`, `rotate`, `union`,
`difference`, `intersection`). One IR tree, two backends, so the two outputs can never
diverge:

```
EnclosureSpec
  → derive    outer dimensions from PCB + clearances;
              map PCB-corner space → origin-centered kernel space;
              resolve each port's position from its anchored keep-out
  → build     assemble body (shell − cavity − ports − joint pockets + standoffs)
              and lid (plate + lip + snap clips) into one IR tree
  → backends  IR → manifold → mesh → STL + live WebGL preview
              IR → OpenSCAD source
```

- **`src/lib/ir.ts`** — the IR node types and builders.
- **`src/lib/eval-manifold.ts`** — IR → manifold solid → triangle mesh (STL / preview).
- **`src/lib/emit-scad.ts`** — IR → readable parametric OpenSCAD source.
- **`src/lib/enclosure/`** — `schema` (input spec), `derive` (dimensions + the
  corner→centered coordinate transform + port resolution), `ports` (connector catalog +
  cut-out geometry), `joints` (snap-fit clip geometry), `build` (assembly), `export`.
- **`src/components/`** — `EnclosurePanel` (inputs + generate/export) and `Preview3D`
  (WebGL viewer).

Coordinate convention: millimeters throughout; Z up; the outer box is centered on X/Y with
its bottom at z=0. Keep-outs are authored in board-corner space (corner at origin); `derive`
owns the single transform into the centered kernel space.

## Develop

```bash
npm install
npm run dev      # dev server
npm run build    # type-check (tsc) + production build
npm test         # vitest unit tests
```

The geometry/derivation logic is pure and tested without WASM; only the manifold
evaluation and a topology smoke test (`genus === 0`) touch the kernel.

## License

MIT — see [LICENSE](LICENSE).
