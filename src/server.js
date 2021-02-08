/* eslint-env node */

import express from "express";
import opn from "open";

const publicPath = new URL("../public", import.meta.url).pathname;

export default function ({
  type,
  port = 8080,
  service,
  open,
  domain,
  username,
  password,
}) {
  const app = express();

  app.use(express.static(publicPath));
  app.get("/params", (req, res) => {
    res.status(200).json({ type, service, domain, username, password });
  });

  app.listen(port, "localhost", () => {
    const url = `http://localhost:${port}`;

    process.stdout.write(url);

    if (open) {
      opn(url);
    }
  });
}
