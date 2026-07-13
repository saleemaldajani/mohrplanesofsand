# Mohr Planes of Sand

Interactive visualizer for stresses along Mohr planes and the angle of repose of a sand dune.

Drag sliders for friction angle φ, cohesion c, and principal stresses σ₁/σ₃ and watch the
Mohr circle, the Mohr–Coulomb failure envelope, and the dune slope respond together.

## The physics

- Stresses on a plane tilted θ from σ₁ map to the point at angle 2θ around the Mohr circle.
- Failure occurs when the circle touches the envelope τ = c + σ tan φ.
- The critical slip plane sits at θ_f = 45° + φ/2 from the major principal stress.
- For dry, cohesionless sand the dune's angle of repose is α ≈ φ.

## Run locally

```bash
npm start
```

Then open http://localhost:3000. No dependencies — plain HTML, CSS, canvas, and a
zero-dependency Node static server.

## Deploy on Railway

The repo is Railway-ready: Railway detects the Node app via `package.json` and uses
`railway.json` for the start command. Create a new Railway project from this repo and it
will build and serve automatically on the assigned `PORT`.

## License

MIT
