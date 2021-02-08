/* eslint-env node */

import readline from "readline";
import chalk from "chalk";

import { component } from "@xmpp/component";
import { client } from "@xmpp/client";

import Console from "./Console.js";

export default function ({ type, service, domain, username, password }) {
  const options = {
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.magenta.bold("✏ "),
  };
  if (Number(process.env.NODE_NO_READLINE)) {
    options.terminal = false;
  }
  const rl = readline.createInterface(options);

  let entity;
  if (type === "component") {
    entity = component({
      credentials: (...args) => xconsole.login(...args, { username, password }),
    });
  } else {
    entity = client({
      credentials: (...args) => xconsole.login(...args, { username, password }),
    });
  }

  const xconsole = new Console(entity);
  xconsole.domain = domain;
  xconsole.resetInput = function () {
    rl.prompt();
  };
  xconsole.log = function (...args) {
    readline.cursorTo(process.stdout, 0);
    console.log(...args);
    rl.prompt();
  };
  xconsole.info = function (...args) {
    this.log(chalk.cyan.bold("🛈"), ...args);
  };
  xconsole.warning = function (...args) {
    this.log(chalk.yellow.bold("⚠"), ...args);
  };
  xconsole.error = function (...args) {
    this.log(chalk.red.bold("❌") + " error", ...args);
  };
  xconsole.input = function (el) {
    this.log(chalk.green.bold("⮈ IN\n") + this.beautify(el));
  };
  xconsole.output = function (el) {
    this.log(chalk.magenta.bold("⮊ OUT\n") + this.beautify(el));
  };
  xconsole.choose = function (options) {
    return new Promise((resolve) => {
      rl.question(
        `${chalk.yellow.bold("?")} ${options.text}: ${options.choices.join(
          ", "
        )}`,
        (answer) => {
          resolve(answer);
        }
      );
    });
  };

  xconsole.ask = function ({ result, ...options }) {
    return new Promise((resolve) => {
      if (result) return resolve(result);
      rl.question(`${chalk.yellow.bold("?")} ${options.text}\n`, (answer) => {
        if (options.type === "password") {
          readline.moveCursor(process.stdout, 0, -1);
          readline.clearLine(process.stdout, 0);
          rl.history = rl.history.slice(1);
        }
        resolve(answer);
      });
    });
  };

  rl.prompt(true);

  rl.on("line", (line) => {
    // Clear stdin - any better idea? please contribute
    readline.moveCursor(process.stdout, 0, -1);
    readline.clearLine(process.stdout, 0);

    line = line.trim();
    if (line) {
      xconsole.send(line);
    } else {
      rl.prompt();
    }
  });

  rl.on("close", () => {
    process.exit(); // eslint-disable-line no-process-exit
  });

  entity.on("close", () => {
    process.exit(); // eslint-disable-line no-process-exit
  });

  xconsole
    .ask({
      text: "Enter service",
      value: "ws://localhost:5280/xmpp-websocket",
      type: "url",
      result: service,
    })
    .then((service) => {
      return entity.connect(service);
    });
}
