import EventEmitter from "events";
import { parse, stringify } from "ltx";

export default class Console extends EventEmitter {
  constructor(entity) {
    super();
    this.entity = entity;

    entity.on("element", (data) => this.input(data));
    entity.on("send", (data) => this.output(data));

    entity.on("connect", () => {
      this.info("connected");
    });

    entity.on("open", () => {
      this.info("open");
    });

    entity.on("online", (jid) => {
      this.jid = jid;
      this.info(`online ${jid.toString()}`);
    });

    entity.on("error", (err) => {
      this.error(err.message);
    });

    entity.on("close", () => {
      this.info("closed");
    });

    entity.on("connect", async () => {
      const domain = await this.ask({
        text: "Enter domain",
        value: "localhost",
        result: this.domain,
      });

      // WORKAROUND: xmpp.js should remember domain after initial open
      // so that it can restart the stream seamlessly
      entity.options.domain = domain;

      entity.open({ domain }).catch((err) => {
        this.error("open - ", err.message);
      });
    });
  }

  async login(auth, mechanism, { username, password } = {}) {
    // console.debug("authenticate", mechanism);

    const options = [
      // // Client only
      ...(mechanism
        ? [
            {
              name: "username",
              text: "Enter username",
              result: username,
            },
          ]
        : []),
      {
        name: "password",
        text: "Enter password",
        type: "password",
        result: password,
      },
    ];

    try {
      const result = await this.askMultiple(options);
      await auth(result);
    } catch (err) {
      this.error("authentication", err.message);
    }
  }

  input(el) {
    this.log("⮈ IN", this.beautify(el));
  }

  output(el) {
    this.log("⮊ OUT", this.beautify(el));
  }

  beautify(frag) {
    let el;
    if (typeof frag === "string") {
      try {
        el = parse(frag);
      } catch (err) {
        return frag;
      }
    } else {
      el = frag;
    }
    return stringify(el, "  ");
  }

  async askMultiple(options) {
    const result = {};

    for await (const option of options) {
      result[option.name] = await this.ask(option);
    }

    return result;
  }

  parse(str) {
    try {
      return parse(str);
    } catch (err) {
      return str;
    }
  }

  send(data) {
    let el;
    try {
      el = parse(data);
    } catch (err) {
      this.error(`invalid XML "${data}"`);
      return;
    }

    this.entity.send(el).then(() => {
      this.resetInput();
    });
  }

  resetInput() {}

  log(...args) {
    console.log(...args);
  }

  info(...args) {
    this.log("🛈 ", ...args);
  }

  warning(...args) {
    this.log("⚠ ", ...args);
  }

  error(...args) {
    this.log("❌ error ", ...args);
  }
}
