#!/usr/bin/env node

/* eslint-env node */

import meow from "meow";

const cli = meow(
  `
    Usage
      $ xmpp-console [service]

    Options
      --port, -p 8080 port for the web interface
      --web, -w use web interface
      --no-open, prevents opening the url for the web interface
      --type, -t client (default) or component
      --username, -u the username for authentication
      --password, -p the password for authentication
      --domain, -d the service domain

    Examples
      $ xmpp-console localhost (auto)
      $ xmpp-console xmpp://localhost[:5222] (classic XMPP)
      $ xmpp-console xmpps://localhost[:5223] (direct TLS)
      $ xmpp-console ws://localhost:5280/xmpp-websocket (WebSocket)
      $ xmpp-console wss://localhost:5443/xmpp-websocket (Secure WebSocket)
      $ xmpp-console xmpp://component.localhost[:5347] --type component (component)
`,
  {
    flags: {
      port: {
        type: "number",
        default: 8080,
      },
      web: {
        type: "boolean",
        default: false,
      },
      open: {
        type: "boolean",
        default: true,
      },
      type: {
        type: "string",
        default: "client",
      },
      username: {
        type: "string",
      },
      password: {
        type: "string",
      },
      domain: {
        type: "string",
      },
    },
  }
);

process.title = "@xmpp/console";

const [service] = cli.input;

(async () => {
  const impl = await import(
    new URL(cli.flags.web ? "./src/server.js" : "./src/cli.js", import.meta.url)
  );
  impl.default({
    ...cli.flags,
    service,
  });
})();
