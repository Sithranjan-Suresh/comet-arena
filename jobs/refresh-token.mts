// Monthly job: refresh the Meta long-lived token and write it back to the GitHub secret.
//   npm run job:refresh-token            (live)
//   npm run job:refresh-token -- --dry-run   (logs the calls it would make)
import { setRepoSecret } from "../lib/jobs/github-secret";
import { metaExchange, runRefreshToken } from "../lib/jobs/refresh-token";
import { getSources } from "../lib/sources";
import { runCli } from "./lib/run";

await runCli(
  "refresh-token",
  async (ctx) => {
    const sources = getSources();
    const result = await runRefreshToken({
      dryRun: process.argv.includes("--dry-run"),
      currentToken: process.env.META_LONG_LIVED_TOKEN ?? "",
      log: ctx.log,
      exchange: metaExchange({
        id: process.env.META_APP_ID ?? "",
        secret: process.env.META_APP_SECRET ?? "",
      }),
      writeBack: async (value) => {
        const repo = process.env.GITHUB_REPOSITORY;
        const token = process.env.GH_SECRETS_TOKEN;
        if (!repo || !token) return false;
        await setRepoSecret({ repo, token, name: "META_LONG_LIVED_TOKEN", value });
        return true;
      },
      alert: async (message) => {
        if (process.env.ADMIN_EMAIL)
          await sources.mailer.send({
            to: process.env.ADMIN_EMAIL,
            subject: "[Comet Arena] Meta token needs attention",
            text: message,
            html: `<p>${message}</p>`,
          });
      },
    });
    return { ...result };
  },
  { needsDb: false },
);
