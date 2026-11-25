# Punchly web traffic

The hosted app loads the Cloudflare Web Analytics beacon with its public site identifier. Only document visits are measured. The beacon runs on the Punchly GitHub Pages origin, and switching between Punchly tabs does not create a new tracked navigation. Attendance, profile data, exports, and backups stay on the device. [Cloudflare beacon privacy](https://developers.cloudflare.com/speed/observatory/rum-beacon/)

The **Settings → About & help → Website traffic** panel reads the deployed Worker's public **/stats** endpoint. It shows total page views and visits over the preceding seven days and when that window ended. The Worker caches the aggregate for 30 minutes in Cloudflare's cache. Its response carries counts and window metadata. It accepts a single fixed request and never forwards caller-supplied filters. [Cloudflare Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/)

## Connect the public counts

1. In Cloudflare, create a token with **Account → Account Analytics → Read**, scoped to the applicable account. The public beacon identifier is already in [wrangler.toml](../workers/traffic/wrangler.toml). [Cloudflare Analytics API authentication](https://developers.cloudflare.com/analytics/graphql-api/getting-started/authentication/api-token-auth/)
2. In the [Worker directory](../workers/traffic/), authenticate Wrangler with a deployment-capable Cloudflare login and run the commands below. Enter the values at the prompts. Store the API token in the Worker secret, and keep it out of the repository, frontend configuration, and chat. [Cloudflare Workers secrets](https://developers.cloudflare.com/workers/configuration/secrets/)

   ```sh
   npx wrangler login
   npx wrangler deploy
   npx wrangler secret put CF_ACCOUNT_ID
   npx wrangler secret put CF_ANALYTICS_API_TOKEN
   ```

3. Open the deployed Worker URL with `/stats` appended. Confirm the JSON contains `pageViews`, `visits`, `periodDays`, and `asOf`. Put that HTTPS URL in the `endpoint` field of [config/traffic.json](../config/traffic.json) and publish it to GitHub Pages.
4. Open Punchly’s **Website traffic** panel and check the aggregate values. An empty endpoint shows the setup state. The panel can retain previously displayed totals through a temporary request failure.
