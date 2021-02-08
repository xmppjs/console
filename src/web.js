/* eslint-env browser */

import { client as xmpp } from "@xmpp/client";
import { input, select } from "notie";
import "notie/dist/notie.css";
import "clipboard";
import Prism from "prismjs";
import "prismjs/themes/prism-solarizedlight.css";
import "prismjs/plugins/toolbar/prism-toolbar.js";
import "prismjs/plugins/toolbar/prism-toolbar.css";
import "prismjs/plugins/copy-to-clipboard/prism-copy-to-clipboard.js";
import "prismjs/plugins/autolinker/prism-autolinker.js";
import "prismjs/plugins/autolinker/prism-autolinker.css";

import Console from "./Console.js";
import editor from "./editor";

import "./style.css";

Prism.manual = true;

Prism.plugins.toolbar.registerButton("edit", {
  text: "Edit",
  onClick: (env) => {
    editor.setValue(env.code);
  },
});
// http://prismjs.com/plugins/toolbar/
Prism.plugins.toolbar.registerButton("select", {
  text: "Select",
  onClick: (env) => {
    // http://stackoverflow.com/a/11128179/2757940
    if (document.body.createTextRange) {
      // Ms
      const range = document.body.createTextRange();
      range.moveToElementText(env.element);
      range.select();
    } else if (window.getSelection) {
      // Moz, opera, webkit
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(env.element);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  },
});

function setup(params) {
  console.log(params);

  const client = xmpp({
    credentials: (...args) => xconsole.login(...args, params),
  });

  const xconsole = new Console(client);
  xconsole.domain = params.domain;
  xconsole.resetInput = function () {
    editor.setValue("");
  };
  xconsole.log = function (subject, body) {
    const div = document.createElement("div");
    div.classList.add("log-entry");
    div.textContent = subject;

    if (subject === "⮈ IN" || subject === "⮊ OUT" || body instanceof Error) {
      const pre = document.createElement("pre");
      pre.classList.add("language-xml");
      const code = document.createElement("code");
      code.textContent = body;
      pre.appendChild(code);
      div.appendChild(pre);
      Prism.highlightElement(code);
    } else if (body) {
      div.textContent += body;
    }

    const outputEl = document.getElementById("output");
    if (outputEl.firstChild) {
      outputEl.insertBefore(div, outputEl.firstChild);
    } else {
      outputEl.appendChild(div);
    }
  };
  xconsole.ask = function ({ result, ...options }) {
    return new Promise((resolve, reject) => {
      if (result) return resolve(result);
      options.submitCallback = resolve;
      options.cancelCallback = reject;
      input(options);
    });
  };
  xconsole.choose = function (options) {
    return new Promise((resolve, reject) => {
      options.cancelCallback = reject;
      options.choices = options.choices.map((choice) => {
        return {
          text: choice,
          handler() {
            resolve(choice);
          },
        };
      });
      select(options);
    });
  };

  xconsole
    .ask({
      text: "Enter service",
      value: "ws://localhost:5280/xmpp-websocket",
      type: "url",
      result: params.service,
    })
    .then((service) => {
      return client.connect(service);
    });

  function send() {
    const xml = editor.getValue().trim();
    if (xml) {
      xconsole.send(xml);
    }
  }

  document.getElementById("input").addEventListener("submit", (e) => {
    e.preventDefault();
    send();
  });

  window.addEventListener("keydown", (e) => {
    if (e.defaultPrevented) {
      return;
    }
    if (e.key === "Enter" && e.ctrlKey) {
      e.preventDefault();
      send();
    }
  });
}

fetch("/params")
  .then((res) => {
    return res.json();
  })
  .then(
    (params) => {
      return setup(params);
    },
    () => {
      return setup();
    }
  );
