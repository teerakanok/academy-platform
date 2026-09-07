using Config = import "/workerd/workerd.capnp".Config;
const config :Config = (
  services = [
(name="static-assets", disk=(path="/private/tmp/academy-course-route-cde63a58/academy-web/.open-next/assets", writable=false)),
    (
      name = "blocked-outbound",
      worker = (
        modules = [(name="blocked.js", esModule="export default { async fetch() { return new Response(null, { status: 503, headers: { 'x-outbound-request-blocked': 'true' } }) } }")],
        compatibilityDate = "2025-03-25",
      ),
    ),
    (
      name = "academy-final-worker",
      worker = (
        bindings = [(name="ASSETS", service="static-assets")],
        modules = [(name="gate.js", esModule=embed "course-route-root-test.js"), (name="./bundle.js", esModule=embed "final-worker-bundle/worker.js"), (name="./77d9faebf7af9e421806970ce10a58e9d83116d7-resvg.wasm", wasm=embed "final-worker-bundle/77d9faebf7af9e421806970ce10a58e9d83116d7-resvg.wasm"), (name="./ef4866ecae192fd87727067cf2c0c0cf9fb8b020-yoga.wasm", wasm=embed "final-worker-bundle/ef4866ecae192fd87727067cf2c0c0cf9fb8b020-yoga.wasm"), (name="./317f3d4af3af6e6c41b4fa8656e08dc5f512ed20-noto-sans-v27-latin-regular.ttf.bin", data=embed "final-worker-bundle/317f3d4af3af6e6c41b4fa8656e08dc5f512ed20-noto-sans-v27-latin-regular.ttf.bin")],
        compatibilityDate = "2025-03-25",
        compatibilityFlags = ["nodejs_compat", "global_fetch_strictly_public"],
        globalOutbound = "blocked-outbound",
      ),
    ),
  ],
);
