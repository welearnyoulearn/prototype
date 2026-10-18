import handler from "./.open-next/worker.js";

export default {
  async fetch(request, env, ctx) {
    return handler.fetch(request, env, ctx);
  },

  async scheduled(event, env, ctx) {
    const map = {
      "30 1 * * 0": "/api/cron/weekly-test",
      "30 3 * * 1": "/api/cron/usage-digest",
      "0 2 * * *": "/api/internal/log-cleanup",
      "30 2 * * *": "/api/cron/backup",
    };
    const path = map[event.cron];
    if (!path) throw new Error(`Unknown cron: ${event.cron}`);
    const request = new Request(new URL(path, env.APP_URL), {
      method: "GET",
      headers: { authorization: "Bearer " + env.CRON_SECRET },
    });

    // Awaited (not waitUntil) so a non-2xx marks the scheduled run as failed in Cloudflare.
    const response = await handler.fetch(request, env, ctx);
    console.log(`Cron ${event.cron} -> ${path}: ${response.status}`);
    if (!response.ok) throw new Error(`Cron ${event.cron} failed with status ${response.status}`);
  },
};
