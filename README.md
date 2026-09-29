# Laboon's Club

A phone-first generative deep-sea drawing built with p5.js. Each tide starts from a new seed and places baby Laboon, an anglerfish, jellies, small octopuses, tiny sharks, squid, prey, and marine snow in a shared current. The art uses open colored-pencil lines on ivory paper; no animal is filled in.

The intended eventual address is `laboonsclub.shin86.dev`. This prototype is local; no domain or hosting change is part of this pass.

Baby Laboon and his small Straw Hat flag are fan-art choices. The flag foreshadows the later One Piece story; it is not presented as a canonical baby marking.

This is an artistic model inspired by ecology. Marine snow drifts through a current; small prey respond to food and a lure; the angler can capture prey. The creature designs, population counts, and timing are invented for the piece. They are not calibrated species models.

## Run the sketch

Requires Node.js 22.13 or newer and pnpm.

```bash
pnpm install
npm run dev
```

Open <http://localhost:5173>. The page has no visible copy; small icons create a new tide and pause motion. The presentation uses 45% current, 200% encounters, and 50% pencil grain.

Drag or toss any creature except Laboon. He stays anchored at the center of the drawing. Fast throws ricochet from the edges before settling back into the current. A swipe through open water stirs nearby animals, and solid bodies yield or bump gently instead of passing through each other. On a supported iPhone, tap the motion icon to grant orientation access and let tilt nudge the current. The aquarium continues on its own without sensor access. Phone sensors require HTTPS; a plain `http://<LAN address>` preview does not grant access.

```bash
pnpm build
pnpm typecheck
pnpm lint
pnpm test
```

## Earlier simulation

The repository still contains the earlier deterministic plant–herbivore–predator engine, protocol, and server. They are not used by this art prototype. Run `npm run dev:legacy` to start that shared-world version during the transition. Its server persists a versioned SQLite snapshot in `data/ecosystem.sqlite` and should be treated as a trusted sandbox: connected clients can control its world, and it has no per-user authorization.

## Ecological grounding

The visual loop draws on two documented relationships. [Marine snow brings food into deep-sea food webs](https://www.mbari.org/project/ecology-of-marine-snow/). [Midwater anglerfish use luminous lures to attract prey](https://www.mbari.org/animal/deep-sea-anglerfish/). In this piece, current carries snow and small swimmers respond to local food patches and the angler's lure. Laboon's anchored body parts nearby swimmers. These compact rules make motion share causes; they do not simulate a measured habitat.

The drawing keeps pigment in open contours, small hatches, and signals. A stable seed lets the tuning controls change one property without replacing the whole composition.
