"use strict";

/* eslint-env browser */

import CodeMirror from "codemirror";
import "codemirror/lib/codemirror.css";
import "codemirror/theme/solarized.css";
import "codemirror/mode/xml/xml.js";
import "codemirror/addon/hint/show-hint.js";
import "codemirror/addon/hint/show-hint.css";
import "codemirror/addon/hint/xml-hint.js";
import "codemirror/addon/fold/foldcode.js";
import "codemirror/addon/fold/foldgutter.js";
import "codemirror/addon/fold/foldgutter.css";
import "codemirror/addon/fold/xml-fold.js";
import "codemirror/addon/edit/matchtags.js";
import "codemirror/addon/edit/closetag.js";

// https://codemirror.net/demo/xmlcomplete.html
function completeAfter(cm, pred) {
  if (!pred || pred()) {
    setTimeout(() => {
      if (!cm.state.completionActive) {
        cm.showHint({ completeSingle: false });
      }
    }, 100);
  }
  return CodeMirror.Pass;
}

function completeIfAfterLt(cm) {
  return completeAfter(cm, () => {
    const cur = cm.getCursor();
    return cm.getRange(CodeMirror.Pos(cur.line, cur.ch - 1), cur) === "<"; // eslint-disable-line new-cap
  });
}

function completeIfInTag(cm) {
  return completeAfter(cm, () => {
    const tok = cm.getTokenAt(cm.getCursor());
    if (
      tok.type === "string" &&
      (!/['"]/.test(tok.string.charAt(tok.string.length - 1)) ||
        tok.string.length === 1)
    ) {
      return false;
    }
    const inner = CodeMirror.innerMode(cm.getMode(), tok.state).state;
    return inner.tagName;
  });
}

const tags = {
  "!top": ["iq", "presence", "message"],
  "!attrs": {
    id: null,
    "xml:lang": "en",
    to: null,
    from: null,
    type: null,
    xmlns: null,
  },
  iq: {
    attrs: {
      type: ["get", "set", "result", "error"],
    },
  },
  presence: {
    attrs: {
      type: [
        "subscribe",
        "unsubscribe",
        "probe",
        "error",
        "subscribed",
        "unsubscribed",
        "available",
        "unavailable",
      ],
    },
  },
  message: {
    attrs: {
      type: ["chat", "normal"],
    },
  },
};

export default CodeMirror.fromTextArea(document.getElementById("editor"), {
  lineNumbers: true,
  mode: "xml",
  gutters: ["CodeMirror-foldgutter"],
  foldGutter: true,
  autoCloseTags: true,
  matchTags: { bothTags: true },
  extraKeys: {
    "'<'": completeAfter,
    "'/'": completeIfAfterLt,
    "' '": completeIfInTag,
    "'='": completeIfInTag,
    "Ctrl-Space": "autocomplete",
  },
  hintOptions: { schemaInfo: tags },
  theme: "solarized light",
});
