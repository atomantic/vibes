# Third-party notices

Original Vibes code, documentation, and procedural content are licensed under the repository's [ISC License](./LICENSE). The following imported asset keeps its own license and provenance.

## Stylized Components rendering techniques

- **Creator:** Christian Ortiz (Cortiz)
- **License:** [MIT](https://github.com/cortiz2894/stylized-components/blob/b182d81bff64531e584f50d71f046ae05fab3c87/LICENSE)
- **Pinned source:** [`cortiz2894/stylized-components` commit `b182d81`](https://github.com/cortiz2894/stylized-components/tree/b182d81bff64531e584f50d71f046ae05fab3c87)
- **Vibes modifications:** Adapted the water system's world-anchored animated Voronoi F1 minus SmoothF1 cel bands, two-octave distortion, three-stop color ramp, opacity, camera fade, and event-driven multi-ring ripples to Vibes' imperative Three.js renderer and gameplay state. Reimplemented the grass system's segmented instanced blades, world-space wind, environmental color variation, and shared procedural ground/dirt mask for Vibes' deterministic terrain. React Three Fiber, Leva, demo models, textures, and source-project runtime code are not bundled.

Copyright (c) 2026 Christian Ortiz (Cortiz). Used under the MIT License; the full license text is available at the pinned source above.

## RobotExpressive.glb

- **Creator:** Tomás Laulhé (Quaternius)
- **glTF modifications:** Don McCurdy added three facial-expression morph targets, converted the model with FBX2GLTF, removed duplicate materials, and reduced material metalness.
- **License:** [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)
- **Pinned source:** [three.js commit `b924f0c`](https://github.com/mrdoob/three.js/tree/b924f0cad4058dc4dde71445c796980c3cd5b5ed/examples/models/gltf/RobotExpressive)
- **Google model-viewer mirror:** [commit `297ed2b`](https://github.com/google/model-viewer/blob/297ed2bdbea0c8f921d985ff0c71afd3a819e12e/packages/shared-assets/models/RobotExpressive.glb)
- **Git blob:** `6fec9cfb4b41cb319c70d38cf86965aba5630964`
- **SHA-256:** `047f5e5fb3bb6d378bd1df16ca6137f2a596c99b3a1b5690b4020c05aaf6f319`
- **Size:** 463,988 bytes
- **Vibes modifications:** The checked-in GLB is byte-for-byte unchanged. At runtime Vibes scales and orients the model, enables shadows, and applies a coral, teal, and deep-slate material palette. Vibes currently uses its `Idle`, `Walking`, `Running`, and `Jump` clips.

CC0 permits use, modification, and redistribution without attribution. This notice records provenance and thanks the creators; it does not imply their endorsement of Vibes.
