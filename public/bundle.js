(function () {
  'use strict';

  var TimeoutError_1 = class TimeoutError extends Error {
    constructor(message) {
      super(message);
      this.name = "TimeoutError";
    }
  };

  var delay = function delay(ms) {
    let timeout;
    const promise = new Promise((resolve) => {
      timeout = setTimeout(resolve, ms);
    });
    promise.timeout = timeout;
    return promise;
  };

  var timeout = function timeout(promise, ms) {
    const promiseDelay = delay(ms);

    function cancelDelay() {
      clearTimeout(promiseDelay.timeout);
    }

    return Promise.race([
      promise.finally(cancelDelay),
      promiseDelay.then(() => {
        throw new TimeoutError_1();
      }),
    ]);
  };

  var promise = function promise(EE, event, rejectEvent = "error", timeout) {
    return new Promise((resolve, reject) => {
      let timeoutId;

      const cleanup = () => {
        clearTimeout(timeoutId);
        EE.removeListener(event, onEvent);
        EE.removeListener(rejectEvent, onError);
      };

      function onError(reason) {
        reject(reason);
        cleanup();
      }

      function onEvent(value) {
        resolve(value);
        cleanup();
      }

      EE.once(event, onEvent);
      if (rejectEvent) {
        EE.once(rejectEvent, onError);
      }

      if (timeout) {
        timeoutId = setTimeout(() => {
          cleanup();
          reject(new TimeoutError_1());
        }, timeout);
      }
    });
  };

  // Copyright Joyent, Inc. and other Node contributors.

  var R = typeof Reflect === 'object' ? Reflect : null;
  var ReflectApply = R && typeof R.apply === 'function'
    ? R.apply
    : function ReflectApply(target, receiver, args) {
      return Function.prototype.apply.call(target, receiver, args);
    };

  var ReflectOwnKeys;
  if (R && typeof R.ownKeys === 'function') {
    ReflectOwnKeys = R.ownKeys;
  } else if (Object.getOwnPropertySymbols) {
    ReflectOwnKeys = function ReflectOwnKeys(target) {
      return Object.getOwnPropertyNames(target)
        .concat(Object.getOwnPropertySymbols(target));
    };
  } else {
    ReflectOwnKeys = function ReflectOwnKeys(target) {
      return Object.getOwnPropertyNames(target);
    };
  }

  function ProcessEmitWarning(warning) {
    if (console && console.warn) console.warn(warning);
  }

  var NumberIsNaN = Number.isNaN || function NumberIsNaN(value) {
    return value !== value;
  };

  function EventEmitter() {
    EventEmitter.init.call(this);
  }
  var events = EventEmitter;
  var once_1 = once;

  // Backwards-compat with node 0.10.x
  EventEmitter.EventEmitter = EventEmitter;

  EventEmitter.prototype._events = undefined;
  EventEmitter.prototype._eventsCount = 0;
  EventEmitter.prototype._maxListeners = undefined;

  // By default EventEmitters will print a warning if more than 10 listeners are
  // added to it. This is a useful default which helps finding memory leaks.
  var defaultMaxListeners = 10;

  function checkListener(listener) {
    if (typeof listener !== 'function') {
      throw new TypeError('The "listener" argument must be of type Function. Received type ' + typeof listener);
    }
  }

  Object.defineProperty(EventEmitter, 'defaultMaxListeners', {
    enumerable: true,
    get: function() {
      return defaultMaxListeners;
    },
    set: function(arg) {
      if (typeof arg !== 'number' || arg < 0 || NumberIsNaN(arg)) {
        throw new RangeError('The value of "defaultMaxListeners" is out of range. It must be a non-negative number. Received ' + arg + '.');
      }
      defaultMaxListeners = arg;
    }
  });

  EventEmitter.init = function() {

    if (this._events === undefined ||
        this._events === Object.getPrototypeOf(this)._events) {
      this._events = Object.create(null);
      this._eventsCount = 0;
    }

    this._maxListeners = this._maxListeners || undefined;
  };

  // Obviously not all Emitters should be limited to 10. This function allows
  // that to be increased. Set to zero for unlimited.
  EventEmitter.prototype.setMaxListeners = function setMaxListeners(n) {
    if (typeof n !== 'number' || n < 0 || NumberIsNaN(n)) {
      throw new RangeError('The value of "n" is out of range. It must be a non-negative number. Received ' + n + '.');
    }
    this._maxListeners = n;
    return this;
  };

  function _getMaxListeners(that) {
    if (that._maxListeners === undefined)
      return EventEmitter.defaultMaxListeners;
    return that._maxListeners;
  }

  EventEmitter.prototype.getMaxListeners = function getMaxListeners() {
    return _getMaxListeners(this);
  };

  EventEmitter.prototype.emit = function emit(type) {
    var args = [];
    for (var i = 1; i < arguments.length; i++) args.push(arguments[i]);
    var doError = (type === 'error');

    var events = this._events;
    if (events !== undefined)
      doError = (doError && events.error === undefined);
    else if (!doError)
      return false;

    // If there is no 'error' event listener then throw.
    if (doError) {
      var er;
      if (args.length > 0)
        er = args[0];
      if (er instanceof Error) {
        // Note: The comments on the `throw` lines are intentional, they show
        // up in Node's output if this results in an unhandled exception.
        throw er; // Unhandled 'error' event
      }
      // At least give some kind of context to the user
      var err = new Error('Unhandled error.' + (er ? ' (' + er.message + ')' : ''));
      err.context = er;
      throw err; // Unhandled 'error' event
    }

    var handler = events[type];

    if (handler === undefined)
      return false;

    if (typeof handler === 'function') {
      ReflectApply(handler, this, args);
    } else {
      var len = handler.length;
      var listeners = arrayClone(handler, len);
      for (var i = 0; i < len; ++i)
        ReflectApply(listeners[i], this, args);
    }

    return true;
  };

  function _addListener(target, type, listener, prepend) {
    var m;
    var events;
    var existing;

    checkListener(listener);

    events = target._events;
    if (events === undefined) {
      events = target._events = Object.create(null);
      target._eventsCount = 0;
    } else {
      // To avoid recursion in the case that type === "newListener"! Before
      // adding it to the listeners, first emit "newListener".
      if (events.newListener !== undefined) {
        target.emit('newListener', type,
                    listener.listener ? listener.listener : listener);

        // Re-assign `events` because a newListener handler could have caused the
        // this._events to be assigned to a new object
        events = target._events;
      }
      existing = events[type];
    }

    if (existing === undefined) {
      // Optimize the case of one listener. Don't need the extra array object.
      existing = events[type] = listener;
      ++target._eventsCount;
    } else {
      if (typeof existing === 'function') {
        // Adding the second element, need to change to array.
        existing = events[type] =
          prepend ? [listener, existing] : [existing, listener];
        // If we've already got an array, just append.
      } else if (prepend) {
        existing.unshift(listener);
      } else {
        existing.push(listener);
      }

      // Check for listener leak
      m = _getMaxListeners(target);
      if (m > 0 && existing.length > m && !existing.warned) {
        existing.warned = true;
        // No error code for this since it is a Warning
        // eslint-disable-next-line no-restricted-syntax
        var w = new Error('Possible EventEmitter memory leak detected. ' +
                            existing.length + ' ' + String(type) + ' listeners ' +
                            'added. Use emitter.setMaxListeners() to ' +
                            'increase limit');
        w.name = 'MaxListenersExceededWarning';
        w.emitter = target;
        w.type = type;
        w.count = existing.length;
        ProcessEmitWarning(w);
      }
    }

    return target;
  }

  EventEmitter.prototype.addListener = function addListener(type, listener) {
    return _addListener(this, type, listener, false);
  };

  EventEmitter.prototype.on = EventEmitter.prototype.addListener;

  EventEmitter.prototype.prependListener =
      function prependListener(type, listener) {
        return _addListener(this, type, listener, true);
      };

  function onceWrapper() {
    if (!this.fired) {
      this.target.removeListener(this.type, this.wrapFn);
      this.fired = true;
      if (arguments.length === 0)
        return this.listener.call(this.target);
      return this.listener.apply(this.target, arguments);
    }
  }

  function _onceWrap(target, type, listener) {
    var state = { fired: false, wrapFn: undefined, target: target, type: type, listener: listener };
    var wrapped = onceWrapper.bind(state);
    wrapped.listener = listener;
    state.wrapFn = wrapped;
    return wrapped;
  }

  EventEmitter.prototype.once = function once(type, listener) {
    checkListener(listener);
    this.on(type, _onceWrap(this, type, listener));
    return this;
  };

  EventEmitter.prototype.prependOnceListener =
      function prependOnceListener(type, listener) {
        checkListener(listener);
        this.prependListener(type, _onceWrap(this, type, listener));
        return this;
      };

  // Emits a 'removeListener' event if and only if the listener was removed.
  EventEmitter.prototype.removeListener =
      function removeListener(type, listener) {
        var list, events, position, i, originalListener;

        checkListener(listener);

        events = this._events;
        if (events === undefined)
          return this;

        list = events[type];
        if (list === undefined)
          return this;

        if (list === listener || list.listener === listener) {
          if (--this._eventsCount === 0)
            this._events = Object.create(null);
          else {
            delete events[type];
            if (events.removeListener)
              this.emit('removeListener', type, list.listener || listener);
          }
        } else if (typeof list !== 'function') {
          position = -1;

          for (i = list.length - 1; i >= 0; i--) {
            if (list[i] === listener || list[i].listener === listener) {
              originalListener = list[i].listener;
              position = i;
              break;
            }
          }

          if (position < 0)
            return this;

          if (position === 0)
            list.shift();
          else {
            spliceOne(list, position);
          }

          if (list.length === 1)
            events[type] = list[0];

          if (events.removeListener !== undefined)
            this.emit('removeListener', type, originalListener || listener);
        }

        return this;
      };

  EventEmitter.prototype.off = EventEmitter.prototype.removeListener;

  EventEmitter.prototype.removeAllListeners =
      function removeAllListeners(type) {
        var listeners, events, i;

        events = this._events;
        if (events === undefined)
          return this;

        // not listening for removeListener, no need to emit
        if (events.removeListener === undefined) {
          if (arguments.length === 0) {
            this._events = Object.create(null);
            this._eventsCount = 0;
          } else if (events[type] !== undefined) {
            if (--this._eventsCount === 0)
              this._events = Object.create(null);
            else
              delete events[type];
          }
          return this;
        }

        // emit removeListener for all listeners on all events
        if (arguments.length === 0) {
          var keys = Object.keys(events);
          var key;
          for (i = 0; i < keys.length; ++i) {
            key = keys[i];
            if (key === 'removeListener') continue;
            this.removeAllListeners(key);
          }
          this.removeAllListeners('removeListener');
          this._events = Object.create(null);
          this._eventsCount = 0;
          return this;
        }

        listeners = events[type];

        if (typeof listeners === 'function') {
          this.removeListener(type, listeners);
        } else if (listeners !== undefined) {
          // LIFO order
          for (i = listeners.length - 1; i >= 0; i--) {
            this.removeListener(type, listeners[i]);
          }
        }

        return this;
      };

  function _listeners(target, type, unwrap) {
    var events = target._events;

    if (events === undefined)
      return [];

    var evlistener = events[type];
    if (evlistener === undefined)
      return [];

    if (typeof evlistener === 'function')
      return unwrap ? [evlistener.listener || evlistener] : [evlistener];

    return unwrap ?
      unwrapListeners(evlistener) : arrayClone(evlistener, evlistener.length);
  }

  EventEmitter.prototype.listeners = function listeners(type) {
    return _listeners(this, type, true);
  };

  EventEmitter.prototype.rawListeners = function rawListeners(type) {
    return _listeners(this, type, false);
  };

  EventEmitter.listenerCount = function(emitter, type) {
    if (typeof emitter.listenerCount === 'function') {
      return emitter.listenerCount(type);
    } else {
      return listenerCount.call(emitter, type);
    }
  };

  EventEmitter.prototype.listenerCount = listenerCount;
  function listenerCount(type) {
    var events = this._events;

    if (events !== undefined) {
      var evlistener = events[type];

      if (typeof evlistener === 'function') {
        return 1;
      } else if (evlistener !== undefined) {
        return evlistener.length;
      }
    }

    return 0;
  }

  EventEmitter.prototype.eventNames = function eventNames() {
    return this._eventsCount > 0 ? ReflectOwnKeys(this._events) : [];
  };

  function arrayClone(arr, n) {
    var copy = new Array(n);
    for (var i = 0; i < n; ++i)
      copy[i] = arr[i];
    return copy;
  }

  function spliceOne(list, index) {
    for (; index + 1 < list.length; index++)
      list[index] = list[index + 1];
    list.pop();
  }

  function unwrapListeners(arr) {
    var ret = new Array(arr.length);
    for (var i = 0; i < ret.length; ++i) {
      ret[i] = arr[i].listener || arr[i];
    }
    return ret;
  }

  function once(emitter, name) {
    return new Promise(function (resolve, reject) {
      function eventListener() {
        if (errorListener !== undefined) {
          emitter.removeListener('error', errorListener);
        }
        resolve([].slice.call(arguments));
      }    var errorListener;

      // Adding an error listener is not optional because
      // if an error is thrown on an event emitter we cannot
      // guarantee that the actual event we are waiting will
      // be fired. The result could be a silent way to create
      // memory or file descriptor leaks, which is something
      // we should avoid.
      if (name !== 'error') {
        errorListener = function errorListener(err) {
          emitter.removeListener(name, eventListener);
          reject(err);
        };

        emitter.once('error', errorListener);
      }

      emitter.once(name, eventListener);
    });
  }
  events.once = once_1;

  var Deferred = function Deferred() {
    this.promise = new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  };

  var EventEmitter_1 = events;
  var timeout_1 = timeout;
  var delay_1 = delay;
  var TimeoutError_1$1 = TimeoutError_1;
  var promise_1 = promise;
  var Deferred_1 = Deferred;

  var events$1 = {
  	EventEmitter: EventEmitter_1,
  	timeout: timeout_1,
  	delay: delay_1,
  	TimeoutError: TimeoutError_1$1,
  	promise: promise_1,
  	Deferred: Deferred_1
  };

  var detect = function detect(local) {
    if (!local) {
      return false;
    }

    // Remove all escaped sequences
    const tmp = local
      .replace(/\\20/g, "")
      .replace(/\\22/g, "")
      .replace(/\\26/g, "")
      .replace(/\\27/g, "")
      .replace(/\\2f/g, "")
      .replace(/\\3a/g, "")
      .replace(/\\3c/g, "")
      .replace(/\\3e/g, "")
      .replace(/\\40/g, "")
      .replace(/\\5c/g, "");

    // Detect if we have unescaped sequences
    const search = tmp.search(/[ "&'/:<>@\\]/g);
    if (search === -1) {
      return false;
    }

    return true;
  };

  /**
   * Escape the local part of a JID.
   *
   * @see http://xmpp.org/extensions/xep-0106.html
   * @param String local local part of a jid
   * @return An escaped local part
   */
  var _escape = function escape(local) {
    if (local === null) {
      return null;
    }

    return local
      .replace(/^\s+|\s+$/g, "")
      .replace(/\\/g, "\\5c")
      .replace(/ /g, "\\20")
      .replace(/"/g, "\\22")
      .replace(/&/g, "\\26")
      .replace(/'/g, "\\27")
      .replace(/\//g, "\\2f")
      .replace(/:/g, "\\3a")
      .replace(/</g, "\\3c")
      .replace(/>/g, "\\3e")
      .replace(/@/g, "\\40")
      .replace(/\3a/g, "\u0005c3a");
  };

  /**
   * Unescape a local part of a JID.
   *
   * @see http://xmpp.org/extensions/xep-0106.html
   * @param String local local part of a jid
   * @return unescaped local part
   */
  var _unescape = function unescape(local) {
    if (local === null) {
      return null;
    }

    return local
      .replace(/\\20/g, " ")
      .replace(/\\22/g, '"')
      .replace(/\\26/g, "&")
      .replace(/\\27/g, "'")
      .replace(/\\2f/g, "/")
      .replace(/\\3a/g, ":")
      .replace(/\\3c/g, "<")
      .replace(/\\3e/g, ">")
      .replace(/\\40/g, "@")
      .replace(/\\5c/g, "\\");
  };

  var escaping = {
  	detect: detect,
  	escape: _escape,
  	unescape: _unescape
  };

  /**
   * JID implements
   * - XMPP addresses according to RFC6122
   * - XEP-0106: JID Escaping
   *
   * @see http://tools.ietf.org/html/rfc6122#section-2
   * @see http://xmpp.org/extensions/xep-0106.html
   */
  class JID {
    constructor(local, domain, resource) {
      if (typeof domain !== "string" || !domain) {
        throw new TypeError(`Invalid domain.`);
      }

      this.setDomain(domain);
      this.setLocal(typeof local === "string" ? local : "");
      this.setResource(typeof resource === "string" ? resource : "");
    }

    [Symbol.toPrimitive](hint) {
      if (hint === "number") {
        return NaN;
      }

      return this.toString();
    }

    toString(unescape) {
      let s = this._domain;
      if (this._local) {
        s = this.getLocal(unescape) + "@" + s;
      }

      if (this._resource) {
        s = s + "/" + this._resource;
      }

      return s;
    }

    /**
     * Convenience method to distinguish users
     * */
    bare() {
      if (this._resource) {
        return new JID(this._local, this._domain, null);
      }

      return this;
    }

    /**
     * Comparison function
     * */
    equals(other) {
      return (
        this._local === other._local &&
        this._domain === other._domain &&
        this._resource === other._resource
      );
    }

    /**
     * http://xmpp.org/rfcs/rfc6122.html#addressing-localpart
     * */
    setLocal(local, escape) {
      escape = escape || escaping.detect(local);

      if (escape) {
        local = escaping.escape(local);
      }

      this._local = local && local.toLowerCase();
      return this;
    }

    getLocal(unescape) {
      unescape = unescape || false;
      let local = null;

      local = unescape ? escaping.unescape(this._local) : this._local;

      return local;
    }

    /**
     * http://xmpp.org/rfcs/rfc6122.html#addressing-domain
     */
    setDomain(domain) {
      this._domain = domain.toLowerCase();
      return this;
    }

    getDomain() {
      return this._domain;
    }

    /**
     * http://xmpp.org/rfcs/rfc6122.html#addressing-resourcepart
     */
    setResource(resource) {
      this._resource = resource;
      return this;
    }

    getResource() {
      return this._resource;
    }
  }

  Object.defineProperty(JID.prototype, "local", {
    get: JID.prototype.getLocal,
    set: JID.prototype.setLocal,
  });

  Object.defineProperty(JID.prototype, "domain", {
    get: JID.prototype.getDomain,
    set: JID.prototype.setDomain,
  });

  Object.defineProperty(JID.prototype, "resource", {
    get: JID.prototype.getResource,
    set: JID.prototype.setResource,
  });

  var JID_1 = JID;

  var parse = function parse(s) {
    let local;
    let resource;

    const resourceStart = s.indexOf("/");
    if (resourceStart !== -1) {
      resource = s.slice(resourceStart + 1);
      s = s.slice(0, resourceStart);
    }

    const atStart = s.indexOf("@");
    if (atStart !== -1) {
      local = s.slice(0, atStart);
      s = s.slice(atStart + 1);
    }

    return new JID_1(local, s, resource);
  };

  function jid(...args) {
    if (!args[1] && !args[2]) {
      return parse(...args);
    }

    return new JID_1(...args);
  }

  var jid_1 = jid.bind();
  var jid_2 = jid;
  var JID_1$1 = JID_1;
  var equal = function equal(a, b) {
    return a.equals(b);
  };

  var detectEscape = escaping.detect;
  var escapeLocal = escaping.escape;
  var unescapeLocal = escaping.unescape;
  var parse_1 = parse;
  jid_1.jid = jid_2;
  jid_1.JID = JID_1$1;
  jid_1.equal = equal;
  jid_1.detectEscape = detectEscape;
  jid_1.escapeLocal = escapeLocal;
  jid_1.unescapeLocal = unescapeLocal;
  jid_1.parse = parse_1;

  var commonjsGlobal = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

  function getAugmentedNamespace(n) {
  	if (n.__esModule) return n;
  	var a = Object.defineProperty({}, '__esModule', {value: true});
  	Object.keys(n).forEach(function (k) {
  		var d = Object.getOwnPropertyDescriptor(n, k);
  		Object.defineProperty(a, k, d.get ? d : {
  			enumerable: true,
  			get: function () {
  				return n[k];
  			}
  		});
  	});
  	return a;
  }

  function createCommonjsModule(fn) {
    var module = { exports: {} };
  	return fn(module, module.exports), module.exports;
  }

  function commonjsRequire (target) {
  	throw new Error('Could not dynamically require "' + target + '". Please configure the dynamicRequireTargets option of @rollup/plugin-commonjs appropriately for this require call to behave properly.');
  }

  var escapeXMLTable = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    '\'': '&apos;'
  };

  function escapeXMLReplace (match) {
    return escapeXMLTable[match]
  }

  var unescapeXMLTable = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&apos;': "'"
  };

  function unescapeXMLReplace (match) {
    if (match[1] === '#') {
      var num;
      if (match[2] === 'x') {
        num = parseInt(match.slice(3), 16);
      } else {
        num = parseInt(match.slice(2), 10);
      }
      // https://www.w3.org/TR/xml/#NT-Char defines legal XML characters:
      // #x9 | #xA | #xD | [#x20-#xD7FF] | [#xE000-#xFFFD] | [#x10000-#x10FFFF]
      if (num === 0x9 || num === 0xA || num === 0xD ||
          (num >= 0x20 && num <= 0xD7FF) ||
          (num >= 0xE000 && num <= 0xFFFD) ||
          (num >= 0x10000 && num <= 0x10FFFF)) {
        return String.fromCodePoint(num)
      }
      throw new Error('Illegal XML character 0x' + num.toString(16))
    }
    if (unescapeXMLTable[match]) {
      return unescapeXMLTable[match] || match
    }
    throw new Error('Illegal XML entity ' + match)
  }

  var escapeXML = function escapeXML (s) {
    return s.replace(/&|<|>|"|'/g, escapeXMLReplace)
  };

  var unescapeXML = function unescapeXML (s) {
    var result = '';
    var start = -1;
    var end = -1;
    var previous = 0;
    while ((start = s.indexOf('&', previous)) !== -1 && (end = s.indexOf(';', start + 1)) !== -1) {
      result = result +
        s.substring(previous, start) +
        unescapeXMLReplace(s.substring(start, end + 1));
      previous = end + 1;
    }

    // shortcut if loop never entered:
    // return the original string without creating new objects
    if (previous === 0) return s

    // push the remaining characters
    result = result + s.substring(previous);

    return result
  };

  var escapeXMLText = function escapeXMLText (s) {
    return s.replace(/&|<|>/g, escapeXMLReplace)
  };

  var unescapeXMLText = function unescapeXMLText (s) {
    return s.replace(/&(amp|#38|lt|#60|gt|#62);/g, unescapeXMLReplace)
  };

  var _escape$1 = {
  	escapeXML: escapeXML,
  	unescapeXML: unescapeXML,
  	escapeXMLText: escapeXMLText,
  	unescapeXMLText: unescapeXMLText
  };

  function nameEqual (a, b) {
    return a.name === b.name
  }

  function attrsEqual (a, b) {
    var attrs = a.attrs;
    var keys = Object.keys(attrs);
    var length = keys.length;
    if (length !== Object.keys(b.attrs).length) return false
    for (var i = 0, l = length; i < l; i++) {
      var key = keys[i];
      var value = attrs[key];
      if (value == null || b.attrs[key] == null) { // === null || undefined
        if (value !== b.attrs[key]) return false
      } else if (value.toString() !== b.attrs[key].toString()) {
        return false
      }
    }
    return true
  }

  function childrenEqual (a, b) {
    var children = a.children;
    var length = children.length;
    if (length !== b.children.length) return false
    for (var i = 0, l = length; i < l; i++) {
      var child = children[i];
      if (typeof child === 'string') {
        if (child !== b.children[i]) return false
      } else {
        if (!child.equals(b.children[i])) return false
      }
    }
    return true
  }

  function equal$1 (a, b) {
    if (!nameEqual(a, b)) return false
    if (!attrsEqual(a, b)) return false
    if (!childrenEqual(a, b)) return false
    return true
  }

  var name = nameEqual;
  var attrs = attrsEqual;
  var children = childrenEqual;
  var equal_2 = equal$1;

  var equal_1 = {
  	name: name,
  	attrs: attrs,
  	children: children,
  	equal: equal_2
  };

  var clone = function clone (el) {
    var clone = new el.constructor(el.name, el.attrs);
    for (var i = 0; i < el.children.length; i++) {
      var child = el.children[i];
      clone.cnode(child.clone ? child.clone() : child);
    }
    return clone
  };

  var escapeXML$1 = _escape$1.escapeXML;
  var escapeXMLText$1 = _escape$1.escapeXMLText;


  var equal$2 = equal_1.equal;
  var nameEqual$1 = equal_1.name;
  var attrsEqual$1 = equal_1.attrs;
  var childrenEqual$1 = equal_1.children;



  /**
   * Element
   *
   * Attributes are in the element.attrs object. Children is a list of
   * either other Elements or Strings for text content.
   **/
  function Element$1 (name, attrs) {
    this.name = name;
    this.parent = null;
    this.children = [];
    this.attrs = {};
    this.setAttrs(attrs);
  }

  /* Accessors */

  /**
   * if (element.is('message', 'jabber:client')) ...
   **/
  Element$1.prototype.is = function (name, xmlns) {
    return (this.getName() === name) &&
    (!xmlns || (this.getNS() === xmlns))
  };

  /* without prefix */
  Element$1.prototype.getName = function () {
    if (this.name.indexOf(':') >= 0) {
      return this.name.substr(this.name.indexOf(':') + 1)
    } else {
      return this.name
    }
  };

  /**
   * retrieves the namespace of the current element, upwards recursively
   **/
  Element$1.prototype.getNS = function () {
    if (this.name.indexOf(':') >= 0) {
      var prefix = this.name.substr(0, this.name.indexOf(':'));
      return this.findNS(prefix)
    }
    return this.findNS()
  };

  /**
   * find the namespace to the given prefix, upwards recursively
   **/
  Element$1.prototype.findNS = function (prefix) {
    if (!prefix) {
      /* default namespace */
      if (this.attrs.xmlns) {
        return this.attrs.xmlns
      } else if (this.parent) {
        return this.parent.findNS()
      }
    } else {
      /* prefixed namespace */
      var attr = 'xmlns:' + prefix;
      if (this.attrs[attr]) {
        return this.attrs[attr]
      } else if (this.parent) {
        return this.parent.findNS(prefix)
      }
    }
  };

  /**
   * Recursiverly gets all xmlns defined, in the form of {url:prefix}
   **/
  Element$1.prototype.getXmlns = function () {
    var namespaces = {};

    if (this.parent) {
      namespaces = this.parent.getXmlns();
    }

    for (var attr in this.attrs) {
      var m = attr.match('xmlns:?(.*)');
      // eslint-disable-next-line  no-prototype-builtins
      if (this.attrs.hasOwnProperty(attr) && m) {
        namespaces[this.attrs[attr]] = m[1];
      }
    }
    return namespaces
  };

  Element$1.prototype.setAttrs = function (attrs) {
    if (typeof attrs === 'string') {
      this.attrs.xmlns = attrs;
    } else if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        this.attrs[key] = attrs[key];
      }, this);
    }
  };

  /**
   * xmlns can be null, returns the matching attribute.
   **/
  Element$1.prototype.getAttr = function (name, xmlns) {
    if (!xmlns) {
      return this.attrs[name]
    }

    var namespaces = this.getXmlns();

    if (!namespaces[xmlns]) {
      return null
    }

    return this.attrs[[namespaces[xmlns], name].join(':')]
  };

  /**
   * xmlns can be null
   **/
  Element$1.prototype.getChild = function (name, xmlns) {
    return this.getChildren(name, xmlns)[0]
  };

  /**
   * xmlns can be null
   **/
  Element$1.prototype.getChildren = function (name, xmlns) {
    var result = [];
    for (var i = 0; i < this.children.length; i++) {
      var child = this.children[i];
      if (child.getName &&
        (child.getName() === name) &&
        (!xmlns || (child.getNS() === xmlns))) {
        result.push(child);
      }
    }
    return result
  };

  /**
   * xmlns and recursive can be null
   **/
  Element$1.prototype.getChildByAttr = function (attr, val, xmlns, recursive) {
    return this.getChildrenByAttr(attr, val, xmlns, recursive)[0]
  };

  /**
   * xmlns and recursive can be null
   **/
  Element$1.prototype.getChildrenByAttr = function (attr, val, xmlns, recursive) {
    var result = [];
    for (var i = 0; i < this.children.length; i++) {
      var child = this.children[i];
      if (child.attrs &&
        (child.attrs[attr] === val) &&
        (!xmlns || (child.getNS() === xmlns))) {
        result.push(child);
      }
      if (recursive && child.getChildrenByAttr) {
        result.push(child.getChildrenByAttr(attr, val, xmlns, true));
      }
    }
    if (recursive) {
      result = [].concat.apply([], result);
    }
    return result
  };

  Element$1.prototype.getChildrenByFilter = function (filter, recursive) {
    var result = [];
    for (var i = 0; i < this.children.length; i++) {
      var child = this.children[i];
      if (filter(child)) {
        result.push(child);
      }
      if (recursive && child.getChildrenByFilter) {
        result.push(child.getChildrenByFilter(filter, true));
      }
    }
    if (recursive) {
      result = [].concat.apply([], result);
    }
    return result
  };

  Element$1.prototype.getText = function () {
    var text = '';
    for (var i = 0; i < this.children.length; i++) {
      var child = this.children[i];
      if ((typeof child === 'string') || (typeof child === 'number')) {
        text += child;
      }
    }
    return text
  };

  Element$1.prototype.getChildText = function (name, xmlns) {
    var child = this.getChild(name, xmlns);
    return child ? child.getText() : null
  };

  /**
   * Return all direct descendents that are Elements.
   * This differs from `getChildren` in that it will exclude text nodes,
   * processing instructions, etc.
   */
  Element$1.prototype.getChildElements = function () {
    return this.getChildrenByFilter(function (child) {
      return child instanceof Element$1
    })
  };

  /* Builder */

  /** returns uppermost parent */
  Element$1.prototype.root = function () {
    if (this.parent) {
      return this.parent.root()
    }
    return this
  };
  Element$1.prototype.tree = Element$1.prototype.root;

  /** just parent or itself */
  Element$1.prototype.up = function () {
    if (this.parent) {
      return this.parent
    }
    return this
  };

  /** create child node and return it */
  Element$1.prototype.c = function (name, attrs) {
    return this.cnode(new Element$1(name, attrs))
  };

  Element$1.prototype.cnode = function (child) {
    this.children.push(child);
    if (typeof child === 'object') {
      child.parent = this;
    }
    return child
  };

  /** add text node and return element */
  Element$1.prototype.t = function (text) {
    this.children.push(text);
    return this
  };

  /* Manipulation */

  /**
   * Either:
   *   el.remove(childEl)
   *   el.remove('author', 'urn:...')
   */
  Element$1.prototype.remove = function (el, xmlns) {
    var filter;
    if (typeof el === 'string') {
      /* 1st parameter is tag name */
      filter = function (child) {
        return !(child.is &&
        child.is(el, xmlns))
      };
    } else {
      /* 1st parameter is element */
      filter = function (child) {
        return child !== el
      };
    }

    this.children = this.children.filter(filter);

    return this
  };

  Element$1.prototype.clone = function () {
    return clone(this)
  };

  Element$1.prototype.text = function (val) {
    if (val && this.children.length === 1) {
      this.children[0] = val;
      return this
    }
    return this.getText()
  };

  Element$1.prototype.attr = function (attr, val) {
    if (typeof val !== 'undefined' || val === null) {
      if (!this.attrs) {
        this.attrs = {};
      }
      this.attrs[attr] = val;
      return this
    }
    return this.attrs[attr]
  };

  /* Serialization */

  Element$1.prototype.toString = function () {
    var s = '';
    this.write(function (c) {
      s += c;
    });
    return s
  };

  Element$1.prototype.toJSON = function () {
    return {
      name: this.name,
      attrs: this.attrs,
      children: this.children.map(function (child) {
        return child && child.toJSON ? child.toJSON() : child
      })
    }
  };

  Element$1.prototype._addChildren = function (writer) {
    writer('>');
    for (var i = 0; i < this.children.length; i++) {
      var child = this.children[i];
      /* Skip null/undefined */
      if (child || (child === 0)) {
        if (child.write) {
          child.write(writer);
        } else if (typeof child === 'string') {
          writer(escapeXMLText$1(child));
        } else if (child.toString) {
          writer(escapeXMLText$1(child.toString(10)));
        }
      }
    }
    writer('</');
    writer(this.name);
    writer('>');
  };

  Element$1.prototype.write = function (writer) {
    writer('<');
    writer(this.name);
    for (var k in this.attrs) {
      var v = this.attrs[k];
      if (v != null) { // === null || undefined
        writer(' ');
        writer(k);
        writer('="');
        if (typeof v !== 'string') {
          v = v.toString();
        }
        writer(escapeXML$1(v));
        writer('"');
      }
    }
    if (this.children.length === 0) {
      writer('/>');
    } else {
      this._addChildren(writer);
    }
  };

  Element$1.prototype.nameEquals = function (el) {
    return nameEqual$1(this, el)
  };

  Element$1.prototype.attrsEquals = function (el) {
    return attrsEqual$1(this, el)
  };

  Element$1.prototype.childrenEquals = function (el) {
    return childrenEqual$1(this, el)
  };

  Element$1.prototype.equals = function (el) {
    return equal$2(this, el)
  };

  var Element_1 = Element$1;

  class Element$2 extends Element_1 {
    setAttrs(attrs) {
      if (typeof attrs === "string") {
        this.attrs.xmlns = attrs;
      } else if (attrs) {
        Object.keys(attrs).forEach((key) => {
          // https://github.com/facebook/react/pull/4596
          // https://www.npmjs.com/package/babel-plugin-transform-react-jsx-source
          if (key === "__source" || key === "__self") return;
          const val = attrs[key];
          if (val !== undefined && val !== null)
            this.attrs[key.toString()] = val.toString();
        }, this);
      }
    }

    append(nodes) {
      nodes = Array.isArray(nodes) ? nodes : [nodes];
      nodes.forEach((node) => {
        this.children.push(node);
        if (typeof node === "object") {
          node.parent = this;
        }
      });
      return this;
    }

    prepend(nodes) {
      nodes = Array.isArray(nodes) ? nodes : [nodes];
      nodes.forEach((node) => {
        this.children.unshift(node);
        if (typeof node === "object") {
          node.parent = this;
        }
      });
      return this;
    }
  }

  var Element_1$1 = Element$2;

  function append(el, child) {
    if (child === false || child === null || child === undefined) return;
    if (child instanceof Element_1$1) {
      el.append(child);
    } else if (Array.isArray(child)) {
      child.forEach((c) => append(el, c));
    } else {
      el.append(String(child));
    }
  }

  function x(name, attrs, ...children) {
    const el = new Element_1$1(name, attrs);
    // eslint-disable-next-line unicorn/no-for-loop
    for (let i = 0; i < children.length; i++) {
      append(el, children[i]);
    }

    return el;
  }

  var x_1 = x;

  var inherits_browser = createCommonjsModule(function (module) {
  if (typeof Object.create === 'function') {
    // implementation from standard node.js 'util' module
    module.exports = function inherits(ctor, superCtor) {
      if (superCtor) {
        ctor.super_ = superCtor;
        ctor.prototype = Object.create(superCtor.prototype, {
          constructor: {
            value: ctor,
            enumerable: false,
            writable: true,
            configurable: true
          }
        });
      }
    };
  } else {
    // old school shim for old browsers
    module.exports = function inherits(ctor, superCtor) {
      if (superCtor) {
        ctor.super_ = superCtor;
        var TempCtor = function () {};
        TempCtor.prototype = superCtor.prototype;
        ctor.prototype = new TempCtor();
        ctor.prototype.constructor = ctor;
      }
    };
  }
  });

  var ltx = createCommonjsModule(function (module) {


  var EventEmitter = events.EventEmitter;
  var unescapeXML = _escape$1.unescapeXML;

  var STATE_TEXT = 0;
  var STATE_IGNORE_COMMENT = 1;
  var STATE_IGNORE_INSTRUCTION = 2;
  var STATE_TAG_NAME = 3;
  var STATE_TAG = 4;
  var STATE_ATTR_NAME = 5;
  var STATE_ATTR_EQ = 6;
  var STATE_ATTR_QUOT = 7;
  var STATE_ATTR_VALUE = 8;
  var STATE_CDATA = 9;
  var STATE_IGNORE_CDATA = 10;

  var SaxLtx = module.exports = function SaxLtx () {
    EventEmitter.call(this);

    var state = STATE_TEXT;
    var remainder;
    var tagName;
    var attrs;
    var endTag;
    var selfClosing;
    var attrQuote;
    var attrQuoteChar;
    var recordStart = 0;
    var attrName;

    this._handleTagOpening = function (endTag, tagName, attrs) {
      if (!endTag) {
        this.emit('startElement', tagName, attrs);
        if (selfClosing) {
          this.emit('endElement', tagName);
        }
      } else {
        this.emit('endElement', tagName);
      }
    };

    this.write = function (data) {
      if (typeof data !== 'string') {
        data = data.toString();
      }
      var pos = 0;

      /* Anything from previous write()? */
      if (remainder) {
        data = remainder + data;
        pos += remainder.length;
        remainder = null;
      }

      function endRecording () {
        if (typeof recordStart === 'number') {
          var recorded = data.substring(recordStart, pos);
          recordStart = undefined;
          return recorded
        }
      }

      for (; pos < data.length; pos++) {
        if (state === STATE_TEXT) {
          // if we're looping through text, fast-forward using indexOf to
          // the next '<' character
          var lt = data.indexOf('<', pos);
          if (lt !== -1 && pos !== lt) {
            pos = lt;
          }
        } else if (state === STATE_ATTR_VALUE) {
          // if we're looping through an attribute, fast-forward using
          // indexOf to the next end quote character
          var quot = data.indexOf(attrQuoteChar, pos);
          if (quot !== -1) {
            pos = quot;
          }
        } else if (state === STATE_IGNORE_COMMENT) {
          // if we're looping through a comment, fast-forward using
          // indexOf to the first end-comment character
          var endcomment = data.indexOf('-->', pos);
          if (endcomment !== -1) {
            pos = endcomment + 2; // target the '>' character
          }
        } else if (state === STATE_IGNORE_CDATA) {
          // if we're looping through a CDATA, fast-forward using
          // indexOf to the first end-CDATA character ]]>
          var endCDATA = data.indexOf(']]>', pos);
          if (endCDATA !== -1) {
            pos = endCDATA + 2; // target the '>' character
          }
        }

        var c = data.charCodeAt(pos);
        switch (state) {
          case STATE_TEXT:
            if (c === 60 /* < */) {
              var text = endRecording();
              if (text) {
                this.emit('text', unescapeXML(text));
              }
              state = STATE_TAG_NAME;
              recordStart = pos + 1;
              attrs = {};
            }
            break
          case STATE_CDATA:
            if (c === 93 /* ] */ && data.substr(pos + 1, 2) === ']>') {
              var cData = endRecording();
              if (cData) {
                this.emit('text', cData);
              }
              state = STATE_TEXT;
            }
            break
          case STATE_TAG_NAME:
            if (c === 47 /* / */ && recordStart === pos) {
              recordStart = pos + 1;
              endTag = true;
            } else if (c === 33 /* ! */) {
              if (data.substr(pos + 1, 7) === '[CDATA[') {
                recordStart = pos + 8;
                state = STATE_CDATA;
              } else {
                recordStart = undefined;
                state = STATE_IGNORE_COMMENT;
              }
            } else if (c === 63 /* ? */) {
              recordStart = undefined;
              state = STATE_IGNORE_INSTRUCTION;
            } else if (c <= 32 || c === 47 /* / */ || c === 62 /* > */) {
              tagName = endRecording();
              pos--;
              state = STATE_TAG;
            }
            break
          case STATE_IGNORE_COMMENT:
            if (c === 62 /* > */) {
              var prevFirst = data.charCodeAt(pos - 1);
              var prevSecond = data.charCodeAt(pos - 2);
              if ((prevFirst === 45 /* - */ && prevSecond === 45 /* - */) ||
                  (prevFirst === 93 /* ] */ && prevSecond === 93 /* ] */)) {
                state = STATE_TEXT;
              }
            }
            break
          case STATE_IGNORE_INSTRUCTION:
            if (c === 62 /* > */) {
              var prev = data.charCodeAt(pos - 1);
              if (prev === 63 /* ? */) {
                state = STATE_TEXT;
              }
            }
            break
          case STATE_TAG:
            if (c === 62 /* > */) {
              this._handleTagOpening(endTag, tagName, attrs);
              tagName = undefined;
              attrs = undefined;
              endTag = undefined;
              selfClosing = undefined;
              state = STATE_TEXT;
              recordStart = pos + 1;
            } else if (c === 47 /* / */) {
              selfClosing = true;
            } else if (c > 32) {
              recordStart = pos;
              state = STATE_ATTR_NAME;
            }
            break
          case STATE_ATTR_NAME:
            if (c <= 32 || c === 61 /* = */) {
              attrName = endRecording();
              pos--;
              state = STATE_ATTR_EQ;
            }
            break
          case STATE_ATTR_EQ:
            if (c === 61 /* = */) {
              state = STATE_ATTR_QUOT;
            }
            break
          case STATE_ATTR_QUOT:
            if (c === 34 /* " */ || c === 39 /* ' */) {
              attrQuote = c;
              attrQuoteChar = c === 34 ? '"' : "'";
              state = STATE_ATTR_VALUE;
              recordStart = pos + 1;
            }
            break
          case STATE_ATTR_VALUE:
            if (c === attrQuote) {
              var value = unescapeXML(endRecording());
              attrs[attrName] = value;
              attrName = undefined;
              state = STATE_TAG;
            }
            break
        }
      }

      if (typeof recordStart === 'number' &&
        recordStart <= data.length) {
        remainder = data.slice(recordStart);
        recordStart = 0;
      }
    };
  };
  inherits_browser(SaxLtx, EventEmitter);

  SaxLtx.prototype.end = function (data) {
    if (data) {
      this.write(data);
    }

    /* Uh, yeah */
    this.write = function () {};
  };
  });

  var XMLError_1 = class XMLError extends Error {
    constructor(...args) {
      super(...args);
      this.name = "XMLError";
    }
  };

  class Parser extends events {
    constructor() {
      super();
      const parser = new ltx();
      this.root = null;
      this.cursor = null;

      parser.on("startElement", this.onStartElement.bind(this));
      parser.on("endElement", this.onEndElement.bind(this));
      parser.on("text", this.onText.bind(this));

      this.parser = parser;
    }

    onStartElement(name, attrs) {
      const element = new Element_1$1(name, attrs);

      const { root, cursor } = this;

      if (!root) {
        this.root = element;
        this.emit("start", element);
      } else if (cursor !== root) {
        cursor.append(element);
      }

      this.cursor = element;
    }

    onEndElement(name) {
      const { root, cursor } = this;
      if (name !== cursor.name) {
        // <foo></bar>
        this.emit("error", new XMLError_1(`${cursor.name} must be closed.`));
        return;
      }

      if (cursor === root) {
        this.emit("end", root);
        return;
      }

      if (!cursor.parent) {
        cursor.parent = root;
        this.emit("element", cursor);
        this.cursor = root;
        return;
      }

      this.cursor = cursor.parent;
    }

    onText(str) {
      const { cursor } = this;
      if (!cursor) {
        this.emit("error", new XMLError_1(`${str} must be a child.`));
        return;
      }

      cursor.t(str);
    }

    write(data) {
      this.parser.write(data);
    }

    end(data) {
      if (data) {
        this.parser.write(data);
      }
    }
  }

  Parser.XMLError = XMLError_1;

  var Parser_1 = Parser;

  var xml_1 = createCommonjsModule(function (module) {




  const {
    escapeXML,
    unescapeXML,
    escapeXMLText,
    unescapeXMLText,
  } = _escape$1;


  function xml(...args) {
    return x_1(...args);
  }

  module.exports = xml;

  Object.assign(module.exports, {
    x: x_1,
    Element: Element_1$1,
    Parser: Parser_1,
    escapeXML,
    unescapeXML,
    escapeXMLText,
    unescapeXMLText,
    XMLError: XMLError_1,
  });
  });

  // https://xmpp.org/rfcs/rfc6120.html#rfc.section.4.9.2

  class XMPPError extends Error {
    constructor(condition, text, application) {
      super(condition + (text ? ` - ${text}` : ""));
      this.name = "XMPPError";
      this.condition = condition;
      this.text = text;
      this.application = application;
    }

    static fromElement(element) {
      const [condition, second, third] = element.children;
      let text;
      let application;

      if (second) {
        if (second.is("text")) {
          text = second;
        } else if (second) {
          application = second;
        }

        if (third) application = third;
      }

      const error = new this(
        condition.name,
        text ? text.text() : "",
        application,
      );
      error.element = element;
      return error;
    }
  }

  var error = XMPPError;

  // https://xmpp.org/rfcs/rfc6120.html#streams-error

  class StreamError extends error {
    constructor(...args) {
      super(...args);
      this.name = "StreamError";
    }
  }

  var StreamError_1 = StreamError;

  var util = createCommonjsModule(function (module) {

  function parseURI(URI) {
    let { port, hostname, protocol } = new URL(URI);
    // https://github.com/nodejs/node/issues/12410#issuecomment-294138912
    if (hostname === "[::1]") {
      hostname = "::1";
    }

    return { port, hostname, protocol };
  }

  function parseHost(host) {
    const { port, hostname } = parseURI(`http://${host}`);
    return { port, hostname };
  }

  function parseService(service) {
    return service.includes("://") ? parseURI(service) : parseHost(service);
  }

  Object.assign(module.exports, { parseURI, parseHost, parseService });
  });

  const { EventEmitter: EventEmitter$1, promise: promise$1 } = events$1;



  const { parseHost, parseService } = util;

  const NS_STREAM = "urn:ietf:params:xml:ns:xmpp-streams";
  const NS_JABBER_STREAM = "http://etherx.jabber.org/streams";

  class Connection extends EventEmitter$1 {
    constructor(options = {}) {
      super();
      this.jid = null;
      this.timeout = 2000;
      this.options = options;
      this.socketListeners = Object.create(null);
      this.parserListeners = Object.create(null);
      this.status = "offline";
      this.socket = null;
      this.parser = null;
      this.root = null;
    }

    _reset() {
      this.jid = null;
      this.status = "offline";
      this._detachSocket();
      this._detachParser();
    }

    async _streamError(condition, children) {
      try {
        await this.send(
          // prettier-ignore
          xml_1('stream:error', {}, [
            xml_1(condition, {xmlns: NS_STREAM}, children),
          ]),
        );
      } catch {}

      return this._end();
    }

    _onData(data) {
      const str = data.toString("utf8");
      this.emit("input", str);
      this.parser.write(str);
    }

    _onParserError(error) {
      // https://xmpp.org/rfcs/rfc6120.html#streams-error-conditions-bad-format
      // "This error can be used instead of the more specific XML-related errors,
      // such as <bad-namespace-prefix/>, <invalid-xml/>, <not-well-formed/>, <restricted-xml/>,
      // and <unsupported-encoding/>. However, the more specific errors are RECOMMENDED."
      this._streamError("bad-format");
      this._detachParser();
      this.emit("error", error);
    }

    _attachSocket(socket) {
      this.socket = socket;
      const listeners = this.socketListeners;

      listeners.data = this._onData.bind(this);

      listeners.close = (dirty, event) => {
        this._reset();
        this._status("disconnect", { clean: !dirty, event });
      };

      listeners.connect = () => {
        this._status("connect");
      };

      listeners.error = (error) => {
        this.emit("error", error);
      };

      this.socket.on("close", listeners.close);
      this.socket.on("data", listeners.data);
      this.socket.on("error", listeners.error);
      this.socket.on("connect", listeners.connect);
    }

    _detachSocket() {
      const { socketListeners, socket } = this;
      Object.getOwnPropertyNames(socketListeners).forEach((k) => {
        socket.removeListener(k, socketListeners[k]);
        delete socketListeners[k];
      });
      this.socket = null;
      return socket;
    }

    _onElement(element) {
      const isStreamError = element.is("error", NS_JABBER_STREAM);

      if (isStreamError) {
        this._onStreamError(element);
      }

      this.emit("element", element);
      this.emit(this.isStanza(element) ? "stanza" : "nonza", element);

      if (isStreamError) {
        // "Stream Errors Are Unrecoverable"
        // "The entity that receives the stream error then SHALL close the stream"
        this._end();
      }
    }

    // https://xmpp.org/rfcs/rfc6120.html#streams-error
    _onStreamError(element) {
      const error = StreamError_1.fromElement(element);

      if (error.condition === "see-other-host") {
        return this._onSeeOtherHost(error);
      }

      this.emit("error", error);
    }

    // https://xmpp.org/rfcs/rfc6120.html#streams-error-conditions-see-other-host
    async _onSeeOtherHost(error) {
      const { protocol } = parseService(this.options.service);

      const host = error.element.getChildText("see-other-host");
      const { port } = parseHost(host);

      let service;
      service = port
        ? `${protocol || "xmpp:"}//${host}`
        : (protocol ? `${protocol}//` : "") + host;

      try {
        await promise$1(this, "disconnect");
        const { domain, lang } = this.options;
        await this.connect(service);
        await this.open({ domain, lang });
      } catch (err) {
        this.emit("error", err);
      }
    }

    _attachParser(parser) {
      this.parser = parser;
      const listeners = this.parserListeners;

      listeners.element = this._onElement.bind(this);
      listeners.error = this._onParserError.bind(this);

      listeners.end = (element) => {
        this._detachParser();
        this._status("close", element);
      };

      listeners.start = (element) => {
        this._status("open", element);
      };

      this.parser.on("error", listeners.error);
      this.parser.on("element", listeners.element);
      this.parser.on("end", listeners.end);
      this.parser.on("start", listeners.start);
    }

    _detachParser() {
      const listeners = this.parserListeners;
      Object.getOwnPropertyNames(listeners).forEach((k) => {
        this.parser.removeListener(k, listeners[k]);
        delete listeners[k];
      });
      this.parser = null;
    }

    _jid(id) {
      this.jid = jid_1(id);
      return this.jid;
    }

    _status(status, ...args) {
      this.status = status;
      this.emit("status", status, ...args);
      this.emit(status, ...args);
    }

    async _end() {
      let el;
      try {
        el = await this.close();
      } catch {}

      try {
        await this.disconnect();
      } catch {}

      return el;
    }

    /**
     * Opens the socket then opens the stream
     */
    async start() {
      if (this.status !== "offline") {
        throw new Error("Connection is not offline");
      }

      const { service, domain, lang } = this.options;

      await this.connect(service);

      const promiseOnline = promise$1(this, "online");

      await this.open({ domain, lang });

      return promiseOnline;
    }

    /**
     * Connects the socket
     */
    async connect(service) {
      this._status("connecting", service);
      const socket = new this.Socket();
      this._attachSocket(socket);
      // The 'connect' status is set by the socket 'connect' listener
      socket.connect(this.socketParameters(service));
      return promise$1(socket, "connect");
    }

    /**
     * Disconnects the socket
     * https://xmpp.org/rfcs/rfc6120.html#streams-close
     * https://tools.ietf.org/html/rfc7395#section-3.6
     */
    async disconnect(timeout = this.timeout) {
      if (this.socket) this._status("disconnecting");

      this.socket.end();

      // The 'disconnect' status is set by the socket 'close' listener
      await promise$1(this.socket, "close", "error", timeout);
    }

    /**
     * Opens the stream
     */
    async open(options) {
      this._status("opening");

      if (typeof options === "string") {
        options = { domain: options };
      }

      const { domain, lang, timeout = this.timeout } = options;

      const headerElement = this.headerElement();
      headerElement.attrs.to = domain;
      headerElement.attrs["xml:lang"] = lang;
      this.root = headerElement;

      this._attachParser(new this.Parser());

      await this.write(this.header(headerElement));
      return promise$1(this, "open", "error", timeout);
    }

    /**
     * Closes the stream then closes the socket
     * https://xmpp.org/rfcs/rfc6120.html#streams-close
     * https://tools.ietf.org/html/rfc7395#section-3.6
     */
    async stop() {
      const el = await this._end();
      if (this.status !== "offline") this._status("offline", el);
      return el;
    }

    /**
     * Closes the stream and wait for the server to close it
     * https://xmpp.org/rfcs/rfc6120.html#streams-close
     * https://tools.ietf.org/html/rfc7395#section-3.6
     */
    async close(timeout = this.timeout) {
      const fragment = this.footer(this.footerElement());

      const p = Promise.all([
        promise$1(this.parser, "end", "error", timeout),
        this.write(fragment),
      ]);

      if (this.parser && this.socket) this._status("closing");
      const [el] = await p;
      this.root = null;
      return el;
      // The 'close' status is set by the parser 'end' listener
    }

    /**
     * Restart the stream
     * https://xmpp.org/rfcs/rfc6120.html#streams-negotiation-restart
     */
    async restart() {
      this._detachParser();
      const { domain, lang } = this.options;
      return this.open({ domain, lang });
    }

    async send(...elements) {
      let fragment = "";

      for (const element of elements) {
        element.parent = this.root;
        fragment += element.toString();
      }

      await this.write(fragment);

      for (const element of elements) {
        this.emit("send", element);
      }
    }

    sendReceive(element, timeout = this.timeout) {
      return Promise.all([
        this.send(element),
        promise$1(this, "element", "error", timeout),
      ]).then(([, el]) => el);
    }

    write(string) {
      return new Promise((resolve, reject) => {
        // https://xmpp.org/rfcs/rfc6120.html#streams-close
        // "Refrain from sending any further data over its outbound stream to the other entity"
        if (this.status === "closing") {
          reject(new Error("Connection is closing"));
          return;
        }

        this.socket.write(string, (err) => {
          if (err) {
            return reject(err);
          }

          this.emit("output", string);
          resolve();
        });
      });
    }

    isStanza(element) {
      const { name } = element;
      return name === "iq" || name === "message" || name === "presence";
    }

    isNonza(element) {
      return !this.isStanza(element);
    }

    // Override
    header(el) {
      return el.toString();
    }

    // Override
    headerElement() {
      return new xml_1.Element("", {
        version: "1.0",
        xmlns: this.NS,
      });
    }

    // Override
    footer(el) {
      return el.toString();
    }

    // Override
    footerElement() {}

    // Override
    socketParameters() {}
  }

  // Overrirde
  Connection.prototype.NS = "";
  Connection.prototype.Socket = null;
  Connection.prototype.Parser = null;

  var connection = Connection;

  class Client extends connection {
    constructor(options) {
      super(options);
      this.transports = [];
    }

    send(element, ...args) {
      return this.Transport.prototype.send.call(this, element, ...args);
    }

    _findTransport(service) {
      return this.transports.find((Transport) => {
        try {
          return Transport.prototype.socketParameters(service) !== undefined;
        } catch {
          return false;
        }
      });
    }

    connect(service) {
      const Transport = this._findTransport(service);

      if (!Transport) {
        throw new Error("No compatible connection method found.");
      }

      this.Transport = Transport;
      this.Socket = Transport.prototype.Socket;
      this.Parser = Transport.prototype.Parser;

      return super.connect(service);
    }

    socketParameters(...args) {
      return this.Transport.prototype.socketParameters(...args);
    }

    header(...args) {
      return this.Transport.prototype.header(...args);
    }

    headerElement(...args) {
      return this.Transport.prototype.headerElement(...args);
    }

    footer(...args) {
      return this.Transport.prototype.footer(...args);
    }

    footerElement(...args) {
      return this.Transport.prototype.footerElement(...args);
    }
  }

  Client.prototype.NS = "jabber:client";

  var Client_1 = Client;

  var Client_1$1 = Client_1;
  var xml_1$1 = xml_1;
  var jid_1$1 = jid_1;

  var clientCore = {
  	Client: Client_1$1,
  	xml: xml_1$1,
  	jid: jid_1$1
  };

  var getDomain = function getDomain(service) {
    const domain = service.split("://")[1] || service;
    return domain.split(":")[0].split("/")[0];
  };

  const { EventEmitter: EventEmitter$2 } = events$1;

  class Reconnect extends EventEmitter$2 {
    constructor(entity) {
      super();

      this.delay = 1000;
      this.entity = entity;
      this._timeout = null;
    }

    scheduleReconnect() {
      const { entity, delay, _timeout } = this;
      clearTimeout(_timeout);
      this._timeout = setTimeout(async () => {
        if (entity.status !== "disconnect") {
          return;
        }

        try {
          await this.reconnect();
        } catch {
          // Ignoring the rejection is safe because the error is emitted on entity by #start
        }
      }, delay);
    }

    async reconnect() {
      const { entity } = this;
      this.emit("reconnecting");

      const { service, domain, lang } = entity.options;
      await entity.connect(service);
      await entity.open({ domain, lang });

      this.emit("reconnected");
    }

    start() {
      const { entity } = this;
      const listeners = {};
      listeners.disconnect = () => {
        this.scheduleReconnect();
      };

      this.listeners = listeners;
      entity.on("disconnect", listeners.disconnect);
    }

    stop() {
      const { entity, listeners, _timeout } = this;
      entity.removeListener("disconnect", listeners.disconnect);
      clearTimeout(_timeout);
    }
  }

  var reconnect = function reconnect({ entity }) {
    const r = new Reconnect(entity);
    r.start();
    return r;
  };

  var _nodeResolve_empty = {};

  var _nodeResolve_empty$1 = /*#__PURE__*/Object.freeze({
    __proto__: null,
    'default': _nodeResolve_empty
  });

  var dns = /*@__PURE__*/getAugmentedNamespace(_nodeResolve_empty$1);

  const WebSocket = commonjsGlobal.WebSocket || dns;


  const CODE = "ECONNERROR";

  class Socket extends events {
    constructor() {
      super();
      this.listeners = Object.create(null);
    }

    connect(url) {
      this.url = url;
      this._attachSocket(new WebSocket(url, ["xmpp"]));
    }

    _attachSocket(socket) {
      this.socket = socket;
      const { listeners } = this;
      listeners.open = () => {
        this.emit("connect");
      };

      listeners.message = ({ data }) => this.emit("data", data);
      listeners.error = (event) => {
        // WS
        let { error } = event;
        // DOM
        if (!error) {
          error = new Error(`WebSocket ${CODE} ${this.url}`);
          error.errno = CODE;
          error.code = CODE;
        }

        error.event = event;
        error.url = this.url;
        this.emit("error", error);
      };

      listeners.close = (event) => {
        this._detachSocket();
        this.emit("close", !event.wasClean, event);
      };

      this.socket.addEventListener("open", listeners.open);
      this.socket.addEventListener("message", listeners.message);
      this.socket.addEventListener("error", listeners.error);
      this.socket.addEventListener("close", listeners.close);
    }

    _detachSocket() {
      delete this.url;
      const { socket, listeners } = this;
      Object.getOwnPropertyNames(listeners).forEach((k) => {
        socket.removeEventListener(k, listeners[k]);
        delete listeners[k];
      });
      delete this.socket;
    }

    end() {
      this.socket.close();
    }

    write(data, fn) {
      if (WebSocket === dns) {
        this.socket.send(data, fn);
      } else {
        this.socket.send(data);
        fn();
      }
    }
  }

  var Socket_1 = Socket;

  const { Parser: Parser$1, Element: Element$3, XMLError } = xml_1;

  var FramedParser_1 = class FramedParser extends Parser$1 {
    onStartElement(name, attrs) {
      const element = new Element$3(name, attrs);

      const { cursor } = this;

      if (cursor) {
        cursor.append(element);
      }

      this.cursor = element;
    }

    onEndElement(name) {
      const { cursor } = this;
      if (name !== cursor.name) {
        // <foo></bar>
        this.emit("error", new XMLError(`${cursor.name} must be closed.`));
        return;
      }

      if (cursor.parent) {
        this.cursor = cursor.parent;
        return;
      }

      if (cursor.is("open", "urn:ietf:params:xml:ns:xmpp-framing")) {
        this.emit("start", cursor);
      } else if (cursor.is("close", "urn:ietf:params:xml:ns:xmpp-framing")) {
        this.emit("end", cursor);
      } else {
        this.emit("element", cursor);
      }

      this.cursor = null;
    }
  };

  const NS_FRAMING = "urn:ietf:params:xml:ns:xmpp-framing";

  /* References
   * WebSocket protocol https://tools.ietf.org/html/rfc6455
   * WebSocket Web API https://html.spec.whatwg.org/multipage/comms.html#network
   * XMPP over WebSocket https://tools.ietf.org/html/rfc7395
   */

  class ConnectionWebSocket extends connection {
    send(element, ...args) {
      if (!element.attrs.xmlns && super.isStanza(element)) {
        element.attrs.xmlns = "jabber:client";
      }

      return super.send(element, ...args);
    }

    // https://tools.ietf.org/html/rfc7395#section-3.6
    footerElement() {
      return new xml_1.Element("close", {
        xmlns: NS_FRAMING,
      });
    }

    // https://tools.ietf.org/html/rfc7395#section-3.4
    headerElement() {
      const el = super.headerElement();
      el.name = "open";
      el.attrs.xmlns = NS_FRAMING;
      return el;
    }

    socketParameters(service) {
      return service.match(/^wss?:\/\//) ? service : undefined;
    }
  }

  ConnectionWebSocket.prototype.Socket = Socket_1;
  ConnectionWebSocket.prototype.NS = "jabber:client";
  ConnectionWebSocket.prototype.Parser = FramedParser_1;

  var Connection_1 = ConnectionWebSocket;

  var websocket = function websocket({ entity }) {
    entity.transports.push(Connection_1);
  };

  /**
   * Expose compositor.
   */

  var koaCompose = compose;

  /**
   * Compose `middleware` returning
   * a fully valid middleware comprised
   * of all those which are passed.
   *
   * @param {Array} middleware
   * @return {Function}
   * @api public
   */

  function compose (middleware) {
    if (!Array.isArray(middleware)) throw new TypeError('Middleware stack must be an array!')
    for (const fn of middleware) {
      if (typeof fn !== 'function') throw new TypeError('Middleware must be composed of functions!')
    }

    /**
     * @param {Object} context
     * @return {Promise}
     * @api public
     */

    return function (context, next) {
      // last called middleware #
      let index = -1;
      return dispatch(0)
      function dispatch (i) {
        if (i <= index) return Promise.reject(new Error('next() called multiple times'))
        index = i;
        let fn = middleware[i];
        if (i === middleware.length) fn = next;
        if (!fn) return Promise.resolve()
        try {
          return Promise.resolve(fn(context, dispatch.bind(null, i + 1)));
        } catch (err) {
          return Promise.reject(err)
        }
      }
    }
  }

  var Context_1 = class Context {
    constructor(entity, stanza) {
      this.stanza = stanza;
      this.entity = entity;

      const { name, attrs } = stanza;
      const { type, id } = attrs;

      this.name = name;
      this.id = id || "";

      if (name === "message") {
        this.type = type || "normal";
      } else if (name === "presence") {
        this.type = type || "available";
      } else {
        this.type = type || "";
      }

      this.from = null;
      this.to = null;
      this.local = "";
      this.domain = "";
      this.resource = "";
    }
  };

  var IncomingContext_1 = class IncomingContext extends Context_1 {
    constructor(entity, stanza) {
      super(entity, stanza);

      const { jid, domain } = entity;

      const to = stanza.attrs.to || (jid && jid.toString());
      const from = stanza.attrs.from || domain;

      if (to) this.to = new jid_1(to);

      if (from) {
        this.from = new jid_1(from);
        this.local = this.from.local;
        this.domain = this.from.domain;
        this.resource = this.from.resource;
      }
    }
  };

  var OutgoingContext_1 = class OutgoingContext extends Context_1 {
    constructor(entity, stanza) {
      super(entity, stanza);

      const { jid, domain } = entity;

      const from = stanza.attrs.from || (jid && jid.toString());
      const to = stanza.attrs.to || domain;

      if (from) this.from = new jid_1(from);

      if (to) {
        this.to = new jid_1(to);
        this.local = this.to.local;
        this.domain = this.to.domain;
        this.resource = this.to.resource;
      }
    }
  };

  function listener(entity, middleware, Context) {
    return (stanza) => {
      const ctx = new Context(entity, stanza);
      return koaCompose(middleware)(ctx);
    };
  }

  function errorHandler(entity) {
    return (ctx, next) => {
      next()
        .then((reply) => reply && entity.send(reply))
        .catch((err) => entity.emit("error", err));
    };
  }

  var middleware = function middleware({ entity }) {
    const incoming = [errorHandler(entity)];
    const outgoing = [];

    const incomingListener = listener(entity, incoming, IncomingContext_1);
    const outgoingListener = listener(entity, outgoing, OutgoingContext_1);

    entity.on("element", incomingListener);
    entity.hookOutgoing = outgoingListener;

    return {
      use(fn) {
        incoming.push(fn);
        return fn;
      },
      filter(fn) {
        outgoing.push(fn);
        return fn;
      },
    };
  };

  var route = function route() {
    return async ({ stanza, entity }, next) => {
      if (!stanza.is("features", "http://etherx.jabber.org/streams"))
        return next();

      const prevent = await next();
      if (!prevent && entity.jid) entity._status("online", entity.jid);
    };
  };

  /**
   * References
   * https://xmpp.org/rfcs/rfc6120.html#streams-negotiation Stream Negotiation
   * https://xmpp.org/extensions/xep-0170.html XEP-0170: Recommended Order of Stream Feature Negotiation
   * https://xmpp.org/registrar/stream-features.html XML Stream Features
   */



  var streamFeatures = function streamFeatures({ middleware }) {
    middleware.use(route());

    function use(name, xmlns, handler) {
      return middleware.use((ctx, next) => {
        const { stanza } = ctx;
        if (!stanza.is("features", "http://etherx.jabber.org/streams"))
          return next();
        const feature = stanza.getChild(name, xmlns);
        if (!feature) return next();
        return handler(ctx, next, feature);
      });
    }

    return {
      use,
    };
  };

  var id = function id() {
    let i;
    while (!i) {
      i = Math.random().toString(36).slice(2, 12);
    }

    return i;
  };

  /* https://xmpp.org/rfcs/rfc6120.html#stanzas-error */



  class StanzaError extends error {
    constructor(condition, text, application, type) {
      super(condition, text, application);
      this.type = type;
      this.name = "StanzaError";
    }

    static fromElement(element) {
      const error = super.fromElement(element);
      error.type = element.attrs.type;
      return error;
    }
  }

  var StanzaError_1 = StanzaError;

  const { Deferred: Deferred$1 } = events$1;
  const timeoutPromise = events$1.timeout;


  function isReply({ name, type }) {
    if (name !== "iq") return false;
    if (type !== "error" && type !== "result") return false;
    return true;
  }

  class IQCaller {
    constructor({ entity, middleware }) {
      this.handlers = new Map();
      this.entity = entity;
      this.middleware = middleware;
    }

    start() {
      this.middleware.use(this._route.bind(this));
    }

    _route({ type, name, id, stanza }, next) {
      if (!isReply({ name, type })) return next();

      const deferred = this.handlers.get(id);

      if (!deferred) {
        return next();
      }

      if (type === "error") {
        deferred.reject(StanzaError_1.fromElement(stanza.getChild("error")));
      } else {
        deferred.resolve(stanza);
      }

      this.handlers.delete(id);
    }

    async request(stanza, timeout = 30 * 1000) {
      if (!stanza.attrs.id) {
        stanza.attrs.id = id();
      }

      const deferred = new Deferred$1();
      this.handlers.set(stanza.attrs.id, deferred);

      try {
        await this.entity.send(stanza);
        await timeoutPromise(deferred.promise, timeout);
      } catch (err) {
        this.handlers.delete(stanza.attrs.id);
        throw err;
      }

      return deferred.promise;
    }

    _childRequest(type, element, to, ...args) {
      const { name } = element;
      const { xmlns } = element.attrs;
      return this.request(
        xml_1("iq", { type, to }, element),
        ...args,
      ).then((stanza) => stanza.getChild(name, xmlns));
    }

    async get(...args) {
      return this._childRequest("get", ...args);
    }

    async set(...args) {
      return this._childRequest("set", ...args);
    }
  }

  var caller = function iqCaller(...args) {
    const iqCaller = new IQCaller(...args);
    iqCaller.start();
    return iqCaller;
  };

  /**
   * References
   * https://xmpp.org/rfcs/rfc6120.html#stanzas-semantics-iq
   * https://xmpp.org/rfcs/rfc6120.html#stanzas-error
   */



  const NS_STANZA = "urn:ietf:params:xml:ns:xmpp-stanzas";

  function isQuery({ name, type }) {
    if (name !== "iq") return false;
    if (type === "error" || type === "result") return false;
    return true;
  }

  function isValidQuery({ type }, children, child) {
    if (type !== "get" && type !== "set") return false;
    if (children.length !== 1) return false;
    if (!child) return false;
    return true;
  }

  function buildReply({ stanza }) {
    return xml_1("iq", {
      to: stanza.attrs.from,
      from: stanza.attrs.to,
      id: stanza.attrs.id,
    });
  }

  function buildReplyResult(ctx, child) {
    const reply = buildReply(ctx);
    reply.attrs.type = "result";
    if (child) {
      reply.append(child);
    }

    return reply;
  }

  function buildReplyError(ctx, error, child) {
    const reply = buildReply(ctx);
    reply.attrs.type = "error";
    if (child) {
      reply.append(child);
    }

    reply.append(error);
    return reply;
  }

  function buildError(type, condition) {
    return xml_1("error", { type }, xml_1(condition, NS_STANZA));
  }

  function iqHandler(entity) {
    return async function iqHandler(ctx, next) {
      if (!isQuery(ctx)) return next();

      const { stanza } = ctx;
      const children = stanza.getChildElements();
      const [child] = children;

      if (!isValidQuery(ctx, children, child)) {
        return buildReplyError(ctx, buildError("modify", "bad-request"), child);
      }

      ctx.element = child;

      let reply;
      try {
        reply = await next();
      } catch (err) {
        entity.emit("error", err);
        reply = buildError("cancel", "internal-server-error");
      }

      if (!reply) {
        reply = buildError("cancel", "service-unavailable");
      }

      if (reply instanceof xml_1.Element && reply.is("error")) {
        return buildReplyError(ctx, reply, child);
      }

      return buildReplyResult(
        ctx,
        reply instanceof xml_1.Element ? reply : undefined,
      );
    };
  }

  function route$1(type, ns, name, handler) {
    return (ctx, next) => {
      if ((ctx.type !== type) | !ctx.element || !ctx.element.is(name, ns))
        return next();
      return handler(ctx, next);
    };
  }

  var callee = function iqCallee({ middleware, entity }) {
    middleware.use(iqHandler(entity));

    return {
      get(ns, name, handler) {
        middleware.use(route$1("get", ns, name, handler));
      },
      set(ns, name, handler) {
        middleware.use(route$1("set", ns, name, handler));
      },
    };
  };

  var parse$1 = function parse(data) {
    const p = new Parser_1();

    let result = null;
    let error = null;

    p.on("start", (el) => {
      result = el;
    });
    p.on("element", (el) => {
      result.append(el);
    });
    p.on("error", (err) => {
      error = err;
    });

    p.write(data);
    p.end();

    if (error) {
      throw error;
    } else {
      return result;
    }
  };

  function isSecure(uri) {
    return uri.startsWith("https") || uri.startsWith("wss");
  }

  var compare = function compare(a, b) {
    let secure;
    if (isSecure(a.uri) && !isSecure(b.uri)) {
      secure = -1;
    } else if (!isSecure(a.uri) && isSecure(b.uri)) {
      secure = 1;
    } else {
      secure = 0;
    }

    if (secure !== 0) {
      return secure;
    }

    let method;
    if (a.method === b.method) {
      method = 0;
    } else if (a.method === "websocket") {
      method = -1;
    } else if (b.method === "websocket") {
      method = 1;
    } else if (a.method === "xbosh") {
      method = -1;
    } else if (b.method === "xbosh") {
      method = 1;
    } else if (a.method === "httppoll") {
      method = -1;
    } else if (b.method === "httppoll") {
      method = 1;
    } else {
      method = 0;
    }

    if (method !== 0) {
      return method;
    }

    return 0;
  };

  var altConnections = {
  	compare: compare
  };

  const fetch$1 = commonjsGlobal.fetch || dns;

  const compareAltConnections = altConnections.compare;

  function resolve(domain) {
    return fetch$1(`https://${domain}/.well-known/host-meta`)
      .then((res) => res.text())
      .then((res) => {
        return parse$1(res)
          .getChildren("Link")
          .filter((link) =>
            [
              "urn:xmpp:alt-connections:websocket",
              "urn:xmpp:alt-connections:httppoll",
              "urn:xmpp:alt-connections:xbosh",
            ].includes(link.attrs.rel),
          )
          .map(({ attrs }) => ({
            rel: attrs.rel,
            href: attrs.href,
            method: attrs.rel.split(":").pop(),
            uri: attrs.href,
          }))
          .sort(compareAltConnections);
      })
      .catch(() => {
        return [];
      });
  }

  var resolve_1 = resolve;

  var http = {
  	resolve: resolve_1
  };

  var resolve$1 = createCommonjsModule(function (module) {




  module.exports = function resolve(...args) {
    return Promise.all([
      dns.resolve ? dns.resolve(...args) : Promise.resolve([]),
      http.resolve(...args),
    ]).then(([records, endpoints]) => records.concat(endpoints));
  };

  if (dns.resolve) {
    module.exports.dns = dns;
  }

  module.exports.http = http;
  });

  const { promise: promise$2 } = events$1;

  async function fetchURIs(domain) {
    return [
      // Remove duplicates
      ...new Set(
        (
          await resolve$1(domain, {
            srv: [
              {
                service: "xmpps-client",
                protocol: "tcp",
              },
              {
                service: "xmpp-client",
                protocol: "tcp",
              },
            ],
          })
        ).map((record) => record.uri),
      ),
    ];
  }

  function filterSupportedURIs(entity, uris) {
    return uris.filter((uri) => entity._findTransport(uri));
  }

  async function fallbackConnect(entity, uris) {
    if (uris.length === 0) {
      throw new Error("Couldn't connect");
    }

    const uri = uris.shift();
    const Transport = entity._findTransport(uri);

    if (!Transport) {
      return fallbackConnect(entity, uris);
    }

    entity._status("connecting", uri);
    const params = Transport.prototype.socketParameters(uri);
    const socket = new Transport.prototype.Socket();

    try {
      socket.connect(params);
      await promise$2(socket, "connect");
    } catch {
      return fallbackConnect(entity, uris);
    }

    entity._attachSocket(socket);
    socket.emit("connect");
    entity.Transport = Transport;
    entity.Socket = Transport.prototype.Socket;
    entity.Parser = Transport.prototype.Parser;
  }

  var resolve_1$1 = function resolve({ entity }) {
    const _connect = entity.connect;
    entity.connect = async function connect(service) {
      if (!service || service.match(/:\/\//)) {
        return _connect.call(this, service);
      }

      const uris = filterSupportedURIs(entity, await fetchURIs(service));

      if (uris.length === 0) {
        throw new Error("No compatible transport found.");
      }

      try {
        await fallbackConnect(entity, uris);
      } catch (err) {
        entity._reset();
        entity._status("disconnect");
        throw err;
      }
    };
  };

  var encode = function encode(string) {
    return commonjsGlobal.btoa(string);
  };

  var decode = function decode(string) {
    return commonjsGlobal.atob(string);
  };

  var browser = {
  	encode: encode,
  	decode: decode
  };

  // https://xmpp.org/rfcs/rfc6120.html#sasl-errors

  class SASLError extends error {
    constructor(...args) {
      super(...args);
      this.name = "SASLError";
    }
  }

  var SASLError_1 = SASLError;

  var factory = createCommonjsModule(function (module, exports) {
  (function(root, factory) {
    {
      // CommonJS
      factory(exports, module);
    }
  }(commonjsGlobal, function(exports, module) {
    
    /**
     * `Factory` constructor.
     *
     * @api public
     */
    function Factory() {
      this._mechs = [];
    }
    
    /**
     * Utilize the given `mech` with optional `name`, overridding the mechanism's
     * default name.
     *
     * Examples:
     *
     *     factory.use(FooMechanism);
     *
     *     factory.use('XFOO', FooMechanism);
     *
     * @param {String|Mechanism} name
     * @param {Mechanism} mech
     * @return {Factory} for chaining
     * @api public
     */
    Factory.prototype.use = function(name, mech) {
      if (!mech) {
        mech = name;
        name = mech.prototype.name;
      }
      this._mechs.push({ name: name, mech: mech });
      return this;
    };
    
    /**
     * Create a new mechanism from supported list of `mechs`.
     *
     * If no mechanisms are supported, returns `null`.
     *
     * Examples:
     *
     *     var mech = factory.create(['FOO', 'BAR']);
     *
     * @param {Array} mechs
     * @return {Mechanism}
     * @api public
     */
    Factory.prototype.create = function(mechs) {
      for (var i = 0, len = this._mechs.length; i < len; i++) {
        for (var j = 0, jlen = mechs.length; j < jlen; j++) {
          var entry = this._mechs[i];
          if (entry.name == mechs[j]) {
            return new entry.mech();
          }
        }
      }
      return null;
    };

    module.exports = Factory;
    
  }));
  });

  var main = createCommonjsModule(function (module, exports) {
  (function(root, factory$1) {
    {
      // CommonJS
      factory$1(exports,
              module,
              factory);
    }
  }(commonjsGlobal, function(exports, module, Factory) {
    
    exports = module.exports = Factory;
    exports.Factory = Factory;
    
  }));
  });

  const { encode: encode$1, decode: decode$1 } = browser;




  // https://xmpp.org/rfcs/rfc6120.html#sasl

  const NS = "urn:ietf:params:xml:ns:xmpp-sasl";

  function getMechanismNames(features) {
    return features.getChild("mechanisms", NS).children.map((el) => el.text());
  }

  async function authenticate(SASL, entity, mechname, credentials) {
    const mech = SASL.create([mechname]);
    if (!mech) {
      throw new Error("No compatible mechanism");
    }

    const { domain } = entity.options;
    const creds = {
      username: null,
      password: null,
      server: domain,
      host: domain,
      realm: domain,
      serviceType: "xmpp",
      serviceName: domain,
      ...credentials,
    };

    return new Promise((resolve, reject) => {
      const handler = (element) => {
        if (element.attrs.xmlns !== NS) {
          return;
        }

        if (element.name === "challenge") {
          mech.challenge(decode$1(element.text()));
          const resp = mech.response(creds);
          entity.send(
            xml_1(
              "response",
              { xmlns: NS, mechanism: mech.name },
              typeof resp === "string" ? encode$1(resp) : "",
            ),
          );
          return;
        }

        if (element.name === "failure") {
          reject(SASLError_1.fromElement(element));
        } else if (element.name === "success") {
          resolve();
        }

        entity.removeListener("nonza", handler);
      };

      entity.on("nonza", handler);

      if (mech.clientFirst) {
        entity.send(
          xml_1(
            "auth",
            { xmlns: NS, mechanism: mech.name },
            encode$1(mech.response(creds)),
          ),
        );
      }
    });
  }

  var sasl = function sasl({ streamFeatures }, credentials) {
    const SASL = new main();

    streamFeatures.use("mechanisms", NS, async ({ stanza, entity }) => {
      const offered = getMechanismNames(stanza);
      const supported = SASL._mechs.map(({ name }) => name);
      // eslint-disable-next-line unicorn/prefer-array-find
      const intersection = supported.filter((mech) => {
        return offered.includes(mech);
      });

      // eslint-disable-next-line prefer-destructuring
      let mech = intersection[0];

      if (typeof credentials === "function") {
        await credentials(
          (creds) => authenticate(SASL, entity, mech, creds),
          mech,
        );
      } else {
        if (!credentials.username && !credentials.password) {
          mech = "ANONYMOUS";
        }

        await authenticate(SASL, entity, mech, credentials);
      }

      await entity.restart();
    });

    return {
      use(...args) {
        return SASL.use(...args);
      },
    };
  };

  /*
   * References
   * https://xmpp.org/rfcs/rfc6120.html#bind
   */

  const NS$1 = "urn:ietf:params:xml:ns:xmpp-bind";

  function makeBindElement(resource) {
    return xml_1("bind", { xmlns: NS$1 }, resource && xml_1("resource", {}, resource));
  }

  async function bind(entity, iqCaller, resource) {
    const result = await iqCaller.set(makeBindElement(resource));
    const jid = result.getChildText("jid");
    entity._jid(jid);
    return jid;
  }

  function route$2({ iqCaller }, resource) {
    return async ({ entity }, next) => {
      await (typeof resource === "function"
        ? resource((resource) => bind(entity, iqCaller, resource))
        : bind(entity, iqCaller, resource));

      next();
    };
  }

  var resourceBinding = function resourceBinding(
    { streamFeatures, iqCaller },
    resource,
  ) {
    streamFeatures.use("bind", NS$1, route$2({ iqCaller }, resource));
  };

  // https://tools.ietf.org/html/draft-cridland-xmpp-session-01

  const NS$2 = "urn:ietf:params:xml:ns:xmpp-session";

  var sessionEstablishment = function sessionEstablishment({ iqCaller, streamFeatures }) {
    streamFeatures.use("session", NS$2, async (context, next, feature) => {
      if (feature.getChild("optional")) return next();
      await iqCaller.set(xml_1("session", NS$2));
      return next();
    });
  };

  // https://xmpp.org/extensions/xep-0198.html

  const NS$3 = "urn:xmpp:sm:3";

  async function enable(entity, resume, max) {
    entity.send(
      xml_1("enable", { xmlns: NS$3, max, resume: resume ? "true" : undefined }),
    );

    return new Promise((resolve, reject) => {
      function listener(nonza) {
        if (nonza.is("enabled", NS$3)) {
          resolve(nonza);
        } else if (nonza.is("failed", NS$3)) {
          reject(nonza);
        } else {
          return;
        }

        entity.removeListener("nonza", listener);
      }

      entity.on("nonza", listener);
    });
  }

  async function resume(entity, h, previd) {
    const response = await entity.sendReceive(
      xml_1("resume", { xmlns: NS$3, h, previd }),
    );

    if (!response.is("resumed", NS$3)) {
      throw response;
    }

    return response;
  }

  var streamManagement = function streamManagement({
    streamFeatures,
    entity,
    middleware,
  }) {
    let address = null;

    const sm = {
      allowResume: true,
      preferredMaximum: null,
      enabled: false,
      id: "",
      outbound: 0,
      inbound: 0,
      max: null,
    };

    entity.on("online", (jid) => {
      address = jid;
      sm.outbound = 0;
      sm.inbound = 0;
    });

    entity.on("offline", () => {
      sm.outbound = 0;
      sm.inbound = 0;
      sm.enabled = false;
      sm.id = "";
    });

    middleware.use((context, next) => {
      const { stanza } = context;
      if (["presence", "message", "iq"].includes(stanza.name)) {
        sm.inbound += 1;
      } else if (stanza.is("r", NS$3)) {
        // > When an <r/> element ("request") is received, the recipient MUST acknowledge it by sending an <a/> element to the sender containing a value of 'h' that is equal to the number of stanzas handled by the recipient of the <r/> element.
        entity.send(xml_1("a", { xmlns: NS$3, h: sm.inbound })).catch(() => {});
      } else if (stanza.is("a", NS$3)) {
        // > When a party receives an <a/> element, it SHOULD keep a record of the 'h' value returned as the sequence number of the last handled outbound stanza for the current stream (and discard the previous value).
        sm.outbound = stanza.attrs.h;
      }

      return next();
    });

    // https://xmpp.org/extensions/xep-0198.html#enable
    // For client-to-server connections, the client MUST NOT attempt to enable stream management until after it has completed Resource Binding unless it is resuming a previous session

    streamFeatures.use("sm", NS$3, async (context, next) => {
      // Resuming
      if (sm.id) {
        try {
          await resume(entity, sm.inbound, sm.id);
          sm.enabled = true;
          entity.jid = address;
          entity.status = "online";
          return true;
          // If resumption fails, continue with session establishment
          // eslint-disable-next-line no-unused-vars
        } catch {
          sm.id = "";
          sm.enabled = false;
          sm.outbound = 0;
        }
      }

      // Enabling

      // Resource binding first
      await next();

      const promiseEnable = enable(entity, sm.allowResume, sm.preferredMaximum);

      // > The counter for an entity's own sent stanzas is set to zero and started after sending either <enable/> or <enabled/>.
      sm.outbound = 0;

      try {
        const response = await promiseEnable;
        sm.enabled = true;
        sm.id = response.attrs.id;
        sm.max = response.attrs.max;
        // eslint-disable-next-line no-unused-vars
      } catch {
        sm.enabled = false;
      }

      sm.inbound = 0;
    });

    return sm;
  };

  var mechanism = createCommonjsModule(function (module, exports) {
  (function(root, factory) {
    {
      // CommonJS
      factory(exports, module);
    }
  }(commonjsGlobal, function(exports, module) {

    /**
     * ANONYMOUS `Mechanism` constructor.
     *
     * This class implements the ANONYMOUS SASL mechanism.
     *
     * The ANONYMOUS SASL mechanism provides support for permitting anonymous
     * access to various services
     *
     * References:
     *  - [RFC 4505](http://tools.ietf.org/html/rfc4505)
     *
     * @api public
     */
    function Mechanism() {
    }
    
    Mechanism.prototype.name = 'ANONYMOUS';
    Mechanism.prototype.clientFirst = true;
    
    /**
     * Encode a response using optional trace information.
     *
     * Options:
     *  - `trace`  trace information (optional)
     *
     * @param {Object} cred
     * @api public
     */
    Mechanism.prototype.response = function(cred) {
      return cred.trace || '';
    };
    
    /**
     * Decode a challenge issued by the server.
     *
     * @param {String} chal
     * @api public
     */
    Mechanism.prototype.challenge = function(chal) {
    };

    module.exports = Mechanism;
    
  }));
  });

  var main$1 = createCommonjsModule(function (module, exports) {
  (function(root, factory) {
    {
      // CommonJS
      factory(exports,
              module,
              mechanism);
    }
  }(commonjsGlobal, function(exports, module, Mechanism) {

    exports = module.exports = Mechanism;
    exports.Mechanism = Mechanism;
    
  }));
  });

  /**
   * [XEP-0175: Best Practices for Use of SASL ANONYMOUS](https://xmpp.org/extensions/xep-0175.html)
   * [RFC-4504: Anonymous Simple Authentication and Security Layer (SASL) Mechanism](https://tools.ietf.org/html/rfc4505)
   */



  var saslAnonymous = function saslAnonymous(sasl) {
    sasl.use(main$1);
  };

  var mechanism$1 = createCommonjsModule(function (module, exports) {
  (function(root, factory) {
    {
      // CommonJS
      factory(exports, module);
    }
  }(commonjsGlobal, function(exports, module) {

    /**
     * PLAIN `Mechanism` constructor.
     *
     * This class implements the PLAIN SASL mechanism.
     *
     * The PLAIN SASL mechanism provides support for exchanging a clear-text
     * username and password.  This mechanism should not be used without adequate
     * security provided by an underlying transport layer. 
     *
     * References:
     *  - [RFC 4616](http://tools.ietf.org/html/rfc4616)
     *
     * @api public
     */
    function Mechanism() {
    }
    
    Mechanism.prototype.name = 'PLAIN';
    Mechanism.prototype.clientFirst = true;
    
    /**
     * Encode a response using given credential.
     *
     * Options:
     *  - `username`
     *  - `password`
     *  - `authzid`   authorization identity (optional)
     *
     * @param {Object} cred
     * @api public
     */
    Mechanism.prototype.response = function(cred) {
      var str = '';
      str += cred.authzid || '';
      str += '\0';
      str += cred.username;
      str += '\0';
      str += cred.password;
      return str;
    };
    
    /**
     * Decode a challenge issued by the server.
     *
     * @param {String} chal
     * @return {Mechanism} for chaining
     * @api public
     */
    Mechanism.prototype.challenge = function(chal) {
      return this;
    };

    module.exports = Mechanism;
    
  }));
  });

  var main$2 = createCommonjsModule(function (module, exports) {
  (function(root, factory) {
    {
      // CommonJS
      factory(exports,
              module,
              mechanism$1);
    }
  }(commonjsGlobal, function(exports, module, Mechanism) {

    exports = module.exports = Mechanism;
    exports.Mechanism = Mechanism;
    
  }));
  });

  var saslPlain = function saslPlain(sasl) {
    sasl.use(main$2);
  };

  const { xml, jid: jid$1, Client: Client$1 } = clientCore;










  // Stream features - order matters and define priority





  // SASL mechanisms - order matters and define priority



  function client(options = {}) {
    const { resource, credentials, username, password, ...params } = options;

    const { domain, service } = params;
    if (!domain && service) {
      params.domain = getDomain(service);
    }

    const entity = new Client$1(params);

    const reconnect$1 = reconnect({ entity });
    const websocket$1 = websocket({ entity });

    const middleware$1 = middleware({ entity });
    const streamFeatures$1 = streamFeatures({ middleware: middleware$1 });
    const iqCaller = caller({ middleware: middleware$1, entity });
    const iqCallee = callee({ middleware: middleware$1, entity });
    const resolve = resolve_1$1({ entity });
    // Stream features - order matters and define priority
    const sasl$1 = sasl({ streamFeatures: streamFeatures$1 }, credentials || { username, password });
    const streamManagement$1 = streamManagement({
      streamFeatures: streamFeatures$1,
      entity,
      middleware: middleware$1,
    });
    const resourceBinding$1 = resourceBinding(
      { iqCaller, streamFeatures: streamFeatures$1 },
      resource,
    );
    const sessionEstablishment$1 = sessionEstablishment({
      iqCaller,
      streamFeatures: streamFeatures$1,
    });
    // SASL mechanisms - order matters and define priority
    const mechanisms = Object.entries({ plain: saslPlain, anonymous: saslAnonymous }).map(([k, v]) => ({
      [k]: v(sasl$1),
    }));

    return Object.assign(entity, {
      entity,
      reconnect: reconnect$1,
      websocket: websocket$1,
      middleware: middleware$1,
      streamFeatures: streamFeatures$1,
      iqCaller,
      iqCallee,
      resolve,
      sasl: sasl$1,
      resourceBinding: resourceBinding$1,
      sessionEstablishment: sessionEstablishment$1,
      streamManagement: streamManagement$1,
      mechanisms,
    });
  }
  var client_1 = client;

  var notie_min = createCommonjsModule(function (module, exports) {
  !function(e,t){module.exports=t();}(commonjsGlobal,function(){return function(e){function t(s){if(n[s])return n[s].exports;var a=n[s]={i:s,l:!1,exports:{}};return e[s].call(a.exports,a,a.exports,t),a.l=!0,a.exports}var n={};return t.m=e,t.c=n,t.i=function(e){return e},t.d=function(e,n,s){t.o(e,n)||Object.defineProperty(e,n,{configurable:!1,enumerable:!0,get:s});},t.n=function(e){var n=e&&e.__esModule?function(){return e.default}:function(){return e};return t.d(n,"a",n),n},t.o=function(e,t){return Object.prototype.hasOwnProperty.call(e,t)},t.p="",t(t.s=1)}([function(e,t){e.exports=function(e){return e.webpackPolyfill||(e.deprecate=function(){},e.paths=[],e.children||(e.children=[]),Object.defineProperty(e,"loaded",{enumerable:!0,get:function(){return e.l}}),Object.defineProperty(e,"id",{enumerable:!0,get:function(){return e.i}}),e.webpackPolyfill=1),e};},function(e,t,n){(function(e){var n,s,a,i="function"==typeof Symbol&&"symbol"==typeof Symbol.iterator?function(e){return typeof e}:function(e){return e&&"function"==typeof Symbol&&e.constructor===Symbol&&e!==Symbol.prototype?"symbol":typeof e};!function(c,o){"object"===i(t)&&"object"===i(e)?e.exports=o():(s=[],n=o,a="function"==typeof n?n.apply(t,s):n,!(void 0!==a&&(e.exports=a)));}(void 0,function(){return function(e){function t(s){if(n[s])return n[s].exports;var a=n[s]={i:s,l:!1,exports:{}};return e[s].call(a.exports,a,a.exports,t),a.l=!0,a.exports}var n={};return t.m=e,t.c=n,t.i=function(e){return e},t.d=function(e,n,s){t.o(e,n)||Object.defineProperty(e,n,{configurable:!1,enumerable:!0,get:s});},t.n=function(e){var n=e&&e.__esModule?function(){return e.default}:function(){return e};return t.d(n,"a",n),n},t.o=function(e,t){return Object.prototype.hasOwnProperty.call(e,t)},t.p="",t(t.s=0)}([function(e,t,n){function s(e,t){var n={};for(var s in e)t.indexOf(s)>=0||Object.prototype.hasOwnProperty.call(e,s)&&(n[s]=e[s]);return n}Object.defineProperty(t,"__esModule",{value:!0});var a="function"==typeof Symbol&&"symbol"===i(Symbol.iterator)?function(e){return "undefined"==typeof e?"undefined":i(e)}:function(e){return e&&"function"==typeof Symbol&&e.constructor===Symbol&&e!==Symbol.prototype?"symbol":"undefined"==typeof e?"undefined":i(e)},c=Object.assign||function(e){for(var t=1;t<arguments.length;t++){var n=arguments[t];for(var s in n)Object.prototype.hasOwnProperty.call(n,s)&&(e[s]=n[s]);}return e},o={top:"top",bottom:"bottom"},r={alertTime:3,dateMonths:["January","February","March","April","May","June","July","August","September","October","November","December"],overlayClickDismiss:!0,overlayOpacity:.75,transitionCurve:"ease",transitionDuration:.3,transitionSelector:"all",classes:{container:"notie-container",textbox:"notie-textbox",textboxInner:"notie-textbox-inner",button:"notie-button",element:"notie-element",elementHalf:"notie-element-half",elementThird:"notie-element-third",overlay:"notie-overlay",backgroundSuccess:"notie-background-success",backgroundWarning:"notie-background-warning",backgroundError:"notie-background-error",backgroundInfo:"notie-background-info",backgroundNeutral:"notie-background-neutral",backgroundOverlay:"notie-background-overlay",alert:"notie-alert",inputField:"notie-input-field",selectChoiceRepeated:"notie-select-choice-repeated",dateSelectorInner:"notie-date-selector-inner",dateSelectorUp:"notie-date-selector-up"},ids:{overlay:"notie-overlay"},positions:{alert:o.top,force:o.top,confirm:o.top,input:o.top,select:o.bottom,date:o.top}},l=t.setOptions=function(e){r=c({},r,e,{classes:c({},r.classes,e.classes),ids:c({},r.ids,e.ids),positions:c({},r.positions,e.positions)});},d=function(){return new Promise(function(e){return setTimeout(e,0)})},u=function(e){return new Promise(function(t){return setTimeout(t,1e3*e)})},p=function(){document.activeElement&&document.activeElement.blur();},f=function(){var e="xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,function(e){var t=16*Math.random()|0,n="x"===e?t:3&t|8;return n.toString(16)});return "notie-"+e},m={1:r.classes.backgroundSuccess,success:r.classes.backgroundSuccess,2:r.classes.backgroundWarning,warning:r.classes.backgroundWarning,3:r.classes.backgroundError,error:r.classes.backgroundError,4:r.classes.backgroundInfo,info:r.classes.backgroundInfo,5:r.classes.backgroundNeutral,neutral:r.classes.backgroundNeutral},v=function(){return r.transitionSelector+" "+r.transitionDuration+"s "+r.transitionCurve},b=function(e){return 13===e.keyCode},x=function(e){return 27===e.keyCode},y=function(e,t){e.classList.add(r.classes.container),e.style[t]="-10000px",document.body.appendChild(e),e.style[t]="-"+e.offsetHeight+"px",e.listener&&window.addEventListener("keydown",e.listener),d().then(function(){e.style.transition=v(),e.style[t]=0;});},L=function(e,t){var n=document.getElementById(e);n&&(n.style[t]="-"+n.offsetHeight+"px",n.listener&&window.removeEventListener("keydown",n.listener),u(r.transitionDuration).then(function(){n.parentNode&&n.parentNode.removeChild(n);}));},g=function(e,t){var n=document.createElement("div");n.id=r.ids.overlay,n.classList.add(r.classes.overlay),n.classList.add(r.classes.backgroundOverlay),n.style.opacity=0,e&&r.overlayClickDismiss&&(n.onclick=function(){L(e.id,t),h();}),document.body.appendChild(n),d().then(function(){n.style.transition=v(),n.style.opacity=r.overlayOpacity;});},h=function(){var e=document.getElementById(r.ids.overlay);e.style.opacity=0,u(r.transitionDuration).then(function(){e.parentNode&&e.parentNode.removeChild(e);});},k=t.hideAlerts=function(e){var t=document.getElementsByClassName(r.classes.alert);if(t.length){for(var n=0;n<t.length;n++){var s=t[n];L(s.id,s.position);}e&&u(r.transitionDuration).then(function(){return e()});}},C=t.alert=function(e){var t=e.type,n=void 0===t?4:t,s=e.text,a=e.time,i=void 0===a?r.alertTime:a,c=e.stay,o=void 0!==c&&c,l=e.position,d=void 0===l?r.positions.alert||d.top:l;p(),k();var v=document.createElement("div"),g=f();v.id=g,v.position=d,v.classList.add(r.classes.textbox),v.classList.add(m[n]),v.classList.add(r.classes.alert),v.innerHTML='<div class="'+r.classes.textboxInner+'">'+s+"</div>",v.onclick=function(){return L(g,d)},v.listener=function(e){(b(e)||x(e))&&k();},y(v,d),i&&i<1&&(i=1),!o&&i&&u(i).then(function(){return L(g,d)});},E=t.force=function(e,t){var n=e.type,s=void 0===n?5:n,a=e.text,i=e.buttonText,c=void 0===i?"OK":i,o=e.callback,l=e.position,d=void 0===l?r.positions.force||d.top:l;p(),k();var u=document.createElement("div"),v=f();u.id=v;var x=document.createElement("div");x.classList.add(r.classes.textbox),x.classList.add(r.classes.backgroundInfo),x.innerHTML='<div class="'+r.classes.textboxInner+'">'+a+"</div>";var C=document.createElement("div");C.classList.add(r.classes.button),C.classList.add(m[s]),C.innerHTML=c,C.onclick=function(){L(v,d),h(),o?o():t&&t();},u.appendChild(x),u.appendChild(C),u.listener=function(e){b(e)&&C.click();},y(u,d),g();},T=t.confirm=function(e,t,n){var s=e.text,a=e.submitText,i=void 0===a?"Yes":a,c=e.cancelText,o=void 0===c?"Cancel":c,l=e.submitCallback,d=e.cancelCallback,u=e.position,m=void 0===u?r.positions.confirm||m.top:u;p(),k();var v=document.createElement("div"),C=f();v.id=C;var E=document.createElement("div");E.classList.add(r.classes.textbox),E.classList.add(r.classes.backgroundInfo),E.innerHTML='<div class="'+r.classes.textboxInner+'">'+s+"</div>";var T=document.createElement("div");T.classList.add(r.classes.button),T.classList.add(r.classes.elementHalf),T.classList.add(r.classes.backgroundSuccess),T.innerHTML=i,T.onclick=function(){L(C,m),h(),l?l():t&&t();};var M=document.createElement("div");M.classList.add(r.classes.button),M.classList.add(r.classes.elementHalf),M.classList.add(r.classes.backgroundError),M.innerHTML=o,M.onclick=function(){L(C,m),h(),d?d():n&&n();},v.appendChild(E),v.appendChild(T),v.appendChild(M),v.listener=function(e){b(e)?T.click():x(e)&&M.click();},y(v,m),g(v,m);},M=function(e,t,n){var i=e.text,c=e.submitText,o=void 0===c?"Submit":c,l=e.cancelText,d=void 0===l?"Cancel":l,u=e.submitCallback,m=e.cancelCallback,v=e.position,C=void 0===v?r.positions.input||C.top:v,E=s(e,["text","submitText","cancelText","submitCallback","cancelCallback","position"]);p(),k();var T=document.createElement("div"),M=f();T.id=M;var H=document.createElement("div");H.classList.add(r.classes.textbox),H.classList.add(r.classes.backgroundInfo),H.innerHTML='<div class="'+r.classes.textboxInner+'">'+i+"</div>";var S=document.createElement("input");S.classList.add(r.classes.inputField),S.setAttribute("autocapitalize",E.autocapitalize||"none"),S.setAttribute("autocomplete",E.autocomplete||"off"),S.setAttribute("autocorrect",E.autocorrect||"off"),S.setAttribute("autofocus",E.autofocus||"true"),S.setAttribute("inputmode",E.inputmode||"verbatim"),S.setAttribute("max",E.max||""),S.setAttribute("maxlength",E.maxlength||""),S.setAttribute("min",E.min||""),S.setAttribute("minlength",E.minlength||""),S.setAttribute("placeholder",E.placeholder||""),S.setAttribute("spellcheck",E.spellcheck||"default"),S.setAttribute("step",E.step||"any"),S.setAttribute("type",E.type||"text"),S.value=E.value||"",E.allowed&&(S.oninput=function(){var e=void 0;if(Array.isArray(E.allowed)){for(var t="",n=E.allowed,s=0;s<n.length;s++)"an"===n[s]?t+="0-9a-zA-Z":"a"===n[s]?t+="a-zA-Z":"n"===n[s]&&(t+="0-9"),"s"===n[s]&&(t+=" ");e=new RegExp("[^"+t+"]","g");}else "object"===a(E.allowed)&&(e=E.allowed);S.value=S.value.replace(e,"");});var w=document.createElement("div");w.classList.add(r.classes.button),w.classList.add(r.classes.elementHalf),w.classList.add(r.classes.backgroundSuccess),w.innerHTML=o,w.onclick=function(){L(M,C),h(),u?u(S.value):t&&t(S.value);};var O=document.createElement("div");O.classList.add(r.classes.button),O.classList.add(r.classes.elementHalf),O.classList.add(r.classes.backgroundError),O.innerHTML=d,O.onclick=function(){L(M,C),h(),m?m(S.value):n&&n(S.value);},T.appendChild(H),T.appendChild(S),T.appendChild(w),T.appendChild(O),T.listener=function(e){b(e)?w.click():x(e)&&O.click();},y(T,C),S.focus(),g(T,C);};t.input=M;var H=t.select=function(e,t){var n=e.text,s=e.cancelText,a=void 0===s?"Cancel":s,i=e.cancelCallback,c=e.choices,o=e.position,l=void 0===o?r.positions.select||l.top:o;p(),k();var d=document.createElement("div"),u=f();d.id=u;var v=document.createElement("div");v.classList.add(r.classes.textbox),v.classList.add(r.classes.backgroundInfo),v.innerHTML='<div class="'+r.classes.textboxInner+'">'+n+"</div>",d.appendChild(v),c.forEach(function(e,t){var n=e.type,s=void 0===n?1:n,a=e.text,i=e.handler,o=document.createElement("div");o.classList.add(m[s]),o.classList.add(r.classes.button),o.classList.add(r.classes.selectChoice);var p=c[t+1];p&&!p.type&&(p.type=1),p&&p.type===s&&o.classList.add(r.classes.selectChoiceRepeated),o.innerHTML=a,o.onclick=function(){L(u,l),h(),i();},d.appendChild(o);});var b=document.createElement("div");b.classList.add(r.classes.backgroundNeutral),b.classList.add(r.classes.button),b.innerHTML=a,b.onclick=function(){L(u,l),h(),i?i():t&&t();},d.appendChild(b),d.listener=function(e){x(e)&&b.click();},y(d,l),g(d,l);},S=t.date=function(e,t,n){var s=e.value,a=void 0===s?new Date:s,i=e.submitText,c=void 0===i?"OK":i,o=e.cancelText,l=void 0===o?"Cancel":o,d=e.submitCallback,u=e.cancelCallback,m=e.position,v=void 0===m?r.positions.date||v.top:m;p(),k();var C="&#9662",E=document.createElement("div"),T=document.createElement("div"),M=document.createElement("div"),H=function(e){E.innerHTML=r.dateMonths[e.getMonth()],T.innerHTML=e.getDate(),M.innerHTML=e.getFullYear();},S=function(e){var t=new Date(a.getFullYear(),a.getMonth()+1,0).getDate(),n=e.target.textContent.replace(/^0+/,"").replace(/[^\d]/g,"").slice(0,2);Number(n)>t&&(n=t.toString()),e.target.textContent=n,Number(n)<1&&(n="1"),a.setDate(Number(n));},w=function(e){var t=e.target.textContent.replace(/^0+/,"").replace(/[^\d]/g,"").slice(0,4);e.target.textContent=t,a.setFullYear(Number(t));},O=function(e){H(a);},A=function(e){var t=new Date(a.getFullYear(),a.getMonth()+e+1,0).getDate();a.getDate()>t&&a.setDate(t),a.setMonth(a.getMonth()+e),H(a);},D=function(e){a.setDate(a.getDate()+e),H(a);},I=function(e){var t=a.getFullYear()+e;t<0?a.setFullYear(0):a.setFullYear(a.getFullYear()+e),H(a);},j=document.createElement("div"),N=f();j.id=N;var P=document.createElement("div");P.classList.add(r.classes.backgroundInfo);var F=document.createElement("div");F.classList.add(r.classes.dateSelectorInner);var Y=document.createElement("div");Y.classList.add(r.classes.button),Y.classList.add(r.classes.elementThird),Y.classList.add(r.classes.dateSelectorUp),Y.innerHTML=C;var _=document.createElement("div");_.classList.add(r.classes.button),_.classList.add(r.classes.elementThird),_.classList.add(r.classes.dateSelectorUp),_.innerHTML=C;var z=document.createElement("div");z.classList.add(r.classes.button),z.classList.add(r.classes.elementThird),z.classList.add(r.classes.dateSelectorUp),z.innerHTML=C,E.classList.add(r.classes.element),E.classList.add(r.classes.elementThird),E.innerHTML=r.dateMonths[a.getMonth()],T.classList.add(r.classes.element),T.classList.add(r.classes.elementThird),T.setAttribute("contentEditable",!0),T.addEventListener("input",S),T.addEventListener("blur",O),T.innerHTML=a.getDate(),M.classList.add(r.classes.element),M.classList.add(r.classes.elementThird),M.setAttribute("contentEditable",!0),M.addEventListener("input",w),M.addEventListener("blur",O),M.innerHTML=a.getFullYear();var U=document.createElement("div");U.classList.add(r.classes.button),U.classList.add(r.classes.elementThird),U.innerHTML=C;var B=document.createElement("div");B.classList.add(r.classes.button),B.classList.add(r.classes.elementThird),B.innerHTML=C;var J=document.createElement("div");J.classList.add(r.classes.button),J.classList.add(r.classes.elementThird),J.innerHTML=C,Y.onclick=function(){return A(1)},_.onclick=function(){return D(1)},z.onclick=function(){return I(1)},U.onclick=function(){return A(-1)},B.onclick=function(){return D(-1)},J.onclick=function(){return I(-1)};var R=document.createElement("div");R.classList.add(r.classes.button),R.classList.add(r.classes.elementHalf),R.classList.add(r.classes.backgroundSuccess),R.innerHTML=c,R.onclick=function(){L(N,v),h(),d?d(a):t&&t(a);};var W=document.createElement("div");W.classList.add(r.classes.button),W.classList.add(r.classes.elementHalf),W.classList.add(r.classes.backgroundError),W.innerHTML=l,W.onclick=function(){L(N,v),h(),u?u(a):n&&n(a);},F.appendChild(Y),F.appendChild(_),F.appendChild(z),F.appendChild(E),F.appendChild(T),F.appendChild(M),F.appendChild(U),F.appendChild(B),F.appendChild(J),P.appendChild(F),j.appendChild(P),j.appendChild(R),j.appendChild(W),j.listener=function(e){b(e)?R.click():x(e)&&W.click();},y(j,v),g(j,v);};t.default={alert:C,force:E,confirm:T,input:M,select:H,date:S,setOptions:l,hideAlerts:k};}])});}).call(t,n(0)(e));}])});
  });

  /*!
   * clipboard.js v2.0.6
   * https://clipboardjs.com/
   * 
   * Licensed MIT © Zeno Rocha
   */

  var clipboard = createCommonjsModule(function (module, exports) {
  (function webpackUniversalModuleDefinition(root, factory) {
  	module.exports = factory();
  })(commonjsGlobal, function() {
  return /******/ (function(modules) { // webpackBootstrap
  /******/ 	// The module cache
  /******/ 	var installedModules = {};
  /******/
  /******/ 	// The require function
  /******/ 	function __webpack_require__(moduleId) {
  /******/
  /******/ 		// Check if module is in cache
  /******/ 		if(installedModules[moduleId]) {
  /******/ 			return installedModules[moduleId].exports;
  /******/ 		}
  /******/ 		// Create a new module (and put it into the cache)
  /******/ 		var module = installedModules[moduleId] = {
  /******/ 			i: moduleId,
  /******/ 			l: false,
  /******/ 			exports: {}
  /******/ 		};
  /******/
  /******/ 		// Execute the module function
  /******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
  /******/
  /******/ 		// Flag the module as loaded
  /******/ 		module.l = true;
  /******/
  /******/ 		// Return the exports of the module
  /******/ 		return module.exports;
  /******/ 	}
  /******/
  /******/
  /******/ 	// expose the modules object (__webpack_modules__)
  /******/ 	__webpack_require__.m = modules;
  /******/
  /******/ 	// expose the module cache
  /******/ 	__webpack_require__.c = installedModules;
  /******/
  /******/ 	// define getter function for harmony exports
  /******/ 	__webpack_require__.d = function(exports, name, getter) {
  /******/ 		if(!__webpack_require__.o(exports, name)) {
  /******/ 			Object.defineProperty(exports, name, { enumerable: true, get: getter });
  /******/ 		}
  /******/ 	};
  /******/
  /******/ 	// define __esModule on exports
  /******/ 	__webpack_require__.r = function(exports) {
  /******/ 		if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
  /******/ 			Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
  /******/ 		}
  /******/ 		Object.defineProperty(exports, '__esModule', { value: true });
  /******/ 	};
  /******/
  /******/ 	// create a fake namespace object
  /******/ 	// mode & 1: value is a module id, require it
  /******/ 	// mode & 2: merge all properties of value into the ns
  /******/ 	// mode & 4: return value when already ns object
  /******/ 	// mode & 8|1: behave like require
  /******/ 	__webpack_require__.t = function(value, mode) {
  /******/ 		if(mode & 1) value = __webpack_require__(value);
  /******/ 		if(mode & 8) return value;
  /******/ 		if((mode & 4) && typeof value === 'object' && value && value.__esModule) return value;
  /******/ 		var ns = Object.create(null);
  /******/ 		__webpack_require__.r(ns);
  /******/ 		Object.defineProperty(ns, 'default', { enumerable: true, value: value });
  /******/ 		if(mode & 2 && typeof value != 'string') for(var key in value) __webpack_require__.d(ns, key, function(key) { return value[key]; }.bind(null, key));
  /******/ 		return ns;
  /******/ 	};
  /******/
  /******/ 	// getDefaultExport function for compatibility with non-harmony modules
  /******/ 	__webpack_require__.n = function(module) {
  /******/ 		var getter = module && module.__esModule ?
  /******/ 			function getDefault() { return module['default']; } :
  /******/ 			function getModuleExports() { return module; };
  /******/ 		__webpack_require__.d(getter, 'a', getter);
  /******/ 		return getter;
  /******/ 	};
  /******/
  /******/ 	// Object.prototype.hasOwnProperty.call
  /******/ 	__webpack_require__.o = function(object, property) { return Object.prototype.hasOwnProperty.call(object, property); };
  /******/
  /******/ 	// __webpack_public_path__
  /******/ 	__webpack_require__.p = "";
  /******/
  /******/
  /******/ 	// Load entry module and return exports
  /******/ 	return __webpack_require__(__webpack_require__.s = 6);
  /******/ })
  /************************************************************************/
  /******/ ([
  /* 0 */
  /***/ (function(module, exports) {

  function select(element) {
      var selectedText;

      if (element.nodeName === 'SELECT') {
          element.focus();

          selectedText = element.value;
      }
      else if (element.nodeName === 'INPUT' || element.nodeName === 'TEXTAREA') {
          var isReadOnly = element.hasAttribute('readonly');

          if (!isReadOnly) {
              element.setAttribute('readonly', '');
          }

          element.select();
          element.setSelectionRange(0, element.value.length);

          if (!isReadOnly) {
              element.removeAttribute('readonly');
          }

          selectedText = element.value;
      }
      else {
          if (element.hasAttribute('contenteditable')) {
              element.focus();
          }

          var selection = window.getSelection();
          var range = document.createRange();

          range.selectNodeContents(element);
          selection.removeAllRanges();
          selection.addRange(range);

          selectedText = selection.toString();
      }

      return selectedText;
  }

  module.exports = select;


  /***/ }),
  /* 1 */
  /***/ (function(module, exports) {

  function E () {
    // Keep this empty so it's easier to inherit from
    // (via https://github.com/lipsmack from https://github.com/scottcorgan/tiny-emitter/issues/3)
  }

  E.prototype = {
    on: function (name, callback, ctx) {
      var e = this.e || (this.e = {});

      (e[name] || (e[name] = [])).push({
        fn: callback,
        ctx: ctx
      });

      return this;
    },

    once: function (name, callback, ctx) {
      var self = this;
      function listener () {
        self.off(name, listener);
        callback.apply(ctx, arguments);
      }
      listener._ = callback;
      return this.on(name, listener, ctx);
    },

    emit: function (name) {
      var data = [].slice.call(arguments, 1);
      var evtArr = ((this.e || (this.e = {}))[name] || []).slice();
      var i = 0;
      var len = evtArr.length;

      for (i; i < len; i++) {
        evtArr[i].fn.apply(evtArr[i].ctx, data);
      }

      return this;
    },

    off: function (name, callback) {
      var e = this.e || (this.e = {});
      var evts = e[name];
      var liveEvents = [];

      if (evts && callback) {
        for (var i = 0, len = evts.length; i < len; i++) {
          if (evts[i].fn !== callback && evts[i].fn._ !== callback)
            liveEvents.push(evts[i]);
        }
      }

      // Remove event from queue to prevent memory leak
      // Suggested by https://github.com/lazd
      // Ref: https://github.com/scottcorgan/tiny-emitter/commit/c6ebfaa9bc973b33d110a84a307742b7cf94c953#commitcomment-5024910

      (liveEvents.length)
        ? e[name] = liveEvents
        : delete e[name];

      return this;
    }
  };

  module.exports = E;
  module.exports.TinyEmitter = E;


  /***/ }),
  /* 2 */
  /***/ (function(module, exports, __webpack_require__) {

  var is = __webpack_require__(3);
  var delegate = __webpack_require__(4);

  /**
   * Validates all params and calls the right
   * listener function based on its target type.
   *
   * @param {String|HTMLElement|HTMLCollection|NodeList} target
   * @param {String} type
   * @param {Function} callback
   * @return {Object}
   */
  function listen(target, type, callback) {
      if (!target && !type && !callback) {
          throw new Error('Missing required arguments');
      }

      if (!is.string(type)) {
          throw new TypeError('Second argument must be a String');
      }

      if (!is.fn(callback)) {
          throw new TypeError('Third argument must be a Function');
      }

      if (is.node(target)) {
          return listenNode(target, type, callback);
      }
      else if (is.nodeList(target)) {
          return listenNodeList(target, type, callback);
      }
      else if (is.string(target)) {
          return listenSelector(target, type, callback);
      }
      else {
          throw new TypeError('First argument must be a String, HTMLElement, HTMLCollection, or NodeList');
      }
  }

  /**
   * Adds an event listener to a HTML element
   * and returns a remove listener function.
   *
   * @param {HTMLElement} node
   * @param {String} type
   * @param {Function} callback
   * @return {Object}
   */
  function listenNode(node, type, callback) {
      node.addEventListener(type, callback);

      return {
          destroy: function() {
              node.removeEventListener(type, callback);
          }
      }
  }

  /**
   * Add an event listener to a list of HTML elements
   * and returns a remove listener function.
   *
   * @param {NodeList|HTMLCollection} nodeList
   * @param {String} type
   * @param {Function} callback
   * @return {Object}
   */
  function listenNodeList(nodeList, type, callback) {
      Array.prototype.forEach.call(nodeList, function(node) {
          node.addEventListener(type, callback);
      });

      return {
          destroy: function() {
              Array.prototype.forEach.call(nodeList, function(node) {
                  node.removeEventListener(type, callback);
              });
          }
      }
  }

  /**
   * Add an event listener to a selector
   * and returns a remove listener function.
   *
   * @param {String} selector
   * @param {String} type
   * @param {Function} callback
   * @return {Object}
   */
  function listenSelector(selector, type, callback) {
      return delegate(document.body, selector, type, callback);
  }

  module.exports = listen;


  /***/ }),
  /* 3 */
  /***/ (function(module, exports) {

  /**
   * Check if argument is a HTML element.
   *
   * @param {Object} value
   * @return {Boolean}
   */
  exports.node = function(value) {
      return value !== undefined
          && value instanceof HTMLElement
          && value.nodeType === 1;
  };

  /**
   * Check if argument is a list of HTML elements.
   *
   * @param {Object} value
   * @return {Boolean}
   */
  exports.nodeList = function(value) {
      var type = Object.prototype.toString.call(value);

      return value !== undefined
          && (type === '[object NodeList]' || type === '[object HTMLCollection]')
          && ('length' in value)
          && (value.length === 0 || exports.node(value[0]));
  };

  /**
   * Check if argument is a string.
   *
   * @param {Object} value
   * @return {Boolean}
   */
  exports.string = function(value) {
      return typeof value === 'string'
          || value instanceof String;
  };

  /**
   * Check if argument is a function.
   *
   * @param {Object} value
   * @return {Boolean}
   */
  exports.fn = function(value) {
      var type = Object.prototype.toString.call(value);

      return type === '[object Function]';
  };


  /***/ }),
  /* 4 */
  /***/ (function(module, exports, __webpack_require__) {

  var closest = __webpack_require__(5);

  /**
   * Delegates event to a selector.
   *
   * @param {Element} element
   * @param {String} selector
   * @param {String} type
   * @param {Function} callback
   * @param {Boolean} useCapture
   * @return {Object}
   */
  function _delegate(element, selector, type, callback, useCapture) {
      var listenerFn = listener.apply(this, arguments);

      element.addEventListener(type, listenerFn, useCapture);

      return {
          destroy: function() {
              element.removeEventListener(type, listenerFn, useCapture);
          }
      }
  }

  /**
   * Delegates event to a selector.
   *
   * @param {Element|String|Array} [elements]
   * @param {String} selector
   * @param {String} type
   * @param {Function} callback
   * @param {Boolean} useCapture
   * @return {Object}
   */
  function delegate(elements, selector, type, callback, useCapture) {
      // Handle the regular Element usage
      if (typeof elements.addEventListener === 'function') {
          return _delegate.apply(null, arguments);
      }

      // Handle Element-less usage, it defaults to global delegation
      if (typeof type === 'function') {
          // Use `document` as the first parameter, then apply arguments
          // This is a short way to .unshift `arguments` without running into deoptimizations
          return _delegate.bind(null, document).apply(null, arguments);
      }

      // Handle Selector-based usage
      if (typeof elements === 'string') {
          elements = document.querySelectorAll(elements);
      }

      // Handle Array-like based usage
      return Array.prototype.map.call(elements, function (element) {
          return _delegate(element, selector, type, callback, useCapture);
      });
  }

  /**
   * Finds closest match and invokes callback.
   *
   * @param {Element} element
   * @param {String} selector
   * @param {String} type
   * @param {Function} callback
   * @return {Function}
   */
  function listener(element, selector, type, callback) {
      return function(e) {
          e.delegateTarget = closest(e.target, selector);

          if (e.delegateTarget) {
              callback.call(element, e);
          }
      }
  }

  module.exports = delegate;


  /***/ }),
  /* 5 */
  /***/ (function(module, exports) {

  var DOCUMENT_NODE_TYPE = 9;

  /**
   * A polyfill for Element.matches()
   */
  if (typeof Element !== 'undefined' && !Element.prototype.matches) {
      var proto = Element.prototype;

      proto.matches = proto.matchesSelector ||
                      proto.mozMatchesSelector ||
                      proto.msMatchesSelector ||
                      proto.oMatchesSelector ||
                      proto.webkitMatchesSelector;
  }

  /**
   * Finds the closest parent that matches a selector.
   *
   * @param {Element} element
   * @param {String} selector
   * @return {Function}
   */
  function closest (element, selector) {
      while (element && element.nodeType !== DOCUMENT_NODE_TYPE) {
          if (typeof element.matches === 'function' &&
              element.matches(selector)) {
            return element;
          }
          element = element.parentNode;
      }
  }

  module.exports = closest;


  /***/ }),
  /* 6 */
  /***/ (function(module, __webpack_exports__, __webpack_require__) {
  __webpack_require__.r(__webpack_exports__);

  // EXTERNAL MODULE: ./node_modules/select/src/select.js
  var src_select = __webpack_require__(0);
  var select_default = /*#__PURE__*/__webpack_require__.n(src_select);

  // CONCATENATED MODULE: ./src/clipboard-action.js
  var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

  var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

  function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }



  /**
   * Inner class which performs selection from either `text` or `target`
   * properties and then executes copy or cut operations.
   */

  var clipboard_action_ClipboardAction = function () {
      /**
       * @param {Object} options
       */
      function ClipboardAction(options) {
          _classCallCheck(this, ClipboardAction);

          this.resolveOptions(options);
          this.initSelection();
      }

      /**
       * Defines base properties passed from constructor.
       * @param {Object} options
       */


      _createClass(ClipboardAction, [{
          key: 'resolveOptions',
          value: function resolveOptions() {
              var options = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};

              this.action = options.action;
              this.container = options.container;
              this.emitter = options.emitter;
              this.target = options.target;
              this.text = options.text;
              this.trigger = options.trigger;

              this.selectedText = '';
          }

          /**
           * Decides which selection strategy is going to be applied based
           * on the existence of `text` and `target` properties.
           */

      }, {
          key: 'initSelection',
          value: function initSelection() {
              if (this.text) {
                  this.selectFake();
              } else if (this.target) {
                  this.selectTarget();
              }
          }

          /**
           * Creates a fake textarea element, sets its value from `text` property,
           * and makes a selection on it.
           */

      }, {
          key: 'selectFake',
          value: function selectFake() {
              var _this = this;

              var isRTL = document.documentElement.getAttribute('dir') == 'rtl';

              this.removeFake();

              this.fakeHandlerCallback = function () {
                  return _this.removeFake();
              };
              this.fakeHandler = this.container.addEventListener('click', this.fakeHandlerCallback) || true;

              this.fakeElem = document.createElement('textarea');
              // Prevent zooming on iOS
              this.fakeElem.style.fontSize = '12pt';
              // Reset box model
              this.fakeElem.style.border = '0';
              this.fakeElem.style.padding = '0';
              this.fakeElem.style.margin = '0';
              // Move element out of screen horizontally
              this.fakeElem.style.position = 'absolute';
              this.fakeElem.style[isRTL ? 'right' : 'left'] = '-9999px';
              // Move element to the same position vertically
              var yPosition = window.pageYOffset || document.documentElement.scrollTop;
              this.fakeElem.style.top = yPosition + 'px';

              this.fakeElem.setAttribute('readonly', '');
              this.fakeElem.value = this.text;

              this.container.appendChild(this.fakeElem);

              this.selectedText = select_default()(this.fakeElem);
              this.copyText();
          }

          /**
           * Only removes the fake element after another click event, that way
           * a user can hit `Ctrl+C` to copy because selection still exists.
           */

      }, {
          key: 'removeFake',
          value: function removeFake() {
              if (this.fakeHandler) {
                  this.container.removeEventListener('click', this.fakeHandlerCallback);
                  this.fakeHandler = null;
                  this.fakeHandlerCallback = null;
              }

              if (this.fakeElem) {
                  this.container.removeChild(this.fakeElem);
                  this.fakeElem = null;
              }
          }

          /**
           * Selects the content from element passed on `target` property.
           */

      }, {
          key: 'selectTarget',
          value: function selectTarget() {
              this.selectedText = select_default()(this.target);
              this.copyText();
          }

          /**
           * Executes the copy operation based on the current selection.
           */

      }, {
          key: 'copyText',
          value: function copyText() {
              var succeeded = void 0;

              try {
                  succeeded = document.execCommand(this.action);
              } catch (err) {
                  succeeded = false;
              }

              this.handleResult(succeeded);
          }

          /**
           * Fires an event based on the copy operation result.
           * @param {Boolean} succeeded
           */

      }, {
          key: 'handleResult',
          value: function handleResult(succeeded) {
              this.emitter.emit(succeeded ? 'success' : 'error', {
                  action: this.action,
                  text: this.selectedText,
                  trigger: this.trigger,
                  clearSelection: this.clearSelection.bind(this)
              });
          }

          /**
           * Moves focus away from `target` and back to the trigger, removes current selection.
           */

      }, {
          key: 'clearSelection',
          value: function clearSelection() {
              if (this.trigger) {
                  this.trigger.focus();
              }
              document.activeElement.blur();
              window.getSelection().removeAllRanges();
          }

          /**
           * Sets the `action` to be performed which can be either 'copy' or 'cut'.
           * @param {String} action
           */

      }, {
          key: 'destroy',


          /**
           * Destroy lifecycle.
           */
          value: function destroy() {
              this.removeFake();
          }
      }, {
          key: 'action',
          set: function set() {
              var action = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 'copy';

              this._action = action;

              if (this._action !== 'copy' && this._action !== 'cut') {
                  throw new Error('Invalid "action" value, use either "copy" or "cut"');
              }
          }

          /**
           * Gets the `action` property.
           * @return {String}
           */
          ,
          get: function get() {
              return this._action;
          }

          /**
           * Sets the `target` property using an element
           * that will be have its content copied.
           * @param {Element} target
           */

      }, {
          key: 'target',
          set: function set(target) {
              if (target !== undefined) {
                  if (target && (typeof target === 'undefined' ? 'undefined' : _typeof(target)) === 'object' && target.nodeType === 1) {
                      if (this.action === 'copy' && target.hasAttribute('disabled')) {
                          throw new Error('Invalid "target" attribute. Please use "readonly" instead of "disabled" attribute');
                      }

                      if (this.action === 'cut' && (target.hasAttribute('readonly') || target.hasAttribute('disabled'))) {
                          throw new Error('Invalid "target" attribute. You can\'t cut text from elements with "readonly" or "disabled" attributes');
                      }

                      this._target = target;
                  } else {
                      throw new Error('Invalid "target" value, use a valid Element');
                  }
              }
          }

          /**
           * Gets the `target` property.
           * @return {String|HTMLElement}
           */
          ,
          get: function get() {
              return this._target;
          }
      }]);

      return ClipboardAction;
  }();

  /* harmony default export */ var clipboard_action = (clipboard_action_ClipboardAction);
  // EXTERNAL MODULE: ./node_modules/tiny-emitter/index.js
  var tiny_emitter = __webpack_require__(1);
  var tiny_emitter_default = /*#__PURE__*/__webpack_require__.n(tiny_emitter);

  // EXTERNAL MODULE: ./node_modules/good-listener/src/listen.js
  var listen = __webpack_require__(2);
  var listen_default = /*#__PURE__*/__webpack_require__.n(listen);

  // CONCATENATED MODULE: ./src/clipboard.js
  var clipboard_typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

  var clipboard_createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

  function clipboard_classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

  function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

  function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }





  /**
   * Base class which takes one or more elements, adds event listeners to them,
   * and instantiates a new `ClipboardAction` on each click.
   */

  var clipboard_Clipboard = function (_Emitter) {
      _inherits(Clipboard, _Emitter);

      /**
       * @param {String|HTMLElement|HTMLCollection|NodeList} trigger
       * @param {Object} options
       */
      function Clipboard(trigger, options) {
          clipboard_classCallCheck(this, Clipboard);

          var _this = _possibleConstructorReturn(this, (Clipboard.__proto__ || Object.getPrototypeOf(Clipboard)).call(this));

          _this.resolveOptions(options);
          _this.listenClick(trigger);
          return _this;
      }

      /**
       * Defines if attributes would be resolved using internal setter functions
       * or custom functions that were passed in the constructor.
       * @param {Object} options
       */


      clipboard_createClass(Clipboard, [{
          key: 'resolveOptions',
          value: function resolveOptions() {
              var options = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};

              this.action = typeof options.action === 'function' ? options.action : this.defaultAction;
              this.target = typeof options.target === 'function' ? options.target : this.defaultTarget;
              this.text = typeof options.text === 'function' ? options.text : this.defaultText;
              this.container = clipboard_typeof(options.container) === 'object' ? options.container : document.body;
          }

          /**
           * Adds a click event listener to the passed trigger.
           * @param {String|HTMLElement|HTMLCollection|NodeList} trigger
           */

      }, {
          key: 'listenClick',
          value: function listenClick(trigger) {
              var _this2 = this;

              this.listener = listen_default()(trigger, 'click', function (e) {
                  return _this2.onClick(e);
              });
          }

          /**
           * Defines a new `ClipboardAction` on each click event.
           * @param {Event} e
           */

      }, {
          key: 'onClick',
          value: function onClick(e) {
              var trigger = e.delegateTarget || e.currentTarget;

              if (this.clipboardAction) {
                  this.clipboardAction = null;
              }

              this.clipboardAction = new clipboard_action({
                  action: this.action(trigger),
                  target: this.target(trigger),
                  text: this.text(trigger),
                  container: this.container,
                  trigger: trigger,
                  emitter: this
              });
          }

          /**
           * Default `action` lookup function.
           * @param {Element} trigger
           */

      }, {
          key: 'defaultAction',
          value: function defaultAction(trigger) {
              return getAttributeValue('action', trigger);
          }

          /**
           * Default `target` lookup function.
           * @param {Element} trigger
           */

      }, {
          key: 'defaultTarget',
          value: function defaultTarget(trigger) {
              var selector = getAttributeValue('target', trigger);

              if (selector) {
                  return document.querySelector(selector);
              }
          }

          /**
           * Returns the support of the given action, or all actions if no action is
           * given.
           * @param {String} [action]
           */

      }, {
          key: 'defaultText',


          /**
           * Default `text` lookup function.
           * @param {Element} trigger
           */
          value: function defaultText(trigger) {
              return getAttributeValue('text', trigger);
          }

          /**
           * Destroy lifecycle.
           */

      }, {
          key: 'destroy',
          value: function destroy() {
              this.listener.destroy();

              if (this.clipboardAction) {
                  this.clipboardAction.destroy();
                  this.clipboardAction = null;
              }
          }
      }], [{
          key: 'isSupported',
          value: function isSupported() {
              var action = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : ['copy', 'cut'];

              var actions = typeof action === 'string' ? [action] : action;
              var support = !!document.queryCommandSupported;

              actions.forEach(function (action) {
                  support = support && !!document.queryCommandSupported(action);
              });

              return support;
          }
      }]);

      return Clipboard;
  }(tiny_emitter_default.a);

  /**
   * Helper function to retrieve attribute value.
   * @param {String} suffix
   * @param {Element} element
   */


  function getAttributeValue(suffix, element) {
      var attribute = 'data-clipboard-' + suffix;

      if (!element.hasAttribute(attribute)) {
          return;
      }

      return element.getAttribute(attribute);
  }

  /* harmony default export */ var clipboard = __webpack_exports__["default"] = (clipboard_Clipboard);

  /***/ })
  /******/ ])["default"];
  });
  });

  var prism = createCommonjsModule(function (module) {
  /* **********************************************
       Begin prism-core.js
  ********************************************** */

  /// <reference lib="WebWorker"/>

  var _self = (typeof window !== 'undefined')
  	? window   // if in browser
  	: (
  		(typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope)
  		? self // if in worker
  		: {}   // if in node js
  	);

  /**
   * Prism: Lightweight, robust, elegant syntax highlighting
   *
   * @license MIT <https://opensource.org/licenses/MIT>
   * @author Lea Verou <https://lea.verou.me>
   * @namespace
   * @public
   */
  var Prism = (function (_self){

  // Private helper vars
  var lang = /\blang(?:uage)?-([\w-]+)\b/i;
  var uniqueId = 0;


  var _ = {
  	/**
  	 * By default, Prism will attempt to highlight all code elements (by calling {@link Prism.highlightAll}) on the
  	 * current page after the page finished loading. This might be a problem if e.g. you wanted to asynchronously load
  	 * additional languages or plugins yourself.
  	 *
  	 * By setting this value to `true`, Prism will not automatically highlight all code elements on the page.
  	 *
  	 * You obviously have to change this value before the automatic highlighting started. To do this, you can add an
  	 * empty Prism object into the global scope before loading the Prism script like this:
  	 *
  	 * ```js
  	 * window.Prism = window.Prism || {};
  	 * Prism.manual = true;
  	 * // add a new <script> to load Prism's script
  	 * ```
  	 *
  	 * @default false
  	 * @type {boolean}
  	 * @memberof Prism
  	 * @public
  	 */
  	manual: _self.Prism && _self.Prism.manual,
  	disableWorkerMessageHandler: _self.Prism && _self.Prism.disableWorkerMessageHandler,

  	/**
  	 * A namespace for utility methods.
  	 *
  	 * All function in this namespace that are not explicitly marked as _public_ are for __internal use only__ and may
  	 * change or disappear at any time.
  	 *
  	 * @namespace
  	 * @memberof Prism
  	 */
  	util: {
  		encode: function encode(tokens) {
  			if (tokens instanceof Token) {
  				return new Token(tokens.type, encode(tokens.content), tokens.alias);
  			} else if (Array.isArray(tokens)) {
  				return tokens.map(encode);
  			} else {
  				return tokens.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\u00a0/g, ' ');
  			}
  		},

  		/**
  		 * Returns the name of the type of the given value.
  		 *
  		 * @param {any} o
  		 * @returns {string}
  		 * @example
  		 * type(null)      === 'Null'
  		 * type(undefined) === 'Undefined'
  		 * type(123)       === 'Number'
  		 * type('foo')     === 'String'
  		 * type(true)      === 'Boolean'
  		 * type([1, 2])    === 'Array'
  		 * type({})        === 'Object'
  		 * type(String)    === 'Function'
  		 * type(/abc+/)    === 'RegExp'
  		 */
  		type: function (o) {
  			return Object.prototype.toString.call(o).slice(8, -1);
  		},

  		/**
  		 * Returns a unique number for the given object. Later calls will still return the same number.
  		 *
  		 * @param {Object} obj
  		 * @returns {number}
  		 */
  		objId: function (obj) {
  			if (!obj['__id']) {
  				Object.defineProperty(obj, '__id', { value: ++uniqueId });
  			}
  			return obj['__id'];
  		},

  		/**
  		 * Creates a deep clone of the given object.
  		 *
  		 * The main intended use of this function is to clone language definitions.
  		 *
  		 * @param {T} o
  		 * @param {Record<number, any>} [visited]
  		 * @returns {T}
  		 * @template T
  		 */
  		clone: function deepClone(o, visited) {
  			visited = visited || {};

  			var clone, id;
  			switch (_.util.type(o)) {
  				case 'Object':
  					id = _.util.objId(o);
  					if (visited[id]) {
  						return visited[id];
  					}
  					clone = /** @type {Record<string, any>} */ ({});
  					visited[id] = clone;

  					for (var key in o) {
  						if (o.hasOwnProperty(key)) {
  							clone[key] = deepClone(o[key], visited);
  						}
  					}

  					return /** @type {any} */ (clone);

  				case 'Array':
  					id = _.util.objId(o);
  					if (visited[id]) {
  						return visited[id];
  					}
  					clone = [];
  					visited[id] = clone;

  					(/** @type {Array} */(/** @type {any} */(o))).forEach(function (v, i) {
  						clone[i] = deepClone(v, visited);
  					});

  					return /** @type {any} */ (clone);

  				default:
  					return o;
  			}
  		},

  		/**
  		 * Returns the Prism language of the given element set by a `language-xxxx` or `lang-xxxx` class.
  		 *
  		 * If no language is set for the element or the element is `null` or `undefined`, `none` will be returned.
  		 *
  		 * @param {Element} element
  		 * @returns {string}
  		 */
  		getLanguage: function (element) {
  			while (element && !lang.test(element.className)) {
  				element = element.parentElement;
  			}
  			if (element) {
  				return (element.className.match(lang) || [, 'none'])[1].toLowerCase();
  			}
  			return 'none';
  		},

  		/**
  		 * Returns the script element that is currently executing.
  		 *
  		 * This does __not__ work for line script element.
  		 *
  		 * @returns {HTMLScriptElement | null}
  		 */
  		currentScript: function () {
  			if (typeof document === 'undefined') {
  				return null;
  			}
  			if ('currentScript' in document && 1 < 2 /* hack to trip TS' flow analysis */) {
  				return /** @type {any} */ (document.currentScript);
  			}

  			// IE11 workaround
  			// we'll get the src of the current script by parsing IE11's error stack trace
  			// this will not work for inline scripts

  			try {
  				throw new Error();
  			} catch (err) {
  				// Get file src url from stack. Specifically works with the format of stack traces in IE.
  				// A stack will look like this:
  				//
  				// Error
  				//    at _.util.currentScript (http://localhost/components/prism-core.js:119:5)
  				//    at Global code (http://localhost/components/prism-core.js:606:1)

  				var src = (/at [^(\r\n]*\((.*):.+:.+\)$/i.exec(err.stack) || [])[1];
  				if (src) {
  					var scripts = document.getElementsByTagName('script');
  					for (var i in scripts) {
  						if (scripts[i].src == src) {
  							return scripts[i];
  						}
  					}
  				}
  				return null;
  			}
  		},

  		/**
  		 * Returns whether a given class is active for `element`.
  		 *
  		 * The class can be activated if `element` or one of its ancestors has the given class and it can be deactivated
  		 * if `element` or one of its ancestors has the negated version of the given class. The _negated version_ of the
  		 * given class is just the given class with a `no-` prefix.
  		 *
  		 * Whether the class is active is determined by the closest ancestor of `element` (where `element` itself is
  		 * closest ancestor) that has the given class or the negated version of it. If neither `element` nor any of its
  		 * ancestors have the given class or the negated version of it, then the default activation will be returned.
  		 *
  		 * In the paradoxical situation where the closest ancestor contains __both__ the given class and the negated
  		 * version of it, the class is considered active.
  		 *
  		 * @param {Element} element
  		 * @param {string} className
  		 * @param {boolean} [defaultActivation=false]
  		 * @returns {boolean}
  		 */
  		isActive: function (element, className, defaultActivation) {
  			var no = 'no-' + className;

  			while (element) {
  				var classList = element.classList;
  				if (classList.contains(className)) {
  					return true;
  				}
  				if (classList.contains(no)) {
  					return false;
  				}
  				element = element.parentElement;
  			}
  			return !!defaultActivation;
  		}
  	},

  	/**
  	 * This namespace contains all currently loaded languages and the some helper functions to create and modify languages.
  	 *
  	 * @namespace
  	 * @memberof Prism
  	 * @public
  	 */
  	languages: {
  		/**
  		 * Creates a deep copy of the language with the given id and appends the given tokens.
  		 *
  		 * If a token in `redef` also appears in the copied language, then the existing token in the copied language
  		 * will be overwritten at its original position.
  		 *
  		 * ## Best practices
  		 *
  		 * Since the position of overwriting tokens (token in `redef` that overwrite tokens in the copied language)
  		 * doesn't matter, they can technically be in any order. However, this can be confusing to others that trying to
  		 * understand the language definition because, normally, the order of tokens matters in Prism grammars.
  		 *
  		 * Therefore, it is encouraged to order overwriting tokens according to the positions of the overwritten tokens.
  		 * Furthermore, all non-overwriting tokens should be placed after the overwriting ones.
  		 *
  		 * @param {string} id The id of the language to extend. This has to be a key in `Prism.languages`.
  		 * @param {Grammar} redef The new tokens to append.
  		 * @returns {Grammar} The new language created.
  		 * @public
  		 * @example
  		 * Prism.languages['css-with-colors'] = Prism.languages.extend('css', {
  		 *     // Prism.languages.css already has a 'comment' token, so this token will overwrite CSS' 'comment' token
  		 *     // at its original position
  		 *     'comment': { ... },
  		 *     // CSS doesn't have a 'color' token, so this token will be appended
  		 *     'color': /\b(?:red|green|blue)\b/
  		 * });
  		 */
  		extend: function (id, redef) {
  			var lang = _.util.clone(_.languages[id]);

  			for (var key in redef) {
  				lang[key] = redef[key];
  			}

  			return lang;
  		},

  		/**
  		 * Inserts tokens _before_ another token in a language definition or any other grammar.
  		 *
  		 * ## Usage
  		 *
  		 * This helper method makes it easy to modify existing languages. For example, the CSS language definition
  		 * not only defines CSS highlighting for CSS documents, but also needs to define highlighting for CSS embedded
  		 * in HTML through `<style>` elements. To do this, it needs to modify `Prism.languages.markup` and add the
  		 * appropriate tokens. However, `Prism.languages.markup` is a regular JavaScript object literal, so if you do
  		 * this:
  		 *
  		 * ```js
  		 * Prism.languages.markup.style = {
  		 *     // token
  		 * };
  		 * ```
  		 *
  		 * then the `style` token will be added (and processed) at the end. `insertBefore` allows you to insert tokens
  		 * before existing tokens. For the CSS example above, you would use it like this:
  		 *
  		 * ```js
  		 * Prism.languages.insertBefore('markup', 'cdata', {
  		 *     'style': {
  		 *         // token
  		 *     }
  		 * });
  		 * ```
  		 *
  		 * ## Special cases
  		 *
  		 * If the grammars of `inside` and `insert` have tokens with the same name, the tokens in `inside`'s grammar
  		 * will be ignored.
  		 *
  		 * This behavior can be used to insert tokens after `before`:
  		 *
  		 * ```js
  		 * Prism.languages.insertBefore('markup', 'comment', {
  		 *     'comment': Prism.languages.markup.comment,
  		 *     // tokens after 'comment'
  		 * });
  		 * ```
  		 *
  		 * ## Limitations
  		 *
  		 * The main problem `insertBefore` has to solve is iteration order. Since ES2015, the iteration order for object
  		 * properties is guaranteed to be the insertion order (except for integer keys) but some browsers behave
  		 * differently when keys are deleted and re-inserted. So `insertBefore` can't be implemented by temporarily
  		 * deleting properties which is necessary to insert at arbitrary positions.
  		 *
  		 * To solve this problem, `insertBefore` doesn't actually insert the given tokens into the target object.
  		 * Instead, it will create a new object and replace all references to the target object with the new one. This
  		 * can be done without temporarily deleting properties, so the iteration order is well-defined.
  		 *
  		 * However, only references that can be reached from `Prism.languages` or `insert` will be replaced. I.e. if
  		 * you hold the target object in a variable, then the value of the variable will not change.
  		 *
  		 * ```js
  		 * var oldMarkup = Prism.languages.markup;
  		 * var newMarkup = Prism.languages.insertBefore('markup', 'comment', { ... });
  		 *
  		 * assert(oldMarkup !== Prism.languages.markup);
  		 * assert(newMarkup === Prism.languages.markup);
  		 * ```
  		 *
  		 * @param {string} inside The property of `root` (e.g. a language id in `Prism.languages`) that contains the
  		 * object to be modified.
  		 * @param {string} before The key to insert before.
  		 * @param {Grammar} insert An object containing the key-value pairs to be inserted.
  		 * @param {Object<string, any>} [root] The object containing `inside`, i.e. the object that contains the
  		 * object to be modified.
  		 *
  		 * Defaults to `Prism.languages`.
  		 * @returns {Grammar} The new grammar object.
  		 * @public
  		 */
  		insertBefore: function (inside, before, insert, root) {
  			root = root || /** @type {any} */ (_.languages);
  			var grammar = root[inside];
  			/** @type {Grammar} */
  			var ret = {};

  			for (var token in grammar) {
  				if (grammar.hasOwnProperty(token)) {

  					if (token == before) {
  						for (var newToken in insert) {
  							if (insert.hasOwnProperty(newToken)) {
  								ret[newToken] = insert[newToken];
  							}
  						}
  					}

  					// Do not insert token which also occur in insert. See #1525
  					if (!insert.hasOwnProperty(token)) {
  						ret[token] = grammar[token];
  					}
  				}
  			}

  			var old = root[inside];
  			root[inside] = ret;

  			// Update references in other language definitions
  			_.languages.DFS(_.languages, function(key, value) {
  				if (value === old && key != inside) {
  					this[key] = ret;
  				}
  			});

  			return ret;
  		},

  		// Traverse a language definition with Depth First Search
  		DFS: function DFS(o, callback, type, visited) {
  			visited = visited || {};

  			var objId = _.util.objId;

  			for (var i in o) {
  				if (o.hasOwnProperty(i)) {
  					callback.call(o, i, o[i], type || i);

  					var property = o[i],
  					    propertyType = _.util.type(property);

  					if (propertyType === 'Object' && !visited[objId(property)]) {
  						visited[objId(property)] = true;
  						DFS(property, callback, null, visited);
  					}
  					else if (propertyType === 'Array' && !visited[objId(property)]) {
  						visited[objId(property)] = true;
  						DFS(property, callback, i, visited);
  					}
  				}
  			}
  		}
  	},

  	plugins: {},

  	/**
  	 * This is the most high-level function in Prism’s API.
  	 * It fetches all the elements that have a `.language-xxxx` class and then calls {@link Prism.highlightElement} on
  	 * each one of them.
  	 *
  	 * This is equivalent to `Prism.highlightAllUnder(document, async, callback)`.
  	 *
  	 * @param {boolean} [async=false] Same as in {@link Prism.highlightAllUnder}.
  	 * @param {HighlightCallback} [callback] Same as in {@link Prism.highlightAllUnder}.
  	 * @memberof Prism
  	 * @public
  	 */
  	highlightAll: function(async, callback) {
  		_.highlightAllUnder(document, async, callback);
  	},

  	/**
  	 * Fetches all the descendants of `container` that have a `.language-xxxx` class and then calls
  	 * {@link Prism.highlightElement} on each one of them.
  	 *
  	 * The following hooks will be run:
  	 * 1. `before-highlightall`
  	 * 2. `before-all-elements-highlight`
  	 * 3. All hooks of {@link Prism.highlightElement} for each element.
  	 *
  	 * @param {ParentNode} container The root element, whose descendants that have a `.language-xxxx` class will be highlighted.
  	 * @param {boolean} [async=false] Whether each element is to be highlighted asynchronously using Web Workers.
  	 * @param {HighlightCallback} [callback] An optional callback to be invoked on each element after its highlighting is done.
  	 * @memberof Prism
  	 * @public
  	 */
  	highlightAllUnder: function(container, async, callback) {
  		var env = {
  			callback: callback,
  			container: container,
  			selector: 'code[class*="language-"], [class*="language-"] code, code[class*="lang-"], [class*="lang-"] code'
  		};

  		_.hooks.run('before-highlightall', env);

  		env.elements = Array.prototype.slice.apply(env.container.querySelectorAll(env.selector));

  		_.hooks.run('before-all-elements-highlight', env);

  		for (var i = 0, element; element = env.elements[i++];) {
  			_.highlightElement(element, async === true, env.callback);
  		}
  	},

  	/**
  	 * Highlights the code inside a single element.
  	 *
  	 * The following hooks will be run:
  	 * 1. `before-sanity-check`
  	 * 2. `before-highlight`
  	 * 3. All hooks of {@link Prism.highlight}. These hooks will be run by an asynchronous worker if `async` is `true`.
  	 * 4. `before-insert`
  	 * 5. `after-highlight`
  	 * 6. `complete`
  	 *
  	 * Some the above hooks will be skipped if the element doesn't contain any text or there is no grammar loaded for
  	 * the element's language.
  	 *
  	 * @param {Element} element The element containing the code.
  	 * It must have a class of `language-xxxx` to be processed, where `xxxx` is a valid language identifier.
  	 * @param {boolean} [async=false] Whether the element is to be highlighted asynchronously using Web Workers
  	 * to improve performance and avoid blocking the UI when highlighting very large chunks of code. This option is
  	 * [disabled by default](https://prismjs.com/faq.html#why-is-asynchronous-highlighting-disabled-by-default).
  	 *
  	 * Note: All language definitions required to highlight the code must be included in the main `prism.js` file for
  	 * asynchronous highlighting to work. You can build your own bundle on the
  	 * [Download page](https://prismjs.com/download.html).
  	 * @param {HighlightCallback} [callback] An optional callback to be invoked after the highlighting is done.
  	 * Mostly useful when `async` is `true`, since in that case, the highlighting is done asynchronously.
  	 * @memberof Prism
  	 * @public
  	 */
  	highlightElement: function(element, async, callback) {
  		// Find language
  		var language = _.util.getLanguage(element);
  		var grammar = _.languages[language];

  		// Set language on the element, if not present
  		element.className = element.className.replace(lang, '').replace(/\s+/g, ' ') + ' language-' + language;

  		// Set language on the parent, for styling
  		var parent = element.parentElement;
  		if (parent && parent.nodeName.toLowerCase() === 'pre') {
  			parent.className = parent.className.replace(lang, '').replace(/\s+/g, ' ') + ' language-' + language;
  		}

  		var code = element.textContent;

  		var env = {
  			element: element,
  			language: language,
  			grammar: grammar,
  			code: code
  		};

  		function insertHighlightedCode(highlightedCode) {
  			env.highlightedCode = highlightedCode;

  			_.hooks.run('before-insert', env);

  			env.element.innerHTML = env.highlightedCode;

  			_.hooks.run('after-highlight', env);
  			_.hooks.run('complete', env);
  			callback && callback.call(env.element);
  		}

  		_.hooks.run('before-sanity-check', env);

  		if (!env.code) {
  			_.hooks.run('complete', env);
  			callback && callback.call(env.element);
  			return;
  		}

  		_.hooks.run('before-highlight', env);

  		if (!env.grammar) {
  			insertHighlightedCode(_.util.encode(env.code));
  			return;
  		}

  		if (async && _self.Worker) {
  			var worker = new Worker(_.filename);

  			worker.onmessage = function(evt) {
  				insertHighlightedCode(evt.data);
  			};

  			worker.postMessage(JSON.stringify({
  				language: env.language,
  				code: env.code,
  				immediateClose: true
  			}));
  		}
  		else {
  			insertHighlightedCode(_.highlight(env.code, env.grammar, env.language));
  		}
  	},

  	/**
  	 * Low-level function, only use if you know what you’re doing. It accepts a string of text as input
  	 * and the language definitions to use, and returns a string with the HTML produced.
  	 *
  	 * The following hooks will be run:
  	 * 1. `before-tokenize`
  	 * 2. `after-tokenize`
  	 * 3. `wrap`: On each {@link Token}.
  	 *
  	 * @param {string} text A string with the code to be highlighted.
  	 * @param {Grammar} grammar An object containing the tokens to use.
  	 *
  	 * Usually a language definition like `Prism.languages.markup`.
  	 * @param {string} language The name of the language definition passed to `grammar`.
  	 * @returns {string} The highlighted HTML.
  	 * @memberof Prism
  	 * @public
  	 * @example
  	 * Prism.highlight('var foo = true;', Prism.languages.javascript, 'javascript');
  	 */
  	highlight: function (text, grammar, language) {
  		var env = {
  			code: text,
  			grammar: grammar,
  			language: language
  		};
  		_.hooks.run('before-tokenize', env);
  		env.tokens = _.tokenize(env.code, env.grammar);
  		_.hooks.run('after-tokenize', env);
  		return Token.stringify(_.util.encode(env.tokens), env.language);
  	},

  	/**
  	 * This is the heart of Prism, and the most low-level function you can use. It accepts a string of text as input
  	 * and the language definitions to use, and returns an array with the tokenized code.
  	 *
  	 * When the language definition includes nested tokens, the function is called recursively on each of these tokens.
  	 *
  	 * This method could be useful in other contexts as well, as a very crude parser.
  	 *
  	 * @param {string} text A string with the code to be highlighted.
  	 * @param {Grammar} grammar An object containing the tokens to use.
  	 *
  	 * Usually a language definition like `Prism.languages.markup`.
  	 * @returns {TokenStream} An array of strings and tokens, a token stream.
  	 * @memberof Prism
  	 * @public
  	 * @example
  	 * let code = `var foo = 0;`;
  	 * let tokens = Prism.tokenize(code, Prism.languages.javascript);
  	 * tokens.forEach(token => {
  	 *     if (token instanceof Prism.Token && token.type === 'number') {
  	 *         console.log(`Found numeric literal: ${token.content}`);
  	 *     }
  	 * });
  	 */
  	tokenize: function(text, grammar) {
  		var rest = grammar.rest;
  		if (rest) {
  			for (var token in rest) {
  				grammar[token] = rest[token];
  			}

  			delete grammar.rest;
  		}

  		var tokenList = new LinkedList();
  		addAfter(tokenList, tokenList.head, text);

  		matchGrammar(text, tokenList, grammar, tokenList.head, 0);

  		return toArray(tokenList);
  	},

  	/**
  	 * @namespace
  	 * @memberof Prism
  	 * @public
  	 */
  	hooks: {
  		all: {},

  		/**
  		 * Adds the given callback to the list of callbacks for the given hook.
  		 *
  		 * The callback will be invoked when the hook it is registered for is run.
  		 * Hooks are usually directly run by a highlight function but you can also run hooks yourself.
  		 *
  		 * One callback function can be registered to multiple hooks and the same hook multiple times.
  		 *
  		 * @param {string} name The name of the hook.
  		 * @param {HookCallback} callback The callback function which is given environment variables.
  		 * @public
  		 */
  		add: function (name, callback) {
  			var hooks = _.hooks.all;

  			hooks[name] = hooks[name] || [];

  			hooks[name].push(callback);
  		},

  		/**
  		 * Runs a hook invoking all registered callbacks with the given environment variables.
  		 *
  		 * Callbacks will be invoked synchronously and in the order in which they were registered.
  		 *
  		 * @param {string} name The name of the hook.
  		 * @param {Object<string, any>} env The environment variables of the hook passed to all callbacks registered.
  		 * @public
  		 */
  		run: function (name, env) {
  			var callbacks = _.hooks.all[name];

  			if (!callbacks || !callbacks.length) {
  				return;
  			}

  			for (var i=0, callback; callback = callbacks[i++];) {
  				callback(env);
  			}
  		}
  	},

  	Token: Token
  };
  _self.Prism = _;


  // Typescript note:
  // The following can be used to import the Token type in JSDoc:
  //
  //   @typedef {InstanceType<import("./prism-core")["Token"]>} Token

  /**
   * Creates a new token.
   *
   * @param {string} type See {@link Token#type type}
   * @param {string | TokenStream} content See {@link Token#content content}
   * @param {string|string[]} [alias] The alias(es) of the token.
   * @param {string} [matchedStr=""] A copy of the full string this token was created from.
   * @class
   * @global
   * @public
   */
  function Token(type, content, alias, matchedStr) {
  	/**
  	 * The type of the token.
  	 *
  	 * This is usually the key of a pattern in a {@link Grammar}.
  	 *
  	 * @type {string}
  	 * @see GrammarToken
  	 * @public
  	 */
  	this.type = type;
  	/**
  	 * The strings or tokens contained by this token.
  	 *
  	 * This will be a token stream if the pattern matched also defined an `inside` grammar.
  	 *
  	 * @type {string | TokenStream}
  	 * @public
  	 */
  	this.content = content;
  	/**
  	 * The alias(es) of the token.
  	 *
  	 * @type {string|string[]}
  	 * @see GrammarToken
  	 * @public
  	 */
  	this.alias = alias;
  	// Copy of the full string this token was created from
  	this.length = (matchedStr || '').length | 0;
  }

  /**
   * A token stream is an array of strings and {@link Token Token} objects.
   *
   * Token streams have to fulfill a few properties that are assumed by most functions (mostly internal ones) that process
   * them.
   *
   * 1. No adjacent strings.
   * 2. No empty strings.
   *
   *    The only exception here is the token stream that only contains the empty string and nothing else.
   *
   * @typedef {Array<string | Token>} TokenStream
   * @global
   * @public
   */

  /**
   * Converts the given token or token stream to an HTML representation.
   *
   * The following hooks will be run:
   * 1. `wrap`: On each {@link Token}.
   *
   * @param {string | Token | TokenStream} o The token or token stream to be converted.
   * @param {string} language The name of current language.
   * @returns {string} The HTML representation of the token or token stream.
   * @memberof Token
   * @static
   */
  Token.stringify = function stringify(o, language) {
  	if (typeof o == 'string') {
  		return o;
  	}
  	if (Array.isArray(o)) {
  		var s = '';
  		o.forEach(function (e) {
  			s += stringify(e, language);
  		});
  		return s;
  	}

  	var env = {
  		type: o.type,
  		content: stringify(o.content, language),
  		tag: 'span',
  		classes: ['token', o.type],
  		attributes: {},
  		language: language
  	};

  	var aliases = o.alias;
  	if (aliases) {
  		if (Array.isArray(aliases)) {
  			Array.prototype.push.apply(env.classes, aliases);
  		} else {
  			env.classes.push(aliases);
  		}
  	}

  	_.hooks.run('wrap', env);

  	var attributes = '';
  	for (var name in env.attributes) {
  		attributes += ' ' + name + '="' + (env.attributes[name] || '').replace(/"/g, '&quot;') + '"';
  	}

  	return '<' + env.tag + ' class="' + env.classes.join(' ') + '"' + attributes + '>' + env.content + '</' + env.tag + '>';
  };

  /**
   * @param {RegExp} pattern
   * @param {number} pos
   * @param {string} text
   * @param {boolean} lookbehind
   * @returns {RegExpExecArray | null}
   */
  function matchPattern(pattern, pos, text, lookbehind) {
  	pattern.lastIndex = pos;
  	var match = pattern.exec(text);
  	if (match && lookbehind && match[1]) {
  		// change the match to remove the text matched by the Prism lookbehind group
  		var lookbehindLength = match[1].length;
  		match.index += lookbehindLength;
  		match[0] = match[0].slice(lookbehindLength);
  	}
  	return match;
  }

  /**
   * @param {string} text
   * @param {LinkedList<string | Token>} tokenList
   * @param {any} grammar
   * @param {LinkedListNode<string | Token>} startNode
   * @param {number} startPos
   * @param {RematchOptions} [rematch]
   * @returns {void}
   * @private
   *
   * @typedef RematchOptions
   * @property {string} cause
   * @property {number} reach
   */
  function matchGrammar(text, tokenList, grammar, startNode, startPos, rematch) {
  	for (var token in grammar) {
  		if (!grammar.hasOwnProperty(token) || !grammar[token]) {
  			continue;
  		}

  		var patterns = grammar[token];
  		patterns = Array.isArray(patterns) ? patterns : [patterns];

  		for (var j = 0; j < patterns.length; ++j) {
  			if (rematch && rematch.cause == token + ',' + j) {
  				return;
  			}

  			var patternObj = patterns[j],
  				inside = patternObj.inside,
  				lookbehind = !!patternObj.lookbehind,
  				greedy = !!patternObj.greedy,
  				alias = patternObj.alias;

  			if (greedy && !patternObj.pattern.global) {
  				// Without the global flag, lastIndex won't work
  				var flags = patternObj.pattern.toString().match(/[imsuy]*$/)[0];
  				patternObj.pattern = RegExp(patternObj.pattern.source, flags + 'g');
  			}

  			/** @type {RegExp} */
  			var pattern = patternObj.pattern || patternObj;

  			for ( // iterate the token list and keep track of the current token/string position
  				var currentNode = startNode.next, pos = startPos;
  				currentNode !== tokenList.tail;
  				pos += currentNode.value.length, currentNode = currentNode.next
  			) {

  				if (rematch && pos >= rematch.reach) {
  					break;
  				}

  				var str = currentNode.value;

  				if (tokenList.length > text.length) {
  					// Something went terribly wrong, ABORT, ABORT!
  					return;
  				}

  				if (str instanceof Token) {
  					continue;
  				}

  				var removeCount = 1; // this is the to parameter of removeBetween
  				var match;

  				if (greedy) {
  					match = matchPattern(pattern, pos, text, lookbehind);
  					if (!match) {
  						break;
  					}

  					var from = match.index;
  					var to = match.index + match[0].length;
  					var p = pos;

  					// find the node that contains the match
  					p += currentNode.value.length;
  					while (from >= p) {
  						currentNode = currentNode.next;
  						p += currentNode.value.length;
  					}
  					// adjust pos (and p)
  					p -= currentNode.value.length;
  					pos = p;

  					// the current node is a Token, then the match starts inside another Token, which is invalid
  					if (currentNode.value instanceof Token) {
  						continue;
  					}

  					// find the last node which is affected by this match
  					for (
  						var k = currentNode;
  						k !== tokenList.tail && (p < to || typeof k.value === 'string');
  						k = k.next
  					) {
  						removeCount++;
  						p += k.value.length;
  					}
  					removeCount--;

  					// replace with the new match
  					str = text.slice(pos, p);
  					match.index -= pos;
  				} else {
  					match = matchPattern(pattern, 0, str, lookbehind);
  					if (!match) {
  						continue;
  					}
  				}

  				var from = match.index,
  					matchStr = match[0],
  					before = str.slice(0, from),
  					after = str.slice(from + matchStr.length);

  				var reach = pos + str.length;
  				if (rematch && reach > rematch.reach) {
  					rematch.reach = reach;
  				}

  				var removeFrom = currentNode.prev;

  				if (before) {
  					removeFrom = addAfter(tokenList, removeFrom, before);
  					pos += before.length;
  				}

  				removeRange(tokenList, removeFrom, removeCount);

  				var wrapped = new Token(token, inside ? _.tokenize(matchStr, inside) : matchStr, alias, matchStr);
  				currentNode = addAfter(tokenList, removeFrom, wrapped);

  				if (after) {
  					addAfter(tokenList, currentNode, after);
  				}

  				if (removeCount > 1) {
  					// at least one Token object was removed, so we have to do some rematching
  					// this can only happen if the current pattern is greedy
  					matchGrammar(text, tokenList, grammar, currentNode.prev, pos, {
  						cause: token + ',' + j,
  						reach: reach
  					});
  				}
  			}
  		}
  	}
  }

  /**
   * @typedef LinkedListNode
   * @property {T} value
   * @property {LinkedListNode<T> | null} prev The previous node.
   * @property {LinkedListNode<T> | null} next The next node.
   * @template T
   * @private
   */

  /**
   * @template T
   * @private
   */
  function LinkedList() {
  	/** @type {LinkedListNode<T>} */
  	var head = { value: null, prev: null, next: null };
  	/** @type {LinkedListNode<T>} */
  	var tail = { value: null, prev: head, next: null };
  	head.next = tail;

  	/** @type {LinkedListNode<T>} */
  	this.head = head;
  	/** @type {LinkedListNode<T>} */
  	this.tail = tail;
  	this.length = 0;
  }

  /**
   * Adds a new node with the given value to the list.
   * @param {LinkedList<T>} list
   * @param {LinkedListNode<T>} node
   * @param {T} value
   * @returns {LinkedListNode<T>} The added node.
   * @template T
   */
  function addAfter(list, node, value) {
  	// assumes that node != list.tail && values.length >= 0
  	var next = node.next;

  	var newNode = { value: value, prev: node, next: next };
  	node.next = newNode;
  	next.prev = newNode;
  	list.length++;

  	return newNode;
  }
  /**
   * Removes `count` nodes after the given node. The given node will not be removed.
   * @param {LinkedList<T>} list
   * @param {LinkedListNode<T>} node
   * @param {number} count
   * @template T
   */
  function removeRange(list, node, count) {
  	var next = node.next;
  	for (var i = 0; i < count && next !== list.tail; i++) {
  		next = next.next;
  	}
  	node.next = next;
  	next.prev = node;
  	list.length -= i;
  }
  /**
   * @param {LinkedList<T>} list
   * @returns {T[]}
   * @template T
   */
  function toArray(list) {
  	var array = [];
  	var node = list.head.next;
  	while (node !== list.tail) {
  		array.push(node.value);
  		node = node.next;
  	}
  	return array;
  }


  if (!_self.document) {
  	if (!_self.addEventListener) {
  		// in Node.js
  		return _;
  	}

  	if (!_.disableWorkerMessageHandler) {
  		// In worker
  		_self.addEventListener('message', function (evt) {
  			var message = JSON.parse(evt.data),
  				lang = message.language,
  				code = message.code,
  				immediateClose = message.immediateClose;

  			_self.postMessage(_.highlight(code, _.languages[lang], lang));
  			if (immediateClose) {
  				_self.close();
  			}
  		}, false);
  	}

  	return _;
  }

  // Get current script and highlight
  var script = _.util.currentScript();

  if (script) {
  	_.filename = script.src;

  	if (script.hasAttribute('data-manual')) {
  		_.manual = true;
  	}
  }

  function highlightAutomaticallyCallback() {
  	if (!_.manual) {
  		_.highlightAll();
  	}
  }

  if (!_.manual) {
  	// If the document state is "loading", then we'll use DOMContentLoaded.
  	// If the document state is "interactive" and the prism.js script is deferred, then we'll also use the
  	// DOMContentLoaded event because there might be some plugins or languages which have also been deferred and they
  	// might take longer one animation frame to execute which can create a race condition where only some plugins have
  	// been loaded when Prism.highlightAll() is executed, depending on how fast resources are loaded.
  	// See https://github.com/PrismJS/prism/issues/2102
  	var readyState = document.readyState;
  	if (readyState === 'loading' || readyState === 'interactive' && script && script.defer) {
  		document.addEventListener('DOMContentLoaded', highlightAutomaticallyCallback);
  	} else {
  		if (window.requestAnimationFrame) {
  			window.requestAnimationFrame(highlightAutomaticallyCallback);
  		} else {
  			window.setTimeout(highlightAutomaticallyCallback, 16);
  		}
  	}
  }

  return _;

  })(_self);

  if ( module.exports) {
  	module.exports = Prism;
  }

  // hack for components to work correctly in node.js
  if (typeof commonjsGlobal !== 'undefined') {
  	commonjsGlobal.Prism = Prism;
  }

  // some additional documentation/types

  /**
   * The expansion of a simple `RegExp` literal to support additional properties.
   *
   * @typedef GrammarToken
   * @property {RegExp} pattern The regular expression of the token.
   * @property {boolean} [lookbehind=false] If `true`, then the first capturing group of `pattern` will (effectively)
   * behave as a lookbehind group meaning that the captured text will not be part of the matched text of the new token.
   * @property {boolean} [greedy=false] Whether the token is greedy.
   * @property {string|string[]} [alias] An optional alias or list of aliases.
   * @property {Grammar} [inside] The nested grammar of this token.
   *
   * The `inside` grammar will be used to tokenize the text value of each token of this kind.
   *
   * This can be used to make nested and even recursive language definitions.
   *
   * Note: This can cause infinite recursion. Be careful when you embed different languages or even the same language into
   * each another.
   * @global
   * @public
  */

  /**
   * @typedef Grammar
   * @type {Object<string, RegExp | GrammarToken | Array<RegExp | GrammarToken>>}
   * @property {Grammar} [rest] An optional grammar object that will be appended to this grammar.
   * @global
   * @public
   */

  /**
   * A function which will invoked after an element was successfully highlighted.
   *
   * @callback HighlightCallback
   * @param {Element} element The element successfully highlighted.
   * @returns {void}
   * @global
   * @public
  */

  /**
   * @callback HookCallback
   * @param {Object<string, any>} env The environment variables of the hook.
   * @returns {void}
   * @global
   * @public
   */


  /* **********************************************
       Begin prism-markup.js
  ********************************************** */

  Prism.languages.markup = {
  	'comment': /<!--[\s\S]*?-->/,
  	'prolog': /<\?[\s\S]+?\?>/,
  	'doctype': {
  		// https://www.w3.org/TR/xml/#NT-doctypedecl
  		pattern: /<!DOCTYPE(?:[^>"'[\]]|"[^"]*"|'[^']*')+(?:\[(?:[^<"'\]]|"[^"]*"|'[^']*'|<(?!!--)|<!--(?:[^-]|-(?!->))*-->)*\]\s*)?>/i,
  		greedy: true,
  		inside: {
  			'internal-subset': {
  				pattern: /(\[)[\s\S]+(?=\]>$)/,
  				lookbehind: true,
  				greedy: true,
  				inside: null // see below
  			},
  			'string': {
  				pattern: /"[^"]*"|'[^']*'/,
  				greedy: true
  			},
  			'punctuation': /^<!|>$|[[\]]/,
  			'doctype-tag': /^DOCTYPE/,
  			'name': /[^\s<>'"]+/
  		}
  	},
  	'cdata': /<!\[CDATA\[[\s\S]*?]]>/i,
  	'tag': {
  		pattern: /<\/?(?!\d)[^\s>\/=$<%]+(?:\s(?:\s*[^\s>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s'">=]+(?=[\s>]))|(?=[\s/>])))+)?\s*\/?>/,
  		greedy: true,
  		inside: {
  			'tag': {
  				pattern: /^<\/?[^\s>\/]+/,
  				inside: {
  					'punctuation': /^<\/?/,
  					'namespace': /^[^\s>\/:]+:/
  				}
  			},
  			'attr-value': {
  				pattern: /=\s*(?:"[^"]*"|'[^']*'|[^\s'">=]+)/,
  				inside: {
  					'punctuation': [
  						{
  							pattern: /^=/,
  							alias: 'attr-equals'
  						},
  						/"|'/
  					]
  				}
  			},
  			'punctuation': /\/?>/,
  			'attr-name': {
  				pattern: /[^\s>\/]+/,
  				inside: {
  					'namespace': /^[^\s>\/:]+:/
  				}
  			}

  		}
  	},
  	'entity': [
  		{
  			pattern: /&[\da-z]{1,8};/i,
  			alias: 'named-entity'
  		},
  		/&#x?[\da-f]{1,8};/i
  	]
  };

  Prism.languages.markup['tag'].inside['attr-value'].inside['entity'] =
  	Prism.languages.markup['entity'];
  Prism.languages.markup['doctype'].inside['internal-subset'].inside = Prism.languages.markup;

  // Plugin to make entity title show the real entity, idea by Roman Komarov
  Prism.hooks.add('wrap', function (env) {

  	if (env.type === 'entity') {
  		env.attributes['title'] = env.content.replace(/&amp;/, '&');
  	}
  });

  Object.defineProperty(Prism.languages.markup.tag, 'addInlined', {
  	/**
  	 * Adds an inlined language to markup.
  	 *
  	 * An example of an inlined language is CSS with `<style>` tags.
  	 *
  	 * @param {string} tagName The name of the tag that contains the inlined language. This name will be treated as
  	 * case insensitive.
  	 * @param {string} lang The language key.
  	 * @example
  	 * addInlined('style', 'css');
  	 */
  	value: function addInlined(tagName, lang) {
  		var includedCdataInside = {};
  		includedCdataInside['language-' + lang] = {
  			pattern: /(^<!\[CDATA\[)[\s\S]+?(?=\]\]>$)/i,
  			lookbehind: true,
  			inside: Prism.languages[lang]
  		};
  		includedCdataInside['cdata'] = /^<!\[CDATA\[|\]\]>$/i;

  		var inside = {
  			'included-cdata': {
  				pattern: /<!\[CDATA\[[\s\S]*?\]\]>/i,
  				inside: includedCdataInside
  			}
  		};
  		inside['language-' + lang] = {
  			pattern: /[\s\S]+/,
  			inside: Prism.languages[lang]
  		};

  		var def = {};
  		def[tagName] = {
  			pattern: RegExp(/(<__[^>]*>)(?:<!\[CDATA\[(?:[^\]]|\](?!\]>))*\]\]>|(?!<!\[CDATA\[)[\s\S])*?(?=<\/__>)/.source.replace(/__/g, function () { return tagName; }), 'i'),
  			lookbehind: true,
  			greedy: true,
  			inside: inside
  		};

  		Prism.languages.insertBefore('markup', 'cdata', def);
  	}
  });

  Prism.languages.html = Prism.languages.markup;
  Prism.languages.mathml = Prism.languages.markup;
  Prism.languages.svg = Prism.languages.markup;

  Prism.languages.xml = Prism.languages.extend('markup', {});
  Prism.languages.ssml = Prism.languages.xml;
  Prism.languages.atom = Prism.languages.xml;
  Prism.languages.rss = Prism.languages.xml;


  /* **********************************************
       Begin prism-css.js
  ********************************************** */

  (function (Prism) {

  	var string = /("|')(?:\\(?:\r\n|[\s\S])|(?!\1)[^\\\r\n])*\1/;

  	Prism.languages.css = {
  		'comment': /\/\*[\s\S]*?\*\//,
  		'atrule': {
  			pattern: /@[\w-](?:[^;{\s]|\s+(?![\s{]))*(?:;|(?=\s*\{))/,
  			inside: {
  				'rule': /^@[\w-]+/,
  				'selector-function-argument': {
  					pattern: /(\bselector\s*\(\s*(?![\s)]))(?:[^()\s]|\s+(?![\s)])|\((?:[^()]|\([^()]*\))*\))+(?=\s*\))/,
  					lookbehind: true,
  					alias: 'selector'
  				},
  				'keyword': {
  					pattern: /(^|[^\w-])(?:and|not|only|or)(?![\w-])/,
  					lookbehind: true
  				}
  				// See rest below
  			}
  		},
  		'url': {
  			// https://drafts.csswg.org/css-values-3/#urls
  			pattern: RegExp('\\burl\\((?:' + string.source + '|' + /(?:[^\\\r\n()"']|\\[\s\S])*/.source + ')\\)', 'i'),
  			greedy: true,
  			inside: {
  				'function': /^url/i,
  				'punctuation': /^\(|\)$/,
  				'string': {
  					pattern: RegExp('^' + string.source + '$'),
  					alias: 'url'
  				}
  			}
  		},
  		'selector': RegExp('[^{}\\s](?:[^{};"\'\\s]|\\s+(?![\\s{])|' + string.source + ')*(?=\\s*\\{)'),
  		'string': {
  			pattern: string,
  			greedy: true
  		},
  		'property': /(?!\s)[-_a-z\xA0-\uFFFF](?:(?!\s)[-\w\xA0-\uFFFF])*(?=\s*:)/i,
  		'important': /!important\b/i,
  		'function': /[-a-z0-9]+(?=\()/i,
  		'punctuation': /[(){};:,]/
  	};

  	Prism.languages.css['atrule'].inside.rest = Prism.languages.css;

  	var markup = Prism.languages.markup;
  	if (markup) {
  		markup.tag.addInlined('style', 'css');

  		Prism.languages.insertBefore('inside', 'attr-value', {
  			'style-attr': {
  				pattern: /(^|["'\s])style\s*=\s*(?:"[^"]*"|'[^']*')/i,
  				lookbehind: true,
  				inside: {
  					'attr-value': {
  						pattern: /=\s*(?:"[^"]*"|'[^']*'|[^\s'">=]+)/,
  						inside: {
  							'style': {
  								pattern: /(["'])[\s\S]+(?=["']$)/,
  								lookbehind: true,
  								alias: 'language-css',
  								inside: Prism.languages.css
  							},
  							'punctuation': [
  								{
  									pattern: /^=/,
  									alias: 'attr-equals'
  								},
  								/"|'/
  							]
  						}
  					},
  					'attr-name': /^style/i
  				}
  			}
  		}, markup.tag);
  	}

  }(Prism));


  /* **********************************************
       Begin prism-clike.js
  ********************************************** */

  Prism.languages.clike = {
  	'comment': [
  		{
  			pattern: /(^|[^\\])\/\*[\s\S]*?(?:\*\/|$)/,
  			lookbehind: true,
  			greedy: true
  		},
  		{
  			pattern: /(^|[^\\:])\/\/.*/,
  			lookbehind: true,
  			greedy: true
  		}
  	],
  	'string': {
  		pattern: /(["'])(?:\\(?:\r\n|[\s\S])|(?!\1)[^\\\r\n])*\1/,
  		greedy: true
  	},
  	'class-name': {
  		pattern: /(\b(?:class|interface|extends|implements|trait|instanceof|new)\s+|\bcatch\s+\()[\w.\\]+/i,
  		lookbehind: true,
  		inside: {
  			'punctuation': /[.\\]/
  		}
  	},
  	'keyword': /\b(?:if|else|while|do|for|return|in|instanceof|function|new|try|throw|catch|finally|null|break|continue)\b/,
  	'boolean': /\b(?:true|false)\b/,
  	'function': /\w+(?=\()/,
  	'number': /\b0x[\da-f]+\b|(?:\b\d+(?:\.\d*)?|\B\.\d+)(?:e[+-]?\d+)?/i,
  	'operator': /[<>]=?|[!=]=?=?|--?|\+\+?|&&?|\|\|?|[?*/~^%]/,
  	'punctuation': /[{}[\];(),.:]/
  };


  /* **********************************************
       Begin prism-javascript.js
  ********************************************** */

  Prism.languages.javascript = Prism.languages.extend('clike', {
  	'class-name': [
  		Prism.languages.clike['class-name'],
  		{
  			pattern: /(^|[^$\w\xA0-\uFFFF])(?!\s)[_$A-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*(?=\.(?:prototype|constructor))/,
  			lookbehind: true
  		}
  	],
  	'keyword': [
  		{
  			pattern: /((?:^|})\s*)(?:catch|finally)\b/,
  			lookbehind: true
  		},
  		{
  			pattern: /(^|[^.]|\.\.\.\s*)\b(?:as|async(?=\s*(?:function\b|\(|[$\w\xA0-\uFFFF]|$))|await|break|case|class|const|continue|debugger|default|delete|do|else|enum|export|extends|for|from|function|(?:get|set)(?=\s*[\[$\w\xA0-\uFFFF])|if|implements|import|in|instanceof|interface|let|new|null|of|package|private|protected|public|return|static|super|switch|this|throw|try|typeof|undefined|var|void|while|with|yield)\b/,
  			lookbehind: true
  		},
  	],
  	// Allow for all non-ASCII characters (See http://stackoverflow.com/a/2008444)
  	'function': /#?(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*(?=\s*(?:\.\s*(?:apply|bind|call)\s*)?\()/,
  	'number': /\b(?:(?:0[xX](?:[\dA-Fa-f](?:_[\dA-Fa-f])?)+|0[bB](?:[01](?:_[01])?)+|0[oO](?:[0-7](?:_[0-7])?)+)n?|(?:\d(?:_\d)?)+n|NaN|Infinity)\b|(?:\b(?:\d(?:_\d)?)+\.?(?:\d(?:_\d)?)*|\B\.(?:\d(?:_\d)?)+)(?:[Ee][+-]?(?:\d(?:_\d)?)+)?/,
  	'operator': /--|\+\+|\*\*=?|=>|&&=?|\|\|=?|[!=]==|<<=?|>>>?=?|[-+*/%&|^!=<>]=?|\.{3}|\?\?=?|\?\.?|[~:]/
  });

  Prism.languages.javascript['class-name'][0].pattern = /(\b(?:class|interface|extends|implements|instanceof|new)\s+)[\w.\\]+/;

  Prism.languages.insertBefore('javascript', 'keyword', {
  	'regex': {
  		pattern: /((?:^|[^$\w\xA0-\uFFFF."'\])\s]|\b(?:return|yield))\s*)\/(?:\[(?:[^\]\\\r\n]|\\.)*]|\\.|[^/\\\[\r\n])+\/[gimyus]{0,6}(?=(?:\s|\/\*(?:[^*]|\*(?!\/))*\*\/)*(?:$|[\r\n,.;:})\]]|\/\/))/,
  		lookbehind: true,
  		greedy: true,
  		inside: {
  			'regex-source': {
  				pattern: /^(\/)[\s\S]+(?=\/[a-z]*$)/,
  				lookbehind: true,
  				alias: 'language-regex',
  				inside: Prism.languages.regex
  			},
  			'regex-flags': /[a-z]+$/,
  			'regex-delimiter': /^\/|\/$/
  		}
  	},
  	// This must be declared before keyword because we use "function" inside the look-forward
  	'function-variable': {
  		pattern: /#?(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*(?=\s*[=:]\s*(?:async\s*)?(?:\bfunction\b|(?:\((?:[^()]|\([^()]*\))*\)|(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*)\s*=>))/,
  		alias: 'function'
  	},
  	'parameter': [
  		{
  			pattern: /(function(?:\s+(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*)?\s*\(\s*)(?!\s)(?:[^()\s]|\s+(?![\s)])|\([^()]*\))+(?=\s*\))/,
  			lookbehind: true,
  			inside: Prism.languages.javascript
  		},
  		{
  			pattern: /(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*(?=\s*=>)/i,
  			inside: Prism.languages.javascript
  		},
  		{
  			pattern: /(\(\s*)(?!\s)(?:[^()\s]|\s+(?![\s)])|\([^()]*\))+(?=\s*\)\s*=>)/,
  			lookbehind: true,
  			inside: Prism.languages.javascript
  		},
  		{
  			pattern: /((?:\b|\s|^)(?!(?:as|async|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|enum|export|extends|finally|for|from|function|get|if|implements|import|in|instanceof|interface|let|new|null|of|package|private|protected|public|return|set|static|super|switch|this|throw|try|typeof|undefined|var|void|while|with|yield)(?![$\w\xA0-\uFFFF]))(?:(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*\s*)\(\s*|\]\s*\(\s*)(?!\s)(?:[^()\s]|\s+(?![\s)])|\([^()]*\))+(?=\s*\)\s*\{)/,
  			lookbehind: true,
  			inside: Prism.languages.javascript
  		}
  	],
  	'constant': /\b[A-Z](?:[A-Z_]|\dx?)*\b/
  });

  Prism.languages.insertBefore('javascript', 'string', {
  	'template-string': {
  		pattern: /`(?:\\[\s\S]|\${(?:[^{}]|{(?:[^{}]|{[^}]*})*})+}|(?!\${)[^\\`])*`/,
  		greedy: true,
  		inside: {
  			'template-punctuation': {
  				pattern: /^`|`$/,
  				alias: 'string'
  			},
  			'interpolation': {
  				pattern: /((?:^|[^\\])(?:\\{2})*)\${(?:[^{}]|{(?:[^{}]|{[^}]*})*})+}/,
  				lookbehind: true,
  				inside: {
  					'interpolation-punctuation': {
  						pattern: /^\${|}$/,
  						alias: 'punctuation'
  					},
  					rest: Prism.languages.javascript
  				}
  			},
  			'string': /[\s\S]+/
  		}
  	}
  });

  if (Prism.languages.markup) {
  	Prism.languages.markup.tag.addInlined('script', 'javascript');
  }

  Prism.languages.js = Prism.languages.javascript;


  /* **********************************************
       Begin prism-file-highlight.js
  ********************************************** */

  (function () {
  	if (typeof self === 'undefined' || !self.Prism || !self.document) {
  		return;
  	}

  	// https://developer.mozilla.org/en-US/docs/Web/API/Element/matches#Polyfill
  	if (!Element.prototype.matches) {
  		Element.prototype.matches = Element.prototype.msMatchesSelector || Element.prototype.webkitMatchesSelector;
  	}

  	var Prism = window.Prism;

  	var LOADING_MESSAGE = 'Loading…';
  	var FAILURE_MESSAGE = function (status, message) {
  		return '✖ Error ' + status + ' while fetching file: ' + message;
  	};
  	var FAILURE_EMPTY_MESSAGE = '✖ Error: File does not exist or is empty';

  	var EXTENSIONS = {
  		'js': 'javascript',
  		'py': 'python',
  		'rb': 'ruby',
  		'ps1': 'powershell',
  		'psm1': 'powershell',
  		'sh': 'bash',
  		'bat': 'batch',
  		'h': 'c',
  		'tex': 'latex'
  	};

  	var STATUS_ATTR = 'data-src-status';
  	var STATUS_LOADING = 'loading';
  	var STATUS_LOADED = 'loaded';
  	var STATUS_FAILED = 'failed';

  	var SELECTOR = 'pre[data-src]:not([' + STATUS_ATTR + '="' + STATUS_LOADED + '"])'
  		+ ':not([' + STATUS_ATTR + '="' + STATUS_LOADING + '"])';

  	var lang = /\blang(?:uage)?-([\w-]+)\b/i;

  	/**
  	 * Sets the Prism `language-xxxx` or `lang-xxxx` class to the given language.
  	 *
  	 * @param {HTMLElement} element
  	 * @param {string} language
  	 * @returns {void}
  	 */
  	function setLanguageClass(element, language) {
  		var className = element.className;
  		className = className.replace(lang, ' ') + ' language-' + language;
  		element.className = className.replace(/\s+/g, ' ').trim();
  	}


  	Prism.hooks.add('before-highlightall', function (env) {
  		env.selector += ', ' + SELECTOR;
  	});

  	Prism.hooks.add('before-sanity-check', function (env) {
  		var pre = /** @type {HTMLPreElement} */ (env.element);
  		if (pre.matches(SELECTOR)) {
  			env.code = ''; // fast-path the whole thing and go to complete

  			pre.setAttribute(STATUS_ATTR, STATUS_LOADING); // mark as loading

  			// add code element with loading message
  			var code = pre.appendChild(document.createElement('CODE'));
  			code.textContent = LOADING_MESSAGE;

  			var src = pre.getAttribute('data-src');

  			var language = env.language;
  			if (language === 'none') {
  				// the language might be 'none' because there is no language set;
  				// in this case, we want to use the extension as the language
  				var extension = (/\.(\w+)$/.exec(src) || [, 'none'])[1];
  				language = EXTENSIONS[extension] || extension;
  			}

  			// set language classes
  			setLanguageClass(code, language);
  			setLanguageClass(pre, language);

  			// preload the language
  			var autoloader = Prism.plugins.autoloader;
  			if (autoloader) {
  				autoloader.loadLanguages(language);
  			}

  			// load file
  			var xhr = new XMLHttpRequest();
  			xhr.open('GET', src, true);
  			xhr.onreadystatechange = function () {
  				if (xhr.readyState == 4) {
  					if (xhr.status < 400 && xhr.responseText) {
  						// mark as loaded
  						pre.setAttribute(STATUS_ATTR, STATUS_LOADED);

  						// highlight code
  						code.textContent = xhr.responseText;
  						Prism.highlightElement(code);

  					} else {
  						// mark as failed
  						pre.setAttribute(STATUS_ATTR, STATUS_FAILED);

  						if (xhr.status >= 400) {
  							code.textContent = FAILURE_MESSAGE(xhr.status, xhr.statusText);
  						} else {
  							code.textContent = FAILURE_EMPTY_MESSAGE;
  						}
  					}
  				}
  			};
  			xhr.send(null);
  		}
  	});

  	Prism.plugins.fileHighlight = {
  		/**
  		 * Executes the File Highlight plugin for all matching `pre` elements under the given container.
  		 *
  		 * Note: Elements which are already loaded or currently loading will not be touched by this method.
  		 *
  		 * @param {ParentNode} [container=document]
  		 */
  		highlight: function highlight(container) {
  			var elements = (container || document).querySelectorAll(SELECTOR);

  			for (var i = 0, element; element = elements[i++];) {
  				Prism.highlightElement(element);
  			}
  		}
  	};

  	var logged = false;
  	/** @deprecated Use `Prism.plugins.fileHighlight.highlight` instead. */
  	Prism.fileHighlight = function () {
  		if (!logged) {
  			console.warn('Prism.fileHighlight is deprecated. Use `Prism.plugins.fileHighlight.highlight` instead.');
  			logged = true;
  		}
  		Prism.plugins.fileHighlight.highlight.apply(this, arguments);
  	};

  })();
  });

  (function(){
  	if (typeof self === 'undefined' || !self.Prism || !self.document) {
  		return;
  	}

  	var callbacks = [];
  	var map = {};
  	var noop = function() {};

  	Prism.plugins.toolbar = {};

  	/**
  	 * @typedef ButtonOptions
  	 * @property {string} text The text displayed.
  	 * @property {string} [url] The URL of the link which will be created.
  	 * @property {Function} [onClick] The event listener for the `click` event of the created button.
  	 * @property {string} [className] The class attribute to include with element.
  	 */

  	/**
  	 * Register a button callback with the toolbar.
  	 *
  	 * @param {string} key
  	 * @param {ButtonOptions|Function} opts
  	 */
  	var registerButton = Prism.plugins.toolbar.registerButton = function (key, opts) {
  		var callback;

  		if (typeof opts === 'function') {
  			callback = opts;
  		} else {
  			callback = function (env) {
  				var element;

  				if (typeof opts.onClick === 'function') {
  					element = document.createElement('button');
  					element.type = 'button';
  					element.addEventListener('click', function () {
  						opts.onClick.call(this, env);
  					});
  				} else if (typeof opts.url === 'string') {
  					element = document.createElement('a');
  					element.href = opts.url;
  				} else {
  					element = document.createElement('span');
  				}

  				if (opts.className) {
  					element.classList.add(opts.className);
  				}

  				element.textContent = opts.text;

  				return element;
  			};
  		}

  		if (key in map) {
  			console.warn('There is a button with the key "' + key + '" registered already.');
  			return;
  		}

  		callbacks.push(map[key] = callback);
  	};

  	/**
  	 * Returns the callback order of the given element.
  	 *
  	 * @param {HTMLElement} element
  	 * @returns {string[] | undefined}
  	 */
  	function getOrder(element) {
  		while (element) {
  			var order = element.getAttribute('data-toolbar-order');
  			if (order != null) {
  				order = order.trim();
  				if (order.length) {
  					return order.split(/\s*,\s*/g);
  				} else {
  					return [];
  				}
  			}
  			element = element.parentElement;
  		}
  	}

  	/**
  	 * Post-highlight Prism hook callback.
  	 *
  	 * @param env
  	 */
  	var hook = Prism.plugins.toolbar.hook = function (env) {
  		// Check if inline or actual code block (credit to line-numbers plugin)
  		var pre = env.element.parentNode;
  		if (!pre || !/pre/i.test(pre.nodeName)) {
  			return;
  		}

  		// Autoloader rehighlights, so only do this once.
  		if (pre.parentNode.classList.contains('code-toolbar')) {
  			return;
  		}

  		// Create wrapper for <pre> to prevent scrolling toolbar with content
  		var wrapper = document.createElement('div');
  		wrapper.classList.add('code-toolbar');
  		pre.parentNode.insertBefore(wrapper, pre);
  		wrapper.appendChild(pre);

  		// Setup the toolbar
  		var toolbar = document.createElement('div');
  		toolbar.classList.add('toolbar');

  		// order callbacks
  		var elementCallbacks = callbacks;
  		var order = getOrder(env.element);
  		if (order) {
  			elementCallbacks = order.map(function (key) {
  				return map[key] || noop;
  			});
  		}

  		elementCallbacks.forEach(function(callback) {
  			var element = callback(env);

  			if (!element) {
  				return;
  			}

  			var item = document.createElement('div');
  			item.classList.add('toolbar-item');

  			item.appendChild(element);
  			toolbar.appendChild(item);
  		});

  		// Add our toolbar to the currently created wrapper of <pre> tag
  		wrapper.appendChild(toolbar);
  	};

  	registerButton('label', function(env) {
  		var pre = env.element.parentNode;
  		if (!pre || !/pre/i.test(pre.nodeName)) {
  			return;
  		}

  		if (!pre.hasAttribute('data-label')) {
  			return;
  		}

  		var element, template;
  		var text = pre.getAttribute('data-label');
  		try {
  			// Any normal text will blow up this selector.
  			template = document.querySelector('template#' + text);
  		} catch (e) {}

  		if (template) {
  			element = template.content;
  		} else {
  			if (pre.hasAttribute('data-url')) {
  				element = document.createElement('a');
  				element.href = pre.getAttribute('data-url');
  			} else {
  				element = document.createElement('span');
  			}

  			element.textContent = text;
  		}

  		return element;
  	});

  	/**
  	 * Register the toolbar with Prism.
  	 */
  	Prism.hooks.add('complete', hook);
  })();

  (function(){
  	if (typeof self === 'undefined' || !self.Prism || !self.document) {
  		return;
  	}

  	if (!Prism.plugins.toolbar) {
  		console.warn('Copy to Clipboard plugin loaded before Toolbar plugin.');

  		return;
  	}

  	var ClipboardJS = window.ClipboardJS || undefined;

  	if (!ClipboardJS && typeof commonjsRequire === 'function') {
  		ClipboardJS = clipboard;
  	}

  	var callbacks = [];

  	if (!ClipboardJS) {
  		var script = document.createElement('script');
  		var head = document.querySelector('head');

  		script.onload = function() {
  			ClipboardJS = window.ClipboardJS;

  			if (ClipboardJS) {
  				while (callbacks.length) {
  					callbacks.pop()();
  				}
  			}
  		};

  		script.src = 'https://cdnjs.cloudflare.com/ajax/libs/clipboard.js/2.0.0/clipboard.min.js';
  		head.appendChild(script);
  	}

  	Prism.plugins.toolbar.registerButton('copy-to-clipboard', function (env) {
  		var linkCopy = document.createElement('button');
  		linkCopy.textContent = 'Copy';
  		linkCopy.setAttribute('type', 'button');

  		var element = env.element;

  		if (!ClipboardJS) {
  			callbacks.push(registerClipboard);
  		} else {
  			registerClipboard();
  		}

  		return linkCopy;

  		function registerClipboard() {
  			var clip = new ClipboardJS(linkCopy, {
  				'text': function () {
  					return element.textContent;
  				}
  			});

  			clip.on('success', function() {
  				linkCopy.textContent = 'Copied!';

  				resetText();
  			});
  			clip.on('error', function () {
  				linkCopy.textContent = 'Press Ctrl+C to copy';

  				resetText();
  			});
  		}

  		function resetText() {
  			setTimeout(function () {
  				linkCopy.textContent = 'Copy';
  			}, 5000);
  		}
  	});
  })();

  (function(){

  if (
  	typeof self !== 'undefined' && !self.Prism ||
  	typeof commonjsGlobal !== 'undefined' && !commonjsGlobal.Prism
  ) {
  	return;
  }

  var url = /\b([a-z]{3,7}:\/\/|tel:)[\w\-+%~/.:=&@]+(?:\?[\w\-+%~/.:=?&!$'()*,;@]*)?(?:#[\w\-+%~/.:#=?&!$'()*,;@]*)?/,
      email = /\b\S+@[\w.]+[a-z]{2}/,
      linkMd = /\[([^\]]+)]\(([^)]+)\)/,

  	// Tokens that may contain URLs and emails
      candidates = ['comment', 'url', 'attr-value', 'string'];

  Prism.plugins.autolinker = {
  	processGrammar: function (grammar) {
  		// Abort if grammar has already been processed
  		if (!grammar || grammar['url-link']) {
  			return;
  		}
  		Prism.languages.DFS(grammar, function (key, def, type) {
  			if (candidates.indexOf(type) > -1 && !Array.isArray(def)) {
  				if (!def.pattern) {
  					def = this[key] = {
  						pattern: def
  					};
  				}

  				def.inside = def.inside || {};

  				if (type == 'comment') {
  					def.inside['md-link'] = linkMd;
  				}
  				if (type == 'attr-value') {
  					Prism.languages.insertBefore('inside', 'punctuation', { 'url-link': url }, def);
  				}
  				else {
  					def.inside['url-link'] = url;
  				}

  				def.inside['email-link'] = email;
  			}
  		});
  		grammar['url-link'] = url;
  		grammar['email-link'] = email;
  	}
  };

  Prism.hooks.add('before-highlight', function(env) {
  	Prism.plugins.autolinker.processGrammar(env.grammar);
  });

  Prism.hooks.add('wrap', function(env) {
  	if (/-link$/.test(env.type)) {
  		env.tag = 'a';

  		var href = env.content;

  		if (env.type == 'email-link' && href.indexOf('mailto:') != 0) {
  			href = 'mailto:' + href;
  		}
  		else if (env.type == 'md-link') {
  			// Markdown
  			var match = env.content.match(linkMd);

  			href = match[2];
  			env.content = match[1];
  		}

  		env.attributes.href = href;

  		// Silently catch any error thrown by decodeURIComponent (#1186)
  		try {
  			env.content = decodeURIComponent(env.content);
  		} catch(e) {}
  	}
  });

  })();

  var EventEmitter$3 = events.EventEmitter;




  var Parser$2 = function (options) {
    EventEmitter$3.call(this);

    var ParserInterface = this.Parser = (options && options.Parser) || this.DefaultParser;
    var ElementInterface = this.Element = (options && options.Element) || this.DefaultElement;

    this.parser = new ParserInterface();

    var el;
    var self = this;
    this.parser.on('startElement', function (name, attrs) {
      var child = new ElementInterface(name, attrs);
      if (!el) {
        el = child;
      } else {
        el = el.cnode(child);
      }
    });
    this.parser.on('endElement', function (name) {
      if (!el) ; else if (name === el.name) {
        if (el.parent) {
          el = el.parent;
        } else if (!self.tree) {
          self.tree = el;
          el = undefined;
        }
      }
    });
    this.parser.on('text', function (str) {
      if (el) {
        el.t(str);
      }
    });
    this.parser.on('error', function (e) {
      self.error = e;
      self.emit('error', e);
    });
  };

  inherits_browser(Parser$2, EventEmitter$3);

  Parser$2.prototype.DefaultParser = ltx;

  Parser$2.prototype.DefaultElement = Element_1;

  Parser$2.prototype.write = function (data) {
    this.parser.write(data);
  };

  Parser$2.prototype.end = function (data) {
    this.parser.end(data);

    if (!this.error) {
      if (this.tree) {
        this.emit('tree', this.tree);
      } else {
        this.emit('error', new Error('Incomplete document'));
      }
    }
  };

  var Parser_1$1 = Parser$2;

  var parse$2 = function parse (data, options) {
    var p;
    if (typeof options === 'function') {
      p = new options(); // eslint-disable-line
    } else {
      p = new Parser_1$1(options);
    }

    var result = null;
    var error = null;

    p.on('tree', function (tree) {
      result = tree;
    });
    p.on('error', function (e) {
      error = e;
    });

    p.write(data);
    p.end();

    if (error) {
      throw error
    } else {
      return result
    }
  };

  /**
   * JSX compatible API, use this function as pragma
   * https://facebook.github.io/jsx/
   *
   * @param  {string} name  name of the element
   * @param  {object} attrs object of attribute key/value pairs
   * @return {Element}      Element
   */
  var createElement = function createElement (name, attrs /*, child1, child2, ... */) {
    var el = new Element_1(name, attrs);

    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child) el.cnode(child);
    }

    return el
  };

  var escape = _escape$1.escapeXML;

  var tagString = function tagString (/* [literals], ...substitutions */) {
    var literals = arguments[0];

    var str = '';

    for (var i = 1; i < arguments.length; i++) {
      str += literals[i - 1];
      str += escape(arguments[i]);
    }
    str += literals[literals.length - 1];

    return str
  };

  var tag = function tag (/* [literals], ...substitutions */) {
    return parse$2(tagString.apply(null, arguments))
  };

  var isNode = function is (el) {
    return el instanceof Element_1 || typeof el === 'string'
  };

  var isElement = function isElement (el) {
    return el instanceof Element_1
  };

  var isText = function isText (el) {
    return typeof el === 'string'
  };

  var is = {
  	isNode: isNode,
  	isElement: isElement,
  	isText: isText
  };

  function stringify (el, indent, level) {
    if (typeof indent === 'number') indent = ' '.repeat(indent);
    if (!level) level = 1;
    var s = '';
    s += '<' + el.name;

    Object.keys(el.attrs).forEach(function (k) {
      s += ' ' + k + '=' + '"' + el.attrs[k] + '"';
    });

    if (el.children.length) {
      s += '>';
      el.children.forEach(function (child, i) {
        if (indent) s += '\n' + indent.repeat(level);
        if (typeof child === 'string') {
          s += child;
        } else {
          s += stringify(child, indent, level + 1);
        }
      });
      if (indent) s += '\n' + indent.repeat(level - 1);
      s += '</' + el.name + '>';
    } else {
      s += '/>';
    }

    return s
  }

  var stringify_1 = stringify;

  var ltx$1 = createCommonjsModule(function (module, exports) {













  exports = module.exports = function ltx () {
    return tag.apply(null, arguments)
  };

  exports.Element = Element_1;

  exports.equal = equal_1.equal;
  exports.nameEqual = equal_1.name;
  exports.attrsEqual = equal_1.attrs;
  exports.childrenEqual = equal_1.children;

  exports.isNode = is.isNode;
  exports.isElement = is.isElement;
  exports.isText = is.isText;

  exports.clone = clone;
  exports.createElement = createElement;

  exports.escapeXML = _escape$1.escapeXML;
  exports.unescapeXML = _escape$1.unescapeXML;
  exports.escapeXMLText = _escape$1.escapeXMLText;
  exports.unescapeXMLText = _escape$1.unescapeXMLText;

  exports.Parser = Parser_1$1;
  exports.parse = parse$2;

  exports.tag = tag;
  exports.tagString = tagString;

  exports.stringify = stringify_1;
  });

  class Console extends events {
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
          el = ltx$1.parse(frag);
        } catch (err) {
          return frag;
        }
      } else {
        el = frag;
      }
      return ltx$1.stringify(el, "  ");
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
        return ltx$1.parse(str);
      } catch (err) {
        return str;
      }
    }

    send(data) {
      let el;
      try {
        el = ltx$1.parse(data);
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

  var codemirror = createCommonjsModule(function (module, exports) {
  // CodeMirror, copyright (c) by Marijn Haverbeke and others
  // Distributed under an MIT license: https://codemirror.net/LICENSE

  // This is CodeMirror (https://codemirror.net), a code editor
  // implemented in JavaScript on top of the browser's DOM.
  //
  // You can find some technical background for some of the code below
  // at http://marijnhaverbeke.nl/blog/#cm-internals .

  (function (global, factory) {
     module.exports = factory() ;
  }(commonjsGlobal, (function () {
    // Kludges for bugs and behavior differences that can't be feature
    // detected are enabled based on userAgent etc sniffing.
    var userAgent = navigator.userAgent;
    var platform = navigator.platform;

    var gecko = /gecko\/\d/i.test(userAgent);
    var ie_upto10 = /MSIE \d/.test(userAgent);
    var ie_11up = /Trident\/(?:[7-9]|\d{2,})\..*rv:(\d+)/.exec(userAgent);
    var edge = /Edge\/(\d+)/.exec(userAgent);
    var ie = ie_upto10 || ie_11up || edge;
    var ie_version = ie && (ie_upto10 ? document.documentMode || 6 : +(edge || ie_11up)[1]);
    var webkit = !edge && /WebKit\//.test(userAgent);
    var qtwebkit = webkit && /Qt\/\d+\.\d+/.test(userAgent);
    var chrome = !edge && /Chrome\//.test(userAgent);
    var presto = /Opera\//.test(userAgent);
    var safari = /Apple Computer/.test(navigator.vendor);
    var mac_geMountainLion = /Mac OS X 1\d\D([8-9]|\d\d)\D/.test(userAgent);
    var phantom = /PhantomJS/.test(userAgent);

    var ios = safari && (/Mobile\/\w+/.test(userAgent) || navigator.maxTouchPoints > 2);
    var android = /Android/.test(userAgent);
    // This is woefully incomplete. Suggestions for alternative methods welcome.
    var mobile = ios || android || /webOS|BlackBerry|Opera Mini|Opera Mobi|IEMobile/i.test(userAgent);
    var mac = ios || /Mac/.test(platform);
    var chromeOS = /\bCrOS\b/.test(userAgent);
    var windows = /win/i.test(platform);

    var presto_version = presto && userAgent.match(/Version\/(\d*\.\d*)/);
    if (presto_version) { presto_version = Number(presto_version[1]); }
    if (presto_version && presto_version >= 15) { presto = false; webkit = true; }
    // Some browsers use the wrong event properties to signal cmd/ctrl on OS X
    var flipCtrlCmd = mac && (qtwebkit || presto && (presto_version == null || presto_version < 12.11));
    var captureRightClick = gecko || (ie && ie_version >= 9);

    function classTest(cls) { return new RegExp("(^|\\s)" + cls + "(?:$|\\s)\\s*") }

    var rmClass = function(node, cls) {
      var current = node.className;
      var match = classTest(cls).exec(current);
      if (match) {
        var after = current.slice(match.index + match[0].length);
        node.className = current.slice(0, match.index) + (after ? match[1] + after : "");
      }
    };

    function removeChildren(e) {
      for (var count = e.childNodes.length; count > 0; --count)
        { e.removeChild(e.firstChild); }
      return e
    }

    function removeChildrenAndAdd(parent, e) {
      return removeChildren(parent).appendChild(e)
    }

    function elt(tag, content, className, style) {
      var e = document.createElement(tag);
      if (className) { e.className = className; }
      if (style) { e.style.cssText = style; }
      if (typeof content == "string") { e.appendChild(document.createTextNode(content)); }
      else if (content) { for (var i = 0; i < content.length; ++i) { e.appendChild(content[i]); } }
      return e
    }
    // wrapper for elt, which removes the elt from the accessibility tree
    function eltP(tag, content, className, style) {
      var e = elt(tag, content, className, style);
      e.setAttribute("role", "presentation");
      return e
    }

    var range;
    if (document.createRange) { range = function(node, start, end, endNode) {
      var r = document.createRange();
      r.setEnd(endNode || node, end);
      r.setStart(node, start);
      return r
    }; }
    else { range = function(node, start, end) {
      var r = document.body.createTextRange();
      try { r.moveToElementText(node.parentNode); }
      catch(e) { return r }
      r.collapse(true);
      r.moveEnd("character", end);
      r.moveStart("character", start);
      return r
    }; }

    function contains(parent, child) {
      if (child.nodeType == 3) // Android browser always returns false when child is a textnode
        { child = child.parentNode; }
      if (parent.contains)
        { return parent.contains(child) }
      do {
        if (child.nodeType == 11) { child = child.host; }
        if (child == parent) { return true }
      } while (child = child.parentNode)
    }

    function activeElt() {
      // IE and Edge may throw an "Unspecified Error" when accessing document.activeElement.
      // IE < 10 will throw when accessed while the page is loading or in an iframe.
      // IE > 9 and Edge will throw when accessed in an iframe if document.body is unavailable.
      var activeElement;
      try {
        activeElement = document.activeElement;
      } catch(e) {
        activeElement = document.body || null;
      }
      while (activeElement && activeElement.shadowRoot && activeElement.shadowRoot.activeElement)
        { activeElement = activeElement.shadowRoot.activeElement; }
      return activeElement
    }

    function addClass(node, cls) {
      var current = node.className;
      if (!classTest(cls).test(current)) { node.className += (current ? " " : "") + cls; }
    }
    function joinClasses(a, b) {
      var as = a.split(" ");
      for (var i = 0; i < as.length; i++)
        { if (as[i] && !classTest(as[i]).test(b)) { b += " " + as[i]; } }
      return b
    }

    var selectInput = function(node) { node.select(); };
    if (ios) // Mobile Safari apparently has a bug where select() is broken.
      { selectInput = function(node) { node.selectionStart = 0; node.selectionEnd = node.value.length; }; }
    else if (ie) // Suppress mysterious IE10 errors
      { selectInput = function(node) { try { node.select(); } catch(_e) {} }; }

    function bind(f) {
      var args = Array.prototype.slice.call(arguments, 1);
      return function(){return f.apply(null, args)}
    }

    function copyObj(obj, target, overwrite) {
      if (!target) { target = {}; }
      for (var prop in obj)
        { if (obj.hasOwnProperty(prop) && (overwrite !== false || !target.hasOwnProperty(prop)))
          { target[prop] = obj[prop]; } }
      return target
    }

    // Counts the column offset in a string, taking tabs into account.
    // Used mostly to find indentation.
    function countColumn(string, end, tabSize, startIndex, startValue) {
      if (end == null) {
        end = string.search(/[^\s\u00a0]/);
        if (end == -1) { end = string.length; }
      }
      for (var i = startIndex || 0, n = startValue || 0;;) {
        var nextTab = string.indexOf("\t", i);
        if (nextTab < 0 || nextTab >= end)
          { return n + (end - i) }
        n += nextTab - i;
        n += tabSize - (n % tabSize);
        i = nextTab + 1;
      }
    }

    var Delayed = function() {
      this.id = null;
      this.f = null;
      this.time = 0;
      this.handler = bind(this.onTimeout, this);
    };
    Delayed.prototype.onTimeout = function (self) {
      self.id = 0;
      if (self.time <= +new Date) {
        self.f();
      } else {
        setTimeout(self.handler, self.time - +new Date);
      }
    };
    Delayed.prototype.set = function (ms, f) {
      this.f = f;
      var time = +new Date + ms;
      if (!this.id || time < this.time) {
        clearTimeout(this.id);
        this.id = setTimeout(this.handler, ms);
        this.time = time;
      }
    };

    function indexOf(array, elt) {
      for (var i = 0; i < array.length; ++i)
        { if (array[i] == elt) { return i } }
      return -1
    }

    // Number of pixels added to scroller and sizer to hide scrollbar
    var scrollerGap = 50;

    // Returned or thrown by various protocols to signal 'I'm not
    // handling this'.
    var Pass = {toString: function(){return "CodeMirror.Pass"}};

    // Reused option objects for setSelection & friends
    var sel_dontScroll = {scroll: false}, sel_mouse = {origin: "*mouse"}, sel_move = {origin: "+move"};

    // The inverse of countColumn -- find the offset that corresponds to
    // a particular column.
    function findColumn(string, goal, tabSize) {
      for (var pos = 0, col = 0;;) {
        var nextTab = string.indexOf("\t", pos);
        if (nextTab == -1) { nextTab = string.length; }
        var skipped = nextTab - pos;
        if (nextTab == string.length || col + skipped >= goal)
          { return pos + Math.min(skipped, goal - col) }
        col += nextTab - pos;
        col += tabSize - (col % tabSize);
        pos = nextTab + 1;
        if (col >= goal) { return pos }
      }
    }

    var spaceStrs = [""];
    function spaceStr(n) {
      while (spaceStrs.length <= n)
        { spaceStrs.push(lst(spaceStrs) + " "); }
      return spaceStrs[n]
    }

    function lst(arr) { return arr[arr.length-1] }

    function map(array, f) {
      var out = [];
      for (var i = 0; i < array.length; i++) { out[i] = f(array[i], i); }
      return out
    }

    function insertSorted(array, value, score) {
      var pos = 0, priority = score(value);
      while (pos < array.length && score(array[pos]) <= priority) { pos++; }
      array.splice(pos, 0, value);
    }

    function nothing() {}

    function createObj(base, props) {
      var inst;
      if (Object.create) {
        inst = Object.create(base);
      } else {
        nothing.prototype = base;
        inst = new nothing();
      }
      if (props) { copyObj(props, inst); }
      return inst
    }

    var nonASCIISingleCaseWordChar = /[\u00df\u0587\u0590-\u05f4\u0600-\u06ff\u3040-\u309f\u30a0-\u30ff\u3400-\u4db5\u4e00-\u9fcc\uac00-\ud7af]/;
    function isWordCharBasic(ch) {
      return /\w/.test(ch) || ch > "\x80" &&
        (ch.toUpperCase() != ch.toLowerCase() || nonASCIISingleCaseWordChar.test(ch))
    }
    function isWordChar(ch, helper) {
      if (!helper) { return isWordCharBasic(ch) }
      if (helper.source.indexOf("\\w") > -1 && isWordCharBasic(ch)) { return true }
      return helper.test(ch)
    }

    function isEmpty(obj) {
      for (var n in obj) { if (obj.hasOwnProperty(n) && obj[n]) { return false } }
      return true
    }

    // Extending unicode characters. A series of a non-extending char +
    // any number of extending chars is treated as a single unit as far
    // as editing and measuring is concerned. This is not fully correct,
    // since some scripts/fonts/browsers also treat other configurations
    // of code points as a group.
    var extendingChars = /[\u0300-\u036f\u0483-\u0489\u0591-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7\u0610-\u061a\u064b-\u065e\u0670\u06d6-\u06dc\u06de-\u06e4\u06e7\u06e8\u06ea-\u06ed\u0711\u0730-\u074a\u07a6-\u07b0\u07eb-\u07f3\u0816-\u0819\u081b-\u0823\u0825-\u0827\u0829-\u082d\u0900-\u0902\u093c\u0941-\u0948\u094d\u0951-\u0955\u0962\u0963\u0981\u09bc\u09be\u09c1-\u09c4\u09cd\u09d7\u09e2\u09e3\u0a01\u0a02\u0a3c\u0a41\u0a42\u0a47\u0a48\u0a4b-\u0a4d\u0a51\u0a70\u0a71\u0a75\u0a81\u0a82\u0abc\u0ac1-\u0ac5\u0ac7\u0ac8\u0acd\u0ae2\u0ae3\u0b01\u0b3c\u0b3e\u0b3f\u0b41-\u0b44\u0b4d\u0b56\u0b57\u0b62\u0b63\u0b82\u0bbe\u0bc0\u0bcd\u0bd7\u0c3e-\u0c40\u0c46-\u0c48\u0c4a-\u0c4d\u0c55\u0c56\u0c62\u0c63\u0cbc\u0cbf\u0cc2\u0cc6\u0ccc\u0ccd\u0cd5\u0cd6\u0ce2\u0ce3\u0d3e\u0d41-\u0d44\u0d4d\u0d57\u0d62\u0d63\u0dca\u0dcf\u0dd2-\u0dd4\u0dd6\u0ddf\u0e31\u0e34-\u0e3a\u0e47-\u0e4e\u0eb1\u0eb4-\u0eb9\u0ebb\u0ebc\u0ec8-\u0ecd\u0f18\u0f19\u0f35\u0f37\u0f39\u0f71-\u0f7e\u0f80-\u0f84\u0f86\u0f87\u0f90-\u0f97\u0f99-\u0fbc\u0fc6\u102d-\u1030\u1032-\u1037\u1039\u103a\u103d\u103e\u1058\u1059\u105e-\u1060\u1071-\u1074\u1082\u1085\u1086\u108d\u109d\u135f\u1712-\u1714\u1732-\u1734\u1752\u1753\u1772\u1773\u17b7-\u17bd\u17c6\u17c9-\u17d3\u17dd\u180b-\u180d\u18a9\u1920-\u1922\u1927\u1928\u1932\u1939-\u193b\u1a17\u1a18\u1a56\u1a58-\u1a5e\u1a60\u1a62\u1a65-\u1a6c\u1a73-\u1a7c\u1a7f\u1b00-\u1b03\u1b34\u1b36-\u1b3a\u1b3c\u1b42\u1b6b-\u1b73\u1b80\u1b81\u1ba2-\u1ba5\u1ba8\u1ba9\u1c2c-\u1c33\u1c36\u1c37\u1cd0-\u1cd2\u1cd4-\u1ce0\u1ce2-\u1ce8\u1ced\u1dc0-\u1de6\u1dfd-\u1dff\u200c\u200d\u20d0-\u20f0\u2cef-\u2cf1\u2de0-\u2dff\u302a-\u302f\u3099\u309a\ua66f-\ua672\ua67c\ua67d\ua6f0\ua6f1\ua802\ua806\ua80b\ua825\ua826\ua8c4\ua8e0-\ua8f1\ua926-\ua92d\ua947-\ua951\ua980-\ua982\ua9b3\ua9b6-\ua9b9\ua9bc\uaa29-\uaa2e\uaa31\uaa32\uaa35\uaa36\uaa43\uaa4c\uaab0\uaab2-\uaab4\uaab7\uaab8\uaabe\uaabf\uaac1\uabe5\uabe8\uabed\udc00-\udfff\ufb1e\ufe00-\ufe0f\ufe20-\ufe26\uff9e\uff9f]/;
    function isExtendingChar(ch) { return ch.charCodeAt(0) >= 768 && extendingChars.test(ch) }

    // Returns a number from the range [`0`; `str.length`] unless `pos` is outside that range.
    function skipExtendingChars(str, pos, dir) {
      while ((dir < 0 ? pos > 0 : pos < str.length) && isExtendingChar(str.charAt(pos))) { pos += dir; }
      return pos
    }

    // Returns the value from the range [`from`; `to`] that satisfies
    // `pred` and is closest to `from`. Assumes that at least `to`
    // satisfies `pred`. Supports `from` being greater than `to`.
    function findFirst(pred, from, to) {
      // At any point we are certain `to` satisfies `pred`, don't know
      // whether `from` does.
      var dir = from > to ? -1 : 1;
      for (;;) {
        if (from == to) { return from }
        var midF = (from + to) / 2, mid = dir < 0 ? Math.ceil(midF) : Math.floor(midF);
        if (mid == from) { return pred(mid) ? from : to }
        if (pred(mid)) { to = mid; }
        else { from = mid + dir; }
      }
    }

    // BIDI HELPERS

    function iterateBidiSections(order, from, to, f) {
      if (!order) { return f(from, to, "ltr", 0) }
      var found = false;
      for (var i = 0; i < order.length; ++i) {
        var part = order[i];
        if (part.from < to && part.to > from || from == to && part.to == from) {
          f(Math.max(part.from, from), Math.min(part.to, to), part.level == 1 ? "rtl" : "ltr", i);
          found = true;
        }
      }
      if (!found) { f(from, to, "ltr"); }
    }

    var bidiOther = null;
    function getBidiPartAt(order, ch, sticky) {
      var found;
      bidiOther = null;
      for (var i = 0; i < order.length; ++i) {
        var cur = order[i];
        if (cur.from < ch && cur.to > ch) { return i }
        if (cur.to == ch) {
          if (cur.from != cur.to && sticky == "before") { found = i; }
          else { bidiOther = i; }
        }
        if (cur.from == ch) {
          if (cur.from != cur.to && sticky != "before") { found = i; }
          else { bidiOther = i; }
        }
      }
      return found != null ? found : bidiOther
    }

    // Bidirectional ordering algorithm
    // See http://unicode.org/reports/tr9/tr9-13.html for the algorithm
    // that this (partially) implements.

    // One-char codes used for character types:
    // L (L):   Left-to-Right
    // R (R):   Right-to-Left
    // r (AL):  Right-to-Left Arabic
    // 1 (EN):  European Number
    // + (ES):  European Number Separator
    // % (ET):  European Number Terminator
    // n (AN):  Arabic Number
    // , (CS):  Common Number Separator
    // m (NSM): Non-Spacing Mark
    // b (BN):  Boundary Neutral
    // s (B):   Paragraph Separator
    // t (S):   Segment Separator
    // w (WS):  Whitespace
    // N (ON):  Other Neutrals

    // Returns null if characters are ordered as they appear
    // (left-to-right), or an array of sections ({from, to, level}
    // objects) in the order in which they occur visually.
    var bidiOrdering = (function() {
      // Character types for codepoints 0 to 0xff
      var lowTypes = "bbbbbbbbbtstwsbbbbbbbbbbbbbbssstwNN%%%NNNNNN,N,N1111111111NNNNNNNLLLLLLLLLLLLLLLLLLLLLLLLLLNNNNNNLLLLLLLLLLLLLLLLLLLLLLLLLLNNNNbbbbbbsbbbbbbbbbbbbbbbbbbbbbbbbbb,N%%%%NNNNLNNNNN%%11NLNNN1LNNNNNLLLLLLLLLLLLLLLLLLLLLLLNLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLN";
      // Character types for codepoints 0x600 to 0x6f9
      var arabicTypes = "nnnnnnNNr%%r,rNNmmmmmmmmmmmrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrmmmmmmmmmmmmmmmmmmmmmnnnnnnnnnn%nnrrrmrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrmmmmmmmnNmmmmmmrrmmNmmmmrr1111111111";
      function charType(code) {
        if (code <= 0xf7) { return lowTypes.charAt(code) }
        else if (0x590 <= code && code <= 0x5f4) { return "R" }
        else if (0x600 <= code && code <= 0x6f9) { return arabicTypes.charAt(code - 0x600) }
        else if (0x6ee <= code && code <= 0x8ac) { return "r" }
        else if (0x2000 <= code && code <= 0x200b) { return "w" }
        else if (code == 0x200c) { return "b" }
        else { return "L" }
      }

      var bidiRE = /[\u0590-\u05f4\u0600-\u06ff\u0700-\u08ac]/;
      var isNeutral = /[stwN]/, isStrong = /[LRr]/, countsAsLeft = /[Lb1n]/, countsAsNum = /[1n]/;

      function BidiSpan(level, from, to) {
        this.level = level;
        this.from = from; this.to = to;
      }

      return function(str, direction) {
        var outerType = direction == "ltr" ? "L" : "R";

        if (str.length == 0 || direction == "ltr" && !bidiRE.test(str)) { return false }
        var len = str.length, types = [];
        for (var i = 0; i < len; ++i)
          { types.push(charType(str.charCodeAt(i))); }

        // W1. Examine each non-spacing mark (NSM) in the level run, and
        // change the type of the NSM to the type of the previous
        // character. If the NSM is at the start of the level run, it will
        // get the type of sor.
        for (var i$1 = 0, prev = outerType; i$1 < len; ++i$1) {
          var type = types[i$1];
          if (type == "m") { types[i$1] = prev; }
          else { prev = type; }
        }

        // W2. Search backwards from each instance of a European number
        // until the first strong type (R, L, AL, or sor) is found. If an
        // AL is found, change the type of the European number to Arabic
        // number.
        // W3. Change all ALs to R.
        for (var i$2 = 0, cur = outerType; i$2 < len; ++i$2) {
          var type$1 = types[i$2];
          if (type$1 == "1" && cur == "r") { types[i$2] = "n"; }
          else if (isStrong.test(type$1)) { cur = type$1; if (type$1 == "r") { types[i$2] = "R"; } }
        }

        // W4. A single European separator between two European numbers
        // changes to a European number. A single common separator between
        // two numbers of the same type changes to that type.
        for (var i$3 = 1, prev$1 = types[0]; i$3 < len - 1; ++i$3) {
          var type$2 = types[i$3];
          if (type$2 == "+" && prev$1 == "1" && types[i$3+1] == "1") { types[i$3] = "1"; }
          else if (type$2 == "," && prev$1 == types[i$3+1] &&
                   (prev$1 == "1" || prev$1 == "n")) { types[i$3] = prev$1; }
          prev$1 = type$2;
        }

        // W5. A sequence of European terminators adjacent to European
        // numbers changes to all European numbers.
        // W6. Otherwise, separators and terminators change to Other
        // Neutral.
        for (var i$4 = 0; i$4 < len; ++i$4) {
          var type$3 = types[i$4];
          if (type$3 == ",") { types[i$4] = "N"; }
          else if (type$3 == "%") {
            var end = (void 0);
            for (end = i$4 + 1; end < len && types[end] == "%"; ++end) {}
            var replace = (i$4 && types[i$4-1] == "!") || (end < len && types[end] == "1") ? "1" : "N";
            for (var j = i$4; j < end; ++j) { types[j] = replace; }
            i$4 = end - 1;
          }
        }

        // W7. Search backwards from each instance of a European number
        // until the first strong type (R, L, or sor) is found. If an L is
        // found, then change the type of the European number to L.
        for (var i$5 = 0, cur$1 = outerType; i$5 < len; ++i$5) {
          var type$4 = types[i$5];
          if (cur$1 == "L" && type$4 == "1") { types[i$5] = "L"; }
          else if (isStrong.test(type$4)) { cur$1 = type$4; }
        }

        // N1. A sequence of neutrals takes the direction of the
        // surrounding strong text if the text on both sides has the same
        // direction. European and Arabic numbers act as if they were R in
        // terms of their influence on neutrals. Start-of-level-run (sor)
        // and end-of-level-run (eor) are used at level run boundaries.
        // N2. Any remaining neutrals take the embedding direction.
        for (var i$6 = 0; i$6 < len; ++i$6) {
          if (isNeutral.test(types[i$6])) {
            var end$1 = (void 0);
            for (end$1 = i$6 + 1; end$1 < len && isNeutral.test(types[end$1]); ++end$1) {}
            var before = (i$6 ? types[i$6-1] : outerType) == "L";
            var after = (end$1 < len ? types[end$1] : outerType) == "L";
            var replace$1 = before == after ? (before ? "L" : "R") : outerType;
            for (var j$1 = i$6; j$1 < end$1; ++j$1) { types[j$1] = replace$1; }
            i$6 = end$1 - 1;
          }
        }

        // Here we depart from the documented algorithm, in order to avoid
        // building up an actual levels array. Since there are only three
        // levels (0, 1, 2) in an implementation that doesn't take
        // explicit embedding into account, we can build up the order on
        // the fly, without following the level-based algorithm.
        var order = [], m;
        for (var i$7 = 0; i$7 < len;) {
          if (countsAsLeft.test(types[i$7])) {
            var start = i$7;
            for (++i$7; i$7 < len && countsAsLeft.test(types[i$7]); ++i$7) {}
            order.push(new BidiSpan(0, start, i$7));
          } else {
            var pos = i$7, at = order.length, isRTL = direction == "rtl" ? 1 : 0;
            for (++i$7; i$7 < len && types[i$7] != "L"; ++i$7) {}
            for (var j$2 = pos; j$2 < i$7;) {
              if (countsAsNum.test(types[j$2])) {
                if (pos < j$2) { order.splice(at, 0, new BidiSpan(1, pos, j$2)); at += isRTL; }
                var nstart = j$2;
                for (++j$2; j$2 < i$7 && countsAsNum.test(types[j$2]); ++j$2) {}
                order.splice(at, 0, new BidiSpan(2, nstart, j$2));
                at += isRTL;
                pos = j$2;
              } else { ++j$2; }
            }
            if (pos < i$7) { order.splice(at, 0, new BidiSpan(1, pos, i$7)); }
          }
        }
        if (direction == "ltr") {
          if (order[0].level == 1 && (m = str.match(/^\s+/))) {
            order[0].from = m[0].length;
            order.unshift(new BidiSpan(0, 0, m[0].length));
          }
          if (lst(order).level == 1 && (m = str.match(/\s+$/))) {
            lst(order).to -= m[0].length;
            order.push(new BidiSpan(0, len - m[0].length, len));
          }
        }

        return direction == "rtl" ? order.reverse() : order
      }
    })();

    // Get the bidi ordering for the given line (and cache it). Returns
    // false for lines that are fully left-to-right, and an array of
    // BidiSpan objects otherwise.
    function getOrder(line, direction) {
      var order = line.order;
      if (order == null) { order = line.order = bidiOrdering(line.text, direction); }
      return order
    }

    // EVENT HANDLING

    // Lightweight event framework. on/off also work on DOM nodes,
    // registering native DOM handlers.

    var noHandlers = [];

    var on = function(emitter, type, f) {
      if (emitter.addEventListener) {
        emitter.addEventListener(type, f, false);
      } else if (emitter.attachEvent) {
        emitter.attachEvent("on" + type, f);
      } else {
        var map = emitter._handlers || (emitter._handlers = {});
        map[type] = (map[type] || noHandlers).concat(f);
      }
    };

    function getHandlers(emitter, type) {
      return emitter._handlers && emitter._handlers[type] || noHandlers
    }

    function off(emitter, type, f) {
      if (emitter.removeEventListener) {
        emitter.removeEventListener(type, f, false);
      } else if (emitter.detachEvent) {
        emitter.detachEvent("on" + type, f);
      } else {
        var map = emitter._handlers, arr = map && map[type];
        if (arr) {
          var index = indexOf(arr, f);
          if (index > -1)
            { map[type] = arr.slice(0, index).concat(arr.slice(index + 1)); }
        }
      }
    }

    function signal(emitter, type /*, values...*/) {
      var handlers = getHandlers(emitter, type);
      if (!handlers.length) { return }
      var args = Array.prototype.slice.call(arguments, 2);
      for (var i = 0; i < handlers.length; ++i) { handlers[i].apply(null, args); }
    }

    // The DOM events that CodeMirror handles can be overridden by
    // registering a (non-DOM) handler on the editor for the event name,
    // and preventDefault-ing the event in that handler.
    function signalDOMEvent(cm, e, override) {
      if (typeof e == "string")
        { e = {type: e, preventDefault: function() { this.defaultPrevented = true; }}; }
      signal(cm, override || e.type, cm, e);
      return e_defaultPrevented(e) || e.codemirrorIgnore
    }

    function signalCursorActivity(cm) {
      var arr = cm._handlers && cm._handlers.cursorActivity;
      if (!arr) { return }
      var set = cm.curOp.cursorActivityHandlers || (cm.curOp.cursorActivityHandlers = []);
      for (var i = 0; i < arr.length; ++i) { if (indexOf(set, arr[i]) == -1)
        { set.push(arr[i]); } }
    }

    function hasHandler(emitter, type) {
      return getHandlers(emitter, type).length > 0
    }

    // Add on and off methods to a constructor's prototype, to make
    // registering events on such objects more convenient.
    function eventMixin(ctor) {
      ctor.prototype.on = function(type, f) {on(this, type, f);};
      ctor.prototype.off = function(type, f) {off(this, type, f);};
    }

    // Due to the fact that we still support jurassic IE versions, some
    // compatibility wrappers are needed.

    function e_preventDefault(e) {
      if (e.preventDefault) { e.preventDefault(); }
      else { e.returnValue = false; }
    }
    function e_stopPropagation(e) {
      if (e.stopPropagation) { e.stopPropagation(); }
      else { e.cancelBubble = true; }
    }
    function e_defaultPrevented(e) {
      return e.defaultPrevented != null ? e.defaultPrevented : e.returnValue == false
    }
    function e_stop(e) {e_preventDefault(e); e_stopPropagation(e);}

    function e_target(e) {return e.target || e.srcElement}
    function e_button(e) {
      var b = e.which;
      if (b == null) {
        if (e.button & 1) { b = 1; }
        else if (e.button & 2) { b = 3; }
        else if (e.button & 4) { b = 2; }
      }
      if (mac && e.ctrlKey && b == 1) { b = 3; }
      return b
    }

    // Detect drag-and-drop
    var dragAndDrop = function() {
      // There is *some* kind of drag-and-drop support in IE6-8, but I
      // couldn't get it to work yet.
      if (ie && ie_version < 9) { return false }
      var div = elt('div');
      return "draggable" in div || "dragDrop" in div
    }();

    var zwspSupported;
    function zeroWidthElement(measure) {
      if (zwspSupported == null) {
        var test = elt("span", "\u200b");
        removeChildrenAndAdd(measure, elt("span", [test, document.createTextNode("x")]));
        if (measure.firstChild.offsetHeight != 0)
          { zwspSupported = test.offsetWidth <= 1 && test.offsetHeight > 2 && !(ie && ie_version < 8); }
      }
      var node = zwspSupported ? elt("span", "\u200b") :
        elt("span", "\u00a0", null, "display: inline-block; width: 1px; margin-right: -1px");
      node.setAttribute("cm-text", "");
      return node
    }

    // Feature-detect IE's crummy client rect reporting for bidi text
    var badBidiRects;
    function hasBadBidiRects(measure) {
      if (badBidiRects != null) { return badBidiRects }
      var txt = removeChildrenAndAdd(measure, document.createTextNode("A\u062eA"));
      var r0 = range(txt, 0, 1).getBoundingClientRect();
      var r1 = range(txt, 1, 2).getBoundingClientRect();
      removeChildren(measure);
      if (!r0 || r0.left == r0.right) { return false } // Safari returns null in some cases (#2780)
      return badBidiRects = (r1.right - r0.right < 3)
    }

    // See if "".split is the broken IE version, if so, provide an
    // alternative way to split lines.
    var splitLinesAuto = "\n\nb".split(/\n/).length != 3 ? function (string) {
      var pos = 0, result = [], l = string.length;
      while (pos <= l) {
        var nl = string.indexOf("\n", pos);
        if (nl == -1) { nl = string.length; }
        var line = string.slice(pos, string.charAt(nl - 1) == "\r" ? nl - 1 : nl);
        var rt = line.indexOf("\r");
        if (rt != -1) {
          result.push(line.slice(0, rt));
          pos += rt + 1;
        } else {
          result.push(line);
          pos = nl + 1;
        }
      }
      return result
    } : function (string) { return string.split(/\r\n?|\n/); };

    var hasSelection = window.getSelection ? function (te) {
      try { return te.selectionStart != te.selectionEnd }
      catch(e) { return false }
    } : function (te) {
      var range;
      try {range = te.ownerDocument.selection.createRange();}
      catch(e) {}
      if (!range || range.parentElement() != te) { return false }
      return range.compareEndPoints("StartToEnd", range) != 0
    };

    var hasCopyEvent = (function () {
      var e = elt("div");
      if ("oncopy" in e) { return true }
      e.setAttribute("oncopy", "return;");
      return typeof e.oncopy == "function"
    })();

    var badZoomedRects = null;
    function hasBadZoomedRects(measure) {
      if (badZoomedRects != null) { return badZoomedRects }
      var node = removeChildrenAndAdd(measure, elt("span", "x"));
      var normal = node.getBoundingClientRect();
      var fromRange = range(node, 0, 1).getBoundingClientRect();
      return badZoomedRects = Math.abs(normal.left - fromRange.left) > 1
    }

    // Known modes, by name and by MIME
    var modes = {}, mimeModes = {};

    // Extra arguments are stored as the mode's dependencies, which is
    // used by (legacy) mechanisms like loadmode.js to automatically
    // load a mode. (Preferred mechanism is the require/define calls.)
    function defineMode(name, mode) {
      if (arguments.length > 2)
        { mode.dependencies = Array.prototype.slice.call(arguments, 2); }
      modes[name] = mode;
    }

    function defineMIME(mime, spec) {
      mimeModes[mime] = spec;
    }

    // Given a MIME type, a {name, ...options} config object, or a name
    // string, return a mode config object.
    function resolveMode(spec) {
      if (typeof spec == "string" && mimeModes.hasOwnProperty(spec)) {
        spec = mimeModes[spec];
      } else if (spec && typeof spec.name == "string" && mimeModes.hasOwnProperty(spec.name)) {
        var found = mimeModes[spec.name];
        if (typeof found == "string") { found = {name: found}; }
        spec = createObj(found, spec);
        spec.name = found.name;
      } else if (typeof spec == "string" && /^[\w\-]+\/[\w\-]+\+xml$/.test(spec)) {
        return resolveMode("application/xml")
      } else if (typeof spec == "string" && /^[\w\-]+\/[\w\-]+\+json$/.test(spec)) {
        return resolveMode("application/json")
      }
      if (typeof spec == "string") { return {name: spec} }
      else { return spec || {name: "null"} }
    }

    // Given a mode spec (anything that resolveMode accepts), find and
    // initialize an actual mode object.
    function getMode(options, spec) {
      spec = resolveMode(spec);
      var mfactory = modes[spec.name];
      if (!mfactory) { return getMode(options, "text/plain") }
      var modeObj = mfactory(options, spec);
      if (modeExtensions.hasOwnProperty(spec.name)) {
        var exts = modeExtensions[spec.name];
        for (var prop in exts) {
          if (!exts.hasOwnProperty(prop)) { continue }
          if (modeObj.hasOwnProperty(prop)) { modeObj["_" + prop] = modeObj[prop]; }
          modeObj[prop] = exts[prop];
        }
      }
      modeObj.name = spec.name;
      if (spec.helperType) { modeObj.helperType = spec.helperType; }
      if (spec.modeProps) { for (var prop$1 in spec.modeProps)
        { modeObj[prop$1] = spec.modeProps[prop$1]; } }

      return modeObj
    }

    // This can be used to attach properties to mode objects from
    // outside the actual mode definition.
    var modeExtensions = {};
    function extendMode(mode, properties) {
      var exts = modeExtensions.hasOwnProperty(mode) ? modeExtensions[mode] : (modeExtensions[mode] = {});
      copyObj(properties, exts);
    }

    function copyState(mode, state) {
      if (state === true) { return state }
      if (mode.copyState) { return mode.copyState(state) }
      var nstate = {};
      for (var n in state) {
        var val = state[n];
        if (val instanceof Array) { val = val.concat([]); }
        nstate[n] = val;
      }
      return nstate
    }

    // Given a mode and a state (for that mode), find the inner mode and
    // state at the position that the state refers to.
    function innerMode(mode, state) {
      var info;
      while (mode.innerMode) {
        info = mode.innerMode(state);
        if (!info || info.mode == mode) { break }
        state = info.state;
        mode = info.mode;
      }
      return info || {mode: mode, state: state}
    }

    function startState(mode, a1, a2) {
      return mode.startState ? mode.startState(a1, a2) : true
    }

    // STRING STREAM

    // Fed to the mode parsers, provides helper functions to make
    // parsers more succinct.

    var StringStream = function(string, tabSize, lineOracle) {
      this.pos = this.start = 0;
      this.string = string;
      this.tabSize = tabSize || 8;
      this.lastColumnPos = this.lastColumnValue = 0;
      this.lineStart = 0;
      this.lineOracle = lineOracle;
    };

    StringStream.prototype.eol = function () {return this.pos >= this.string.length};
    StringStream.prototype.sol = function () {return this.pos == this.lineStart};
    StringStream.prototype.peek = function () {return this.string.charAt(this.pos) || undefined};
    StringStream.prototype.next = function () {
      if (this.pos < this.string.length)
        { return this.string.charAt(this.pos++) }
    };
    StringStream.prototype.eat = function (match) {
      var ch = this.string.charAt(this.pos);
      var ok;
      if (typeof match == "string") { ok = ch == match; }
      else { ok = ch && (match.test ? match.test(ch) : match(ch)); }
      if (ok) {++this.pos; return ch}
    };
    StringStream.prototype.eatWhile = function (match) {
      var start = this.pos;
      while (this.eat(match)){}
      return this.pos > start
    };
    StringStream.prototype.eatSpace = function () {
      var start = this.pos;
      while (/[\s\u00a0]/.test(this.string.charAt(this.pos))) { ++this.pos; }
      return this.pos > start
    };
    StringStream.prototype.skipToEnd = function () {this.pos = this.string.length;};
    StringStream.prototype.skipTo = function (ch) {
      var found = this.string.indexOf(ch, this.pos);
      if (found > -1) {this.pos = found; return true}
    };
    StringStream.prototype.backUp = function (n) {this.pos -= n;};
    StringStream.prototype.column = function () {
      if (this.lastColumnPos < this.start) {
        this.lastColumnValue = countColumn(this.string, this.start, this.tabSize, this.lastColumnPos, this.lastColumnValue);
        this.lastColumnPos = this.start;
      }
      return this.lastColumnValue - (this.lineStart ? countColumn(this.string, this.lineStart, this.tabSize) : 0)
    };
    StringStream.prototype.indentation = function () {
      return countColumn(this.string, null, this.tabSize) -
        (this.lineStart ? countColumn(this.string, this.lineStart, this.tabSize) : 0)
    };
    StringStream.prototype.match = function (pattern, consume, caseInsensitive) {
      if (typeof pattern == "string") {
        var cased = function (str) { return caseInsensitive ? str.toLowerCase() : str; };
        var substr = this.string.substr(this.pos, pattern.length);
        if (cased(substr) == cased(pattern)) {
          if (consume !== false) { this.pos += pattern.length; }
          return true
        }
      } else {
        var match = this.string.slice(this.pos).match(pattern);
        if (match && match.index > 0) { return null }
        if (match && consume !== false) { this.pos += match[0].length; }
        return match
      }
    };
    StringStream.prototype.current = function (){return this.string.slice(this.start, this.pos)};
    StringStream.prototype.hideFirstChars = function (n, inner) {
      this.lineStart += n;
      try { return inner() }
      finally { this.lineStart -= n; }
    };
    StringStream.prototype.lookAhead = function (n) {
      var oracle = this.lineOracle;
      return oracle && oracle.lookAhead(n)
    };
    StringStream.prototype.baseToken = function () {
      var oracle = this.lineOracle;
      return oracle && oracle.baseToken(this.pos)
    };

    // Find the line object corresponding to the given line number.
    function getLine(doc, n) {
      n -= doc.first;
      if (n < 0 || n >= doc.size) { throw new Error("There is no line " + (n + doc.first) + " in the document.") }
      var chunk = doc;
      while (!chunk.lines) {
        for (var i = 0;; ++i) {
          var child = chunk.children[i], sz = child.chunkSize();
          if (n < sz) { chunk = child; break }
          n -= sz;
        }
      }
      return chunk.lines[n]
    }

    // Get the part of a document between two positions, as an array of
    // strings.
    function getBetween(doc, start, end) {
      var out = [], n = start.line;
      doc.iter(start.line, end.line + 1, function (line) {
        var text = line.text;
        if (n == end.line) { text = text.slice(0, end.ch); }
        if (n == start.line) { text = text.slice(start.ch); }
        out.push(text);
        ++n;
      });
      return out
    }
    // Get the lines between from and to, as array of strings.
    function getLines(doc, from, to) {
      var out = [];
      doc.iter(from, to, function (line) { out.push(line.text); }); // iter aborts when callback returns truthy value
      return out
    }

    // Update the height of a line, propagating the height change
    // upwards to parent nodes.
    function updateLineHeight(line, height) {
      var diff = height - line.height;
      if (diff) { for (var n = line; n; n = n.parent) { n.height += diff; } }
    }

    // Given a line object, find its line number by walking up through
    // its parent links.
    function lineNo(line) {
      if (line.parent == null) { return null }
      var cur = line.parent, no = indexOf(cur.lines, line);
      for (var chunk = cur.parent; chunk; cur = chunk, chunk = chunk.parent) {
        for (var i = 0;; ++i) {
          if (chunk.children[i] == cur) { break }
          no += chunk.children[i].chunkSize();
        }
      }
      return no + cur.first
    }

    // Find the line at the given vertical position, using the height
    // information in the document tree.
    function lineAtHeight(chunk, h) {
      var n = chunk.first;
      outer: do {
        for (var i$1 = 0; i$1 < chunk.children.length; ++i$1) {
          var child = chunk.children[i$1], ch = child.height;
          if (h < ch) { chunk = child; continue outer }
          h -= ch;
          n += child.chunkSize();
        }
        return n
      } while (!chunk.lines)
      var i = 0;
      for (; i < chunk.lines.length; ++i) {
        var line = chunk.lines[i], lh = line.height;
        if (h < lh) { break }
        h -= lh;
      }
      return n + i
    }

    function isLine(doc, l) {return l >= doc.first && l < doc.first + doc.size}

    function lineNumberFor(options, i) {
      return String(options.lineNumberFormatter(i + options.firstLineNumber))
    }

    // A Pos instance represents a position within the text.
    function Pos(line, ch, sticky) {
      if ( sticky === void 0 ) sticky = null;

      if (!(this instanceof Pos)) { return new Pos(line, ch, sticky) }
      this.line = line;
      this.ch = ch;
      this.sticky = sticky;
    }

    // Compare two positions, return 0 if they are the same, a negative
    // number when a is less, and a positive number otherwise.
    function cmp(a, b) { return a.line - b.line || a.ch - b.ch }

    function equalCursorPos(a, b) { return a.sticky == b.sticky && cmp(a, b) == 0 }

    function copyPos(x) {return Pos(x.line, x.ch)}
    function maxPos(a, b) { return cmp(a, b) < 0 ? b : a }
    function minPos(a, b) { return cmp(a, b) < 0 ? a : b }

    // Most of the external API clips given positions to make sure they
    // actually exist within the document.
    function clipLine(doc, n) {return Math.max(doc.first, Math.min(n, doc.first + doc.size - 1))}
    function clipPos(doc, pos) {
      if (pos.line < doc.first) { return Pos(doc.first, 0) }
      var last = doc.first + doc.size - 1;
      if (pos.line > last) { return Pos(last, getLine(doc, last).text.length) }
      return clipToLen(pos, getLine(doc, pos.line).text.length)
    }
    function clipToLen(pos, linelen) {
      var ch = pos.ch;
      if (ch == null || ch > linelen) { return Pos(pos.line, linelen) }
      else if (ch < 0) { return Pos(pos.line, 0) }
      else { return pos }
    }
    function clipPosArray(doc, array) {
      var out = [];
      for (var i = 0; i < array.length; i++) { out[i] = clipPos(doc, array[i]); }
      return out
    }

    var SavedContext = function(state, lookAhead) {
      this.state = state;
      this.lookAhead = lookAhead;
    };

    var Context = function(doc, state, line, lookAhead) {
      this.state = state;
      this.doc = doc;
      this.line = line;
      this.maxLookAhead = lookAhead || 0;
      this.baseTokens = null;
      this.baseTokenPos = 1;
    };

    Context.prototype.lookAhead = function (n) {
      var line = this.doc.getLine(this.line + n);
      if (line != null && n > this.maxLookAhead) { this.maxLookAhead = n; }
      return line
    };

    Context.prototype.baseToken = function (n) {
      if (!this.baseTokens) { return null }
      while (this.baseTokens[this.baseTokenPos] <= n)
        { this.baseTokenPos += 2; }
      var type = this.baseTokens[this.baseTokenPos + 1];
      return {type: type && type.replace(/( |^)overlay .*/, ""),
              size: this.baseTokens[this.baseTokenPos] - n}
    };

    Context.prototype.nextLine = function () {
      this.line++;
      if (this.maxLookAhead > 0) { this.maxLookAhead--; }
    };

    Context.fromSaved = function (doc, saved, line) {
      if (saved instanceof SavedContext)
        { return new Context(doc, copyState(doc.mode, saved.state), line, saved.lookAhead) }
      else
        { return new Context(doc, copyState(doc.mode, saved), line) }
    };

    Context.prototype.save = function (copy) {
      var state = copy !== false ? copyState(this.doc.mode, this.state) : this.state;
      return this.maxLookAhead > 0 ? new SavedContext(state, this.maxLookAhead) : state
    };


    // Compute a style array (an array starting with a mode generation
    // -- for invalidation -- followed by pairs of end positions and
    // style strings), which is used to highlight the tokens on the
    // line.
    function highlightLine(cm, line, context, forceToEnd) {
      // A styles array always starts with a number identifying the
      // mode/overlays that it is based on (for easy invalidation).
      var st = [cm.state.modeGen], lineClasses = {};
      // Compute the base array of styles
      runMode(cm, line.text, cm.doc.mode, context, function (end, style) { return st.push(end, style); },
              lineClasses, forceToEnd);
      var state = context.state;

      // Run overlays, adjust style array.
      var loop = function ( o ) {
        context.baseTokens = st;
        var overlay = cm.state.overlays[o], i = 1, at = 0;
        context.state = true;
        runMode(cm, line.text, overlay.mode, context, function (end, style) {
          var start = i;
          // Ensure there's a token end at the current position, and that i points at it
          while (at < end) {
            var i_end = st[i];
            if (i_end > end)
              { st.splice(i, 1, end, st[i+1], i_end); }
            i += 2;
            at = Math.min(end, i_end);
          }
          if (!style) { return }
          if (overlay.opaque) {
            st.splice(start, i - start, end, "overlay " + style);
            i = start + 2;
          } else {
            for (; start < i; start += 2) {
              var cur = st[start+1];
              st[start+1] = (cur ? cur + " " : "") + "overlay " + style;
            }
          }
        }, lineClasses);
        context.state = state;
        context.baseTokens = null;
        context.baseTokenPos = 1;
      };

      for (var o = 0; o < cm.state.overlays.length; ++o) loop( o );

      return {styles: st, classes: lineClasses.bgClass || lineClasses.textClass ? lineClasses : null}
    }

    function getLineStyles(cm, line, updateFrontier) {
      if (!line.styles || line.styles[0] != cm.state.modeGen) {
        var context = getContextBefore(cm, lineNo(line));
        var resetState = line.text.length > cm.options.maxHighlightLength && copyState(cm.doc.mode, context.state);
        var result = highlightLine(cm, line, context);
        if (resetState) { context.state = resetState; }
        line.stateAfter = context.save(!resetState);
        line.styles = result.styles;
        if (result.classes) { line.styleClasses = result.classes; }
        else if (line.styleClasses) { line.styleClasses = null; }
        if (updateFrontier === cm.doc.highlightFrontier)
          { cm.doc.modeFrontier = Math.max(cm.doc.modeFrontier, ++cm.doc.highlightFrontier); }
      }
      return line.styles
    }

    function getContextBefore(cm, n, precise) {
      var doc = cm.doc, display = cm.display;
      if (!doc.mode.startState) { return new Context(doc, true, n) }
      var start = findStartLine(cm, n, precise);
      var saved = start > doc.first && getLine(doc, start - 1).stateAfter;
      var context = saved ? Context.fromSaved(doc, saved, start) : new Context(doc, startState(doc.mode), start);

      doc.iter(start, n, function (line) {
        processLine(cm, line.text, context);
        var pos = context.line;
        line.stateAfter = pos == n - 1 || pos % 5 == 0 || pos >= display.viewFrom && pos < display.viewTo ? context.save() : null;
        context.nextLine();
      });
      if (precise) { doc.modeFrontier = context.line; }
      return context
    }

    // Lightweight form of highlight -- proceed over this line and
    // update state, but don't save a style array. Used for lines that
    // aren't currently visible.
    function processLine(cm, text, context, startAt) {
      var mode = cm.doc.mode;
      var stream = new StringStream(text, cm.options.tabSize, context);
      stream.start = stream.pos = startAt || 0;
      if (text == "") { callBlankLine(mode, context.state); }
      while (!stream.eol()) {
        readToken(mode, stream, context.state);
        stream.start = stream.pos;
      }
    }

    function callBlankLine(mode, state) {
      if (mode.blankLine) { return mode.blankLine(state) }
      if (!mode.innerMode) { return }
      var inner = innerMode(mode, state);
      if (inner.mode.blankLine) { return inner.mode.blankLine(inner.state) }
    }

    function readToken(mode, stream, state, inner) {
      for (var i = 0; i < 10; i++) {
        if (inner) { inner[0] = innerMode(mode, state).mode; }
        var style = mode.token(stream, state);
        if (stream.pos > stream.start) { return style }
      }
      throw new Error("Mode " + mode.name + " failed to advance stream.")
    }

    var Token = function(stream, type, state) {
      this.start = stream.start; this.end = stream.pos;
      this.string = stream.current();
      this.type = type || null;
      this.state = state;
    };

    // Utility for getTokenAt and getLineTokens
    function takeToken(cm, pos, precise, asArray) {
      var doc = cm.doc, mode = doc.mode, style;
      pos = clipPos(doc, pos);
      var line = getLine(doc, pos.line), context = getContextBefore(cm, pos.line, precise);
      var stream = new StringStream(line.text, cm.options.tabSize, context), tokens;
      if (asArray) { tokens = []; }
      while ((asArray || stream.pos < pos.ch) && !stream.eol()) {
        stream.start = stream.pos;
        style = readToken(mode, stream, context.state);
        if (asArray) { tokens.push(new Token(stream, style, copyState(doc.mode, context.state))); }
      }
      return asArray ? tokens : new Token(stream, style, context.state)
    }

    function extractLineClasses(type, output) {
      if (type) { for (;;) {
        var lineClass = type.match(/(?:^|\s+)line-(background-)?(\S+)/);
        if (!lineClass) { break }
        type = type.slice(0, lineClass.index) + type.slice(lineClass.index + lineClass[0].length);
        var prop = lineClass[1] ? "bgClass" : "textClass";
        if (output[prop] == null)
          { output[prop] = lineClass[2]; }
        else if (!(new RegExp("(?:^|\\s)" + lineClass[2] + "(?:$|\\s)")).test(output[prop]))
          { output[prop] += " " + lineClass[2]; }
      } }
      return type
    }

    // Run the given mode's parser over a line, calling f for each token.
    function runMode(cm, text, mode, context, f, lineClasses, forceToEnd) {
      var flattenSpans = mode.flattenSpans;
      if (flattenSpans == null) { flattenSpans = cm.options.flattenSpans; }
      var curStart = 0, curStyle = null;
      var stream = new StringStream(text, cm.options.tabSize, context), style;
      var inner = cm.options.addModeClass && [null];
      if (text == "") { extractLineClasses(callBlankLine(mode, context.state), lineClasses); }
      while (!stream.eol()) {
        if (stream.pos > cm.options.maxHighlightLength) {
          flattenSpans = false;
          if (forceToEnd) { processLine(cm, text, context, stream.pos); }
          stream.pos = text.length;
          style = null;
        } else {
          style = extractLineClasses(readToken(mode, stream, context.state, inner), lineClasses);
        }
        if (inner) {
          var mName = inner[0].name;
          if (mName) { style = "m-" + (style ? mName + " " + style : mName); }
        }
        if (!flattenSpans || curStyle != style) {
          while (curStart < stream.start) {
            curStart = Math.min(stream.start, curStart + 5000);
            f(curStart, curStyle);
          }
          curStyle = style;
        }
        stream.start = stream.pos;
      }
      while (curStart < stream.pos) {
        // Webkit seems to refuse to render text nodes longer than 57444
        // characters, and returns inaccurate measurements in nodes
        // starting around 5000 chars.
        var pos = Math.min(stream.pos, curStart + 5000);
        f(pos, curStyle);
        curStart = pos;
      }
    }

    // Finds the line to start with when starting a parse. Tries to
    // find a line with a stateAfter, so that it can start with a
    // valid state. If that fails, it returns the line with the
    // smallest indentation, which tends to need the least context to
    // parse correctly.
    function findStartLine(cm, n, precise) {
      var minindent, minline, doc = cm.doc;
      var lim = precise ? -1 : n - (cm.doc.mode.innerMode ? 1000 : 100);
      for (var search = n; search > lim; --search) {
        if (search <= doc.first) { return doc.first }
        var line = getLine(doc, search - 1), after = line.stateAfter;
        if (after && (!precise || search + (after instanceof SavedContext ? after.lookAhead : 0) <= doc.modeFrontier))
          { return search }
        var indented = countColumn(line.text, null, cm.options.tabSize);
        if (minline == null || minindent > indented) {
          minline = search - 1;
          minindent = indented;
        }
      }
      return minline
    }

    function retreatFrontier(doc, n) {
      doc.modeFrontier = Math.min(doc.modeFrontier, n);
      if (doc.highlightFrontier < n - 10) { return }
      var start = doc.first;
      for (var line = n - 1; line > start; line--) {
        var saved = getLine(doc, line).stateAfter;
        // change is on 3
        // state on line 1 looked ahead 2 -- so saw 3
        // test 1 + 2 < 3 should cover this
        if (saved && (!(saved instanceof SavedContext) || line + saved.lookAhead < n)) {
          start = line + 1;
          break
        }
      }
      doc.highlightFrontier = Math.min(doc.highlightFrontier, start);
    }

    // Optimize some code when these features are not used.
    var sawReadOnlySpans = false, sawCollapsedSpans = false;

    function seeReadOnlySpans() {
      sawReadOnlySpans = true;
    }

    function seeCollapsedSpans() {
      sawCollapsedSpans = true;
    }

    // TEXTMARKER SPANS

    function MarkedSpan(marker, from, to) {
      this.marker = marker;
      this.from = from; this.to = to;
    }

    // Search an array of spans for a span matching the given marker.
    function getMarkedSpanFor(spans, marker) {
      if (spans) { for (var i = 0; i < spans.length; ++i) {
        var span = spans[i];
        if (span.marker == marker) { return span }
      } }
    }
    // Remove a span from an array, returning undefined if no spans are
    // left (we don't store arrays for lines without spans).
    function removeMarkedSpan(spans, span) {
      var r;
      for (var i = 0; i < spans.length; ++i)
        { if (spans[i] != span) { (r || (r = [])).push(spans[i]); } }
      return r
    }
    // Add a span to a line.
    function addMarkedSpan(line, span) {
      line.markedSpans = line.markedSpans ? line.markedSpans.concat([span]) : [span];
      span.marker.attachLine(line);
    }

    // Used for the algorithm that adjusts markers for a change in the
    // document. These functions cut an array of spans at a given
    // character position, returning an array of remaining chunks (or
    // undefined if nothing remains).
    function markedSpansBefore(old, startCh, isInsert) {
      var nw;
      if (old) { for (var i = 0; i < old.length; ++i) {
        var span = old[i], marker = span.marker;
        var startsBefore = span.from == null || (marker.inclusiveLeft ? span.from <= startCh : span.from < startCh);
        if (startsBefore || span.from == startCh && marker.type == "bookmark" && (!isInsert || !span.marker.insertLeft)) {
          var endsAfter = span.to == null || (marker.inclusiveRight ? span.to >= startCh : span.to > startCh)
          ;(nw || (nw = [])).push(new MarkedSpan(marker, span.from, endsAfter ? null : span.to));
        }
      } }
      return nw
    }
    function markedSpansAfter(old, endCh, isInsert) {
      var nw;
      if (old) { for (var i = 0; i < old.length; ++i) {
        var span = old[i], marker = span.marker;
        var endsAfter = span.to == null || (marker.inclusiveRight ? span.to >= endCh : span.to > endCh);
        if (endsAfter || span.from == endCh && marker.type == "bookmark" && (!isInsert || span.marker.insertLeft)) {
          var startsBefore = span.from == null || (marker.inclusiveLeft ? span.from <= endCh : span.from < endCh)
          ;(nw || (nw = [])).push(new MarkedSpan(marker, startsBefore ? null : span.from - endCh,
                                                span.to == null ? null : span.to - endCh));
        }
      } }
      return nw
    }

    // Given a change object, compute the new set of marker spans that
    // cover the line in which the change took place. Removes spans
    // entirely within the change, reconnects spans belonging to the
    // same marker that appear on both sides of the change, and cuts off
    // spans partially within the change. Returns an array of span
    // arrays with one element for each line in (after) the change.
    function stretchSpansOverChange(doc, change) {
      if (change.full) { return null }
      var oldFirst = isLine(doc, change.from.line) && getLine(doc, change.from.line).markedSpans;
      var oldLast = isLine(doc, change.to.line) && getLine(doc, change.to.line).markedSpans;
      if (!oldFirst && !oldLast) { return null }

      var startCh = change.from.ch, endCh = change.to.ch, isInsert = cmp(change.from, change.to) == 0;
      // Get the spans that 'stick out' on both sides
      var first = markedSpansBefore(oldFirst, startCh, isInsert);
      var last = markedSpansAfter(oldLast, endCh, isInsert);

      // Next, merge those two ends
      var sameLine = change.text.length == 1, offset = lst(change.text).length + (sameLine ? startCh : 0);
      if (first) {
        // Fix up .to properties of first
        for (var i = 0; i < first.length; ++i) {
          var span = first[i];
          if (span.to == null) {
            var found = getMarkedSpanFor(last, span.marker);
            if (!found) { span.to = startCh; }
            else if (sameLine) { span.to = found.to == null ? null : found.to + offset; }
          }
        }
      }
      if (last) {
        // Fix up .from in last (or move them into first in case of sameLine)
        for (var i$1 = 0; i$1 < last.length; ++i$1) {
          var span$1 = last[i$1];
          if (span$1.to != null) { span$1.to += offset; }
          if (span$1.from == null) {
            var found$1 = getMarkedSpanFor(first, span$1.marker);
            if (!found$1) {
              span$1.from = offset;
              if (sameLine) { (first || (first = [])).push(span$1); }
            }
          } else {
            span$1.from += offset;
            if (sameLine) { (first || (first = [])).push(span$1); }
          }
        }
      }
      // Make sure we didn't create any zero-length spans
      if (first) { first = clearEmptySpans(first); }
      if (last && last != first) { last = clearEmptySpans(last); }

      var newMarkers = [first];
      if (!sameLine) {
        // Fill gap with whole-line-spans
        var gap = change.text.length - 2, gapMarkers;
        if (gap > 0 && first)
          { for (var i$2 = 0; i$2 < first.length; ++i$2)
            { if (first[i$2].to == null)
              { (gapMarkers || (gapMarkers = [])).push(new MarkedSpan(first[i$2].marker, null, null)); } } }
        for (var i$3 = 0; i$3 < gap; ++i$3)
          { newMarkers.push(gapMarkers); }
        newMarkers.push(last);
      }
      return newMarkers
    }

    // Remove spans that are empty and don't have a clearWhenEmpty
    // option of false.
    function clearEmptySpans(spans) {
      for (var i = 0; i < spans.length; ++i) {
        var span = spans[i];
        if (span.from != null && span.from == span.to && span.marker.clearWhenEmpty !== false)
          { spans.splice(i--, 1); }
      }
      if (!spans.length) { return null }
      return spans
    }

    // Used to 'clip' out readOnly ranges when making a change.
    function removeReadOnlyRanges(doc, from, to) {
      var markers = null;
      doc.iter(from.line, to.line + 1, function (line) {
        if (line.markedSpans) { for (var i = 0; i < line.markedSpans.length; ++i) {
          var mark = line.markedSpans[i].marker;
          if (mark.readOnly && (!markers || indexOf(markers, mark) == -1))
            { (markers || (markers = [])).push(mark); }
        } }
      });
      if (!markers) { return null }
      var parts = [{from: from, to: to}];
      for (var i = 0; i < markers.length; ++i) {
        var mk = markers[i], m = mk.find(0);
        for (var j = 0; j < parts.length; ++j) {
          var p = parts[j];
          if (cmp(p.to, m.from) < 0 || cmp(p.from, m.to) > 0) { continue }
          var newParts = [j, 1], dfrom = cmp(p.from, m.from), dto = cmp(p.to, m.to);
          if (dfrom < 0 || !mk.inclusiveLeft && !dfrom)
            { newParts.push({from: p.from, to: m.from}); }
          if (dto > 0 || !mk.inclusiveRight && !dto)
            { newParts.push({from: m.to, to: p.to}); }
          parts.splice.apply(parts, newParts);
          j += newParts.length - 3;
        }
      }
      return parts
    }

    // Connect or disconnect spans from a line.
    function detachMarkedSpans(line) {
      var spans = line.markedSpans;
      if (!spans) { return }
      for (var i = 0; i < spans.length; ++i)
        { spans[i].marker.detachLine(line); }
      line.markedSpans = null;
    }
    function attachMarkedSpans(line, spans) {
      if (!spans) { return }
      for (var i = 0; i < spans.length; ++i)
        { spans[i].marker.attachLine(line); }
      line.markedSpans = spans;
    }

    // Helpers used when computing which overlapping collapsed span
    // counts as the larger one.
    function extraLeft(marker) { return marker.inclusiveLeft ? -1 : 0 }
    function extraRight(marker) { return marker.inclusiveRight ? 1 : 0 }

    // Returns a number indicating which of two overlapping collapsed
    // spans is larger (and thus includes the other). Falls back to
    // comparing ids when the spans cover exactly the same range.
    function compareCollapsedMarkers(a, b) {
      var lenDiff = a.lines.length - b.lines.length;
      if (lenDiff != 0) { return lenDiff }
      var aPos = a.find(), bPos = b.find();
      var fromCmp = cmp(aPos.from, bPos.from) || extraLeft(a) - extraLeft(b);
      if (fromCmp) { return -fromCmp }
      var toCmp = cmp(aPos.to, bPos.to) || extraRight(a) - extraRight(b);
      if (toCmp) { return toCmp }
      return b.id - a.id
    }

    // Find out whether a line ends or starts in a collapsed span. If
    // so, return the marker for that span.
    function collapsedSpanAtSide(line, start) {
      var sps = sawCollapsedSpans && line.markedSpans, found;
      if (sps) { for (var sp = (void 0), i = 0; i < sps.length; ++i) {
        sp = sps[i];
        if (sp.marker.collapsed && (start ? sp.from : sp.to) == null &&
            (!found || compareCollapsedMarkers(found, sp.marker) < 0))
          { found = sp.marker; }
      } }
      return found
    }
    function collapsedSpanAtStart(line) { return collapsedSpanAtSide(line, true) }
    function collapsedSpanAtEnd(line) { return collapsedSpanAtSide(line, false) }

    function collapsedSpanAround(line, ch) {
      var sps = sawCollapsedSpans && line.markedSpans, found;
      if (sps) { for (var i = 0; i < sps.length; ++i) {
        var sp = sps[i];
        if (sp.marker.collapsed && (sp.from == null || sp.from < ch) && (sp.to == null || sp.to > ch) &&
            (!found || compareCollapsedMarkers(found, sp.marker) < 0)) { found = sp.marker; }
      } }
      return found
    }

    // Test whether there exists a collapsed span that partially
    // overlaps (covers the start or end, but not both) of a new span.
    // Such overlap is not allowed.
    function conflictingCollapsedRange(doc, lineNo, from, to, marker) {
      var line = getLine(doc, lineNo);
      var sps = sawCollapsedSpans && line.markedSpans;
      if (sps) { for (var i = 0; i < sps.length; ++i) {
        var sp = sps[i];
        if (!sp.marker.collapsed) { continue }
        var found = sp.marker.find(0);
        var fromCmp = cmp(found.from, from) || extraLeft(sp.marker) - extraLeft(marker);
        var toCmp = cmp(found.to, to) || extraRight(sp.marker) - extraRight(marker);
        if (fromCmp >= 0 && toCmp <= 0 || fromCmp <= 0 && toCmp >= 0) { continue }
        if (fromCmp <= 0 && (sp.marker.inclusiveRight && marker.inclusiveLeft ? cmp(found.to, from) >= 0 : cmp(found.to, from) > 0) ||
            fromCmp >= 0 && (sp.marker.inclusiveRight && marker.inclusiveLeft ? cmp(found.from, to) <= 0 : cmp(found.from, to) < 0))
          { return true }
      } }
    }

    // A visual line is a line as drawn on the screen. Folding, for
    // example, can cause multiple logical lines to appear on the same
    // visual line. This finds the start of the visual line that the
    // given line is part of (usually that is the line itself).
    function visualLine(line) {
      var merged;
      while (merged = collapsedSpanAtStart(line))
        { line = merged.find(-1, true).line; }
      return line
    }

    function visualLineEnd(line) {
      var merged;
      while (merged = collapsedSpanAtEnd(line))
        { line = merged.find(1, true).line; }
      return line
    }

    // Returns an array of logical lines that continue the visual line
    // started by the argument, or undefined if there are no such lines.
    function visualLineContinued(line) {
      var merged, lines;
      while (merged = collapsedSpanAtEnd(line)) {
        line = merged.find(1, true).line
        ;(lines || (lines = [])).push(line);
      }
      return lines
    }

    // Get the line number of the start of the visual line that the
    // given line number is part of.
    function visualLineNo(doc, lineN) {
      var line = getLine(doc, lineN), vis = visualLine(line);
      if (line == vis) { return lineN }
      return lineNo(vis)
    }

    // Get the line number of the start of the next visual line after
    // the given line.
    function visualLineEndNo(doc, lineN) {
      if (lineN > doc.lastLine()) { return lineN }
      var line = getLine(doc, lineN), merged;
      if (!lineIsHidden(doc, line)) { return lineN }
      while (merged = collapsedSpanAtEnd(line))
        { line = merged.find(1, true).line; }
      return lineNo(line) + 1
    }

    // Compute whether a line is hidden. Lines count as hidden when they
    // are part of a visual line that starts with another line, or when
    // they are entirely covered by collapsed, non-widget span.
    function lineIsHidden(doc, line) {
      var sps = sawCollapsedSpans && line.markedSpans;
      if (sps) { for (var sp = (void 0), i = 0; i < sps.length; ++i) {
        sp = sps[i];
        if (!sp.marker.collapsed) { continue }
        if (sp.from == null) { return true }
        if (sp.marker.widgetNode) { continue }
        if (sp.from == 0 && sp.marker.inclusiveLeft && lineIsHiddenInner(doc, line, sp))
          { return true }
      } }
    }
    function lineIsHiddenInner(doc, line, span) {
      if (span.to == null) {
        var end = span.marker.find(1, true);
        return lineIsHiddenInner(doc, end.line, getMarkedSpanFor(end.line.markedSpans, span.marker))
      }
      if (span.marker.inclusiveRight && span.to == line.text.length)
        { return true }
      for (var sp = (void 0), i = 0; i < line.markedSpans.length; ++i) {
        sp = line.markedSpans[i];
        if (sp.marker.collapsed && !sp.marker.widgetNode && sp.from == span.to &&
            (sp.to == null || sp.to != span.from) &&
            (sp.marker.inclusiveLeft || span.marker.inclusiveRight) &&
            lineIsHiddenInner(doc, line, sp)) { return true }
      }
    }

    // Find the height above the given line.
    function heightAtLine(lineObj) {
      lineObj = visualLine(lineObj);

      var h = 0, chunk = lineObj.parent;
      for (var i = 0; i < chunk.lines.length; ++i) {
        var line = chunk.lines[i];
        if (line == lineObj) { break }
        else { h += line.height; }
      }
      for (var p = chunk.parent; p; chunk = p, p = chunk.parent) {
        for (var i$1 = 0; i$1 < p.children.length; ++i$1) {
          var cur = p.children[i$1];
          if (cur == chunk) { break }
          else { h += cur.height; }
        }
      }
      return h
    }

    // Compute the character length of a line, taking into account
    // collapsed ranges (see markText) that might hide parts, and join
    // other lines onto it.
    function lineLength(line) {
      if (line.height == 0) { return 0 }
      var len = line.text.length, merged, cur = line;
      while (merged = collapsedSpanAtStart(cur)) {
        var found = merged.find(0, true);
        cur = found.from.line;
        len += found.from.ch - found.to.ch;
      }
      cur = line;
      while (merged = collapsedSpanAtEnd(cur)) {
        var found$1 = merged.find(0, true);
        len -= cur.text.length - found$1.from.ch;
        cur = found$1.to.line;
        len += cur.text.length - found$1.to.ch;
      }
      return len
    }

    // Find the longest line in the document.
    function findMaxLine(cm) {
      var d = cm.display, doc = cm.doc;
      d.maxLine = getLine(doc, doc.first);
      d.maxLineLength = lineLength(d.maxLine);
      d.maxLineChanged = true;
      doc.iter(function (line) {
        var len = lineLength(line);
        if (len > d.maxLineLength) {
          d.maxLineLength = len;
          d.maxLine = line;
        }
      });
    }

    // LINE DATA STRUCTURE

    // Line objects. These hold state related to a line, including
    // highlighting info (the styles array).
    var Line = function(text, markedSpans, estimateHeight) {
      this.text = text;
      attachMarkedSpans(this, markedSpans);
      this.height = estimateHeight ? estimateHeight(this) : 1;
    };

    Line.prototype.lineNo = function () { return lineNo(this) };
    eventMixin(Line);

    // Change the content (text, markers) of a line. Automatically
    // invalidates cached information and tries to re-estimate the
    // line's height.
    function updateLine(line, text, markedSpans, estimateHeight) {
      line.text = text;
      if (line.stateAfter) { line.stateAfter = null; }
      if (line.styles) { line.styles = null; }
      if (line.order != null) { line.order = null; }
      detachMarkedSpans(line);
      attachMarkedSpans(line, markedSpans);
      var estHeight = estimateHeight ? estimateHeight(line) : 1;
      if (estHeight != line.height) { updateLineHeight(line, estHeight); }
    }

    // Detach a line from the document tree and its markers.
    function cleanUpLine(line) {
      line.parent = null;
      detachMarkedSpans(line);
    }

    // Convert a style as returned by a mode (either null, or a string
    // containing one or more styles) to a CSS style. This is cached,
    // and also looks for line-wide styles.
    var styleToClassCache = {}, styleToClassCacheWithMode = {};
    function interpretTokenStyle(style, options) {
      if (!style || /^\s*$/.test(style)) { return null }
      var cache = options.addModeClass ? styleToClassCacheWithMode : styleToClassCache;
      return cache[style] ||
        (cache[style] = style.replace(/\S+/g, "cm-$&"))
    }

    // Render the DOM representation of the text of a line. Also builds
    // up a 'line map', which points at the DOM nodes that represent
    // specific stretches of text, and is used by the measuring code.
    // The returned object contains the DOM node, this map, and
    // information about line-wide styles that were set by the mode.
    function buildLineContent(cm, lineView) {
      // The padding-right forces the element to have a 'border', which
      // is needed on Webkit to be able to get line-level bounding
      // rectangles for it (in measureChar).
      var content = eltP("span", null, null, webkit ? "padding-right: .1px" : null);
      var builder = {pre: eltP("pre", [content], "CodeMirror-line"), content: content,
                     col: 0, pos: 0, cm: cm,
                     trailingSpace: false,
                     splitSpaces: cm.getOption("lineWrapping")};
      lineView.measure = {};

      // Iterate over the logical lines that make up this visual line.
      for (var i = 0; i <= (lineView.rest ? lineView.rest.length : 0); i++) {
        var line = i ? lineView.rest[i - 1] : lineView.line, order = (void 0);
        builder.pos = 0;
        builder.addToken = buildToken;
        // Optionally wire in some hacks into the token-rendering
        // algorithm, to deal with browser quirks.
        if (hasBadBidiRects(cm.display.measure) && (order = getOrder(line, cm.doc.direction)))
          { builder.addToken = buildTokenBadBidi(builder.addToken, order); }
        builder.map = [];
        var allowFrontierUpdate = lineView != cm.display.externalMeasured && lineNo(line);
        insertLineContent(line, builder, getLineStyles(cm, line, allowFrontierUpdate));
        if (line.styleClasses) {
          if (line.styleClasses.bgClass)
            { builder.bgClass = joinClasses(line.styleClasses.bgClass, builder.bgClass || ""); }
          if (line.styleClasses.textClass)
            { builder.textClass = joinClasses(line.styleClasses.textClass, builder.textClass || ""); }
        }

        // Ensure at least a single node is present, for measuring.
        if (builder.map.length == 0)
          { builder.map.push(0, 0, builder.content.appendChild(zeroWidthElement(cm.display.measure))); }

        // Store the map and a cache object for the current logical line
        if (i == 0) {
          lineView.measure.map = builder.map;
          lineView.measure.cache = {};
        } else {
    (lineView.measure.maps || (lineView.measure.maps = [])).push(builder.map)
          ;(lineView.measure.caches || (lineView.measure.caches = [])).push({});
        }
      }

      // See issue #2901
      if (webkit) {
        var last = builder.content.lastChild;
        if (/\bcm-tab\b/.test(last.className) || (last.querySelector && last.querySelector(".cm-tab")))
          { builder.content.className = "cm-tab-wrap-hack"; }
      }

      signal(cm, "renderLine", cm, lineView.line, builder.pre);
      if (builder.pre.className)
        { builder.textClass = joinClasses(builder.pre.className, builder.textClass || ""); }

      return builder
    }

    function defaultSpecialCharPlaceholder(ch) {
      var token = elt("span", "\u2022", "cm-invalidchar");
      token.title = "\\u" + ch.charCodeAt(0).toString(16);
      token.setAttribute("aria-label", token.title);
      return token
    }

    // Build up the DOM representation for a single token, and add it to
    // the line map. Takes care to render special characters separately.
    function buildToken(builder, text, style, startStyle, endStyle, css, attributes) {
      if (!text) { return }
      var displayText = builder.splitSpaces ? splitSpaces(text, builder.trailingSpace) : text;
      var special = builder.cm.state.specialChars, mustWrap = false;
      var content;
      if (!special.test(text)) {
        builder.col += text.length;
        content = document.createTextNode(displayText);
        builder.map.push(builder.pos, builder.pos + text.length, content);
        if (ie && ie_version < 9) { mustWrap = true; }
        builder.pos += text.length;
      } else {
        content = document.createDocumentFragment();
        var pos = 0;
        while (true) {
          special.lastIndex = pos;
          var m = special.exec(text);
          var skipped = m ? m.index - pos : text.length - pos;
          if (skipped) {
            var txt = document.createTextNode(displayText.slice(pos, pos + skipped));
            if (ie && ie_version < 9) { content.appendChild(elt("span", [txt])); }
            else { content.appendChild(txt); }
            builder.map.push(builder.pos, builder.pos + skipped, txt);
            builder.col += skipped;
            builder.pos += skipped;
          }
          if (!m) { break }
          pos += skipped + 1;
          var txt$1 = (void 0);
          if (m[0] == "\t") {
            var tabSize = builder.cm.options.tabSize, tabWidth = tabSize - builder.col % tabSize;
            txt$1 = content.appendChild(elt("span", spaceStr(tabWidth), "cm-tab"));
            txt$1.setAttribute("role", "presentation");
            txt$1.setAttribute("cm-text", "\t");
            builder.col += tabWidth;
          } else if (m[0] == "\r" || m[0] == "\n") {
            txt$1 = content.appendChild(elt("span", m[0] == "\r" ? "\u240d" : "\u2424", "cm-invalidchar"));
            txt$1.setAttribute("cm-text", m[0]);
            builder.col += 1;
          } else {
            txt$1 = builder.cm.options.specialCharPlaceholder(m[0]);
            txt$1.setAttribute("cm-text", m[0]);
            if (ie && ie_version < 9) { content.appendChild(elt("span", [txt$1])); }
            else { content.appendChild(txt$1); }
            builder.col += 1;
          }
          builder.map.push(builder.pos, builder.pos + 1, txt$1);
          builder.pos++;
        }
      }
      builder.trailingSpace = displayText.charCodeAt(text.length - 1) == 32;
      if (style || startStyle || endStyle || mustWrap || css || attributes) {
        var fullStyle = style || "";
        if (startStyle) { fullStyle += startStyle; }
        if (endStyle) { fullStyle += endStyle; }
        var token = elt("span", [content], fullStyle, css);
        if (attributes) {
          for (var attr in attributes) { if (attributes.hasOwnProperty(attr) && attr != "style" && attr != "class")
            { token.setAttribute(attr, attributes[attr]); } }
        }
        return builder.content.appendChild(token)
      }
      builder.content.appendChild(content);
    }

    // Change some spaces to NBSP to prevent the browser from collapsing
    // trailing spaces at the end of a line when rendering text (issue #1362).
    function splitSpaces(text, trailingBefore) {
      if (text.length > 1 && !/  /.test(text)) { return text }
      var spaceBefore = trailingBefore, result = "";
      for (var i = 0; i < text.length; i++) {
        var ch = text.charAt(i);
        if (ch == " " && spaceBefore && (i == text.length - 1 || text.charCodeAt(i + 1) == 32))
          { ch = "\u00a0"; }
        result += ch;
        spaceBefore = ch == " ";
      }
      return result
    }

    // Work around nonsense dimensions being reported for stretches of
    // right-to-left text.
    function buildTokenBadBidi(inner, order) {
      return function (builder, text, style, startStyle, endStyle, css, attributes) {
        style = style ? style + " cm-force-border" : "cm-force-border";
        var start = builder.pos, end = start + text.length;
        for (;;) {
          // Find the part that overlaps with the start of this text
          var part = (void 0);
          for (var i = 0; i < order.length; i++) {
            part = order[i];
            if (part.to > start && part.from <= start) { break }
          }
          if (part.to >= end) { return inner(builder, text, style, startStyle, endStyle, css, attributes) }
          inner(builder, text.slice(0, part.to - start), style, startStyle, null, css, attributes);
          startStyle = null;
          text = text.slice(part.to - start);
          start = part.to;
        }
      }
    }

    function buildCollapsedSpan(builder, size, marker, ignoreWidget) {
      var widget = !ignoreWidget && marker.widgetNode;
      if (widget) { builder.map.push(builder.pos, builder.pos + size, widget); }
      if (!ignoreWidget && builder.cm.display.input.needsContentAttribute) {
        if (!widget)
          { widget = builder.content.appendChild(document.createElement("span")); }
        widget.setAttribute("cm-marker", marker.id);
      }
      if (widget) {
        builder.cm.display.input.setUneditable(widget);
        builder.content.appendChild(widget);
      }
      builder.pos += size;
      builder.trailingSpace = false;
    }

    // Outputs a number of spans to make up a line, taking highlighting
    // and marked text into account.
    function insertLineContent(line, builder, styles) {
      var spans = line.markedSpans, allText = line.text, at = 0;
      if (!spans) {
        for (var i$1 = 1; i$1 < styles.length; i$1+=2)
          { builder.addToken(builder, allText.slice(at, at = styles[i$1]), interpretTokenStyle(styles[i$1+1], builder.cm.options)); }
        return
      }

      var len = allText.length, pos = 0, i = 1, text = "", style, css;
      var nextChange = 0, spanStyle, spanEndStyle, spanStartStyle, collapsed, attributes;
      for (;;) {
        if (nextChange == pos) { // Update current marker set
          spanStyle = spanEndStyle = spanStartStyle = css = "";
          attributes = null;
          collapsed = null; nextChange = Infinity;
          var foundBookmarks = [], endStyles = (void 0);
          for (var j = 0; j < spans.length; ++j) {
            var sp = spans[j], m = sp.marker;
            if (m.type == "bookmark" && sp.from == pos && m.widgetNode) {
              foundBookmarks.push(m);
            } else if (sp.from <= pos && (sp.to == null || sp.to > pos || m.collapsed && sp.to == pos && sp.from == pos)) {
              if (sp.to != null && sp.to != pos && nextChange > sp.to) {
                nextChange = sp.to;
                spanEndStyle = "";
              }
              if (m.className) { spanStyle += " " + m.className; }
              if (m.css) { css = (css ? css + ";" : "") + m.css; }
              if (m.startStyle && sp.from == pos) { spanStartStyle += " " + m.startStyle; }
              if (m.endStyle && sp.to == nextChange) { (endStyles || (endStyles = [])).push(m.endStyle, sp.to); }
              // support for the old title property
              // https://github.com/codemirror/CodeMirror/pull/5673
              if (m.title) { (attributes || (attributes = {})).title = m.title; }
              if (m.attributes) {
                for (var attr in m.attributes)
                  { (attributes || (attributes = {}))[attr] = m.attributes[attr]; }
              }
              if (m.collapsed && (!collapsed || compareCollapsedMarkers(collapsed.marker, m) < 0))
                { collapsed = sp; }
            } else if (sp.from > pos && nextChange > sp.from) {
              nextChange = sp.from;
            }
          }
          if (endStyles) { for (var j$1 = 0; j$1 < endStyles.length; j$1 += 2)
            { if (endStyles[j$1 + 1] == nextChange) { spanEndStyle += " " + endStyles[j$1]; } } }

          if (!collapsed || collapsed.from == pos) { for (var j$2 = 0; j$2 < foundBookmarks.length; ++j$2)
            { buildCollapsedSpan(builder, 0, foundBookmarks[j$2]); } }
          if (collapsed && (collapsed.from || 0) == pos) {
            buildCollapsedSpan(builder, (collapsed.to == null ? len + 1 : collapsed.to) - pos,
                               collapsed.marker, collapsed.from == null);
            if (collapsed.to == null) { return }
            if (collapsed.to == pos) { collapsed = false; }
          }
        }
        if (pos >= len) { break }

        var upto = Math.min(len, nextChange);
        while (true) {
          if (text) {
            var end = pos + text.length;
            if (!collapsed) {
              var tokenText = end > upto ? text.slice(0, upto - pos) : text;
              builder.addToken(builder, tokenText, style ? style + spanStyle : spanStyle,
                               spanStartStyle, pos + tokenText.length == nextChange ? spanEndStyle : "", css, attributes);
            }
            if (end >= upto) {text = text.slice(upto - pos); pos = upto; break}
            pos = end;
            spanStartStyle = "";
          }
          text = allText.slice(at, at = styles[i++]);
          style = interpretTokenStyle(styles[i++], builder.cm.options);
        }
      }
    }


    // These objects are used to represent the visible (currently drawn)
    // part of the document. A LineView may correspond to multiple
    // logical lines, if those are connected by collapsed ranges.
    function LineView(doc, line, lineN) {
      // The starting line
      this.line = line;
      // Continuing lines, if any
      this.rest = visualLineContinued(line);
      // Number of logical lines in this visual line
      this.size = this.rest ? lineNo(lst(this.rest)) - lineN + 1 : 1;
      this.node = this.text = null;
      this.hidden = lineIsHidden(doc, line);
    }

    // Create a range of LineView objects for the given lines.
    function buildViewArray(cm, from, to) {
      var array = [], nextPos;
      for (var pos = from; pos < to; pos = nextPos) {
        var view = new LineView(cm.doc, getLine(cm.doc, pos), pos);
        nextPos = pos + view.size;
        array.push(view);
      }
      return array
    }

    var operationGroup = null;

    function pushOperation(op) {
      if (operationGroup) {
        operationGroup.ops.push(op);
      } else {
        op.ownsGroup = operationGroup = {
          ops: [op],
          delayedCallbacks: []
        };
      }
    }

    function fireCallbacksForOps(group) {
      // Calls delayed callbacks and cursorActivity handlers until no
      // new ones appear
      var callbacks = group.delayedCallbacks, i = 0;
      do {
        for (; i < callbacks.length; i++)
          { callbacks[i].call(null); }
        for (var j = 0; j < group.ops.length; j++) {
          var op = group.ops[j];
          if (op.cursorActivityHandlers)
            { while (op.cursorActivityCalled < op.cursorActivityHandlers.length)
              { op.cursorActivityHandlers[op.cursorActivityCalled++].call(null, op.cm); } }
        }
      } while (i < callbacks.length)
    }

    function finishOperation(op, endCb) {
      var group = op.ownsGroup;
      if (!group) { return }

      try { fireCallbacksForOps(group); }
      finally {
        operationGroup = null;
        endCb(group);
      }
    }

    var orphanDelayedCallbacks = null;

    // Often, we want to signal events at a point where we are in the
    // middle of some work, but don't want the handler to start calling
    // other methods on the editor, which might be in an inconsistent
    // state or simply not expect any other events to happen.
    // signalLater looks whether there are any handlers, and schedules
    // them to be executed when the last operation ends, or, if no
    // operation is active, when a timeout fires.
    function signalLater(emitter, type /*, values...*/) {
      var arr = getHandlers(emitter, type);
      if (!arr.length) { return }
      var args = Array.prototype.slice.call(arguments, 2), list;
      if (operationGroup) {
        list = operationGroup.delayedCallbacks;
      } else if (orphanDelayedCallbacks) {
        list = orphanDelayedCallbacks;
      } else {
        list = orphanDelayedCallbacks = [];
        setTimeout(fireOrphanDelayed, 0);
      }
      var loop = function ( i ) {
        list.push(function () { return arr[i].apply(null, args); });
      };

      for (var i = 0; i < arr.length; ++i)
        loop( i );
    }

    function fireOrphanDelayed() {
      var delayed = orphanDelayedCallbacks;
      orphanDelayedCallbacks = null;
      for (var i = 0; i < delayed.length; ++i) { delayed[i](); }
    }

    // When an aspect of a line changes, a string is added to
    // lineView.changes. This updates the relevant part of the line's
    // DOM structure.
    function updateLineForChanges(cm, lineView, lineN, dims) {
      for (var j = 0; j < lineView.changes.length; j++) {
        var type = lineView.changes[j];
        if (type == "text") { updateLineText(cm, lineView); }
        else if (type == "gutter") { updateLineGutter(cm, lineView, lineN, dims); }
        else if (type == "class") { updateLineClasses(cm, lineView); }
        else if (type == "widget") { updateLineWidgets(cm, lineView, dims); }
      }
      lineView.changes = null;
    }

    // Lines with gutter elements, widgets or a background class need to
    // be wrapped, and have the extra elements added to the wrapper div
    function ensureLineWrapped(lineView) {
      if (lineView.node == lineView.text) {
        lineView.node = elt("div", null, null, "position: relative");
        if (lineView.text.parentNode)
          { lineView.text.parentNode.replaceChild(lineView.node, lineView.text); }
        lineView.node.appendChild(lineView.text);
        if (ie && ie_version < 8) { lineView.node.style.zIndex = 2; }
      }
      return lineView.node
    }

    function updateLineBackground(cm, lineView) {
      var cls = lineView.bgClass ? lineView.bgClass + " " + (lineView.line.bgClass || "") : lineView.line.bgClass;
      if (cls) { cls += " CodeMirror-linebackground"; }
      if (lineView.background) {
        if (cls) { lineView.background.className = cls; }
        else { lineView.background.parentNode.removeChild(lineView.background); lineView.background = null; }
      } else if (cls) {
        var wrap = ensureLineWrapped(lineView);
        lineView.background = wrap.insertBefore(elt("div", null, cls), wrap.firstChild);
        cm.display.input.setUneditable(lineView.background);
      }
    }

    // Wrapper around buildLineContent which will reuse the structure
    // in display.externalMeasured when possible.
    function getLineContent(cm, lineView) {
      var ext = cm.display.externalMeasured;
      if (ext && ext.line == lineView.line) {
        cm.display.externalMeasured = null;
        lineView.measure = ext.measure;
        return ext.built
      }
      return buildLineContent(cm, lineView)
    }

    // Redraw the line's text. Interacts with the background and text
    // classes because the mode may output tokens that influence these
    // classes.
    function updateLineText(cm, lineView) {
      var cls = lineView.text.className;
      var built = getLineContent(cm, lineView);
      if (lineView.text == lineView.node) { lineView.node = built.pre; }
      lineView.text.parentNode.replaceChild(built.pre, lineView.text);
      lineView.text = built.pre;
      if (built.bgClass != lineView.bgClass || built.textClass != lineView.textClass) {
        lineView.bgClass = built.bgClass;
        lineView.textClass = built.textClass;
        updateLineClasses(cm, lineView);
      } else if (cls) {
        lineView.text.className = cls;
      }
    }

    function updateLineClasses(cm, lineView) {
      updateLineBackground(cm, lineView);
      if (lineView.line.wrapClass)
        { ensureLineWrapped(lineView).className = lineView.line.wrapClass; }
      else if (lineView.node != lineView.text)
        { lineView.node.className = ""; }
      var textClass = lineView.textClass ? lineView.textClass + " " + (lineView.line.textClass || "") : lineView.line.textClass;
      lineView.text.className = textClass || "";
    }

    function updateLineGutter(cm, lineView, lineN, dims) {
      if (lineView.gutter) {
        lineView.node.removeChild(lineView.gutter);
        lineView.gutter = null;
      }
      if (lineView.gutterBackground) {
        lineView.node.removeChild(lineView.gutterBackground);
        lineView.gutterBackground = null;
      }
      if (lineView.line.gutterClass) {
        var wrap = ensureLineWrapped(lineView);
        lineView.gutterBackground = elt("div", null, "CodeMirror-gutter-background " + lineView.line.gutterClass,
                                        ("left: " + (cm.options.fixedGutter ? dims.fixedPos : -dims.gutterTotalWidth) + "px; width: " + (dims.gutterTotalWidth) + "px"));
        cm.display.input.setUneditable(lineView.gutterBackground);
        wrap.insertBefore(lineView.gutterBackground, lineView.text);
      }
      var markers = lineView.line.gutterMarkers;
      if (cm.options.lineNumbers || markers) {
        var wrap$1 = ensureLineWrapped(lineView);
        var gutterWrap = lineView.gutter = elt("div", null, "CodeMirror-gutter-wrapper", ("left: " + (cm.options.fixedGutter ? dims.fixedPos : -dims.gutterTotalWidth) + "px"));
        cm.display.input.setUneditable(gutterWrap);
        wrap$1.insertBefore(gutterWrap, lineView.text);
        if (lineView.line.gutterClass)
          { gutterWrap.className += " " + lineView.line.gutterClass; }
        if (cm.options.lineNumbers && (!markers || !markers["CodeMirror-linenumbers"]))
          { lineView.lineNumber = gutterWrap.appendChild(
            elt("div", lineNumberFor(cm.options, lineN),
                "CodeMirror-linenumber CodeMirror-gutter-elt",
                ("left: " + (dims.gutterLeft["CodeMirror-linenumbers"]) + "px; width: " + (cm.display.lineNumInnerWidth) + "px"))); }
        if (markers) { for (var k = 0; k < cm.display.gutterSpecs.length; ++k) {
          var id = cm.display.gutterSpecs[k].className, found = markers.hasOwnProperty(id) && markers[id];
          if (found)
            { gutterWrap.appendChild(elt("div", [found], "CodeMirror-gutter-elt",
                                       ("left: " + (dims.gutterLeft[id]) + "px; width: " + (dims.gutterWidth[id]) + "px"))); }
        } }
      }
    }

    function updateLineWidgets(cm, lineView, dims) {
      if (lineView.alignable) { lineView.alignable = null; }
      var isWidget = classTest("CodeMirror-linewidget");
      for (var node = lineView.node.firstChild, next = (void 0); node; node = next) {
        next = node.nextSibling;
        if (isWidget.test(node.className)) { lineView.node.removeChild(node); }
      }
      insertLineWidgets(cm, lineView, dims);
    }

    // Build a line's DOM representation from scratch
    function buildLineElement(cm, lineView, lineN, dims) {
      var built = getLineContent(cm, lineView);
      lineView.text = lineView.node = built.pre;
      if (built.bgClass) { lineView.bgClass = built.bgClass; }
      if (built.textClass) { lineView.textClass = built.textClass; }

      updateLineClasses(cm, lineView);
      updateLineGutter(cm, lineView, lineN, dims);
      insertLineWidgets(cm, lineView, dims);
      return lineView.node
    }

    // A lineView may contain multiple logical lines (when merged by
    // collapsed spans). The widgets for all of them need to be drawn.
    function insertLineWidgets(cm, lineView, dims) {
      insertLineWidgetsFor(cm, lineView.line, lineView, dims, true);
      if (lineView.rest) { for (var i = 0; i < lineView.rest.length; i++)
        { insertLineWidgetsFor(cm, lineView.rest[i], lineView, dims, false); } }
    }

    function insertLineWidgetsFor(cm, line, lineView, dims, allowAbove) {
      if (!line.widgets) { return }
      var wrap = ensureLineWrapped(lineView);
      for (var i = 0, ws = line.widgets; i < ws.length; ++i) {
        var widget = ws[i], node = elt("div", [widget.node], "CodeMirror-linewidget" + (widget.className ? " " + widget.className : ""));
        if (!widget.handleMouseEvents) { node.setAttribute("cm-ignore-events", "true"); }
        positionLineWidget(widget, node, lineView, dims);
        cm.display.input.setUneditable(node);
        if (allowAbove && widget.above)
          { wrap.insertBefore(node, lineView.gutter || lineView.text); }
        else
          { wrap.appendChild(node); }
        signalLater(widget, "redraw");
      }
    }

    function positionLineWidget(widget, node, lineView, dims) {
      if (widget.noHScroll) {
    (lineView.alignable || (lineView.alignable = [])).push(node);
        var width = dims.wrapperWidth;
        node.style.left = dims.fixedPos + "px";
        if (!widget.coverGutter) {
          width -= dims.gutterTotalWidth;
          node.style.paddingLeft = dims.gutterTotalWidth + "px";
        }
        node.style.width = width + "px";
      }
      if (widget.coverGutter) {
        node.style.zIndex = 5;
        node.style.position = "relative";
        if (!widget.noHScroll) { node.style.marginLeft = -dims.gutterTotalWidth + "px"; }
      }
    }

    function widgetHeight(widget) {
      if (widget.height != null) { return widget.height }
      var cm = widget.doc.cm;
      if (!cm) { return 0 }
      if (!contains(document.body, widget.node)) {
        var parentStyle = "position: relative;";
        if (widget.coverGutter)
          { parentStyle += "margin-left: -" + cm.display.gutters.offsetWidth + "px;"; }
        if (widget.noHScroll)
          { parentStyle += "width: " + cm.display.wrapper.clientWidth + "px;"; }
        removeChildrenAndAdd(cm.display.measure, elt("div", [widget.node], null, parentStyle));
      }
      return widget.height = widget.node.parentNode.offsetHeight
    }

    // Return true when the given mouse event happened in a widget
    function eventInWidget(display, e) {
      for (var n = e_target(e); n != display.wrapper; n = n.parentNode) {
        if (!n || (n.nodeType == 1 && n.getAttribute("cm-ignore-events") == "true") ||
            (n.parentNode == display.sizer && n != display.mover))
          { return true }
      }
    }

    // POSITION MEASUREMENT

    function paddingTop(display) {return display.lineSpace.offsetTop}
    function paddingVert(display) {return display.mover.offsetHeight - display.lineSpace.offsetHeight}
    function paddingH(display) {
      if (display.cachedPaddingH) { return display.cachedPaddingH }
      var e = removeChildrenAndAdd(display.measure, elt("pre", "x", "CodeMirror-line-like"));
      var style = window.getComputedStyle ? window.getComputedStyle(e) : e.currentStyle;
      var data = {left: parseInt(style.paddingLeft), right: parseInt(style.paddingRight)};
      if (!isNaN(data.left) && !isNaN(data.right)) { display.cachedPaddingH = data; }
      return data
    }

    function scrollGap(cm) { return scrollerGap - cm.display.nativeBarWidth }
    function displayWidth(cm) {
      return cm.display.scroller.clientWidth - scrollGap(cm) - cm.display.barWidth
    }
    function displayHeight(cm) {
      return cm.display.scroller.clientHeight - scrollGap(cm) - cm.display.barHeight
    }

    // Ensure the lineView.wrapping.heights array is populated. This is
    // an array of bottom offsets for the lines that make up a drawn
    // line. When lineWrapping is on, there might be more than one
    // height.
    function ensureLineHeights(cm, lineView, rect) {
      var wrapping = cm.options.lineWrapping;
      var curWidth = wrapping && displayWidth(cm);
      if (!lineView.measure.heights || wrapping && lineView.measure.width != curWidth) {
        var heights = lineView.measure.heights = [];
        if (wrapping) {
          lineView.measure.width = curWidth;
          var rects = lineView.text.firstChild.getClientRects();
          for (var i = 0; i < rects.length - 1; i++) {
            var cur = rects[i], next = rects[i + 1];
            if (Math.abs(cur.bottom - next.bottom) > 2)
              { heights.push((cur.bottom + next.top) / 2 - rect.top); }
          }
        }
        heights.push(rect.bottom - rect.top);
      }
    }

    // Find a line map (mapping character offsets to text nodes) and a
    // measurement cache for the given line number. (A line view might
    // contain multiple lines when collapsed ranges are present.)
    function mapFromLineView(lineView, line, lineN) {
      if (lineView.line == line)
        { return {map: lineView.measure.map, cache: lineView.measure.cache} }
      for (var i = 0; i < lineView.rest.length; i++)
        { if (lineView.rest[i] == line)
          { return {map: lineView.measure.maps[i], cache: lineView.measure.caches[i]} } }
      for (var i$1 = 0; i$1 < lineView.rest.length; i$1++)
        { if (lineNo(lineView.rest[i$1]) > lineN)
          { return {map: lineView.measure.maps[i$1], cache: lineView.measure.caches[i$1], before: true} } }
    }

    // Render a line into the hidden node display.externalMeasured. Used
    // when measurement is needed for a line that's not in the viewport.
    function updateExternalMeasurement(cm, line) {
      line = visualLine(line);
      var lineN = lineNo(line);
      var view = cm.display.externalMeasured = new LineView(cm.doc, line, lineN);
      view.lineN = lineN;
      var built = view.built = buildLineContent(cm, view);
      view.text = built.pre;
      removeChildrenAndAdd(cm.display.lineMeasure, built.pre);
      return view
    }

    // Get a {top, bottom, left, right} box (in line-local coordinates)
    // for a given character.
    function measureChar(cm, line, ch, bias) {
      return measureCharPrepared(cm, prepareMeasureForLine(cm, line), ch, bias)
    }

    // Find a line view that corresponds to the given line number.
    function findViewForLine(cm, lineN) {
      if (lineN >= cm.display.viewFrom && lineN < cm.display.viewTo)
        { return cm.display.view[findViewIndex(cm, lineN)] }
      var ext = cm.display.externalMeasured;
      if (ext && lineN >= ext.lineN && lineN < ext.lineN + ext.size)
        { return ext }
    }

    // Measurement can be split in two steps, the set-up work that
    // applies to the whole line, and the measurement of the actual
    // character. Functions like coordsChar, that need to do a lot of
    // measurements in a row, can thus ensure that the set-up work is
    // only done once.
    function prepareMeasureForLine(cm, line) {
      var lineN = lineNo(line);
      var view = findViewForLine(cm, lineN);
      if (view && !view.text) {
        view = null;
      } else if (view && view.changes) {
        updateLineForChanges(cm, view, lineN, getDimensions(cm));
        cm.curOp.forceUpdate = true;
      }
      if (!view)
        { view = updateExternalMeasurement(cm, line); }

      var info = mapFromLineView(view, line, lineN);
      return {
        line: line, view: view, rect: null,
        map: info.map, cache: info.cache, before: info.before,
        hasHeights: false
      }
    }

    // Given a prepared measurement object, measures the position of an
    // actual character (or fetches it from the cache).
    function measureCharPrepared(cm, prepared, ch, bias, varHeight) {
      if (prepared.before) { ch = -1; }
      var key = ch + (bias || ""), found;
      if (prepared.cache.hasOwnProperty(key)) {
        found = prepared.cache[key];
      } else {
        if (!prepared.rect)
          { prepared.rect = prepared.view.text.getBoundingClientRect(); }
        if (!prepared.hasHeights) {
          ensureLineHeights(cm, prepared.view, prepared.rect);
          prepared.hasHeights = true;
        }
        found = measureCharInner(cm, prepared, ch, bias);
        if (!found.bogus) { prepared.cache[key] = found; }
      }
      return {left: found.left, right: found.right,
              top: varHeight ? found.rtop : found.top,
              bottom: varHeight ? found.rbottom : found.bottom}
    }

    var nullRect = {left: 0, right: 0, top: 0, bottom: 0};

    function nodeAndOffsetInLineMap(map, ch, bias) {
      var node, start, end, collapse, mStart, mEnd;
      // First, search the line map for the text node corresponding to,
      // or closest to, the target character.
      for (var i = 0; i < map.length; i += 3) {
        mStart = map[i];
        mEnd = map[i + 1];
        if (ch < mStart) {
          start = 0; end = 1;
          collapse = "left";
        } else if (ch < mEnd) {
          start = ch - mStart;
          end = start + 1;
        } else if (i == map.length - 3 || ch == mEnd && map[i + 3] > ch) {
          end = mEnd - mStart;
          start = end - 1;
          if (ch >= mEnd) { collapse = "right"; }
        }
        if (start != null) {
          node = map[i + 2];
          if (mStart == mEnd && bias == (node.insertLeft ? "left" : "right"))
            { collapse = bias; }
          if (bias == "left" && start == 0)
            { while (i && map[i - 2] == map[i - 3] && map[i - 1].insertLeft) {
              node = map[(i -= 3) + 2];
              collapse = "left";
            } }
          if (bias == "right" && start == mEnd - mStart)
            { while (i < map.length - 3 && map[i + 3] == map[i + 4] && !map[i + 5].insertLeft) {
              node = map[(i += 3) + 2];
              collapse = "right";
            } }
          break
        }
      }
      return {node: node, start: start, end: end, collapse: collapse, coverStart: mStart, coverEnd: mEnd}
    }

    function getUsefulRect(rects, bias) {
      var rect = nullRect;
      if (bias == "left") { for (var i = 0; i < rects.length; i++) {
        if ((rect = rects[i]).left != rect.right) { break }
      } } else { for (var i$1 = rects.length - 1; i$1 >= 0; i$1--) {
        if ((rect = rects[i$1]).left != rect.right) { break }
      } }
      return rect
    }

    function measureCharInner(cm, prepared, ch, bias) {
      var place = nodeAndOffsetInLineMap(prepared.map, ch, bias);
      var node = place.node, start = place.start, end = place.end, collapse = place.collapse;

      var rect;
      if (node.nodeType == 3) { // If it is a text node, use a range to retrieve the coordinates.
        for (var i$1 = 0; i$1 < 4; i$1++) { // Retry a maximum of 4 times when nonsense rectangles are returned
          while (start && isExtendingChar(prepared.line.text.charAt(place.coverStart + start))) { --start; }
          while (place.coverStart + end < place.coverEnd && isExtendingChar(prepared.line.text.charAt(place.coverStart + end))) { ++end; }
          if (ie && ie_version < 9 && start == 0 && end == place.coverEnd - place.coverStart)
            { rect = node.parentNode.getBoundingClientRect(); }
          else
            { rect = getUsefulRect(range(node, start, end).getClientRects(), bias); }
          if (rect.left || rect.right || start == 0) { break }
          end = start;
          start = start - 1;
          collapse = "right";
        }
        if (ie && ie_version < 11) { rect = maybeUpdateRectForZooming(cm.display.measure, rect); }
      } else { // If it is a widget, simply get the box for the whole widget.
        if (start > 0) { collapse = bias = "right"; }
        var rects;
        if (cm.options.lineWrapping && (rects = node.getClientRects()).length > 1)
          { rect = rects[bias == "right" ? rects.length - 1 : 0]; }
        else
          { rect = node.getBoundingClientRect(); }
      }
      if (ie && ie_version < 9 && !start && (!rect || !rect.left && !rect.right)) {
        var rSpan = node.parentNode.getClientRects()[0];
        if (rSpan)
          { rect = {left: rSpan.left, right: rSpan.left + charWidth(cm.display), top: rSpan.top, bottom: rSpan.bottom}; }
        else
          { rect = nullRect; }
      }

      var rtop = rect.top - prepared.rect.top, rbot = rect.bottom - prepared.rect.top;
      var mid = (rtop + rbot) / 2;
      var heights = prepared.view.measure.heights;
      var i = 0;
      for (; i < heights.length - 1; i++)
        { if (mid < heights[i]) { break } }
      var top = i ? heights[i - 1] : 0, bot = heights[i];
      var result = {left: (collapse == "right" ? rect.right : rect.left) - prepared.rect.left,
                    right: (collapse == "left" ? rect.left : rect.right) - prepared.rect.left,
                    top: top, bottom: bot};
      if (!rect.left && !rect.right) { result.bogus = true; }
      if (!cm.options.singleCursorHeightPerLine) { result.rtop = rtop; result.rbottom = rbot; }

      return result
    }

    // Work around problem with bounding client rects on ranges being
    // returned incorrectly when zoomed on IE10 and below.
    function maybeUpdateRectForZooming(measure, rect) {
      if (!window.screen || screen.logicalXDPI == null ||
          screen.logicalXDPI == screen.deviceXDPI || !hasBadZoomedRects(measure))
        { return rect }
      var scaleX = screen.logicalXDPI / screen.deviceXDPI;
      var scaleY = screen.logicalYDPI / screen.deviceYDPI;
      return {left: rect.left * scaleX, right: rect.right * scaleX,
              top: rect.top * scaleY, bottom: rect.bottom * scaleY}
    }

    function clearLineMeasurementCacheFor(lineView) {
      if (lineView.measure) {
        lineView.measure.cache = {};
        lineView.measure.heights = null;
        if (lineView.rest) { for (var i = 0; i < lineView.rest.length; i++)
          { lineView.measure.caches[i] = {}; } }
      }
    }

    function clearLineMeasurementCache(cm) {
      cm.display.externalMeasure = null;
      removeChildren(cm.display.lineMeasure);
      for (var i = 0; i < cm.display.view.length; i++)
        { clearLineMeasurementCacheFor(cm.display.view[i]); }
    }

    function clearCaches(cm) {
      clearLineMeasurementCache(cm);
      cm.display.cachedCharWidth = cm.display.cachedTextHeight = cm.display.cachedPaddingH = null;
      if (!cm.options.lineWrapping) { cm.display.maxLineChanged = true; }
      cm.display.lineNumChars = null;
    }

    function pageScrollX() {
      // Work around https://bugs.chromium.org/p/chromium/issues/detail?id=489206
      // which causes page_Offset and bounding client rects to use
      // different reference viewports and invalidate our calculations.
      if (chrome && android) { return -(document.body.getBoundingClientRect().left - parseInt(getComputedStyle(document.body).marginLeft)) }
      return window.pageXOffset || (document.documentElement || document.body).scrollLeft
    }
    function pageScrollY() {
      if (chrome && android) { return -(document.body.getBoundingClientRect().top - parseInt(getComputedStyle(document.body).marginTop)) }
      return window.pageYOffset || (document.documentElement || document.body).scrollTop
    }

    function widgetTopHeight(lineObj) {
      var height = 0;
      if (lineObj.widgets) { for (var i = 0; i < lineObj.widgets.length; ++i) { if (lineObj.widgets[i].above)
        { height += widgetHeight(lineObj.widgets[i]); } } }
      return height
    }

    // Converts a {top, bottom, left, right} box from line-local
    // coordinates into another coordinate system. Context may be one of
    // "line", "div" (display.lineDiv), "local"./null (editor), "window",
    // or "page".
    function intoCoordSystem(cm, lineObj, rect, context, includeWidgets) {
      if (!includeWidgets) {
        var height = widgetTopHeight(lineObj);
        rect.top += height; rect.bottom += height;
      }
      if (context == "line") { return rect }
      if (!context) { context = "local"; }
      var yOff = heightAtLine(lineObj);
      if (context == "local") { yOff += paddingTop(cm.display); }
      else { yOff -= cm.display.viewOffset; }
      if (context == "page" || context == "window") {
        var lOff = cm.display.lineSpace.getBoundingClientRect();
        yOff += lOff.top + (context == "window" ? 0 : pageScrollY());
        var xOff = lOff.left + (context == "window" ? 0 : pageScrollX());
        rect.left += xOff; rect.right += xOff;
      }
      rect.top += yOff; rect.bottom += yOff;
      return rect
    }

    // Coverts a box from "div" coords to another coordinate system.
    // Context may be "window", "page", "div", or "local"./null.
    function fromCoordSystem(cm, coords, context) {
      if (context == "div") { return coords }
      var left = coords.left, top = coords.top;
      // First move into "page" coordinate system
      if (context == "page") {
        left -= pageScrollX();
        top -= pageScrollY();
      } else if (context == "local" || !context) {
        var localBox = cm.display.sizer.getBoundingClientRect();
        left += localBox.left;
        top += localBox.top;
      }

      var lineSpaceBox = cm.display.lineSpace.getBoundingClientRect();
      return {left: left - lineSpaceBox.left, top: top - lineSpaceBox.top}
    }

    function charCoords(cm, pos, context, lineObj, bias) {
      if (!lineObj) { lineObj = getLine(cm.doc, pos.line); }
      return intoCoordSystem(cm, lineObj, measureChar(cm, lineObj, pos.ch, bias), context)
    }

    // Returns a box for a given cursor position, which may have an
    // 'other' property containing the position of the secondary cursor
    // on a bidi boundary.
    // A cursor Pos(line, char, "before") is on the same visual line as `char - 1`
    // and after `char - 1` in writing order of `char - 1`
    // A cursor Pos(line, char, "after") is on the same visual line as `char`
    // and before `char` in writing order of `char`
    // Examples (upper-case letters are RTL, lower-case are LTR):
    //     Pos(0, 1, ...)
    //     before   after
    // ab     a|b     a|b
    // aB     a|B     aB|
    // Ab     |Ab     A|b
    // AB     B|A     B|A
    // Every position after the last character on a line is considered to stick
    // to the last character on the line.
    function cursorCoords(cm, pos, context, lineObj, preparedMeasure, varHeight) {
      lineObj = lineObj || getLine(cm.doc, pos.line);
      if (!preparedMeasure) { preparedMeasure = prepareMeasureForLine(cm, lineObj); }
      function get(ch, right) {
        var m = measureCharPrepared(cm, preparedMeasure, ch, right ? "right" : "left", varHeight);
        if (right) { m.left = m.right; } else { m.right = m.left; }
        return intoCoordSystem(cm, lineObj, m, context)
      }
      var order = getOrder(lineObj, cm.doc.direction), ch = pos.ch, sticky = pos.sticky;
      if (ch >= lineObj.text.length) {
        ch = lineObj.text.length;
        sticky = "before";
      } else if (ch <= 0) {
        ch = 0;
        sticky = "after";
      }
      if (!order) { return get(sticky == "before" ? ch - 1 : ch, sticky == "before") }

      function getBidi(ch, partPos, invert) {
        var part = order[partPos], right = part.level == 1;
        return get(invert ? ch - 1 : ch, right != invert)
      }
      var partPos = getBidiPartAt(order, ch, sticky);
      var other = bidiOther;
      var val = getBidi(ch, partPos, sticky == "before");
      if (other != null) { val.other = getBidi(ch, other, sticky != "before"); }
      return val
    }

    // Used to cheaply estimate the coordinates for a position. Used for
    // intermediate scroll updates.
    function estimateCoords(cm, pos) {
      var left = 0;
      pos = clipPos(cm.doc, pos);
      if (!cm.options.lineWrapping) { left = charWidth(cm.display) * pos.ch; }
      var lineObj = getLine(cm.doc, pos.line);
      var top = heightAtLine(lineObj) + paddingTop(cm.display);
      return {left: left, right: left, top: top, bottom: top + lineObj.height}
    }

    // Positions returned by coordsChar contain some extra information.
    // xRel is the relative x position of the input coordinates compared
    // to the found position (so xRel > 0 means the coordinates are to
    // the right of the character position, for example). When outside
    // is true, that means the coordinates lie outside the line's
    // vertical range.
    function PosWithInfo(line, ch, sticky, outside, xRel) {
      var pos = Pos(line, ch, sticky);
      pos.xRel = xRel;
      if (outside) { pos.outside = outside; }
      return pos
    }

    // Compute the character position closest to the given coordinates.
    // Input must be lineSpace-local ("div" coordinate system).
    function coordsChar(cm, x, y) {
      var doc = cm.doc;
      y += cm.display.viewOffset;
      if (y < 0) { return PosWithInfo(doc.first, 0, null, -1, -1) }
      var lineN = lineAtHeight(doc, y), last = doc.first + doc.size - 1;
      if (lineN > last)
        { return PosWithInfo(doc.first + doc.size - 1, getLine(doc, last).text.length, null, 1, 1) }
      if (x < 0) { x = 0; }

      var lineObj = getLine(doc, lineN);
      for (;;) {
        var found = coordsCharInner(cm, lineObj, lineN, x, y);
        var collapsed = collapsedSpanAround(lineObj, found.ch + (found.xRel > 0 || found.outside > 0 ? 1 : 0));
        if (!collapsed) { return found }
        var rangeEnd = collapsed.find(1);
        if (rangeEnd.line == lineN) { return rangeEnd }
        lineObj = getLine(doc, lineN = rangeEnd.line);
      }
    }

    function wrappedLineExtent(cm, lineObj, preparedMeasure, y) {
      y -= widgetTopHeight(lineObj);
      var end = lineObj.text.length;
      var begin = findFirst(function (ch) { return measureCharPrepared(cm, preparedMeasure, ch - 1).bottom <= y; }, end, 0);
      end = findFirst(function (ch) { return measureCharPrepared(cm, preparedMeasure, ch).top > y; }, begin, end);
      return {begin: begin, end: end}
    }

    function wrappedLineExtentChar(cm, lineObj, preparedMeasure, target) {
      if (!preparedMeasure) { preparedMeasure = prepareMeasureForLine(cm, lineObj); }
      var targetTop = intoCoordSystem(cm, lineObj, measureCharPrepared(cm, preparedMeasure, target), "line").top;
      return wrappedLineExtent(cm, lineObj, preparedMeasure, targetTop)
    }

    // Returns true if the given side of a box is after the given
    // coordinates, in top-to-bottom, left-to-right order.
    function boxIsAfter(box, x, y, left) {
      return box.bottom <= y ? false : box.top > y ? true : (left ? box.left : box.right) > x
    }

    function coordsCharInner(cm, lineObj, lineNo, x, y) {
      // Move y into line-local coordinate space
      y -= heightAtLine(lineObj);
      var preparedMeasure = prepareMeasureForLine(cm, lineObj);
      // When directly calling `measureCharPrepared`, we have to adjust
      // for the widgets at this line.
      var widgetHeight = widgetTopHeight(lineObj);
      var begin = 0, end = lineObj.text.length, ltr = true;

      var order = getOrder(lineObj, cm.doc.direction);
      // If the line isn't plain left-to-right text, first figure out
      // which bidi section the coordinates fall into.
      if (order) {
        var part = (cm.options.lineWrapping ? coordsBidiPartWrapped : coordsBidiPart)
                     (cm, lineObj, lineNo, preparedMeasure, order, x, y);
        ltr = part.level != 1;
        // The awkward -1 offsets are needed because findFirst (called
        // on these below) will treat its first bound as inclusive,
        // second as exclusive, but we want to actually address the
        // characters in the part's range
        begin = ltr ? part.from : part.to - 1;
        end = ltr ? part.to : part.from - 1;
      }

      // A binary search to find the first character whose bounding box
      // starts after the coordinates. If we run across any whose box wrap
      // the coordinates, store that.
      var chAround = null, boxAround = null;
      var ch = findFirst(function (ch) {
        var box = measureCharPrepared(cm, preparedMeasure, ch);
        box.top += widgetHeight; box.bottom += widgetHeight;
        if (!boxIsAfter(box, x, y, false)) { return false }
        if (box.top <= y && box.left <= x) {
          chAround = ch;
          boxAround = box;
        }
        return true
      }, begin, end);

      var baseX, sticky, outside = false;
      // If a box around the coordinates was found, use that
      if (boxAround) {
        // Distinguish coordinates nearer to the left or right side of the box
        var atLeft = x - boxAround.left < boxAround.right - x, atStart = atLeft == ltr;
        ch = chAround + (atStart ? 0 : 1);
        sticky = atStart ? "after" : "before";
        baseX = atLeft ? boxAround.left : boxAround.right;
      } else {
        // (Adjust for extended bound, if necessary.)
        if (!ltr && (ch == end || ch == begin)) { ch++; }
        // To determine which side to associate with, get the box to the
        // left of the character and compare it's vertical position to the
        // coordinates
        sticky = ch == 0 ? "after" : ch == lineObj.text.length ? "before" :
          (measureCharPrepared(cm, preparedMeasure, ch - (ltr ? 1 : 0)).bottom + widgetHeight <= y) == ltr ?
          "after" : "before";
        // Now get accurate coordinates for this place, in order to get a
        // base X position
        var coords = cursorCoords(cm, Pos(lineNo, ch, sticky), "line", lineObj, preparedMeasure);
        baseX = coords.left;
        outside = y < coords.top ? -1 : y >= coords.bottom ? 1 : 0;
      }

      ch = skipExtendingChars(lineObj.text, ch, 1);
      return PosWithInfo(lineNo, ch, sticky, outside, x - baseX)
    }

    function coordsBidiPart(cm, lineObj, lineNo, preparedMeasure, order, x, y) {
      // Bidi parts are sorted left-to-right, and in a non-line-wrapping
      // situation, we can take this ordering to correspond to the visual
      // ordering. This finds the first part whose end is after the given
      // coordinates.
      var index = findFirst(function (i) {
        var part = order[i], ltr = part.level != 1;
        return boxIsAfter(cursorCoords(cm, Pos(lineNo, ltr ? part.to : part.from, ltr ? "before" : "after"),
                                       "line", lineObj, preparedMeasure), x, y, true)
      }, 0, order.length - 1);
      var part = order[index];
      // If this isn't the first part, the part's start is also after
      // the coordinates, and the coordinates aren't on the same line as
      // that start, move one part back.
      if (index > 0) {
        var ltr = part.level != 1;
        var start = cursorCoords(cm, Pos(lineNo, ltr ? part.from : part.to, ltr ? "after" : "before"),
                                 "line", lineObj, preparedMeasure);
        if (boxIsAfter(start, x, y, true) && start.top > y)
          { part = order[index - 1]; }
      }
      return part
    }

    function coordsBidiPartWrapped(cm, lineObj, _lineNo, preparedMeasure, order, x, y) {
      // In a wrapped line, rtl text on wrapping boundaries can do things
      // that don't correspond to the ordering in our `order` array at
      // all, so a binary search doesn't work, and we want to return a
      // part that only spans one line so that the binary search in
      // coordsCharInner is safe. As such, we first find the extent of the
      // wrapped line, and then do a flat search in which we discard any
      // spans that aren't on the line.
      var ref = wrappedLineExtent(cm, lineObj, preparedMeasure, y);
      var begin = ref.begin;
      var end = ref.end;
      if (/\s/.test(lineObj.text.charAt(end - 1))) { end--; }
      var part = null, closestDist = null;
      for (var i = 0; i < order.length; i++) {
        var p = order[i];
        if (p.from >= end || p.to <= begin) { continue }
        var ltr = p.level != 1;
        var endX = measureCharPrepared(cm, preparedMeasure, ltr ? Math.min(end, p.to) - 1 : Math.max(begin, p.from)).right;
        // Weigh against spans ending before this, so that they are only
        // picked if nothing ends after
        var dist = endX < x ? x - endX + 1e9 : endX - x;
        if (!part || closestDist > dist) {
          part = p;
          closestDist = dist;
        }
      }
      if (!part) { part = order[order.length - 1]; }
      // Clip the part to the wrapped line.
      if (part.from < begin) { part = {from: begin, to: part.to, level: part.level}; }
      if (part.to > end) { part = {from: part.from, to: end, level: part.level}; }
      return part
    }

    var measureText;
    // Compute the default text height.
    function textHeight(display) {
      if (display.cachedTextHeight != null) { return display.cachedTextHeight }
      if (measureText == null) {
        measureText = elt("pre", null, "CodeMirror-line-like");
        // Measure a bunch of lines, for browsers that compute
        // fractional heights.
        for (var i = 0; i < 49; ++i) {
          measureText.appendChild(document.createTextNode("x"));
          measureText.appendChild(elt("br"));
        }
        measureText.appendChild(document.createTextNode("x"));
      }
      removeChildrenAndAdd(display.measure, measureText);
      var height = measureText.offsetHeight / 50;
      if (height > 3) { display.cachedTextHeight = height; }
      removeChildren(display.measure);
      return height || 1
    }

    // Compute the default character width.
    function charWidth(display) {
      if (display.cachedCharWidth != null) { return display.cachedCharWidth }
      var anchor = elt("span", "xxxxxxxxxx");
      var pre = elt("pre", [anchor], "CodeMirror-line-like");
      removeChildrenAndAdd(display.measure, pre);
      var rect = anchor.getBoundingClientRect(), width = (rect.right - rect.left) / 10;
      if (width > 2) { display.cachedCharWidth = width; }
      return width || 10
    }

    // Do a bulk-read of the DOM positions and sizes needed to draw the
    // view, so that we don't interleave reading and writing to the DOM.
    function getDimensions(cm) {
      var d = cm.display, left = {}, width = {};
      var gutterLeft = d.gutters.clientLeft;
      for (var n = d.gutters.firstChild, i = 0; n; n = n.nextSibling, ++i) {
        var id = cm.display.gutterSpecs[i].className;
        left[id] = n.offsetLeft + n.clientLeft + gutterLeft;
        width[id] = n.clientWidth;
      }
      return {fixedPos: compensateForHScroll(d),
              gutterTotalWidth: d.gutters.offsetWidth,
              gutterLeft: left,
              gutterWidth: width,
              wrapperWidth: d.wrapper.clientWidth}
    }

    // Computes display.scroller.scrollLeft + display.gutters.offsetWidth,
    // but using getBoundingClientRect to get a sub-pixel-accurate
    // result.
    function compensateForHScroll(display) {
      return display.scroller.getBoundingClientRect().left - display.sizer.getBoundingClientRect().left
    }

    // Returns a function that estimates the height of a line, to use as
    // first approximation until the line becomes visible (and is thus
    // properly measurable).
    function estimateHeight(cm) {
      var th = textHeight(cm.display), wrapping = cm.options.lineWrapping;
      var perLine = wrapping && Math.max(5, cm.display.scroller.clientWidth / charWidth(cm.display) - 3);
      return function (line) {
        if (lineIsHidden(cm.doc, line)) { return 0 }

        var widgetsHeight = 0;
        if (line.widgets) { for (var i = 0; i < line.widgets.length; i++) {
          if (line.widgets[i].height) { widgetsHeight += line.widgets[i].height; }
        } }

        if (wrapping)
          { return widgetsHeight + (Math.ceil(line.text.length / perLine) || 1) * th }
        else
          { return widgetsHeight + th }
      }
    }

    function estimateLineHeights(cm) {
      var doc = cm.doc, est = estimateHeight(cm);
      doc.iter(function (line) {
        var estHeight = est(line);
        if (estHeight != line.height) { updateLineHeight(line, estHeight); }
      });
    }

    // Given a mouse event, find the corresponding position. If liberal
    // is false, it checks whether a gutter or scrollbar was clicked,
    // and returns null if it was. forRect is used by rectangular
    // selections, and tries to estimate a character position even for
    // coordinates beyond the right of the text.
    function posFromMouse(cm, e, liberal, forRect) {
      var display = cm.display;
      if (!liberal && e_target(e).getAttribute("cm-not-content") == "true") { return null }

      var x, y, space = display.lineSpace.getBoundingClientRect();
      // Fails unpredictably on IE[67] when mouse is dragged around quickly.
      try { x = e.clientX - space.left; y = e.clientY - space.top; }
      catch (e$1) { return null }
      var coords = coordsChar(cm, x, y), line;
      if (forRect && coords.xRel > 0 && (line = getLine(cm.doc, coords.line).text).length == coords.ch) {
        var colDiff = countColumn(line, line.length, cm.options.tabSize) - line.length;
        coords = Pos(coords.line, Math.max(0, Math.round((x - paddingH(cm.display).left) / charWidth(cm.display)) - colDiff));
      }
      return coords
    }

    // Find the view element corresponding to a given line. Return null
    // when the line isn't visible.
    function findViewIndex(cm, n) {
      if (n >= cm.display.viewTo) { return null }
      n -= cm.display.viewFrom;
      if (n < 0) { return null }
      var view = cm.display.view;
      for (var i = 0; i < view.length; i++) {
        n -= view[i].size;
        if (n < 0) { return i }
      }
    }

    // Updates the display.view data structure for a given change to the
    // document. From and to are in pre-change coordinates. Lendiff is
    // the amount of lines added or subtracted by the change. This is
    // used for changes that span multiple lines, or change the way
    // lines are divided into visual lines. regLineChange (below)
    // registers single-line changes.
    function regChange(cm, from, to, lendiff) {
      if (from == null) { from = cm.doc.first; }
      if (to == null) { to = cm.doc.first + cm.doc.size; }
      if (!lendiff) { lendiff = 0; }

      var display = cm.display;
      if (lendiff && to < display.viewTo &&
          (display.updateLineNumbers == null || display.updateLineNumbers > from))
        { display.updateLineNumbers = from; }

      cm.curOp.viewChanged = true;

      if (from >= display.viewTo) { // Change after
        if (sawCollapsedSpans && visualLineNo(cm.doc, from) < display.viewTo)
          { resetView(cm); }
      } else if (to <= display.viewFrom) { // Change before
        if (sawCollapsedSpans && visualLineEndNo(cm.doc, to + lendiff) > display.viewFrom) {
          resetView(cm);
        } else {
          display.viewFrom += lendiff;
          display.viewTo += lendiff;
        }
      } else if (from <= display.viewFrom && to >= display.viewTo) { // Full overlap
        resetView(cm);
      } else if (from <= display.viewFrom) { // Top overlap
        var cut = viewCuttingPoint(cm, to, to + lendiff, 1);
        if (cut) {
          display.view = display.view.slice(cut.index);
          display.viewFrom = cut.lineN;
          display.viewTo += lendiff;
        } else {
          resetView(cm);
        }
      } else if (to >= display.viewTo) { // Bottom overlap
        var cut$1 = viewCuttingPoint(cm, from, from, -1);
        if (cut$1) {
          display.view = display.view.slice(0, cut$1.index);
          display.viewTo = cut$1.lineN;
        } else {
          resetView(cm);
        }
      } else { // Gap in the middle
        var cutTop = viewCuttingPoint(cm, from, from, -1);
        var cutBot = viewCuttingPoint(cm, to, to + lendiff, 1);
        if (cutTop && cutBot) {
          display.view = display.view.slice(0, cutTop.index)
            .concat(buildViewArray(cm, cutTop.lineN, cutBot.lineN))
            .concat(display.view.slice(cutBot.index));
          display.viewTo += lendiff;
        } else {
          resetView(cm);
        }
      }

      var ext = display.externalMeasured;
      if (ext) {
        if (to < ext.lineN)
          { ext.lineN += lendiff; }
        else if (from < ext.lineN + ext.size)
          { display.externalMeasured = null; }
      }
    }

    // Register a change to a single line. Type must be one of "text",
    // "gutter", "class", "widget"
    function regLineChange(cm, line, type) {
      cm.curOp.viewChanged = true;
      var display = cm.display, ext = cm.display.externalMeasured;
      if (ext && line >= ext.lineN && line < ext.lineN + ext.size)
        { display.externalMeasured = null; }

      if (line < display.viewFrom || line >= display.viewTo) { return }
      var lineView = display.view[findViewIndex(cm, line)];
      if (lineView.node == null) { return }
      var arr = lineView.changes || (lineView.changes = []);
      if (indexOf(arr, type) == -1) { arr.push(type); }
    }

    // Clear the view.
    function resetView(cm) {
      cm.display.viewFrom = cm.display.viewTo = cm.doc.first;
      cm.display.view = [];
      cm.display.viewOffset = 0;
    }

    function viewCuttingPoint(cm, oldN, newN, dir) {
      var index = findViewIndex(cm, oldN), diff, view = cm.display.view;
      if (!sawCollapsedSpans || newN == cm.doc.first + cm.doc.size)
        { return {index: index, lineN: newN} }
      var n = cm.display.viewFrom;
      for (var i = 0; i < index; i++)
        { n += view[i].size; }
      if (n != oldN) {
        if (dir > 0) {
          if (index == view.length - 1) { return null }
          diff = (n + view[index].size) - oldN;
          index++;
        } else {
          diff = n - oldN;
        }
        oldN += diff; newN += diff;
      }
      while (visualLineNo(cm.doc, newN) != newN) {
        if (index == (dir < 0 ? 0 : view.length - 1)) { return null }
        newN += dir * view[index - (dir < 0 ? 1 : 0)].size;
        index += dir;
      }
      return {index: index, lineN: newN}
    }

    // Force the view to cover a given range, adding empty view element
    // or clipping off existing ones as needed.
    function adjustView(cm, from, to) {
      var display = cm.display, view = display.view;
      if (view.length == 0 || from >= display.viewTo || to <= display.viewFrom) {
        display.view = buildViewArray(cm, from, to);
        display.viewFrom = from;
      } else {
        if (display.viewFrom > from)
          { display.view = buildViewArray(cm, from, display.viewFrom).concat(display.view); }
        else if (display.viewFrom < from)
          { display.view = display.view.slice(findViewIndex(cm, from)); }
        display.viewFrom = from;
        if (display.viewTo < to)
          { display.view = display.view.concat(buildViewArray(cm, display.viewTo, to)); }
        else if (display.viewTo > to)
          { display.view = display.view.slice(0, findViewIndex(cm, to)); }
      }
      display.viewTo = to;
    }

    // Count the number of lines in the view whose DOM representation is
    // out of date (or nonexistent).
    function countDirtyView(cm) {
      var view = cm.display.view, dirty = 0;
      for (var i = 0; i < view.length; i++) {
        var lineView = view[i];
        if (!lineView.hidden && (!lineView.node || lineView.changes)) { ++dirty; }
      }
      return dirty
    }

    function updateSelection(cm) {
      cm.display.input.showSelection(cm.display.input.prepareSelection());
    }

    function prepareSelection(cm, primary) {
      if ( primary === void 0 ) primary = true;

      var doc = cm.doc, result = {};
      var curFragment = result.cursors = document.createDocumentFragment();
      var selFragment = result.selection = document.createDocumentFragment();

      for (var i = 0; i < doc.sel.ranges.length; i++) {
        if (!primary && i == doc.sel.primIndex) { continue }
        var range = doc.sel.ranges[i];
        if (range.from().line >= cm.display.viewTo || range.to().line < cm.display.viewFrom) { continue }
        var collapsed = range.empty();
        if (collapsed || cm.options.showCursorWhenSelecting)
          { drawSelectionCursor(cm, range.head, curFragment); }
        if (!collapsed)
          { drawSelectionRange(cm, range, selFragment); }
      }
      return result
    }

    // Draws a cursor for the given range
    function drawSelectionCursor(cm, head, output) {
      var pos = cursorCoords(cm, head, "div", null, null, !cm.options.singleCursorHeightPerLine);

      var cursor = output.appendChild(elt("div", "\u00a0", "CodeMirror-cursor"));
      cursor.style.left = pos.left + "px";
      cursor.style.top = pos.top + "px";
      cursor.style.height = Math.max(0, pos.bottom - pos.top) * cm.options.cursorHeight + "px";

      if (pos.other) {
        // Secondary cursor, shown when on a 'jump' in bi-directional text
        var otherCursor = output.appendChild(elt("div", "\u00a0", "CodeMirror-cursor CodeMirror-secondarycursor"));
        otherCursor.style.display = "";
        otherCursor.style.left = pos.other.left + "px";
        otherCursor.style.top = pos.other.top + "px";
        otherCursor.style.height = (pos.other.bottom - pos.other.top) * .85 + "px";
      }
    }

    function cmpCoords(a, b) { return a.top - b.top || a.left - b.left }

    // Draws the given range as a highlighted selection
    function drawSelectionRange(cm, range, output) {
      var display = cm.display, doc = cm.doc;
      var fragment = document.createDocumentFragment();
      var padding = paddingH(cm.display), leftSide = padding.left;
      var rightSide = Math.max(display.sizerWidth, displayWidth(cm) - display.sizer.offsetLeft) - padding.right;
      var docLTR = doc.direction == "ltr";

      function add(left, top, width, bottom) {
        if (top < 0) { top = 0; }
        top = Math.round(top);
        bottom = Math.round(bottom);
        fragment.appendChild(elt("div", null, "CodeMirror-selected", ("position: absolute; left: " + left + "px;\n                             top: " + top + "px; width: " + (width == null ? rightSide - left : width) + "px;\n                             height: " + (bottom - top) + "px")));
      }

      function drawForLine(line, fromArg, toArg) {
        var lineObj = getLine(doc, line);
        var lineLen = lineObj.text.length;
        var start, end;
        function coords(ch, bias) {
          return charCoords(cm, Pos(line, ch), "div", lineObj, bias)
        }

        function wrapX(pos, dir, side) {
          var extent = wrappedLineExtentChar(cm, lineObj, null, pos);
          var prop = (dir == "ltr") == (side == "after") ? "left" : "right";
          var ch = side == "after" ? extent.begin : extent.end - (/\s/.test(lineObj.text.charAt(extent.end - 1)) ? 2 : 1);
          return coords(ch, prop)[prop]
        }

        var order = getOrder(lineObj, doc.direction);
        iterateBidiSections(order, fromArg || 0, toArg == null ? lineLen : toArg, function (from, to, dir, i) {
          var ltr = dir == "ltr";
          var fromPos = coords(from, ltr ? "left" : "right");
          var toPos = coords(to - 1, ltr ? "right" : "left");

          var openStart = fromArg == null && from == 0, openEnd = toArg == null && to == lineLen;
          var first = i == 0, last = !order || i == order.length - 1;
          if (toPos.top - fromPos.top <= 3) { // Single line
            var openLeft = (docLTR ? openStart : openEnd) && first;
            var openRight = (docLTR ? openEnd : openStart) && last;
            var left = openLeft ? leftSide : (ltr ? fromPos : toPos).left;
            var right = openRight ? rightSide : (ltr ? toPos : fromPos).right;
            add(left, fromPos.top, right - left, fromPos.bottom);
          } else { // Multiple lines
            var topLeft, topRight, botLeft, botRight;
            if (ltr) {
              topLeft = docLTR && openStart && first ? leftSide : fromPos.left;
              topRight = docLTR ? rightSide : wrapX(from, dir, "before");
              botLeft = docLTR ? leftSide : wrapX(to, dir, "after");
              botRight = docLTR && openEnd && last ? rightSide : toPos.right;
            } else {
              topLeft = !docLTR ? leftSide : wrapX(from, dir, "before");
              topRight = !docLTR && openStart && first ? rightSide : fromPos.right;
              botLeft = !docLTR && openEnd && last ? leftSide : toPos.left;
              botRight = !docLTR ? rightSide : wrapX(to, dir, "after");
            }
            add(topLeft, fromPos.top, topRight - topLeft, fromPos.bottom);
            if (fromPos.bottom < toPos.top) { add(leftSide, fromPos.bottom, null, toPos.top); }
            add(botLeft, toPos.top, botRight - botLeft, toPos.bottom);
          }

          if (!start || cmpCoords(fromPos, start) < 0) { start = fromPos; }
          if (cmpCoords(toPos, start) < 0) { start = toPos; }
          if (!end || cmpCoords(fromPos, end) < 0) { end = fromPos; }
          if (cmpCoords(toPos, end) < 0) { end = toPos; }
        });
        return {start: start, end: end}
      }

      var sFrom = range.from(), sTo = range.to();
      if (sFrom.line == sTo.line) {
        drawForLine(sFrom.line, sFrom.ch, sTo.ch);
      } else {
        var fromLine = getLine(doc, sFrom.line), toLine = getLine(doc, sTo.line);
        var singleVLine = visualLine(fromLine) == visualLine(toLine);
        var leftEnd = drawForLine(sFrom.line, sFrom.ch, singleVLine ? fromLine.text.length + 1 : null).end;
        var rightStart = drawForLine(sTo.line, singleVLine ? 0 : null, sTo.ch).start;
        if (singleVLine) {
          if (leftEnd.top < rightStart.top - 2) {
            add(leftEnd.right, leftEnd.top, null, leftEnd.bottom);
            add(leftSide, rightStart.top, rightStart.left, rightStart.bottom);
          } else {
            add(leftEnd.right, leftEnd.top, rightStart.left - leftEnd.right, leftEnd.bottom);
          }
        }
        if (leftEnd.bottom < rightStart.top)
          { add(leftSide, leftEnd.bottom, null, rightStart.top); }
      }

      output.appendChild(fragment);
    }

    // Cursor-blinking
    function restartBlink(cm) {
      if (!cm.state.focused) { return }
      var display = cm.display;
      clearInterval(display.blinker);
      var on = true;
      display.cursorDiv.style.visibility = "";
      if (cm.options.cursorBlinkRate > 0)
        { display.blinker = setInterval(function () {
          if (!cm.hasFocus()) { onBlur(cm); }
          display.cursorDiv.style.visibility = (on = !on) ? "" : "hidden";
        }, cm.options.cursorBlinkRate); }
      else if (cm.options.cursorBlinkRate < 0)
        { display.cursorDiv.style.visibility = "hidden"; }
    }

    function ensureFocus(cm) {
      if (!cm.hasFocus()) {
        cm.display.input.focus();
        if (!cm.state.focused) { onFocus(cm); }
      }
    }

    function delayBlurEvent(cm) {
      cm.state.delayingBlurEvent = true;
      setTimeout(function () { if (cm.state.delayingBlurEvent) {
        cm.state.delayingBlurEvent = false;
        if (cm.state.focused) { onBlur(cm); }
      } }, 100);
    }

    function onFocus(cm, e) {
      if (cm.state.delayingBlurEvent && !cm.state.draggingText) { cm.state.delayingBlurEvent = false; }

      if (cm.options.readOnly == "nocursor") { return }
      if (!cm.state.focused) {
        signal(cm, "focus", cm, e);
        cm.state.focused = true;
        addClass(cm.display.wrapper, "CodeMirror-focused");
        // This test prevents this from firing when a context
        // menu is closed (since the input reset would kill the
        // select-all detection hack)
        if (!cm.curOp && cm.display.selForContextMenu != cm.doc.sel) {
          cm.display.input.reset();
          if (webkit) { setTimeout(function () { return cm.display.input.reset(true); }, 20); } // Issue #1730
        }
        cm.display.input.receivedFocus();
      }
      restartBlink(cm);
    }
    function onBlur(cm, e) {
      if (cm.state.delayingBlurEvent) { return }

      if (cm.state.focused) {
        signal(cm, "blur", cm, e);
        cm.state.focused = false;
        rmClass(cm.display.wrapper, "CodeMirror-focused");
      }
      clearInterval(cm.display.blinker);
      setTimeout(function () { if (!cm.state.focused) { cm.display.shift = false; } }, 150);
    }

    // Read the actual heights of the rendered lines, and update their
    // stored heights to match.
    function updateHeightsInViewport(cm) {
      var display = cm.display;
      var prevBottom = display.lineDiv.offsetTop;
      for (var i = 0; i < display.view.length; i++) {
        var cur = display.view[i], wrapping = cm.options.lineWrapping;
        var height = (void 0), width = 0;
        if (cur.hidden) { continue }
        if (ie && ie_version < 8) {
          var bot = cur.node.offsetTop + cur.node.offsetHeight;
          height = bot - prevBottom;
          prevBottom = bot;
        } else {
          var box = cur.node.getBoundingClientRect();
          height = box.bottom - box.top;
          // Check that lines don't extend past the right of the current
          // editor width
          if (!wrapping && cur.text.firstChild)
            { width = cur.text.firstChild.getBoundingClientRect().right - box.left - 1; }
        }
        var diff = cur.line.height - height;
        if (diff > .005 || diff < -.005) {
          updateLineHeight(cur.line, height);
          updateWidgetHeight(cur.line);
          if (cur.rest) { for (var j = 0; j < cur.rest.length; j++)
            { updateWidgetHeight(cur.rest[j]); } }
        }
        if (width > cm.display.sizerWidth) {
          var chWidth = Math.ceil(width / charWidth(cm.display));
          if (chWidth > cm.display.maxLineLength) {
            cm.display.maxLineLength = chWidth;
            cm.display.maxLine = cur.line;
            cm.display.maxLineChanged = true;
          }
        }
      }
    }

    // Read and store the height of line widgets associated with the
    // given line.
    function updateWidgetHeight(line) {
      if (line.widgets) { for (var i = 0; i < line.widgets.length; ++i) {
        var w = line.widgets[i], parent = w.node.parentNode;
        if (parent) { w.height = parent.offsetHeight; }
      } }
    }

    // Compute the lines that are visible in a given viewport (defaults
    // the the current scroll position). viewport may contain top,
    // height, and ensure (see op.scrollToPos) properties.
    function visibleLines(display, doc, viewport) {
      var top = viewport && viewport.top != null ? Math.max(0, viewport.top) : display.scroller.scrollTop;
      top = Math.floor(top - paddingTop(display));
      var bottom = viewport && viewport.bottom != null ? viewport.bottom : top + display.wrapper.clientHeight;

      var from = lineAtHeight(doc, top), to = lineAtHeight(doc, bottom);
      // Ensure is a {from: {line, ch}, to: {line, ch}} object, and
      // forces those lines into the viewport (if possible).
      if (viewport && viewport.ensure) {
        var ensureFrom = viewport.ensure.from.line, ensureTo = viewport.ensure.to.line;
        if (ensureFrom < from) {
          from = ensureFrom;
          to = lineAtHeight(doc, heightAtLine(getLine(doc, ensureFrom)) + display.wrapper.clientHeight);
        } else if (Math.min(ensureTo, doc.lastLine()) >= to) {
          from = lineAtHeight(doc, heightAtLine(getLine(doc, ensureTo)) - display.wrapper.clientHeight);
          to = ensureTo;
        }
      }
      return {from: from, to: Math.max(to, from + 1)}
    }

    // SCROLLING THINGS INTO VIEW

    // If an editor sits on the top or bottom of the window, partially
    // scrolled out of view, this ensures that the cursor is visible.
    function maybeScrollWindow(cm, rect) {
      if (signalDOMEvent(cm, "scrollCursorIntoView")) { return }

      var display = cm.display, box = display.sizer.getBoundingClientRect(), doScroll = null;
      if (rect.top + box.top < 0) { doScroll = true; }
      else if (rect.bottom + box.top > (window.innerHeight || document.documentElement.clientHeight)) { doScroll = false; }
      if (doScroll != null && !phantom) {
        var scrollNode = elt("div", "\u200b", null, ("position: absolute;\n                         top: " + (rect.top - display.viewOffset - paddingTop(cm.display)) + "px;\n                         height: " + (rect.bottom - rect.top + scrollGap(cm) + display.barHeight) + "px;\n                         left: " + (rect.left) + "px; width: " + (Math.max(2, rect.right - rect.left)) + "px;"));
        cm.display.lineSpace.appendChild(scrollNode);
        scrollNode.scrollIntoView(doScroll);
        cm.display.lineSpace.removeChild(scrollNode);
      }
    }

    // Scroll a given position into view (immediately), verifying that
    // it actually became visible (as line heights are accurately
    // measured, the position of something may 'drift' during drawing).
    function scrollPosIntoView(cm, pos, end, margin) {
      if (margin == null) { margin = 0; }
      var rect;
      if (!cm.options.lineWrapping && pos == end) {
        // Set pos and end to the cursor positions around the character pos sticks to
        // If pos.sticky == "before", that is around pos.ch - 1, otherwise around pos.ch
        // If pos == Pos(_, 0, "before"), pos and end are unchanged
        pos = pos.ch ? Pos(pos.line, pos.sticky == "before" ? pos.ch - 1 : pos.ch, "after") : pos;
        end = pos.sticky == "before" ? Pos(pos.line, pos.ch + 1, "before") : pos;
      }
      for (var limit = 0; limit < 5; limit++) {
        var changed = false;
        var coords = cursorCoords(cm, pos);
        var endCoords = !end || end == pos ? coords : cursorCoords(cm, end);
        rect = {left: Math.min(coords.left, endCoords.left),
                top: Math.min(coords.top, endCoords.top) - margin,
                right: Math.max(coords.left, endCoords.left),
                bottom: Math.max(coords.bottom, endCoords.bottom) + margin};
        var scrollPos = calculateScrollPos(cm, rect);
        var startTop = cm.doc.scrollTop, startLeft = cm.doc.scrollLeft;
        if (scrollPos.scrollTop != null) {
          updateScrollTop(cm, scrollPos.scrollTop);
          if (Math.abs(cm.doc.scrollTop - startTop) > 1) { changed = true; }
        }
        if (scrollPos.scrollLeft != null) {
          setScrollLeft(cm, scrollPos.scrollLeft);
          if (Math.abs(cm.doc.scrollLeft - startLeft) > 1) { changed = true; }
        }
        if (!changed) { break }
      }
      return rect
    }

    // Scroll a given set of coordinates into view (immediately).
    function scrollIntoView(cm, rect) {
      var scrollPos = calculateScrollPos(cm, rect);
      if (scrollPos.scrollTop != null) { updateScrollTop(cm, scrollPos.scrollTop); }
      if (scrollPos.scrollLeft != null) { setScrollLeft(cm, scrollPos.scrollLeft); }
    }

    // Calculate a new scroll position needed to scroll the given
    // rectangle into view. Returns an object with scrollTop and
    // scrollLeft properties. When these are undefined, the
    // vertical/horizontal position does not need to be adjusted.
    function calculateScrollPos(cm, rect) {
      var display = cm.display, snapMargin = textHeight(cm.display);
      if (rect.top < 0) { rect.top = 0; }
      var screentop = cm.curOp && cm.curOp.scrollTop != null ? cm.curOp.scrollTop : display.scroller.scrollTop;
      var screen = displayHeight(cm), result = {};
      if (rect.bottom - rect.top > screen) { rect.bottom = rect.top + screen; }
      var docBottom = cm.doc.height + paddingVert(display);
      var atTop = rect.top < snapMargin, atBottom = rect.bottom > docBottom - snapMargin;
      if (rect.top < screentop) {
        result.scrollTop = atTop ? 0 : rect.top;
      } else if (rect.bottom > screentop + screen) {
        var newTop = Math.min(rect.top, (atBottom ? docBottom : rect.bottom) - screen);
        if (newTop != screentop) { result.scrollTop = newTop; }
      }

      var gutterSpace = cm.options.fixedGutter ? 0 : display.gutters.offsetWidth;
      var screenleft = cm.curOp && cm.curOp.scrollLeft != null ? cm.curOp.scrollLeft : display.scroller.scrollLeft - gutterSpace;
      var screenw = displayWidth(cm) - display.gutters.offsetWidth;
      var tooWide = rect.right - rect.left > screenw;
      if (tooWide) { rect.right = rect.left + screenw; }
      if (rect.left < 10)
        { result.scrollLeft = 0; }
      else if (rect.left < screenleft)
        { result.scrollLeft = Math.max(0, rect.left + gutterSpace - (tooWide ? 0 : 10)); }
      else if (rect.right > screenw + screenleft - 3)
        { result.scrollLeft = rect.right + (tooWide ? 0 : 10) - screenw; }
      return result
    }

    // Store a relative adjustment to the scroll position in the current
    // operation (to be applied when the operation finishes).
    function addToScrollTop(cm, top) {
      if (top == null) { return }
      resolveScrollToPos(cm);
      cm.curOp.scrollTop = (cm.curOp.scrollTop == null ? cm.doc.scrollTop : cm.curOp.scrollTop) + top;
    }

    // Make sure that at the end of the operation the current cursor is
    // shown.
    function ensureCursorVisible(cm) {
      resolveScrollToPos(cm);
      var cur = cm.getCursor();
      cm.curOp.scrollToPos = {from: cur, to: cur, margin: cm.options.cursorScrollMargin};
    }

    function scrollToCoords(cm, x, y) {
      if (x != null || y != null) { resolveScrollToPos(cm); }
      if (x != null) { cm.curOp.scrollLeft = x; }
      if (y != null) { cm.curOp.scrollTop = y; }
    }

    function scrollToRange(cm, range) {
      resolveScrollToPos(cm);
      cm.curOp.scrollToPos = range;
    }

    // When an operation has its scrollToPos property set, and another
    // scroll action is applied before the end of the operation, this
    // 'simulates' scrolling that position into view in a cheap way, so
    // that the effect of intermediate scroll commands is not ignored.
    function resolveScrollToPos(cm) {
      var range = cm.curOp.scrollToPos;
      if (range) {
        cm.curOp.scrollToPos = null;
        var from = estimateCoords(cm, range.from), to = estimateCoords(cm, range.to);
        scrollToCoordsRange(cm, from, to, range.margin);
      }
    }

    function scrollToCoordsRange(cm, from, to, margin) {
      var sPos = calculateScrollPos(cm, {
        left: Math.min(from.left, to.left),
        top: Math.min(from.top, to.top) - margin,
        right: Math.max(from.right, to.right),
        bottom: Math.max(from.bottom, to.bottom) + margin
      });
      scrollToCoords(cm, sPos.scrollLeft, sPos.scrollTop);
    }

    // Sync the scrollable area and scrollbars, ensure the viewport
    // covers the visible area.
    function updateScrollTop(cm, val) {
      if (Math.abs(cm.doc.scrollTop - val) < 2) { return }
      if (!gecko) { updateDisplaySimple(cm, {top: val}); }
      setScrollTop(cm, val, true);
      if (gecko) { updateDisplaySimple(cm); }
      startWorker(cm, 100);
    }

    function setScrollTop(cm, val, forceScroll) {
      val = Math.max(0, Math.min(cm.display.scroller.scrollHeight - cm.display.scroller.clientHeight, val));
      if (cm.display.scroller.scrollTop == val && !forceScroll) { return }
      cm.doc.scrollTop = val;
      cm.display.scrollbars.setScrollTop(val);
      if (cm.display.scroller.scrollTop != val) { cm.display.scroller.scrollTop = val; }
    }

    // Sync scroller and scrollbar, ensure the gutter elements are
    // aligned.
    function setScrollLeft(cm, val, isScroller, forceScroll) {
      val = Math.max(0, Math.min(val, cm.display.scroller.scrollWidth - cm.display.scroller.clientWidth));
      if ((isScroller ? val == cm.doc.scrollLeft : Math.abs(cm.doc.scrollLeft - val) < 2) && !forceScroll) { return }
      cm.doc.scrollLeft = val;
      alignHorizontally(cm);
      if (cm.display.scroller.scrollLeft != val) { cm.display.scroller.scrollLeft = val; }
      cm.display.scrollbars.setScrollLeft(val);
    }

    // SCROLLBARS

    // Prepare DOM reads needed to update the scrollbars. Done in one
    // shot to minimize update/measure roundtrips.
    function measureForScrollbars(cm) {
      var d = cm.display, gutterW = d.gutters.offsetWidth;
      var docH = Math.round(cm.doc.height + paddingVert(cm.display));
      return {
        clientHeight: d.scroller.clientHeight,
        viewHeight: d.wrapper.clientHeight,
        scrollWidth: d.scroller.scrollWidth, clientWidth: d.scroller.clientWidth,
        viewWidth: d.wrapper.clientWidth,
        barLeft: cm.options.fixedGutter ? gutterW : 0,
        docHeight: docH,
        scrollHeight: docH + scrollGap(cm) + d.barHeight,
        nativeBarWidth: d.nativeBarWidth,
        gutterWidth: gutterW
      }
    }

    var NativeScrollbars = function(place, scroll, cm) {
      this.cm = cm;
      var vert = this.vert = elt("div", [elt("div", null, null, "min-width: 1px")], "CodeMirror-vscrollbar");
      var horiz = this.horiz = elt("div", [elt("div", null, null, "height: 100%; min-height: 1px")], "CodeMirror-hscrollbar");
      vert.tabIndex = horiz.tabIndex = -1;
      place(vert); place(horiz);

      on(vert, "scroll", function () {
        if (vert.clientHeight) { scroll(vert.scrollTop, "vertical"); }
      });
      on(horiz, "scroll", function () {
        if (horiz.clientWidth) { scroll(horiz.scrollLeft, "horizontal"); }
      });

      this.checkedZeroWidth = false;
      // Need to set a minimum width to see the scrollbar on IE7 (but must not set it on IE8).
      if (ie && ie_version < 8) { this.horiz.style.minHeight = this.vert.style.minWidth = "18px"; }
    };

    NativeScrollbars.prototype.update = function (measure) {
      var needsH = measure.scrollWidth > measure.clientWidth + 1;
      var needsV = measure.scrollHeight > measure.clientHeight + 1;
      var sWidth = measure.nativeBarWidth;

      if (needsV) {
        this.vert.style.display = "block";
        this.vert.style.bottom = needsH ? sWidth + "px" : "0";
        var totalHeight = measure.viewHeight - (needsH ? sWidth : 0);
        // A bug in IE8 can cause this value to be negative, so guard it.
        this.vert.firstChild.style.height =
          Math.max(0, measure.scrollHeight - measure.clientHeight + totalHeight) + "px";
      } else {
        this.vert.style.display = "";
        this.vert.firstChild.style.height = "0";
      }

      if (needsH) {
        this.horiz.style.display = "block";
        this.horiz.style.right = needsV ? sWidth + "px" : "0";
        this.horiz.style.left = measure.barLeft + "px";
        var totalWidth = measure.viewWidth - measure.barLeft - (needsV ? sWidth : 0);
        this.horiz.firstChild.style.width =
          Math.max(0, measure.scrollWidth - measure.clientWidth + totalWidth) + "px";
      } else {
        this.horiz.style.display = "";
        this.horiz.firstChild.style.width = "0";
      }

      if (!this.checkedZeroWidth && measure.clientHeight > 0) {
        if (sWidth == 0) { this.zeroWidthHack(); }
        this.checkedZeroWidth = true;
      }

      return {right: needsV ? sWidth : 0, bottom: needsH ? sWidth : 0}
    };

    NativeScrollbars.prototype.setScrollLeft = function (pos) {
      if (this.horiz.scrollLeft != pos) { this.horiz.scrollLeft = pos; }
      if (this.disableHoriz) { this.enableZeroWidthBar(this.horiz, this.disableHoriz, "horiz"); }
    };

    NativeScrollbars.prototype.setScrollTop = function (pos) {
      if (this.vert.scrollTop != pos) { this.vert.scrollTop = pos; }
      if (this.disableVert) { this.enableZeroWidthBar(this.vert, this.disableVert, "vert"); }
    };

    NativeScrollbars.prototype.zeroWidthHack = function () {
      var w = mac && !mac_geMountainLion ? "12px" : "18px";
      this.horiz.style.height = this.vert.style.width = w;
      this.horiz.style.pointerEvents = this.vert.style.pointerEvents = "none";
      this.disableHoriz = new Delayed;
      this.disableVert = new Delayed;
    };

    NativeScrollbars.prototype.enableZeroWidthBar = function (bar, delay, type) {
      bar.style.pointerEvents = "auto";
      function maybeDisable() {
        // To find out whether the scrollbar is still visible, we
        // check whether the element under the pixel in the bottom
        // right corner of the scrollbar box is the scrollbar box
        // itself (when the bar is still visible) or its filler child
        // (when the bar is hidden). If it is still visible, we keep
        // it enabled, if it's hidden, we disable pointer events.
        var box = bar.getBoundingClientRect();
        var elt = type == "vert" ? document.elementFromPoint(box.right - 1, (box.top + box.bottom) / 2)
            : document.elementFromPoint((box.right + box.left) / 2, box.bottom - 1);
        if (elt != bar) { bar.style.pointerEvents = "none"; }
        else { delay.set(1000, maybeDisable); }
      }
      delay.set(1000, maybeDisable);
    };

    NativeScrollbars.prototype.clear = function () {
      var parent = this.horiz.parentNode;
      parent.removeChild(this.horiz);
      parent.removeChild(this.vert);
    };

    var NullScrollbars = function () {};

    NullScrollbars.prototype.update = function () { return {bottom: 0, right: 0} };
    NullScrollbars.prototype.setScrollLeft = function () {};
    NullScrollbars.prototype.setScrollTop = function () {};
    NullScrollbars.prototype.clear = function () {};

    function updateScrollbars(cm, measure) {
      if (!measure) { measure = measureForScrollbars(cm); }
      var startWidth = cm.display.barWidth, startHeight = cm.display.barHeight;
      updateScrollbarsInner(cm, measure);
      for (var i = 0; i < 4 && startWidth != cm.display.barWidth || startHeight != cm.display.barHeight; i++) {
        if (startWidth != cm.display.barWidth && cm.options.lineWrapping)
          { updateHeightsInViewport(cm); }
        updateScrollbarsInner(cm, measureForScrollbars(cm));
        startWidth = cm.display.barWidth; startHeight = cm.display.barHeight;
      }
    }

    // Re-synchronize the fake scrollbars with the actual size of the
    // content.
    function updateScrollbarsInner(cm, measure) {
      var d = cm.display;
      var sizes = d.scrollbars.update(measure);

      d.sizer.style.paddingRight = (d.barWidth = sizes.right) + "px";
      d.sizer.style.paddingBottom = (d.barHeight = sizes.bottom) + "px";
      d.heightForcer.style.borderBottom = sizes.bottom + "px solid transparent";

      if (sizes.right && sizes.bottom) {
        d.scrollbarFiller.style.display = "block";
        d.scrollbarFiller.style.height = sizes.bottom + "px";
        d.scrollbarFiller.style.width = sizes.right + "px";
      } else { d.scrollbarFiller.style.display = ""; }
      if (sizes.bottom && cm.options.coverGutterNextToScrollbar && cm.options.fixedGutter) {
        d.gutterFiller.style.display = "block";
        d.gutterFiller.style.height = sizes.bottom + "px";
        d.gutterFiller.style.width = measure.gutterWidth + "px";
      } else { d.gutterFiller.style.display = ""; }
    }

    var scrollbarModel = {"native": NativeScrollbars, "null": NullScrollbars};

    function initScrollbars(cm) {
      if (cm.display.scrollbars) {
        cm.display.scrollbars.clear();
        if (cm.display.scrollbars.addClass)
          { rmClass(cm.display.wrapper, cm.display.scrollbars.addClass); }
      }

      cm.display.scrollbars = new scrollbarModel[cm.options.scrollbarStyle](function (node) {
        cm.display.wrapper.insertBefore(node, cm.display.scrollbarFiller);
        // Prevent clicks in the scrollbars from killing focus
        on(node, "mousedown", function () {
          if (cm.state.focused) { setTimeout(function () { return cm.display.input.focus(); }, 0); }
        });
        node.setAttribute("cm-not-content", "true");
      }, function (pos, axis) {
        if (axis == "horizontal") { setScrollLeft(cm, pos); }
        else { updateScrollTop(cm, pos); }
      }, cm);
      if (cm.display.scrollbars.addClass)
        { addClass(cm.display.wrapper, cm.display.scrollbars.addClass); }
    }

    // Operations are used to wrap a series of changes to the editor
    // state in such a way that each change won't have to update the
    // cursor and display (which would be awkward, slow, and
    // error-prone). Instead, display updates are batched and then all
    // combined and executed at once.

    var nextOpId = 0;
    // Start a new operation.
    function startOperation(cm) {
      cm.curOp = {
        cm: cm,
        viewChanged: false,      // Flag that indicates that lines might need to be redrawn
        startHeight: cm.doc.height, // Used to detect need to update scrollbar
        forceUpdate: false,      // Used to force a redraw
        updateInput: 0,       // Whether to reset the input textarea
        typing: false,           // Whether this reset should be careful to leave existing text (for compositing)
        changeObjs: null,        // Accumulated changes, for firing change events
        cursorActivityHandlers: null, // Set of handlers to fire cursorActivity on
        cursorActivityCalled: 0, // Tracks which cursorActivity handlers have been called already
        selectionChanged: false, // Whether the selection needs to be redrawn
        updateMaxLine: false,    // Set when the widest line needs to be determined anew
        scrollLeft: null, scrollTop: null, // Intermediate scroll position, not pushed to DOM yet
        scrollToPos: null,       // Used to scroll to a specific position
        focus: false,
        id: ++nextOpId           // Unique ID
      };
      pushOperation(cm.curOp);
    }

    // Finish an operation, updating the display and signalling delayed events
    function endOperation(cm) {
      var op = cm.curOp;
      if (op) { finishOperation(op, function (group) {
        for (var i = 0; i < group.ops.length; i++)
          { group.ops[i].cm.curOp = null; }
        endOperations(group);
      }); }
    }

    // The DOM updates done when an operation finishes are batched so
    // that the minimum number of relayouts are required.
    function endOperations(group) {
      var ops = group.ops;
      for (var i = 0; i < ops.length; i++) // Read DOM
        { endOperation_R1(ops[i]); }
      for (var i$1 = 0; i$1 < ops.length; i$1++) // Write DOM (maybe)
        { endOperation_W1(ops[i$1]); }
      for (var i$2 = 0; i$2 < ops.length; i$2++) // Read DOM
        { endOperation_R2(ops[i$2]); }
      for (var i$3 = 0; i$3 < ops.length; i$3++) // Write DOM (maybe)
        { endOperation_W2(ops[i$3]); }
      for (var i$4 = 0; i$4 < ops.length; i$4++) // Read DOM
        { endOperation_finish(ops[i$4]); }
    }

    function endOperation_R1(op) {
      var cm = op.cm, display = cm.display;
      maybeClipScrollbars(cm);
      if (op.updateMaxLine) { findMaxLine(cm); }

      op.mustUpdate = op.viewChanged || op.forceUpdate || op.scrollTop != null ||
        op.scrollToPos && (op.scrollToPos.from.line < display.viewFrom ||
                           op.scrollToPos.to.line >= display.viewTo) ||
        display.maxLineChanged && cm.options.lineWrapping;
      op.update = op.mustUpdate &&
        new DisplayUpdate(cm, op.mustUpdate && {top: op.scrollTop, ensure: op.scrollToPos}, op.forceUpdate);
    }

    function endOperation_W1(op) {
      op.updatedDisplay = op.mustUpdate && updateDisplayIfNeeded(op.cm, op.update);
    }

    function endOperation_R2(op) {
      var cm = op.cm, display = cm.display;
      if (op.updatedDisplay) { updateHeightsInViewport(cm); }

      op.barMeasure = measureForScrollbars(cm);

      // If the max line changed since it was last measured, measure it,
      // and ensure the document's width matches it.
      // updateDisplay_W2 will use these properties to do the actual resizing
      if (display.maxLineChanged && !cm.options.lineWrapping) {
        op.adjustWidthTo = measureChar(cm, display.maxLine, display.maxLine.text.length).left + 3;
        cm.display.sizerWidth = op.adjustWidthTo;
        op.barMeasure.scrollWidth =
          Math.max(display.scroller.clientWidth, display.sizer.offsetLeft + op.adjustWidthTo + scrollGap(cm) + cm.display.barWidth);
        op.maxScrollLeft = Math.max(0, display.sizer.offsetLeft + op.adjustWidthTo - displayWidth(cm));
      }

      if (op.updatedDisplay || op.selectionChanged)
        { op.preparedSelection = display.input.prepareSelection(); }
    }

    function endOperation_W2(op) {
      var cm = op.cm;

      if (op.adjustWidthTo != null) {
        cm.display.sizer.style.minWidth = op.adjustWidthTo + "px";
        if (op.maxScrollLeft < cm.doc.scrollLeft)
          { setScrollLeft(cm, Math.min(cm.display.scroller.scrollLeft, op.maxScrollLeft), true); }
        cm.display.maxLineChanged = false;
      }

      var takeFocus = op.focus && op.focus == activeElt();
      if (op.preparedSelection)
        { cm.display.input.showSelection(op.preparedSelection, takeFocus); }
      if (op.updatedDisplay || op.startHeight != cm.doc.height)
        { updateScrollbars(cm, op.barMeasure); }
      if (op.updatedDisplay)
        { setDocumentHeight(cm, op.barMeasure); }

      if (op.selectionChanged) { restartBlink(cm); }

      if (cm.state.focused && op.updateInput)
        { cm.display.input.reset(op.typing); }
      if (takeFocus) { ensureFocus(op.cm); }
    }

    function endOperation_finish(op) {
      var cm = op.cm, display = cm.display, doc = cm.doc;

      if (op.updatedDisplay) { postUpdateDisplay(cm, op.update); }

      // Abort mouse wheel delta measurement, when scrolling explicitly
      if (display.wheelStartX != null && (op.scrollTop != null || op.scrollLeft != null || op.scrollToPos))
        { display.wheelStartX = display.wheelStartY = null; }

      // Propagate the scroll position to the actual DOM scroller
      if (op.scrollTop != null) { setScrollTop(cm, op.scrollTop, op.forceScroll); }

      if (op.scrollLeft != null) { setScrollLeft(cm, op.scrollLeft, true, true); }
      // If we need to scroll a specific position into view, do so.
      if (op.scrollToPos) {
        var rect = scrollPosIntoView(cm, clipPos(doc, op.scrollToPos.from),
                                     clipPos(doc, op.scrollToPos.to), op.scrollToPos.margin);
        maybeScrollWindow(cm, rect);
      }

      // Fire events for markers that are hidden/unidden by editing or
      // undoing
      var hidden = op.maybeHiddenMarkers, unhidden = op.maybeUnhiddenMarkers;
      if (hidden) { for (var i = 0; i < hidden.length; ++i)
        { if (!hidden[i].lines.length) { signal(hidden[i], "hide"); } } }
      if (unhidden) { for (var i$1 = 0; i$1 < unhidden.length; ++i$1)
        { if (unhidden[i$1].lines.length) { signal(unhidden[i$1], "unhide"); } } }

      if (display.wrapper.offsetHeight)
        { doc.scrollTop = cm.display.scroller.scrollTop; }

      // Fire change events, and delayed event handlers
      if (op.changeObjs)
        { signal(cm, "changes", cm, op.changeObjs); }
      if (op.update)
        { op.update.finish(); }
    }

    // Run the given function in an operation
    function runInOp(cm, f) {
      if (cm.curOp) { return f() }
      startOperation(cm);
      try { return f() }
      finally { endOperation(cm); }
    }
    // Wraps a function in an operation. Returns the wrapped function.
    function operation(cm, f) {
      return function() {
        if (cm.curOp) { return f.apply(cm, arguments) }
        startOperation(cm);
        try { return f.apply(cm, arguments) }
        finally { endOperation(cm); }
      }
    }
    // Used to add methods to editor and doc instances, wrapping them in
    // operations.
    function methodOp(f) {
      return function() {
        if (this.curOp) { return f.apply(this, arguments) }
        startOperation(this);
        try { return f.apply(this, arguments) }
        finally { endOperation(this); }
      }
    }
    function docMethodOp(f) {
      return function() {
        var cm = this.cm;
        if (!cm || cm.curOp) { return f.apply(this, arguments) }
        startOperation(cm);
        try { return f.apply(this, arguments) }
        finally { endOperation(cm); }
      }
    }

    // HIGHLIGHT WORKER

    function startWorker(cm, time) {
      if (cm.doc.highlightFrontier < cm.display.viewTo)
        { cm.state.highlight.set(time, bind(highlightWorker, cm)); }
    }

    function highlightWorker(cm) {
      var doc = cm.doc;
      if (doc.highlightFrontier >= cm.display.viewTo) { return }
      var end = +new Date + cm.options.workTime;
      var context = getContextBefore(cm, doc.highlightFrontier);
      var changedLines = [];

      doc.iter(context.line, Math.min(doc.first + doc.size, cm.display.viewTo + 500), function (line) {
        if (context.line >= cm.display.viewFrom) { // Visible
          var oldStyles = line.styles;
          var resetState = line.text.length > cm.options.maxHighlightLength ? copyState(doc.mode, context.state) : null;
          var highlighted = highlightLine(cm, line, context, true);
          if (resetState) { context.state = resetState; }
          line.styles = highlighted.styles;
          var oldCls = line.styleClasses, newCls = highlighted.classes;
          if (newCls) { line.styleClasses = newCls; }
          else if (oldCls) { line.styleClasses = null; }
          var ischange = !oldStyles || oldStyles.length != line.styles.length ||
            oldCls != newCls && (!oldCls || !newCls || oldCls.bgClass != newCls.bgClass || oldCls.textClass != newCls.textClass);
          for (var i = 0; !ischange && i < oldStyles.length; ++i) { ischange = oldStyles[i] != line.styles[i]; }
          if (ischange) { changedLines.push(context.line); }
          line.stateAfter = context.save();
          context.nextLine();
        } else {
          if (line.text.length <= cm.options.maxHighlightLength)
            { processLine(cm, line.text, context); }
          line.stateAfter = context.line % 5 == 0 ? context.save() : null;
          context.nextLine();
        }
        if (+new Date > end) {
          startWorker(cm, cm.options.workDelay);
          return true
        }
      });
      doc.highlightFrontier = context.line;
      doc.modeFrontier = Math.max(doc.modeFrontier, context.line);
      if (changedLines.length) { runInOp(cm, function () {
        for (var i = 0; i < changedLines.length; i++)
          { regLineChange(cm, changedLines[i], "text"); }
      }); }
    }

    // DISPLAY DRAWING

    var DisplayUpdate = function(cm, viewport, force) {
      var display = cm.display;

      this.viewport = viewport;
      // Store some values that we'll need later (but don't want to force a relayout for)
      this.visible = visibleLines(display, cm.doc, viewport);
      this.editorIsHidden = !display.wrapper.offsetWidth;
      this.wrapperHeight = display.wrapper.clientHeight;
      this.wrapperWidth = display.wrapper.clientWidth;
      this.oldDisplayWidth = displayWidth(cm);
      this.force = force;
      this.dims = getDimensions(cm);
      this.events = [];
    };

    DisplayUpdate.prototype.signal = function (emitter, type) {
      if (hasHandler(emitter, type))
        { this.events.push(arguments); }
    };
    DisplayUpdate.prototype.finish = function () {
      for (var i = 0; i < this.events.length; i++)
        { signal.apply(null, this.events[i]); }
    };

    function maybeClipScrollbars(cm) {
      var display = cm.display;
      if (!display.scrollbarsClipped && display.scroller.offsetWidth) {
        display.nativeBarWidth = display.scroller.offsetWidth - display.scroller.clientWidth;
        display.heightForcer.style.height = scrollGap(cm) + "px";
        display.sizer.style.marginBottom = -display.nativeBarWidth + "px";
        display.sizer.style.borderRightWidth = scrollGap(cm) + "px";
        display.scrollbarsClipped = true;
      }
    }

    function selectionSnapshot(cm) {
      if (cm.hasFocus()) { return null }
      var active = activeElt();
      if (!active || !contains(cm.display.lineDiv, active)) { return null }
      var result = {activeElt: active};
      if (window.getSelection) {
        var sel = window.getSelection();
        if (sel.anchorNode && sel.extend && contains(cm.display.lineDiv, sel.anchorNode)) {
          result.anchorNode = sel.anchorNode;
          result.anchorOffset = sel.anchorOffset;
          result.focusNode = sel.focusNode;
          result.focusOffset = sel.focusOffset;
        }
      }
      return result
    }

    function restoreSelection(snapshot) {
      if (!snapshot || !snapshot.activeElt || snapshot.activeElt == activeElt()) { return }
      snapshot.activeElt.focus();
      if (!/^(INPUT|TEXTAREA)$/.test(snapshot.activeElt.nodeName) &&
          snapshot.anchorNode && contains(document.body, snapshot.anchorNode) && contains(document.body, snapshot.focusNode)) {
        var sel = window.getSelection(), range = document.createRange();
        range.setEnd(snapshot.anchorNode, snapshot.anchorOffset);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
        sel.extend(snapshot.focusNode, snapshot.focusOffset);
      }
    }

    // Does the actual updating of the line display. Bails out
    // (returning false) when there is nothing to be done and forced is
    // false.
    function updateDisplayIfNeeded(cm, update) {
      var display = cm.display, doc = cm.doc;

      if (update.editorIsHidden) {
        resetView(cm);
        return false
      }

      // Bail out if the visible area is already rendered and nothing changed.
      if (!update.force &&
          update.visible.from >= display.viewFrom && update.visible.to <= display.viewTo &&
          (display.updateLineNumbers == null || display.updateLineNumbers >= display.viewTo) &&
          display.renderedView == display.view && countDirtyView(cm) == 0)
        { return false }

      if (maybeUpdateLineNumberWidth(cm)) {
        resetView(cm);
        update.dims = getDimensions(cm);
      }

      // Compute a suitable new viewport (from & to)
      var end = doc.first + doc.size;
      var from = Math.max(update.visible.from - cm.options.viewportMargin, doc.first);
      var to = Math.min(end, update.visible.to + cm.options.viewportMargin);
      if (display.viewFrom < from && from - display.viewFrom < 20) { from = Math.max(doc.first, display.viewFrom); }
      if (display.viewTo > to && display.viewTo - to < 20) { to = Math.min(end, display.viewTo); }
      if (sawCollapsedSpans) {
        from = visualLineNo(cm.doc, from);
        to = visualLineEndNo(cm.doc, to);
      }

      var different = from != display.viewFrom || to != display.viewTo ||
        display.lastWrapHeight != update.wrapperHeight || display.lastWrapWidth != update.wrapperWidth;
      adjustView(cm, from, to);

      display.viewOffset = heightAtLine(getLine(cm.doc, display.viewFrom));
      // Position the mover div to align with the current scroll position
      cm.display.mover.style.top = display.viewOffset + "px";

      var toUpdate = countDirtyView(cm);
      if (!different && toUpdate == 0 && !update.force && display.renderedView == display.view &&
          (display.updateLineNumbers == null || display.updateLineNumbers >= display.viewTo))
        { return false }

      // For big changes, we hide the enclosing element during the
      // update, since that speeds up the operations on most browsers.
      var selSnapshot = selectionSnapshot(cm);
      if (toUpdate > 4) { display.lineDiv.style.display = "none"; }
      patchDisplay(cm, display.updateLineNumbers, update.dims);
      if (toUpdate > 4) { display.lineDiv.style.display = ""; }
      display.renderedView = display.view;
      // There might have been a widget with a focused element that got
      // hidden or updated, if so re-focus it.
      restoreSelection(selSnapshot);

      // Prevent selection and cursors from interfering with the scroll
      // width and height.
      removeChildren(display.cursorDiv);
      removeChildren(display.selectionDiv);
      display.gutters.style.height = display.sizer.style.minHeight = 0;

      if (different) {
        display.lastWrapHeight = update.wrapperHeight;
        display.lastWrapWidth = update.wrapperWidth;
        startWorker(cm, 400);
      }

      display.updateLineNumbers = null;

      return true
    }

    function postUpdateDisplay(cm, update) {
      var viewport = update.viewport;

      for (var first = true;; first = false) {
        if (!first || !cm.options.lineWrapping || update.oldDisplayWidth == displayWidth(cm)) {
          // Clip forced viewport to actual scrollable area.
          if (viewport && viewport.top != null)
            { viewport = {top: Math.min(cm.doc.height + paddingVert(cm.display) - displayHeight(cm), viewport.top)}; }
          // Updated line heights might result in the drawn area not
          // actually covering the viewport. Keep looping until it does.
          update.visible = visibleLines(cm.display, cm.doc, viewport);
          if (update.visible.from >= cm.display.viewFrom && update.visible.to <= cm.display.viewTo)
            { break }
        } else if (first) {
          update.visible = visibleLines(cm.display, cm.doc, viewport);
        }
        if (!updateDisplayIfNeeded(cm, update)) { break }
        updateHeightsInViewport(cm);
        var barMeasure = measureForScrollbars(cm);
        updateSelection(cm);
        updateScrollbars(cm, barMeasure);
        setDocumentHeight(cm, barMeasure);
        update.force = false;
      }

      update.signal(cm, "update", cm);
      if (cm.display.viewFrom != cm.display.reportedViewFrom || cm.display.viewTo != cm.display.reportedViewTo) {
        update.signal(cm, "viewportChange", cm, cm.display.viewFrom, cm.display.viewTo);
        cm.display.reportedViewFrom = cm.display.viewFrom; cm.display.reportedViewTo = cm.display.viewTo;
      }
    }

    function updateDisplaySimple(cm, viewport) {
      var update = new DisplayUpdate(cm, viewport);
      if (updateDisplayIfNeeded(cm, update)) {
        updateHeightsInViewport(cm);
        postUpdateDisplay(cm, update);
        var barMeasure = measureForScrollbars(cm);
        updateSelection(cm);
        updateScrollbars(cm, barMeasure);
        setDocumentHeight(cm, barMeasure);
        update.finish();
      }
    }

    // Sync the actual display DOM structure with display.view, removing
    // nodes for lines that are no longer in view, and creating the ones
    // that are not there yet, and updating the ones that are out of
    // date.
    function patchDisplay(cm, updateNumbersFrom, dims) {
      var display = cm.display, lineNumbers = cm.options.lineNumbers;
      var container = display.lineDiv, cur = container.firstChild;

      function rm(node) {
        var next = node.nextSibling;
        // Works around a throw-scroll bug in OS X Webkit
        if (webkit && mac && cm.display.currentWheelTarget == node)
          { node.style.display = "none"; }
        else
          { node.parentNode.removeChild(node); }
        return next
      }

      var view = display.view, lineN = display.viewFrom;
      // Loop over the elements in the view, syncing cur (the DOM nodes
      // in display.lineDiv) with the view as we go.
      for (var i = 0; i < view.length; i++) {
        var lineView = view[i];
        if (lineView.hidden) ; else if (!lineView.node || lineView.node.parentNode != container) { // Not drawn yet
          var node = buildLineElement(cm, lineView, lineN, dims);
          container.insertBefore(node, cur);
        } else { // Already drawn
          while (cur != lineView.node) { cur = rm(cur); }
          var updateNumber = lineNumbers && updateNumbersFrom != null &&
            updateNumbersFrom <= lineN && lineView.lineNumber;
          if (lineView.changes) {
            if (indexOf(lineView.changes, "gutter") > -1) { updateNumber = false; }
            updateLineForChanges(cm, lineView, lineN, dims);
          }
          if (updateNumber) {
            removeChildren(lineView.lineNumber);
            lineView.lineNumber.appendChild(document.createTextNode(lineNumberFor(cm.options, lineN)));
          }
          cur = lineView.node.nextSibling;
        }
        lineN += lineView.size;
      }
      while (cur) { cur = rm(cur); }
    }

    function updateGutterSpace(display) {
      var width = display.gutters.offsetWidth;
      display.sizer.style.marginLeft = width + "px";
    }

    function setDocumentHeight(cm, measure) {
      cm.display.sizer.style.minHeight = measure.docHeight + "px";
      cm.display.heightForcer.style.top = measure.docHeight + "px";
      cm.display.gutters.style.height = (measure.docHeight + cm.display.barHeight + scrollGap(cm)) + "px";
    }

    // Re-align line numbers and gutter marks to compensate for
    // horizontal scrolling.
    function alignHorizontally(cm) {
      var display = cm.display, view = display.view;
      if (!display.alignWidgets && (!display.gutters.firstChild || !cm.options.fixedGutter)) { return }
      var comp = compensateForHScroll(display) - display.scroller.scrollLeft + cm.doc.scrollLeft;
      var gutterW = display.gutters.offsetWidth, left = comp + "px";
      for (var i = 0; i < view.length; i++) { if (!view[i].hidden) {
        if (cm.options.fixedGutter) {
          if (view[i].gutter)
            { view[i].gutter.style.left = left; }
          if (view[i].gutterBackground)
            { view[i].gutterBackground.style.left = left; }
        }
        var align = view[i].alignable;
        if (align) { for (var j = 0; j < align.length; j++)
          { align[j].style.left = left; } }
      } }
      if (cm.options.fixedGutter)
        { display.gutters.style.left = (comp + gutterW) + "px"; }
    }

    // Used to ensure that the line number gutter is still the right
    // size for the current document size. Returns true when an update
    // is needed.
    function maybeUpdateLineNumberWidth(cm) {
      if (!cm.options.lineNumbers) { return false }
      var doc = cm.doc, last = lineNumberFor(cm.options, doc.first + doc.size - 1), display = cm.display;
      if (last.length != display.lineNumChars) {
        var test = display.measure.appendChild(elt("div", [elt("div", last)],
                                                   "CodeMirror-linenumber CodeMirror-gutter-elt"));
        var innerW = test.firstChild.offsetWidth, padding = test.offsetWidth - innerW;
        display.lineGutter.style.width = "";
        display.lineNumInnerWidth = Math.max(innerW, display.lineGutter.offsetWidth - padding) + 1;
        display.lineNumWidth = display.lineNumInnerWidth + padding;
        display.lineNumChars = display.lineNumInnerWidth ? last.length : -1;
        display.lineGutter.style.width = display.lineNumWidth + "px";
        updateGutterSpace(cm.display);
        return true
      }
      return false
    }

    function getGutters(gutters, lineNumbers) {
      var result = [], sawLineNumbers = false;
      for (var i = 0; i < gutters.length; i++) {
        var name = gutters[i], style = null;
        if (typeof name != "string") { style = name.style; name = name.className; }
        if (name == "CodeMirror-linenumbers") {
          if (!lineNumbers) { continue }
          else { sawLineNumbers = true; }
        }
        result.push({className: name, style: style});
      }
      if (lineNumbers && !sawLineNumbers) { result.push({className: "CodeMirror-linenumbers", style: null}); }
      return result
    }

    // Rebuild the gutter elements, ensure the margin to the left of the
    // code matches their width.
    function renderGutters(display) {
      var gutters = display.gutters, specs = display.gutterSpecs;
      removeChildren(gutters);
      display.lineGutter = null;
      for (var i = 0; i < specs.length; ++i) {
        var ref = specs[i];
        var className = ref.className;
        var style = ref.style;
        var gElt = gutters.appendChild(elt("div", null, "CodeMirror-gutter " + className));
        if (style) { gElt.style.cssText = style; }
        if (className == "CodeMirror-linenumbers") {
          display.lineGutter = gElt;
          gElt.style.width = (display.lineNumWidth || 1) + "px";
        }
      }
      gutters.style.display = specs.length ? "" : "none";
      updateGutterSpace(display);
    }

    function updateGutters(cm) {
      renderGutters(cm.display);
      regChange(cm);
      alignHorizontally(cm);
    }

    // The display handles the DOM integration, both for input reading
    // and content drawing. It holds references to DOM nodes and
    // display-related state.

    function Display(place, doc, input, options) {
      var d = this;
      this.input = input;

      // Covers bottom-right square when both scrollbars are present.
      d.scrollbarFiller = elt("div", null, "CodeMirror-scrollbar-filler");
      d.scrollbarFiller.setAttribute("cm-not-content", "true");
      // Covers bottom of gutter when coverGutterNextToScrollbar is on
      // and h scrollbar is present.
      d.gutterFiller = elt("div", null, "CodeMirror-gutter-filler");
      d.gutterFiller.setAttribute("cm-not-content", "true");
      // Will contain the actual code, positioned to cover the viewport.
      d.lineDiv = eltP("div", null, "CodeMirror-code");
      // Elements are added to these to represent selection and cursors.
      d.selectionDiv = elt("div", null, null, "position: relative; z-index: 1");
      d.cursorDiv = elt("div", null, "CodeMirror-cursors");
      // A visibility: hidden element used to find the size of things.
      d.measure = elt("div", null, "CodeMirror-measure");
      // When lines outside of the viewport are measured, they are drawn in this.
      d.lineMeasure = elt("div", null, "CodeMirror-measure");
      // Wraps everything that needs to exist inside the vertically-padded coordinate system
      d.lineSpace = eltP("div", [d.measure, d.lineMeasure, d.selectionDiv, d.cursorDiv, d.lineDiv],
                        null, "position: relative; outline: none");
      var lines = eltP("div", [d.lineSpace], "CodeMirror-lines");
      // Moved around its parent to cover visible view.
      d.mover = elt("div", [lines], null, "position: relative");
      // Set to the height of the document, allowing scrolling.
      d.sizer = elt("div", [d.mover], "CodeMirror-sizer");
      d.sizerWidth = null;
      // Behavior of elts with overflow: auto and padding is
      // inconsistent across browsers. This is used to ensure the
      // scrollable area is big enough.
      d.heightForcer = elt("div", null, null, "position: absolute; height: " + scrollerGap + "px; width: 1px;");
      // Will contain the gutters, if any.
      d.gutters = elt("div", null, "CodeMirror-gutters");
      d.lineGutter = null;
      // Actual scrollable element.
      d.scroller = elt("div", [d.sizer, d.heightForcer, d.gutters], "CodeMirror-scroll");
      d.scroller.setAttribute("tabIndex", "-1");
      // The element in which the editor lives.
      d.wrapper = elt("div", [d.scrollbarFiller, d.gutterFiller, d.scroller], "CodeMirror");

      // Work around IE7 z-index bug (not perfect, hence IE7 not really being supported)
      if (ie && ie_version < 8) { d.gutters.style.zIndex = -1; d.scroller.style.paddingRight = 0; }
      if (!webkit && !(gecko && mobile)) { d.scroller.draggable = true; }

      if (place) {
        if (place.appendChild) { place.appendChild(d.wrapper); }
        else { place(d.wrapper); }
      }

      // Current rendered range (may be bigger than the view window).
      d.viewFrom = d.viewTo = doc.first;
      d.reportedViewFrom = d.reportedViewTo = doc.first;
      // Information about the rendered lines.
      d.view = [];
      d.renderedView = null;
      // Holds info about a single rendered line when it was rendered
      // for measurement, while not in view.
      d.externalMeasured = null;
      // Empty space (in pixels) above the view
      d.viewOffset = 0;
      d.lastWrapHeight = d.lastWrapWidth = 0;
      d.updateLineNumbers = null;

      d.nativeBarWidth = d.barHeight = d.barWidth = 0;
      d.scrollbarsClipped = false;

      // Used to only resize the line number gutter when necessary (when
      // the amount of lines crosses a boundary that makes its width change)
      d.lineNumWidth = d.lineNumInnerWidth = d.lineNumChars = null;
      // Set to true when a non-horizontal-scrolling line widget is
      // added. As an optimization, line widget aligning is skipped when
      // this is false.
      d.alignWidgets = false;

      d.cachedCharWidth = d.cachedTextHeight = d.cachedPaddingH = null;

      // Tracks the maximum line length so that the horizontal scrollbar
      // can be kept static when scrolling.
      d.maxLine = null;
      d.maxLineLength = 0;
      d.maxLineChanged = false;

      // Used for measuring wheel scrolling granularity
      d.wheelDX = d.wheelDY = d.wheelStartX = d.wheelStartY = null;

      // True when shift is held down.
      d.shift = false;

      // Used to track whether anything happened since the context menu
      // was opened.
      d.selForContextMenu = null;

      d.activeTouch = null;

      d.gutterSpecs = getGutters(options.gutters, options.lineNumbers);
      renderGutters(d);

      input.init(d);
    }

    // Since the delta values reported on mouse wheel events are
    // unstandardized between browsers and even browser versions, and
    // generally horribly unpredictable, this code starts by measuring
    // the scroll effect that the first few mouse wheel events have,
    // and, from that, detects the way it can convert deltas to pixel
    // offsets afterwards.
    //
    // The reason we want to know the amount a wheel event will scroll
    // is that it gives us a chance to update the display before the
    // actual scrolling happens, reducing flickering.

    var wheelSamples = 0, wheelPixelsPerUnit = null;
    // Fill in a browser-detected starting value on browsers where we
    // know one. These don't have to be accurate -- the result of them
    // being wrong would just be a slight flicker on the first wheel
    // scroll (if it is large enough).
    if (ie) { wheelPixelsPerUnit = -.53; }
    else if (gecko) { wheelPixelsPerUnit = 15; }
    else if (chrome) { wheelPixelsPerUnit = -.7; }
    else if (safari) { wheelPixelsPerUnit = -1/3; }

    function wheelEventDelta(e) {
      var dx = e.wheelDeltaX, dy = e.wheelDeltaY;
      if (dx == null && e.detail && e.axis == e.HORIZONTAL_AXIS) { dx = e.detail; }
      if (dy == null && e.detail && e.axis == e.VERTICAL_AXIS) { dy = e.detail; }
      else if (dy == null) { dy = e.wheelDelta; }
      return {x: dx, y: dy}
    }
    function wheelEventPixels(e) {
      var delta = wheelEventDelta(e);
      delta.x *= wheelPixelsPerUnit;
      delta.y *= wheelPixelsPerUnit;
      return delta
    }

    function onScrollWheel(cm, e) {
      var delta = wheelEventDelta(e), dx = delta.x, dy = delta.y;

      var display = cm.display, scroll = display.scroller;
      // Quit if there's nothing to scroll here
      var canScrollX = scroll.scrollWidth > scroll.clientWidth;
      var canScrollY = scroll.scrollHeight > scroll.clientHeight;
      if (!(dx && canScrollX || dy && canScrollY)) { return }

      // Webkit browsers on OS X abort momentum scrolls when the target
      // of the scroll event is removed from the scrollable element.
      // This hack (see related code in patchDisplay) makes sure the
      // element is kept around.
      if (dy && mac && webkit) {
        outer: for (var cur = e.target, view = display.view; cur != scroll; cur = cur.parentNode) {
          for (var i = 0; i < view.length; i++) {
            if (view[i].node == cur) {
              cm.display.currentWheelTarget = cur;
              break outer
            }
          }
        }
      }

      // On some browsers, horizontal scrolling will cause redraws to
      // happen before the gutter has been realigned, causing it to
      // wriggle around in a most unseemly way. When we have an
      // estimated pixels/delta value, we just handle horizontal
      // scrolling entirely here. It'll be slightly off from native, but
      // better than glitching out.
      if (dx && !gecko && !presto && wheelPixelsPerUnit != null) {
        if (dy && canScrollY)
          { updateScrollTop(cm, Math.max(0, scroll.scrollTop + dy * wheelPixelsPerUnit)); }
        setScrollLeft(cm, Math.max(0, scroll.scrollLeft + dx * wheelPixelsPerUnit));
        // Only prevent default scrolling if vertical scrolling is
        // actually possible. Otherwise, it causes vertical scroll
        // jitter on OSX trackpads when deltaX is small and deltaY
        // is large (issue #3579)
        if (!dy || (dy && canScrollY))
          { e_preventDefault(e); }
        display.wheelStartX = null; // Abort measurement, if in progress
        return
      }

      // 'Project' the visible viewport to cover the area that is being
      // scrolled into view (if we know enough to estimate it).
      if (dy && wheelPixelsPerUnit != null) {
        var pixels = dy * wheelPixelsPerUnit;
        var top = cm.doc.scrollTop, bot = top + display.wrapper.clientHeight;
        if (pixels < 0) { top = Math.max(0, top + pixels - 50); }
        else { bot = Math.min(cm.doc.height, bot + pixels + 50); }
        updateDisplaySimple(cm, {top: top, bottom: bot});
      }

      if (wheelSamples < 20) {
        if (display.wheelStartX == null) {
          display.wheelStartX = scroll.scrollLeft; display.wheelStartY = scroll.scrollTop;
          display.wheelDX = dx; display.wheelDY = dy;
          setTimeout(function () {
            if (display.wheelStartX == null) { return }
            var movedX = scroll.scrollLeft - display.wheelStartX;
            var movedY = scroll.scrollTop - display.wheelStartY;
            var sample = (movedY && display.wheelDY && movedY / display.wheelDY) ||
              (movedX && display.wheelDX && movedX / display.wheelDX);
            display.wheelStartX = display.wheelStartY = null;
            if (!sample) { return }
            wheelPixelsPerUnit = (wheelPixelsPerUnit * wheelSamples + sample) / (wheelSamples + 1);
            ++wheelSamples;
          }, 200);
        } else {
          display.wheelDX += dx; display.wheelDY += dy;
        }
      }
    }

    // Selection objects are immutable. A new one is created every time
    // the selection changes. A selection is one or more non-overlapping
    // (and non-touching) ranges, sorted, and an integer that indicates
    // which one is the primary selection (the one that's scrolled into
    // view, that getCursor returns, etc).
    var Selection = function(ranges, primIndex) {
      this.ranges = ranges;
      this.primIndex = primIndex;
    };

    Selection.prototype.primary = function () { return this.ranges[this.primIndex] };

    Selection.prototype.equals = function (other) {
      if (other == this) { return true }
      if (other.primIndex != this.primIndex || other.ranges.length != this.ranges.length) { return false }
      for (var i = 0; i < this.ranges.length; i++) {
        var here = this.ranges[i], there = other.ranges[i];
        if (!equalCursorPos(here.anchor, there.anchor) || !equalCursorPos(here.head, there.head)) { return false }
      }
      return true
    };

    Selection.prototype.deepCopy = function () {
      var out = [];
      for (var i = 0; i < this.ranges.length; i++)
        { out[i] = new Range(copyPos(this.ranges[i].anchor), copyPos(this.ranges[i].head)); }
      return new Selection(out, this.primIndex)
    };

    Selection.prototype.somethingSelected = function () {
      for (var i = 0; i < this.ranges.length; i++)
        { if (!this.ranges[i].empty()) { return true } }
      return false
    };

    Selection.prototype.contains = function (pos, end) {
      if (!end) { end = pos; }
      for (var i = 0; i < this.ranges.length; i++) {
        var range = this.ranges[i];
        if (cmp(end, range.from()) >= 0 && cmp(pos, range.to()) <= 0)
          { return i }
      }
      return -1
    };

    var Range = function(anchor, head) {
      this.anchor = anchor; this.head = head;
    };

    Range.prototype.from = function () { return minPos(this.anchor, this.head) };
    Range.prototype.to = function () { return maxPos(this.anchor, this.head) };
    Range.prototype.empty = function () { return this.head.line == this.anchor.line && this.head.ch == this.anchor.ch };

    // Take an unsorted, potentially overlapping set of ranges, and
    // build a selection out of it. 'Consumes' ranges array (modifying
    // it).
    function normalizeSelection(cm, ranges, primIndex) {
      var mayTouch = cm && cm.options.selectionsMayTouch;
      var prim = ranges[primIndex];
      ranges.sort(function (a, b) { return cmp(a.from(), b.from()); });
      primIndex = indexOf(ranges, prim);
      for (var i = 1; i < ranges.length; i++) {
        var cur = ranges[i], prev = ranges[i - 1];
        var diff = cmp(prev.to(), cur.from());
        if (mayTouch && !cur.empty() ? diff > 0 : diff >= 0) {
          var from = minPos(prev.from(), cur.from()), to = maxPos(prev.to(), cur.to());
          var inv = prev.empty() ? cur.from() == cur.head : prev.from() == prev.head;
          if (i <= primIndex) { --primIndex; }
          ranges.splice(--i, 2, new Range(inv ? to : from, inv ? from : to));
        }
      }
      return new Selection(ranges, primIndex)
    }

    function simpleSelection(anchor, head) {
      return new Selection([new Range(anchor, head || anchor)], 0)
    }

    // Compute the position of the end of a change (its 'to' property
    // refers to the pre-change end).
    function changeEnd(change) {
      if (!change.text) { return change.to }
      return Pos(change.from.line + change.text.length - 1,
                 lst(change.text).length + (change.text.length == 1 ? change.from.ch : 0))
    }

    // Adjust a position to refer to the post-change position of the
    // same text, or the end of the change if the change covers it.
    function adjustForChange(pos, change) {
      if (cmp(pos, change.from) < 0) { return pos }
      if (cmp(pos, change.to) <= 0) { return changeEnd(change) }

      var line = pos.line + change.text.length - (change.to.line - change.from.line) - 1, ch = pos.ch;
      if (pos.line == change.to.line) { ch += changeEnd(change).ch - change.to.ch; }
      return Pos(line, ch)
    }

    function computeSelAfterChange(doc, change) {
      var out = [];
      for (var i = 0; i < doc.sel.ranges.length; i++) {
        var range = doc.sel.ranges[i];
        out.push(new Range(adjustForChange(range.anchor, change),
                           adjustForChange(range.head, change)));
      }
      return normalizeSelection(doc.cm, out, doc.sel.primIndex)
    }

    function offsetPos(pos, old, nw) {
      if (pos.line == old.line)
        { return Pos(nw.line, pos.ch - old.ch + nw.ch) }
      else
        { return Pos(nw.line + (pos.line - old.line), pos.ch) }
    }

    // Used by replaceSelections to allow moving the selection to the
    // start or around the replaced test. Hint may be "start" or "around".
    function computeReplacedSel(doc, changes, hint) {
      var out = [];
      var oldPrev = Pos(doc.first, 0), newPrev = oldPrev;
      for (var i = 0; i < changes.length; i++) {
        var change = changes[i];
        var from = offsetPos(change.from, oldPrev, newPrev);
        var to = offsetPos(changeEnd(change), oldPrev, newPrev);
        oldPrev = change.to;
        newPrev = to;
        if (hint == "around") {
          var range = doc.sel.ranges[i], inv = cmp(range.head, range.anchor) < 0;
          out[i] = new Range(inv ? to : from, inv ? from : to);
        } else {
          out[i] = new Range(from, from);
        }
      }
      return new Selection(out, doc.sel.primIndex)
    }

    // Used to get the editor into a consistent state again when options change.

    function loadMode(cm) {
      cm.doc.mode = getMode(cm.options, cm.doc.modeOption);
      resetModeState(cm);
    }

    function resetModeState(cm) {
      cm.doc.iter(function (line) {
        if (line.stateAfter) { line.stateAfter = null; }
        if (line.styles) { line.styles = null; }
      });
      cm.doc.modeFrontier = cm.doc.highlightFrontier = cm.doc.first;
      startWorker(cm, 100);
      cm.state.modeGen++;
      if (cm.curOp) { regChange(cm); }
    }

    // DOCUMENT DATA STRUCTURE

    // By default, updates that start and end at the beginning of a line
    // are treated specially, in order to make the association of line
    // widgets and marker elements with the text behave more intuitive.
    function isWholeLineUpdate(doc, change) {
      return change.from.ch == 0 && change.to.ch == 0 && lst(change.text) == "" &&
        (!doc.cm || doc.cm.options.wholeLineUpdateBefore)
    }

    // Perform a change on the document data structure.
    function updateDoc(doc, change, markedSpans, estimateHeight) {
      function spansFor(n) {return markedSpans ? markedSpans[n] : null}
      function update(line, text, spans) {
        updateLine(line, text, spans, estimateHeight);
        signalLater(line, "change", line, change);
      }
      function linesFor(start, end) {
        var result = [];
        for (var i = start; i < end; ++i)
          { result.push(new Line(text[i], spansFor(i), estimateHeight)); }
        return result
      }

      var from = change.from, to = change.to, text = change.text;
      var firstLine = getLine(doc, from.line), lastLine = getLine(doc, to.line);
      var lastText = lst(text), lastSpans = spansFor(text.length - 1), nlines = to.line - from.line;

      // Adjust the line structure
      if (change.full) {
        doc.insert(0, linesFor(0, text.length));
        doc.remove(text.length, doc.size - text.length);
      } else if (isWholeLineUpdate(doc, change)) {
        // This is a whole-line replace. Treated specially to make
        // sure line objects move the way they are supposed to.
        var added = linesFor(0, text.length - 1);
        update(lastLine, lastLine.text, lastSpans);
        if (nlines) { doc.remove(from.line, nlines); }
        if (added.length) { doc.insert(from.line, added); }
      } else if (firstLine == lastLine) {
        if (text.length == 1) {
          update(firstLine, firstLine.text.slice(0, from.ch) + lastText + firstLine.text.slice(to.ch), lastSpans);
        } else {
          var added$1 = linesFor(1, text.length - 1);
          added$1.push(new Line(lastText + firstLine.text.slice(to.ch), lastSpans, estimateHeight));
          update(firstLine, firstLine.text.slice(0, from.ch) + text[0], spansFor(0));
          doc.insert(from.line + 1, added$1);
        }
      } else if (text.length == 1) {
        update(firstLine, firstLine.text.slice(0, from.ch) + text[0] + lastLine.text.slice(to.ch), spansFor(0));
        doc.remove(from.line + 1, nlines);
      } else {
        update(firstLine, firstLine.text.slice(0, from.ch) + text[0], spansFor(0));
        update(lastLine, lastText + lastLine.text.slice(to.ch), lastSpans);
        var added$2 = linesFor(1, text.length - 1);
        if (nlines > 1) { doc.remove(from.line + 1, nlines - 1); }
        doc.insert(from.line + 1, added$2);
      }

      signalLater(doc, "change", doc, change);
    }

    // Call f for all linked documents.
    function linkedDocs(doc, f, sharedHistOnly) {
      function propagate(doc, skip, sharedHist) {
        if (doc.linked) { for (var i = 0; i < doc.linked.length; ++i) {
          var rel = doc.linked[i];
          if (rel.doc == skip) { continue }
          var shared = sharedHist && rel.sharedHist;
          if (sharedHistOnly && !shared) { continue }
          f(rel.doc, shared);
          propagate(rel.doc, doc, shared);
        } }
      }
      propagate(doc, null, true);
    }

    // Attach a document to an editor.
    function attachDoc(cm, doc) {
      if (doc.cm) { throw new Error("This document is already in use.") }
      cm.doc = doc;
      doc.cm = cm;
      estimateLineHeights(cm);
      loadMode(cm);
      setDirectionClass(cm);
      if (!cm.options.lineWrapping) { findMaxLine(cm); }
      cm.options.mode = doc.modeOption;
      regChange(cm);
    }

    function setDirectionClass(cm) {
    (cm.doc.direction == "rtl" ? addClass : rmClass)(cm.display.lineDiv, "CodeMirror-rtl");
    }

    function directionChanged(cm) {
      runInOp(cm, function () {
        setDirectionClass(cm);
        regChange(cm);
      });
    }

    function History(startGen) {
      // Arrays of change events and selections. Doing something adds an
      // event to done and clears undo. Undoing moves events from done
      // to undone, redoing moves them in the other direction.
      this.done = []; this.undone = [];
      this.undoDepth = Infinity;
      // Used to track when changes can be merged into a single undo
      // event
      this.lastModTime = this.lastSelTime = 0;
      this.lastOp = this.lastSelOp = null;
      this.lastOrigin = this.lastSelOrigin = null;
      // Used by the isClean() method
      this.generation = this.maxGeneration = startGen || 1;
    }

    // Create a history change event from an updateDoc-style change
    // object.
    function historyChangeFromChange(doc, change) {
      var histChange = {from: copyPos(change.from), to: changeEnd(change), text: getBetween(doc, change.from, change.to)};
      attachLocalSpans(doc, histChange, change.from.line, change.to.line + 1);
      linkedDocs(doc, function (doc) { return attachLocalSpans(doc, histChange, change.from.line, change.to.line + 1); }, true);
      return histChange
    }

    // Pop all selection events off the end of a history array. Stop at
    // a change event.
    function clearSelectionEvents(array) {
      while (array.length) {
        var last = lst(array);
        if (last.ranges) { array.pop(); }
        else { break }
      }
    }

    // Find the top change event in the history. Pop off selection
    // events that are in the way.
    function lastChangeEvent(hist, force) {
      if (force) {
        clearSelectionEvents(hist.done);
        return lst(hist.done)
      } else if (hist.done.length && !lst(hist.done).ranges) {
        return lst(hist.done)
      } else if (hist.done.length > 1 && !hist.done[hist.done.length - 2].ranges) {
        hist.done.pop();
        return lst(hist.done)
      }
    }

    // Register a change in the history. Merges changes that are within
    // a single operation, or are close together with an origin that
    // allows merging (starting with "+") into a single event.
    function addChangeToHistory(doc, change, selAfter, opId) {
      var hist = doc.history;
      hist.undone.length = 0;
      var time = +new Date, cur;
      var last;

      if ((hist.lastOp == opId ||
           hist.lastOrigin == change.origin && change.origin &&
           ((change.origin.charAt(0) == "+" && hist.lastModTime > time - (doc.cm ? doc.cm.options.historyEventDelay : 500)) ||
            change.origin.charAt(0) == "*")) &&
          (cur = lastChangeEvent(hist, hist.lastOp == opId))) {
        // Merge this change into the last event
        last = lst(cur.changes);
        if (cmp(change.from, change.to) == 0 && cmp(change.from, last.to) == 0) {
          // Optimized case for simple insertion -- don't want to add
          // new changesets for every character typed
          last.to = changeEnd(change);
        } else {
          // Add new sub-event
          cur.changes.push(historyChangeFromChange(doc, change));
        }
      } else {
        // Can not be merged, start a new event.
        var before = lst(hist.done);
        if (!before || !before.ranges)
          { pushSelectionToHistory(doc.sel, hist.done); }
        cur = {changes: [historyChangeFromChange(doc, change)],
               generation: hist.generation};
        hist.done.push(cur);
        while (hist.done.length > hist.undoDepth) {
          hist.done.shift();
          if (!hist.done[0].ranges) { hist.done.shift(); }
        }
      }
      hist.done.push(selAfter);
      hist.generation = ++hist.maxGeneration;
      hist.lastModTime = hist.lastSelTime = time;
      hist.lastOp = hist.lastSelOp = opId;
      hist.lastOrigin = hist.lastSelOrigin = change.origin;

      if (!last) { signal(doc, "historyAdded"); }
    }

    function selectionEventCanBeMerged(doc, origin, prev, sel) {
      var ch = origin.charAt(0);
      return ch == "*" ||
        ch == "+" &&
        prev.ranges.length == sel.ranges.length &&
        prev.somethingSelected() == sel.somethingSelected() &&
        new Date - doc.history.lastSelTime <= (doc.cm ? doc.cm.options.historyEventDelay : 500)
    }

    // Called whenever the selection changes, sets the new selection as
    // the pending selection in the history, and pushes the old pending
    // selection into the 'done' array when it was significantly
    // different (in number of selected ranges, emptiness, or time).
    function addSelectionToHistory(doc, sel, opId, options) {
      var hist = doc.history, origin = options && options.origin;

      // A new event is started when the previous origin does not match
      // the current, or the origins don't allow matching. Origins
      // starting with * are always merged, those starting with + are
      // merged when similar and close together in time.
      if (opId == hist.lastSelOp ||
          (origin && hist.lastSelOrigin == origin &&
           (hist.lastModTime == hist.lastSelTime && hist.lastOrigin == origin ||
            selectionEventCanBeMerged(doc, origin, lst(hist.done), sel))))
        { hist.done[hist.done.length - 1] = sel; }
      else
        { pushSelectionToHistory(sel, hist.done); }

      hist.lastSelTime = +new Date;
      hist.lastSelOrigin = origin;
      hist.lastSelOp = opId;
      if (options && options.clearRedo !== false)
        { clearSelectionEvents(hist.undone); }
    }

    function pushSelectionToHistory(sel, dest) {
      var top = lst(dest);
      if (!(top && top.ranges && top.equals(sel)))
        { dest.push(sel); }
    }

    // Used to store marked span information in the history.
    function attachLocalSpans(doc, change, from, to) {
      var existing = change["spans_" + doc.id], n = 0;
      doc.iter(Math.max(doc.first, from), Math.min(doc.first + doc.size, to), function (line) {
        if (line.markedSpans)
          { (existing || (existing = change["spans_" + doc.id] = {}))[n] = line.markedSpans; }
        ++n;
      });
    }

    // When un/re-doing restores text containing marked spans, those
    // that have been explicitly cleared should not be restored.
    function removeClearedSpans(spans) {
      if (!spans) { return null }
      var out;
      for (var i = 0; i < spans.length; ++i) {
        if (spans[i].marker.explicitlyCleared) { if (!out) { out = spans.slice(0, i); } }
        else if (out) { out.push(spans[i]); }
      }
      return !out ? spans : out.length ? out : null
    }

    // Retrieve and filter the old marked spans stored in a change event.
    function getOldSpans(doc, change) {
      var found = change["spans_" + doc.id];
      if (!found) { return null }
      var nw = [];
      for (var i = 0; i < change.text.length; ++i)
        { nw.push(removeClearedSpans(found[i])); }
      return nw
    }

    // Used for un/re-doing changes from the history. Combines the
    // result of computing the existing spans with the set of spans that
    // existed in the history (so that deleting around a span and then
    // undoing brings back the span).
    function mergeOldSpans(doc, change) {
      var old = getOldSpans(doc, change);
      var stretched = stretchSpansOverChange(doc, change);
      if (!old) { return stretched }
      if (!stretched) { return old }

      for (var i = 0; i < old.length; ++i) {
        var oldCur = old[i], stretchCur = stretched[i];
        if (oldCur && stretchCur) {
          spans: for (var j = 0; j < stretchCur.length; ++j) {
            var span = stretchCur[j];
            for (var k = 0; k < oldCur.length; ++k)
              { if (oldCur[k].marker == span.marker) { continue spans } }
            oldCur.push(span);
          }
        } else if (stretchCur) {
          old[i] = stretchCur;
        }
      }
      return old
    }

    // Used both to provide a JSON-safe object in .getHistory, and, when
    // detaching a document, to split the history in two
    function copyHistoryArray(events, newGroup, instantiateSel) {
      var copy = [];
      for (var i = 0; i < events.length; ++i) {
        var event = events[i];
        if (event.ranges) {
          copy.push(instantiateSel ? Selection.prototype.deepCopy.call(event) : event);
          continue
        }
        var changes = event.changes, newChanges = [];
        copy.push({changes: newChanges});
        for (var j = 0; j < changes.length; ++j) {
          var change = changes[j], m = (void 0);
          newChanges.push({from: change.from, to: change.to, text: change.text});
          if (newGroup) { for (var prop in change) { if (m = prop.match(/^spans_(\d+)$/)) {
            if (indexOf(newGroup, Number(m[1])) > -1) {
              lst(newChanges)[prop] = change[prop];
              delete change[prop];
            }
          } } }
        }
      }
      return copy
    }

    // The 'scroll' parameter given to many of these indicated whether
    // the new cursor position should be scrolled into view after
    // modifying the selection.

    // If shift is held or the extend flag is set, extends a range to
    // include a given position (and optionally a second position).
    // Otherwise, simply returns the range between the given positions.
    // Used for cursor motion and such.
    function extendRange(range, head, other, extend) {
      if (extend) {
        var anchor = range.anchor;
        if (other) {
          var posBefore = cmp(head, anchor) < 0;
          if (posBefore != (cmp(other, anchor) < 0)) {
            anchor = head;
            head = other;
          } else if (posBefore != (cmp(head, other) < 0)) {
            head = other;
          }
        }
        return new Range(anchor, head)
      } else {
        return new Range(other || head, head)
      }
    }

    // Extend the primary selection range, discard the rest.
    function extendSelection(doc, head, other, options, extend) {
      if (extend == null) { extend = doc.cm && (doc.cm.display.shift || doc.extend); }
      setSelection(doc, new Selection([extendRange(doc.sel.primary(), head, other, extend)], 0), options);
    }

    // Extend all selections (pos is an array of selections with length
    // equal the number of selections)
    function extendSelections(doc, heads, options) {
      var out = [];
      var extend = doc.cm && (doc.cm.display.shift || doc.extend);
      for (var i = 0; i < doc.sel.ranges.length; i++)
        { out[i] = extendRange(doc.sel.ranges[i], heads[i], null, extend); }
      var newSel = normalizeSelection(doc.cm, out, doc.sel.primIndex);
      setSelection(doc, newSel, options);
    }

    // Updates a single range in the selection.
    function replaceOneSelection(doc, i, range, options) {
      var ranges = doc.sel.ranges.slice(0);
      ranges[i] = range;
      setSelection(doc, normalizeSelection(doc.cm, ranges, doc.sel.primIndex), options);
    }

    // Reset the selection to a single range.
    function setSimpleSelection(doc, anchor, head, options) {
      setSelection(doc, simpleSelection(anchor, head), options);
    }

    // Give beforeSelectionChange handlers a change to influence a
    // selection update.
    function filterSelectionChange(doc, sel, options) {
      var obj = {
        ranges: sel.ranges,
        update: function(ranges) {
          this.ranges = [];
          for (var i = 0; i < ranges.length; i++)
            { this.ranges[i] = new Range(clipPos(doc, ranges[i].anchor),
                                       clipPos(doc, ranges[i].head)); }
        },
        origin: options && options.origin
      };
      signal(doc, "beforeSelectionChange", doc, obj);
      if (doc.cm) { signal(doc.cm, "beforeSelectionChange", doc.cm, obj); }
      if (obj.ranges != sel.ranges) { return normalizeSelection(doc.cm, obj.ranges, obj.ranges.length - 1) }
      else { return sel }
    }

    function setSelectionReplaceHistory(doc, sel, options) {
      var done = doc.history.done, last = lst(done);
      if (last && last.ranges) {
        done[done.length - 1] = sel;
        setSelectionNoUndo(doc, sel, options);
      } else {
        setSelection(doc, sel, options);
      }
    }

    // Set a new selection.
    function setSelection(doc, sel, options) {
      setSelectionNoUndo(doc, sel, options);
      addSelectionToHistory(doc, doc.sel, doc.cm ? doc.cm.curOp.id : NaN, options);
    }

    function setSelectionNoUndo(doc, sel, options) {
      if (hasHandler(doc, "beforeSelectionChange") || doc.cm && hasHandler(doc.cm, "beforeSelectionChange"))
        { sel = filterSelectionChange(doc, sel, options); }

      var bias = options && options.bias ||
        (cmp(sel.primary().head, doc.sel.primary().head) < 0 ? -1 : 1);
      setSelectionInner(doc, skipAtomicInSelection(doc, sel, bias, true));

      if (!(options && options.scroll === false) && doc.cm)
        { ensureCursorVisible(doc.cm); }
    }

    function setSelectionInner(doc, sel) {
      if (sel.equals(doc.sel)) { return }

      doc.sel = sel;

      if (doc.cm) {
        doc.cm.curOp.updateInput = 1;
        doc.cm.curOp.selectionChanged = true;
        signalCursorActivity(doc.cm);
      }
      signalLater(doc, "cursorActivity", doc);
    }

    // Verify that the selection does not partially select any atomic
    // marked ranges.
    function reCheckSelection(doc) {
      setSelectionInner(doc, skipAtomicInSelection(doc, doc.sel, null, false));
    }

    // Return a selection that does not partially select any atomic
    // ranges.
    function skipAtomicInSelection(doc, sel, bias, mayClear) {
      var out;
      for (var i = 0; i < sel.ranges.length; i++) {
        var range = sel.ranges[i];
        var old = sel.ranges.length == doc.sel.ranges.length && doc.sel.ranges[i];
        var newAnchor = skipAtomic(doc, range.anchor, old && old.anchor, bias, mayClear);
        var newHead = skipAtomic(doc, range.head, old && old.head, bias, mayClear);
        if (out || newAnchor != range.anchor || newHead != range.head) {
          if (!out) { out = sel.ranges.slice(0, i); }
          out[i] = new Range(newAnchor, newHead);
        }
      }
      return out ? normalizeSelection(doc.cm, out, sel.primIndex) : sel
    }

    function skipAtomicInner(doc, pos, oldPos, dir, mayClear) {
      var line = getLine(doc, pos.line);
      if (line.markedSpans) { for (var i = 0; i < line.markedSpans.length; ++i) {
        var sp = line.markedSpans[i], m = sp.marker;

        // Determine if we should prevent the cursor being placed to the left/right of an atomic marker
        // Historically this was determined using the inclusiveLeft/Right option, but the new way to control it
        // is with selectLeft/Right
        var preventCursorLeft = ("selectLeft" in m) ? !m.selectLeft : m.inclusiveLeft;
        var preventCursorRight = ("selectRight" in m) ? !m.selectRight : m.inclusiveRight;

        if ((sp.from == null || (preventCursorLeft ? sp.from <= pos.ch : sp.from < pos.ch)) &&
            (sp.to == null || (preventCursorRight ? sp.to >= pos.ch : sp.to > pos.ch))) {
          if (mayClear) {
            signal(m, "beforeCursorEnter");
            if (m.explicitlyCleared) {
              if (!line.markedSpans) { break }
              else {--i; continue}
            }
          }
          if (!m.atomic) { continue }

          if (oldPos) {
            var near = m.find(dir < 0 ? 1 : -1), diff = (void 0);
            if (dir < 0 ? preventCursorRight : preventCursorLeft)
              { near = movePos(doc, near, -dir, near && near.line == pos.line ? line : null); }
            if (near && near.line == pos.line && (diff = cmp(near, oldPos)) && (dir < 0 ? diff < 0 : diff > 0))
              { return skipAtomicInner(doc, near, pos, dir, mayClear) }
          }

          var far = m.find(dir < 0 ? -1 : 1);
          if (dir < 0 ? preventCursorLeft : preventCursorRight)
            { far = movePos(doc, far, dir, far.line == pos.line ? line : null); }
          return far ? skipAtomicInner(doc, far, pos, dir, mayClear) : null
        }
      } }
      return pos
    }

    // Ensure a given position is not inside an atomic range.
    function skipAtomic(doc, pos, oldPos, bias, mayClear) {
      var dir = bias || 1;
      var found = skipAtomicInner(doc, pos, oldPos, dir, mayClear) ||
          (!mayClear && skipAtomicInner(doc, pos, oldPos, dir, true)) ||
          skipAtomicInner(doc, pos, oldPos, -dir, mayClear) ||
          (!mayClear && skipAtomicInner(doc, pos, oldPos, -dir, true));
      if (!found) {
        doc.cantEdit = true;
        return Pos(doc.first, 0)
      }
      return found
    }

    function movePos(doc, pos, dir, line) {
      if (dir < 0 && pos.ch == 0) {
        if (pos.line > doc.first) { return clipPos(doc, Pos(pos.line - 1)) }
        else { return null }
      } else if (dir > 0 && pos.ch == (line || getLine(doc, pos.line)).text.length) {
        if (pos.line < doc.first + doc.size - 1) { return Pos(pos.line + 1, 0) }
        else { return null }
      } else {
        return new Pos(pos.line, pos.ch + dir)
      }
    }

    function selectAll(cm) {
      cm.setSelection(Pos(cm.firstLine(), 0), Pos(cm.lastLine()), sel_dontScroll);
    }

    // UPDATING

    // Allow "beforeChange" event handlers to influence a change
    function filterChange(doc, change, update) {
      var obj = {
        canceled: false,
        from: change.from,
        to: change.to,
        text: change.text,
        origin: change.origin,
        cancel: function () { return obj.canceled = true; }
      };
      if (update) { obj.update = function (from, to, text, origin) {
        if (from) { obj.from = clipPos(doc, from); }
        if (to) { obj.to = clipPos(doc, to); }
        if (text) { obj.text = text; }
        if (origin !== undefined) { obj.origin = origin; }
      }; }
      signal(doc, "beforeChange", doc, obj);
      if (doc.cm) { signal(doc.cm, "beforeChange", doc.cm, obj); }

      if (obj.canceled) {
        if (doc.cm) { doc.cm.curOp.updateInput = 2; }
        return null
      }
      return {from: obj.from, to: obj.to, text: obj.text, origin: obj.origin}
    }

    // Apply a change to a document, and add it to the document's
    // history, and propagating it to all linked documents.
    function makeChange(doc, change, ignoreReadOnly) {
      if (doc.cm) {
        if (!doc.cm.curOp) { return operation(doc.cm, makeChange)(doc, change, ignoreReadOnly) }
        if (doc.cm.state.suppressEdits) { return }
      }

      if (hasHandler(doc, "beforeChange") || doc.cm && hasHandler(doc.cm, "beforeChange")) {
        change = filterChange(doc, change, true);
        if (!change) { return }
      }

      // Possibly split or suppress the update based on the presence
      // of read-only spans in its range.
      var split = sawReadOnlySpans && !ignoreReadOnly && removeReadOnlyRanges(doc, change.from, change.to);
      if (split) {
        for (var i = split.length - 1; i >= 0; --i)
          { makeChangeInner(doc, {from: split[i].from, to: split[i].to, text: i ? [""] : change.text, origin: change.origin}); }
      } else {
        makeChangeInner(doc, change);
      }
    }

    function makeChangeInner(doc, change) {
      if (change.text.length == 1 && change.text[0] == "" && cmp(change.from, change.to) == 0) { return }
      var selAfter = computeSelAfterChange(doc, change);
      addChangeToHistory(doc, change, selAfter, doc.cm ? doc.cm.curOp.id : NaN);

      makeChangeSingleDoc(doc, change, selAfter, stretchSpansOverChange(doc, change));
      var rebased = [];

      linkedDocs(doc, function (doc, sharedHist) {
        if (!sharedHist && indexOf(rebased, doc.history) == -1) {
          rebaseHist(doc.history, change);
          rebased.push(doc.history);
        }
        makeChangeSingleDoc(doc, change, null, stretchSpansOverChange(doc, change));
      });
    }

    // Revert a change stored in a document's history.
    function makeChangeFromHistory(doc, type, allowSelectionOnly) {
      var suppress = doc.cm && doc.cm.state.suppressEdits;
      if (suppress && !allowSelectionOnly) { return }

      var hist = doc.history, event, selAfter = doc.sel;
      var source = type == "undo" ? hist.done : hist.undone, dest = type == "undo" ? hist.undone : hist.done;

      // Verify that there is a useable event (so that ctrl-z won't
      // needlessly clear selection events)
      var i = 0;
      for (; i < source.length; i++) {
        event = source[i];
        if (allowSelectionOnly ? event.ranges && !event.equals(doc.sel) : !event.ranges)
          { break }
      }
      if (i == source.length) { return }
      hist.lastOrigin = hist.lastSelOrigin = null;

      for (;;) {
        event = source.pop();
        if (event.ranges) {
          pushSelectionToHistory(event, dest);
          if (allowSelectionOnly && !event.equals(doc.sel)) {
            setSelection(doc, event, {clearRedo: false});
            return
          }
          selAfter = event;
        } else if (suppress) {
          source.push(event);
          return
        } else { break }
      }

      // Build up a reverse change object to add to the opposite history
      // stack (redo when undoing, and vice versa).
      var antiChanges = [];
      pushSelectionToHistory(selAfter, dest);
      dest.push({changes: antiChanges, generation: hist.generation});
      hist.generation = event.generation || ++hist.maxGeneration;

      var filter = hasHandler(doc, "beforeChange") || doc.cm && hasHandler(doc.cm, "beforeChange");

      var loop = function ( i ) {
        var change = event.changes[i];
        change.origin = type;
        if (filter && !filterChange(doc, change, false)) {
          source.length = 0;
          return {}
        }

        antiChanges.push(historyChangeFromChange(doc, change));

        var after = i ? computeSelAfterChange(doc, change) : lst(source);
        makeChangeSingleDoc(doc, change, after, mergeOldSpans(doc, change));
        if (!i && doc.cm) { doc.cm.scrollIntoView({from: change.from, to: changeEnd(change)}); }
        var rebased = [];

        // Propagate to the linked documents
        linkedDocs(doc, function (doc, sharedHist) {
          if (!sharedHist && indexOf(rebased, doc.history) == -1) {
            rebaseHist(doc.history, change);
            rebased.push(doc.history);
          }
          makeChangeSingleDoc(doc, change, null, mergeOldSpans(doc, change));
        });
      };

      for (var i$1 = event.changes.length - 1; i$1 >= 0; --i$1) {
        var returned = loop( i$1 );

        if ( returned ) return returned.v;
      }
    }

    // Sub-views need their line numbers shifted when text is added
    // above or below them in the parent document.
    function shiftDoc(doc, distance) {
      if (distance == 0) { return }
      doc.first += distance;
      doc.sel = new Selection(map(doc.sel.ranges, function (range) { return new Range(
        Pos(range.anchor.line + distance, range.anchor.ch),
        Pos(range.head.line + distance, range.head.ch)
      ); }), doc.sel.primIndex);
      if (doc.cm) {
        regChange(doc.cm, doc.first, doc.first - distance, distance);
        for (var d = doc.cm.display, l = d.viewFrom; l < d.viewTo; l++)
          { regLineChange(doc.cm, l, "gutter"); }
      }
    }

    // More lower-level change function, handling only a single document
    // (not linked ones).
    function makeChangeSingleDoc(doc, change, selAfter, spans) {
      if (doc.cm && !doc.cm.curOp)
        { return operation(doc.cm, makeChangeSingleDoc)(doc, change, selAfter, spans) }

      if (change.to.line < doc.first) {
        shiftDoc(doc, change.text.length - 1 - (change.to.line - change.from.line));
        return
      }
      if (change.from.line > doc.lastLine()) { return }

      // Clip the change to the size of this doc
      if (change.from.line < doc.first) {
        var shift = change.text.length - 1 - (doc.first - change.from.line);
        shiftDoc(doc, shift);
        change = {from: Pos(doc.first, 0), to: Pos(change.to.line + shift, change.to.ch),
                  text: [lst(change.text)], origin: change.origin};
      }
      var last = doc.lastLine();
      if (change.to.line > last) {
        change = {from: change.from, to: Pos(last, getLine(doc, last).text.length),
                  text: [change.text[0]], origin: change.origin};
      }

      change.removed = getBetween(doc, change.from, change.to);

      if (!selAfter) { selAfter = computeSelAfterChange(doc, change); }
      if (doc.cm) { makeChangeSingleDocInEditor(doc.cm, change, spans); }
      else { updateDoc(doc, change, spans); }
      setSelectionNoUndo(doc, selAfter, sel_dontScroll);

      if (doc.cantEdit && skipAtomic(doc, Pos(doc.firstLine(), 0)))
        { doc.cantEdit = false; }
    }

    // Handle the interaction of a change to a document with the editor
    // that this document is part of.
    function makeChangeSingleDocInEditor(cm, change, spans) {
      var doc = cm.doc, display = cm.display, from = change.from, to = change.to;

      var recomputeMaxLength = false, checkWidthStart = from.line;
      if (!cm.options.lineWrapping) {
        checkWidthStart = lineNo(visualLine(getLine(doc, from.line)));
        doc.iter(checkWidthStart, to.line + 1, function (line) {
          if (line == display.maxLine) {
            recomputeMaxLength = true;
            return true
          }
        });
      }

      if (doc.sel.contains(change.from, change.to) > -1)
        { signalCursorActivity(cm); }

      updateDoc(doc, change, spans, estimateHeight(cm));

      if (!cm.options.lineWrapping) {
        doc.iter(checkWidthStart, from.line + change.text.length, function (line) {
          var len = lineLength(line);
          if (len > display.maxLineLength) {
            display.maxLine = line;
            display.maxLineLength = len;
            display.maxLineChanged = true;
            recomputeMaxLength = false;
          }
        });
        if (recomputeMaxLength) { cm.curOp.updateMaxLine = true; }
      }

      retreatFrontier(doc, from.line);
      startWorker(cm, 400);

      var lendiff = change.text.length - (to.line - from.line) - 1;
      // Remember that these lines changed, for updating the display
      if (change.full)
        { regChange(cm); }
      else if (from.line == to.line && change.text.length == 1 && !isWholeLineUpdate(cm.doc, change))
        { regLineChange(cm, from.line, "text"); }
      else
        { regChange(cm, from.line, to.line + 1, lendiff); }

      var changesHandler = hasHandler(cm, "changes"), changeHandler = hasHandler(cm, "change");
      if (changeHandler || changesHandler) {
        var obj = {
          from: from, to: to,
          text: change.text,
          removed: change.removed,
          origin: change.origin
        };
        if (changeHandler) { signalLater(cm, "change", cm, obj); }
        if (changesHandler) { (cm.curOp.changeObjs || (cm.curOp.changeObjs = [])).push(obj); }
      }
      cm.display.selForContextMenu = null;
    }

    function replaceRange(doc, code, from, to, origin) {
      var assign;

      if (!to) { to = from; }
      if (cmp(to, from) < 0) { (assign = [to, from], from = assign[0], to = assign[1]); }
      if (typeof code == "string") { code = doc.splitLines(code); }
      makeChange(doc, {from: from, to: to, text: code, origin: origin});
    }

    // Rebasing/resetting history to deal with externally-sourced changes

    function rebaseHistSelSingle(pos, from, to, diff) {
      if (to < pos.line) {
        pos.line += diff;
      } else if (from < pos.line) {
        pos.line = from;
        pos.ch = 0;
      }
    }

    // Tries to rebase an array of history events given a change in the
    // document. If the change touches the same lines as the event, the
    // event, and everything 'behind' it, is discarded. If the change is
    // before the event, the event's positions are updated. Uses a
    // copy-on-write scheme for the positions, to avoid having to
    // reallocate them all on every rebase, but also avoid problems with
    // shared position objects being unsafely updated.
    function rebaseHistArray(array, from, to, diff) {
      for (var i = 0; i < array.length; ++i) {
        var sub = array[i], ok = true;
        if (sub.ranges) {
          if (!sub.copied) { sub = array[i] = sub.deepCopy(); sub.copied = true; }
          for (var j = 0; j < sub.ranges.length; j++) {
            rebaseHistSelSingle(sub.ranges[j].anchor, from, to, diff);
            rebaseHistSelSingle(sub.ranges[j].head, from, to, diff);
          }
          continue
        }
        for (var j$1 = 0; j$1 < sub.changes.length; ++j$1) {
          var cur = sub.changes[j$1];
          if (to < cur.from.line) {
            cur.from = Pos(cur.from.line + diff, cur.from.ch);
            cur.to = Pos(cur.to.line + diff, cur.to.ch);
          } else if (from <= cur.to.line) {
            ok = false;
            break
          }
        }
        if (!ok) {
          array.splice(0, i + 1);
          i = 0;
        }
      }
    }

    function rebaseHist(hist, change) {
      var from = change.from.line, to = change.to.line, diff = change.text.length - (to - from) - 1;
      rebaseHistArray(hist.done, from, to, diff);
      rebaseHistArray(hist.undone, from, to, diff);
    }

    // Utility for applying a change to a line by handle or number,
    // returning the number and optionally registering the line as
    // changed.
    function changeLine(doc, handle, changeType, op) {
      var no = handle, line = handle;
      if (typeof handle == "number") { line = getLine(doc, clipLine(doc, handle)); }
      else { no = lineNo(handle); }
      if (no == null) { return null }
      if (op(line, no) && doc.cm) { regLineChange(doc.cm, no, changeType); }
      return line
    }

    // The document is represented as a BTree consisting of leaves, with
    // chunk of lines in them, and branches, with up to ten leaves or
    // other branch nodes below them. The top node is always a branch
    // node, and is the document object itself (meaning it has
    // additional methods and properties).
    //
    // All nodes have parent links. The tree is used both to go from
    // line numbers to line objects, and to go from objects to numbers.
    // It also indexes by height, and is used to convert between height
    // and line object, and to find the total height of the document.
    //
    // See also http://marijnhaverbeke.nl/blog/codemirror-line-tree.html

    function LeafChunk(lines) {
      this.lines = lines;
      this.parent = null;
      var height = 0;
      for (var i = 0; i < lines.length; ++i) {
        lines[i].parent = this;
        height += lines[i].height;
      }
      this.height = height;
    }

    LeafChunk.prototype = {
      chunkSize: function() { return this.lines.length },

      // Remove the n lines at offset 'at'.
      removeInner: function(at, n) {
        for (var i = at, e = at + n; i < e; ++i) {
          var line = this.lines[i];
          this.height -= line.height;
          cleanUpLine(line);
          signalLater(line, "delete");
        }
        this.lines.splice(at, n);
      },

      // Helper used to collapse a small branch into a single leaf.
      collapse: function(lines) {
        lines.push.apply(lines, this.lines);
      },

      // Insert the given array of lines at offset 'at', count them as
      // having the given height.
      insertInner: function(at, lines, height) {
        this.height += height;
        this.lines = this.lines.slice(0, at).concat(lines).concat(this.lines.slice(at));
        for (var i = 0; i < lines.length; ++i) { lines[i].parent = this; }
      },

      // Used to iterate over a part of the tree.
      iterN: function(at, n, op) {
        for (var e = at + n; at < e; ++at)
          { if (op(this.lines[at])) { return true } }
      }
    };

    function BranchChunk(children) {
      this.children = children;
      var size = 0, height = 0;
      for (var i = 0; i < children.length; ++i) {
        var ch = children[i];
        size += ch.chunkSize(); height += ch.height;
        ch.parent = this;
      }
      this.size = size;
      this.height = height;
      this.parent = null;
    }

    BranchChunk.prototype = {
      chunkSize: function() { return this.size },

      removeInner: function(at, n) {
        this.size -= n;
        for (var i = 0; i < this.children.length; ++i) {
          var child = this.children[i], sz = child.chunkSize();
          if (at < sz) {
            var rm = Math.min(n, sz - at), oldHeight = child.height;
            child.removeInner(at, rm);
            this.height -= oldHeight - child.height;
            if (sz == rm) { this.children.splice(i--, 1); child.parent = null; }
            if ((n -= rm) == 0) { break }
            at = 0;
          } else { at -= sz; }
        }
        // If the result is smaller than 25 lines, ensure that it is a
        // single leaf node.
        if (this.size - n < 25 &&
            (this.children.length > 1 || !(this.children[0] instanceof LeafChunk))) {
          var lines = [];
          this.collapse(lines);
          this.children = [new LeafChunk(lines)];
          this.children[0].parent = this;
        }
      },

      collapse: function(lines) {
        for (var i = 0; i < this.children.length; ++i) { this.children[i].collapse(lines); }
      },

      insertInner: function(at, lines, height) {
        this.size += lines.length;
        this.height += height;
        for (var i = 0; i < this.children.length; ++i) {
          var child = this.children[i], sz = child.chunkSize();
          if (at <= sz) {
            child.insertInner(at, lines, height);
            if (child.lines && child.lines.length > 50) {
              // To avoid memory thrashing when child.lines is huge (e.g. first view of a large file), it's never spliced.
              // Instead, small slices are taken. They're taken in order because sequential memory accesses are fastest.
              var remaining = child.lines.length % 25 + 25;
              for (var pos = remaining; pos < child.lines.length;) {
                var leaf = new LeafChunk(child.lines.slice(pos, pos += 25));
                child.height -= leaf.height;
                this.children.splice(++i, 0, leaf);
                leaf.parent = this;
              }
              child.lines = child.lines.slice(0, remaining);
              this.maybeSpill();
            }
            break
          }
          at -= sz;
        }
      },

      // When a node has grown, check whether it should be split.
      maybeSpill: function() {
        if (this.children.length <= 10) { return }
        var me = this;
        do {
          var spilled = me.children.splice(me.children.length - 5, 5);
          var sibling = new BranchChunk(spilled);
          if (!me.parent) { // Become the parent node
            var copy = new BranchChunk(me.children);
            copy.parent = me;
            me.children = [copy, sibling];
            me = copy;
         } else {
            me.size -= sibling.size;
            me.height -= sibling.height;
            var myIndex = indexOf(me.parent.children, me);
            me.parent.children.splice(myIndex + 1, 0, sibling);
          }
          sibling.parent = me.parent;
        } while (me.children.length > 10)
        me.parent.maybeSpill();
      },

      iterN: function(at, n, op) {
        for (var i = 0; i < this.children.length; ++i) {
          var child = this.children[i], sz = child.chunkSize();
          if (at < sz) {
            var used = Math.min(n, sz - at);
            if (child.iterN(at, used, op)) { return true }
            if ((n -= used) == 0) { break }
            at = 0;
          } else { at -= sz; }
        }
      }
    };

    // Line widgets are block elements displayed above or below a line.

    var LineWidget = function(doc, node, options) {
      if (options) { for (var opt in options) { if (options.hasOwnProperty(opt))
        { this[opt] = options[opt]; } } }
      this.doc = doc;
      this.node = node;
    };

    LineWidget.prototype.clear = function () {
      var cm = this.doc.cm, ws = this.line.widgets, line = this.line, no = lineNo(line);
      if (no == null || !ws) { return }
      for (var i = 0; i < ws.length; ++i) { if (ws[i] == this) { ws.splice(i--, 1); } }
      if (!ws.length) { line.widgets = null; }
      var height = widgetHeight(this);
      updateLineHeight(line, Math.max(0, line.height - height));
      if (cm) {
        runInOp(cm, function () {
          adjustScrollWhenAboveVisible(cm, line, -height);
          regLineChange(cm, no, "widget");
        });
        signalLater(cm, "lineWidgetCleared", cm, this, no);
      }
    };

    LineWidget.prototype.changed = function () {
        var this$1 = this;

      var oldH = this.height, cm = this.doc.cm, line = this.line;
      this.height = null;
      var diff = widgetHeight(this) - oldH;
      if (!diff) { return }
      if (!lineIsHidden(this.doc, line)) { updateLineHeight(line, line.height + diff); }
      if (cm) {
        runInOp(cm, function () {
          cm.curOp.forceUpdate = true;
          adjustScrollWhenAboveVisible(cm, line, diff);
          signalLater(cm, "lineWidgetChanged", cm, this$1, lineNo(line));
        });
      }
    };
    eventMixin(LineWidget);

    function adjustScrollWhenAboveVisible(cm, line, diff) {
      if (heightAtLine(line) < ((cm.curOp && cm.curOp.scrollTop) || cm.doc.scrollTop))
        { addToScrollTop(cm, diff); }
    }

    function addLineWidget(doc, handle, node, options) {
      var widget = new LineWidget(doc, node, options);
      var cm = doc.cm;
      if (cm && widget.noHScroll) { cm.display.alignWidgets = true; }
      changeLine(doc, handle, "widget", function (line) {
        var widgets = line.widgets || (line.widgets = []);
        if (widget.insertAt == null) { widgets.push(widget); }
        else { widgets.splice(Math.min(widgets.length, Math.max(0, widget.insertAt)), 0, widget); }
        widget.line = line;
        if (cm && !lineIsHidden(doc, line)) {
          var aboveVisible = heightAtLine(line) < doc.scrollTop;
          updateLineHeight(line, line.height + widgetHeight(widget));
          if (aboveVisible) { addToScrollTop(cm, widget.height); }
          cm.curOp.forceUpdate = true;
        }
        return true
      });
      if (cm) { signalLater(cm, "lineWidgetAdded", cm, widget, typeof handle == "number" ? handle : lineNo(handle)); }
      return widget
    }

    // TEXTMARKERS

    // Created with markText and setBookmark methods. A TextMarker is a
    // handle that can be used to clear or find a marked position in the
    // document. Line objects hold arrays (markedSpans) containing
    // {from, to, marker} object pointing to such marker objects, and
    // indicating that such a marker is present on that line. Multiple
    // lines may point to the same marker when it spans across lines.
    // The spans will have null for their from/to properties when the
    // marker continues beyond the start/end of the line. Markers have
    // links back to the lines they currently touch.

    // Collapsed markers have unique ids, in order to be able to order
    // them, which is needed for uniquely determining an outer marker
    // when they overlap (they may nest, but not partially overlap).
    var nextMarkerId = 0;

    var TextMarker = function(doc, type) {
      this.lines = [];
      this.type = type;
      this.doc = doc;
      this.id = ++nextMarkerId;
    };

    // Clear the marker.
    TextMarker.prototype.clear = function () {
      if (this.explicitlyCleared) { return }
      var cm = this.doc.cm, withOp = cm && !cm.curOp;
      if (withOp) { startOperation(cm); }
      if (hasHandler(this, "clear")) {
        var found = this.find();
        if (found) { signalLater(this, "clear", found.from, found.to); }
      }
      var min = null, max = null;
      for (var i = 0; i < this.lines.length; ++i) {
        var line = this.lines[i];
        var span = getMarkedSpanFor(line.markedSpans, this);
        if (cm && !this.collapsed) { regLineChange(cm, lineNo(line), "text"); }
        else if (cm) {
          if (span.to != null) { max = lineNo(line); }
          if (span.from != null) { min = lineNo(line); }
        }
        line.markedSpans = removeMarkedSpan(line.markedSpans, span);
        if (span.from == null && this.collapsed && !lineIsHidden(this.doc, line) && cm)
          { updateLineHeight(line, textHeight(cm.display)); }
      }
      if (cm && this.collapsed && !cm.options.lineWrapping) { for (var i$1 = 0; i$1 < this.lines.length; ++i$1) {
        var visual = visualLine(this.lines[i$1]), len = lineLength(visual);
        if (len > cm.display.maxLineLength) {
          cm.display.maxLine = visual;
          cm.display.maxLineLength = len;
          cm.display.maxLineChanged = true;
        }
      } }

      if (min != null && cm && this.collapsed) { regChange(cm, min, max + 1); }
      this.lines.length = 0;
      this.explicitlyCleared = true;
      if (this.atomic && this.doc.cantEdit) {
        this.doc.cantEdit = false;
        if (cm) { reCheckSelection(cm.doc); }
      }
      if (cm) { signalLater(cm, "markerCleared", cm, this, min, max); }
      if (withOp) { endOperation(cm); }
      if (this.parent) { this.parent.clear(); }
    };

    // Find the position of the marker in the document. Returns a {from,
    // to} object by default. Side can be passed to get a specific side
    // -- 0 (both), -1 (left), or 1 (right). When lineObj is true, the
    // Pos objects returned contain a line object, rather than a line
    // number (used to prevent looking up the same line twice).
    TextMarker.prototype.find = function (side, lineObj) {
      if (side == null && this.type == "bookmark") { side = 1; }
      var from, to;
      for (var i = 0; i < this.lines.length; ++i) {
        var line = this.lines[i];
        var span = getMarkedSpanFor(line.markedSpans, this);
        if (span.from != null) {
          from = Pos(lineObj ? line : lineNo(line), span.from);
          if (side == -1) { return from }
        }
        if (span.to != null) {
          to = Pos(lineObj ? line : lineNo(line), span.to);
          if (side == 1) { return to }
        }
      }
      return from && {from: from, to: to}
    };

    // Signals that the marker's widget changed, and surrounding layout
    // should be recomputed.
    TextMarker.prototype.changed = function () {
        var this$1 = this;

      var pos = this.find(-1, true), widget = this, cm = this.doc.cm;
      if (!pos || !cm) { return }
      runInOp(cm, function () {
        var line = pos.line, lineN = lineNo(pos.line);
        var view = findViewForLine(cm, lineN);
        if (view) {
          clearLineMeasurementCacheFor(view);
          cm.curOp.selectionChanged = cm.curOp.forceUpdate = true;
        }
        cm.curOp.updateMaxLine = true;
        if (!lineIsHidden(widget.doc, line) && widget.height != null) {
          var oldHeight = widget.height;
          widget.height = null;
          var dHeight = widgetHeight(widget) - oldHeight;
          if (dHeight)
            { updateLineHeight(line, line.height + dHeight); }
        }
        signalLater(cm, "markerChanged", cm, this$1);
      });
    };

    TextMarker.prototype.attachLine = function (line) {
      if (!this.lines.length && this.doc.cm) {
        var op = this.doc.cm.curOp;
        if (!op.maybeHiddenMarkers || indexOf(op.maybeHiddenMarkers, this) == -1)
          { (op.maybeUnhiddenMarkers || (op.maybeUnhiddenMarkers = [])).push(this); }
      }
      this.lines.push(line);
    };

    TextMarker.prototype.detachLine = function (line) {
      this.lines.splice(indexOf(this.lines, line), 1);
      if (!this.lines.length && this.doc.cm) {
        var op = this.doc.cm.curOp
        ;(op.maybeHiddenMarkers || (op.maybeHiddenMarkers = [])).push(this);
      }
    };
    eventMixin(TextMarker);

    // Create a marker, wire it up to the right lines, and
    function markText(doc, from, to, options, type) {
      // Shared markers (across linked documents) are handled separately
      // (markTextShared will call out to this again, once per
      // document).
      if (options && options.shared) { return markTextShared(doc, from, to, options, type) }
      // Ensure we are in an operation.
      if (doc.cm && !doc.cm.curOp) { return operation(doc.cm, markText)(doc, from, to, options, type) }

      var marker = new TextMarker(doc, type), diff = cmp(from, to);
      if (options) { copyObj(options, marker, false); }
      // Don't connect empty markers unless clearWhenEmpty is false
      if (diff > 0 || diff == 0 && marker.clearWhenEmpty !== false)
        { return marker }
      if (marker.replacedWith) {
        // Showing up as a widget implies collapsed (widget replaces text)
        marker.collapsed = true;
        marker.widgetNode = eltP("span", [marker.replacedWith], "CodeMirror-widget");
        if (!options.handleMouseEvents) { marker.widgetNode.setAttribute("cm-ignore-events", "true"); }
        if (options.insertLeft) { marker.widgetNode.insertLeft = true; }
      }
      if (marker.collapsed) {
        if (conflictingCollapsedRange(doc, from.line, from, to, marker) ||
            from.line != to.line && conflictingCollapsedRange(doc, to.line, from, to, marker))
          { throw new Error("Inserting collapsed marker partially overlapping an existing one") }
        seeCollapsedSpans();
      }

      if (marker.addToHistory)
        { addChangeToHistory(doc, {from: from, to: to, origin: "markText"}, doc.sel, NaN); }

      var curLine = from.line, cm = doc.cm, updateMaxLine;
      doc.iter(curLine, to.line + 1, function (line) {
        if (cm && marker.collapsed && !cm.options.lineWrapping && visualLine(line) == cm.display.maxLine)
          { updateMaxLine = true; }
        if (marker.collapsed && curLine != from.line) { updateLineHeight(line, 0); }
        addMarkedSpan(line, new MarkedSpan(marker,
                                           curLine == from.line ? from.ch : null,
                                           curLine == to.line ? to.ch : null));
        ++curLine;
      });
      // lineIsHidden depends on the presence of the spans, so needs a second pass
      if (marker.collapsed) { doc.iter(from.line, to.line + 1, function (line) {
        if (lineIsHidden(doc, line)) { updateLineHeight(line, 0); }
      }); }

      if (marker.clearOnEnter) { on(marker, "beforeCursorEnter", function () { return marker.clear(); }); }

      if (marker.readOnly) {
        seeReadOnlySpans();
        if (doc.history.done.length || doc.history.undone.length)
          { doc.clearHistory(); }
      }
      if (marker.collapsed) {
        marker.id = ++nextMarkerId;
        marker.atomic = true;
      }
      if (cm) {
        // Sync editor state
        if (updateMaxLine) { cm.curOp.updateMaxLine = true; }
        if (marker.collapsed)
          { regChange(cm, from.line, to.line + 1); }
        else if (marker.className || marker.startStyle || marker.endStyle || marker.css ||
                 marker.attributes || marker.title)
          { for (var i = from.line; i <= to.line; i++) { regLineChange(cm, i, "text"); } }
        if (marker.atomic) { reCheckSelection(cm.doc); }
        signalLater(cm, "markerAdded", cm, marker);
      }
      return marker
    }

    // SHARED TEXTMARKERS

    // A shared marker spans multiple linked documents. It is
    // implemented as a meta-marker-object controlling multiple normal
    // markers.
    var SharedTextMarker = function(markers, primary) {
      this.markers = markers;
      this.primary = primary;
      for (var i = 0; i < markers.length; ++i)
        { markers[i].parent = this; }
    };

    SharedTextMarker.prototype.clear = function () {
      if (this.explicitlyCleared) { return }
      this.explicitlyCleared = true;
      for (var i = 0; i < this.markers.length; ++i)
        { this.markers[i].clear(); }
      signalLater(this, "clear");
    };

    SharedTextMarker.prototype.find = function (side, lineObj) {
      return this.primary.find(side, lineObj)
    };
    eventMixin(SharedTextMarker);

    function markTextShared(doc, from, to, options, type) {
      options = copyObj(options);
      options.shared = false;
      var markers = [markText(doc, from, to, options, type)], primary = markers[0];
      var widget = options.widgetNode;
      linkedDocs(doc, function (doc) {
        if (widget) { options.widgetNode = widget.cloneNode(true); }
        markers.push(markText(doc, clipPos(doc, from), clipPos(doc, to), options, type));
        for (var i = 0; i < doc.linked.length; ++i)
          { if (doc.linked[i].isParent) { return } }
        primary = lst(markers);
      });
      return new SharedTextMarker(markers, primary)
    }

    function findSharedMarkers(doc) {
      return doc.findMarks(Pos(doc.first, 0), doc.clipPos(Pos(doc.lastLine())), function (m) { return m.parent; })
    }

    function copySharedMarkers(doc, markers) {
      for (var i = 0; i < markers.length; i++) {
        var marker = markers[i], pos = marker.find();
        var mFrom = doc.clipPos(pos.from), mTo = doc.clipPos(pos.to);
        if (cmp(mFrom, mTo)) {
          var subMark = markText(doc, mFrom, mTo, marker.primary, marker.primary.type);
          marker.markers.push(subMark);
          subMark.parent = marker;
        }
      }
    }

    function detachSharedMarkers(markers) {
      var loop = function ( i ) {
        var marker = markers[i], linked = [marker.primary.doc];
        linkedDocs(marker.primary.doc, function (d) { return linked.push(d); });
        for (var j = 0; j < marker.markers.length; j++) {
          var subMarker = marker.markers[j];
          if (indexOf(linked, subMarker.doc) == -1) {
            subMarker.parent = null;
            marker.markers.splice(j--, 1);
          }
        }
      };

      for (var i = 0; i < markers.length; i++) loop( i );
    }

    var nextDocId = 0;
    var Doc = function(text, mode, firstLine, lineSep, direction) {
      if (!(this instanceof Doc)) { return new Doc(text, mode, firstLine, lineSep, direction) }
      if (firstLine == null) { firstLine = 0; }

      BranchChunk.call(this, [new LeafChunk([new Line("", null)])]);
      this.first = firstLine;
      this.scrollTop = this.scrollLeft = 0;
      this.cantEdit = false;
      this.cleanGeneration = 1;
      this.modeFrontier = this.highlightFrontier = firstLine;
      var start = Pos(firstLine, 0);
      this.sel = simpleSelection(start);
      this.history = new History(null);
      this.id = ++nextDocId;
      this.modeOption = mode;
      this.lineSep = lineSep;
      this.direction = (direction == "rtl") ? "rtl" : "ltr";
      this.extend = false;

      if (typeof text == "string") { text = this.splitLines(text); }
      updateDoc(this, {from: start, to: start, text: text});
      setSelection(this, simpleSelection(start), sel_dontScroll);
    };

    Doc.prototype = createObj(BranchChunk.prototype, {
      constructor: Doc,
      // Iterate over the document. Supports two forms -- with only one
      // argument, it calls that for each line in the document. With
      // three, it iterates over the range given by the first two (with
      // the second being non-inclusive).
      iter: function(from, to, op) {
        if (op) { this.iterN(from - this.first, to - from, op); }
        else { this.iterN(this.first, this.first + this.size, from); }
      },

      // Non-public interface for adding and removing lines.
      insert: function(at, lines) {
        var height = 0;
        for (var i = 0; i < lines.length; ++i) { height += lines[i].height; }
        this.insertInner(at - this.first, lines, height);
      },
      remove: function(at, n) { this.removeInner(at - this.first, n); },

      // From here, the methods are part of the public interface. Most
      // are also available from CodeMirror (editor) instances.

      getValue: function(lineSep) {
        var lines = getLines(this, this.first, this.first + this.size);
        if (lineSep === false) { return lines }
        return lines.join(lineSep || this.lineSeparator())
      },
      setValue: docMethodOp(function(code) {
        var top = Pos(this.first, 0), last = this.first + this.size - 1;
        makeChange(this, {from: top, to: Pos(last, getLine(this, last).text.length),
                          text: this.splitLines(code), origin: "setValue", full: true}, true);
        if (this.cm) { scrollToCoords(this.cm, 0, 0); }
        setSelection(this, simpleSelection(top), sel_dontScroll);
      }),
      replaceRange: function(code, from, to, origin) {
        from = clipPos(this, from);
        to = to ? clipPos(this, to) : from;
        replaceRange(this, code, from, to, origin);
      },
      getRange: function(from, to, lineSep) {
        var lines = getBetween(this, clipPos(this, from), clipPos(this, to));
        if (lineSep === false) { return lines }
        return lines.join(lineSep || this.lineSeparator())
      },

      getLine: function(line) {var l = this.getLineHandle(line); return l && l.text},

      getLineHandle: function(line) {if (isLine(this, line)) { return getLine(this, line) }},
      getLineNumber: function(line) {return lineNo(line)},

      getLineHandleVisualStart: function(line) {
        if (typeof line == "number") { line = getLine(this, line); }
        return visualLine(line)
      },

      lineCount: function() {return this.size},
      firstLine: function() {return this.first},
      lastLine: function() {return this.first + this.size - 1},

      clipPos: function(pos) {return clipPos(this, pos)},

      getCursor: function(start) {
        var range = this.sel.primary(), pos;
        if (start == null || start == "head") { pos = range.head; }
        else if (start == "anchor") { pos = range.anchor; }
        else if (start == "end" || start == "to" || start === false) { pos = range.to(); }
        else { pos = range.from(); }
        return pos
      },
      listSelections: function() { return this.sel.ranges },
      somethingSelected: function() {return this.sel.somethingSelected()},

      setCursor: docMethodOp(function(line, ch, options) {
        setSimpleSelection(this, clipPos(this, typeof line == "number" ? Pos(line, ch || 0) : line), null, options);
      }),
      setSelection: docMethodOp(function(anchor, head, options) {
        setSimpleSelection(this, clipPos(this, anchor), clipPos(this, head || anchor), options);
      }),
      extendSelection: docMethodOp(function(head, other, options) {
        extendSelection(this, clipPos(this, head), other && clipPos(this, other), options);
      }),
      extendSelections: docMethodOp(function(heads, options) {
        extendSelections(this, clipPosArray(this, heads), options);
      }),
      extendSelectionsBy: docMethodOp(function(f, options) {
        var heads = map(this.sel.ranges, f);
        extendSelections(this, clipPosArray(this, heads), options);
      }),
      setSelections: docMethodOp(function(ranges, primary, options) {
        if (!ranges.length) { return }
        var out = [];
        for (var i = 0; i < ranges.length; i++)
          { out[i] = new Range(clipPos(this, ranges[i].anchor),
                             clipPos(this, ranges[i].head)); }
        if (primary == null) { primary = Math.min(ranges.length - 1, this.sel.primIndex); }
        setSelection(this, normalizeSelection(this.cm, out, primary), options);
      }),
      addSelection: docMethodOp(function(anchor, head, options) {
        var ranges = this.sel.ranges.slice(0);
        ranges.push(new Range(clipPos(this, anchor), clipPos(this, head || anchor)));
        setSelection(this, normalizeSelection(this.cm, ranges, ranges.length - 1), options);
      }),

      getSelection: function(lineSep) {
        var ranges = this.sel.ranges, lines;
        for (var i = 0; i < ranges.length; i++) {
          var sel = getBetween(this, ranges[i].from(), ranges[i].to());
          lines = lines ? lines.concat(sel) : sel;
        }
        if (lineSep === false) { return lines }
        else { return lines.join(lineSep || this.lineSeparator()) }
      },
      getSelections: function(lineSep) {
        var parts = [], ranges = this.sel.ranges;
        for (var i = 0; i < ranges.length; i++) {
          var sel = getBetween(this, ranges[i].from(), ranges[i].to());
          if (lineSep !== false) { sel = sel.join(lineSep || this.lineSeparator()); }
          parts[i] = sel;
        }
        return parts
      },
      replaceSelection: function(code, collapse, origin) {
        var dup = [];
        for (var i = 0; i < this.sel.ranges.length; i++)
          { dup[i] = code; }
        this.replaceSelections(dup, collapse, origin || "+input");
      },
      replaceSelections: docMethodOp(function(code, collapse, origin) {
        var changes = [], sel = this.sel;
        for (var i = 0; i < sel.ranges.length; i++) {
          var range = sel.ranges[i];
          changes[i] = {from: range.from(), to: range.to(), text: this.splitLines(code[i]), origin: origin};
        }
        var newSel = collapse && collapse != "end" && computeReplacedSel(this, changes, collapse);
        for (var i$1 = changes.length - 1; i$1 >= 0; i$1--)
          { makeChange(this, changes[i$1]); }
        if (newSel) { setSelectionReplaceHistory(this, newSel); }
        else if (this.cm) { ensureCursorVisible(this.cm); }
      }),
      undo: docMethodOp(function() {makeChangeFromHistory(this, "undo");}),
      redo: docMethodOp(function() {makeChangeFromHistory(this, "redo");}),
      undoSelection: docMethodOp(function() {makeChangeFromHistory(this, "undo", true);}),
      redoSelection: docMethodOp(function() {makeChangeFromHistory(this, "redo", true);}),

      setExtending: function(val) {this.extend = val;},
      getExtending: function() {return this.extend},

      historySize: function() {
        var hist = this.history, done = 0, undone = 0;
        for (var i = 0; i < hist.done.length; i++) { if (!hist.done[i].ranges) { ++done; } }
        for (var i$1 = 0; i$1 < hist.undone.length; i$1++) { if (!hist.undone[i$1].ranges) { ++undone; } }
        return {undo: done, redo: undone}
      },
      clearHistory: function() {
        var this$1 = this;

        this.history = new History(this.history.maxGeneration);
        linkedDocs(this, function (doc) { return doc.history = this$1.history; }, true);
      },

      markClean: function() {
        this.cleanGeneration = this.changeGeneration(true);
      },
      changeGeneration: function(forceSplit) {
        if (forceSplit)
          { this.history.lastOp = this.history.lastSelOp = this.history.lastOrigin = null; }
        return this.history.generation
      },
      isClean: function (gen) {
        return this.history.generation == (gen || this.cleanGeneration)
      },

      getHistory: function() {
        return {done: copyHistoryArray(this.history.done),
                undone: copyHistoryArray(this.history.undone)}
      },
      setHistory: function(histData) {
        var hist = this.history = new History(this.history.maxGeneration);
        hist.done = copyHistoryArray(histData.done.slice(0), null, true);
        hist.undone = copyHistoryArray(histData.undone.slice(0), null, true);
      },

      setGutterMarker: docMethodOp(function(line, gutterID, value) {
        return changeLine(this, line, "gutter", function (line) {
          var markers = line.gutterMarkers || (line.gutterMarkers = {});
          markers[gutterID] = value;
          if (!value && isEmpty(markers)) { line.gutterMarkers = null; }
          return true
        })
      }),

      clearGutter: docMethodOp(function(gutterID) {
        var this$1 = this;

        this.iter(function (line) {
          if (line.gutterMarkers && line.gutterMarkers[gutterID]) {
            changeLine(this$1, line, "gutter", function () {
              line.gutterMarkers[gutterID] = null;
              if (isEmpty(line.gutterMarkers)) { line.gutterMarkers = null; }
              return true
            });
          }
        });
      }),

      lineInfo: function(line) {
        var n;
        if (typeof line == "number") {
          if (!isLine(this, line)) { return null }
          n = line;
          line = getLine(this, line);
          if (!line) { return null }
        } else {
          n = lineNo(line);
          if (n == null) { return null }
        }
        return {line: n, handle: line, text: line.text, gutterMarkers: line.gutterMarkers,
                textClass: line.textClass, bgClass: line.bgClass, wrapClass: line.wrapClass,
                widgets: line.widgets}
      },

      addLineClass: docMethodOp(function(handle, where, cls) {
        return changeLine(this, handle, where == "gutter" ? "gutter" : "class", function (line) {
          var prop = where == "text" ? "textClass"
                   : where == "background" ? "bgClass"
                   : where == "gutter" ? "gutterClass" : "wrapClass";
          if (!line[prop]) { line[prop] = cls; }
          else if (classTest(cls).test(line[prop])) { return false }
          else { line[prop] += " " + cls; }
          return true
        })
      }),
      removeLineClass: docMethodOp(function(handle, where, cls) {
        return changeLine(this, handle, where == "gutter" ? "gutter" : "class", function (line) {
          var prop = where == "text" ? "textClass"
                   : where == "background" ? "bgClass"
                   : where == "gutter" ? "gutterClass" : "wrapClass";
          var cur = line[prop];
          if (!cur) { return false }
          else if (cls == null) { line[prop] = null; }
          else {
            var found = cur.match(classTest(cls));
            if (!found) { return false }
            var end = found.index + found[0].length;
            line[prop] = cur.slice(0, found.index) + (!found.index || end == cur.length ? "" : " ") + cur.slice(end) || null;
          }
          return true
        })
      }),

      addLineWidget: docMethodOp(function(handle, node, options) {
        return addLineWidget(this, handle, node, options)
      }),
      removeLineWidget: function(widget) { widget.clear(); },

      markText: function(from, to, options) {
        return markText(this, clipPos(this, from), clipPos(this, to), options, options && options.type || "range")
      },
      setBookmark: function(pos, options) {
        var realOpts = {replacedWith: options && (options.nodeType == null ? options.widget : options),
                        insertLeft: options && options.insertLeft,
                        clearWhenEmpty: false, shared: options && options.shared,
                        handleMouseEvents: options && options.handleMouseEvents};
        pos = clipPos(this, pos);
        return markText(this, pos, pos, realOpts, "bookmark")
      },
      findMarksAt: function(pos) {
        pos = clipPos(this, pos);
        var markers = [], spans = getLine(this, pos.line).markedSpans;
        if (spans) { for (var i = 0; i < spans.length; ++i) {
          var span = spans[i];
          if ((span.from == null || span.from <= pos.ch) &&
              (span.to == null || span.to >= pos.ch))
            { markers.push(span.marker.parent || span.marker); }
        } }
        return markers
      },
      findMarks: function(from, to, filter) {
        from = clipPos(this, from); to = clipPos(this, to);
        var found = [], lineNo = from.line;
        this.iter(from.line, to.line + 1, function (line) {
          var spans = line.markedSpans;
          if (spans) { for (var i = 0; i < spans.length; i++) {
            var span = spans[i];
            if (!(span.to != null && lineNo == from.line && from.ch >= span.to ||
                  span.from == null && lineNo != from.line ||
                  span.from != null && lineNo == to.line && span.from >= to.ch) &&
                (!filter || filter(span.marker)))
              { found.push(span.marker.parent || span.marker); }
          } }
          ++lineNo;
        });
        return found
      },
      getAllMarks: function() {
        var markers = [];
        this.iter(function (line) {
          var sps = line.markedSpans;
          if (sps) { for (var i = 0; i < sps.length; ++i)
            { if (sps[i].from != null) { markers.push(sps[i].marker); } } }
        });
        return markers
      },

      posFromIndex: function(off) {
        var ch, lineNo = this.first, sepSize = this.lineSeparator().length;
        this.iter(function (line) {
          var sz = line.text.length + sepSize;
          if (sz > off) { ch = off; return true }
          off -= sz;
          ++lineNo;
        });
        return clipPos(this, Pos(lineNo, ch))
      },
      indexFromPos: function (coords) {
        coords = clipPos(this, coords);
        var index = coords.ch;
        if (coords.line < this.first || coords.ch < 0) { return 0 }
        var sepSize = this.lineSeparator().length;
        this.iter(this.first, coords.line, function (line) { // iter aborts when callback returns a truthy value
          index += line.text.length + sepSize;
        });
        return index
      },

      copy: function(copyHistory) {
        var doc = new Doc(getLines(this, this.first, this.first + this.size),
                          this.modeOption, this.first, this.lineSep, this.direction);
        doc.scrollTop = this.scrollTop; doc.scrollLeft = this.scrollLeft;
        doc.sel = this.sel;
        doc.extend = false;
        if (copyHistory) {
          doc.history.undoDepth = this.history.undoDepth;
          doc.setHistory(this.getHistory());
        }
        return doc
      },

      linkedDoc: function(options) {
        if (!options) { options = {}; }
        var from = this.first, to = this.first + this.size;
        if (options.from != null && options.from > from) { from = options.from; }
        if (options.to != null && options.to < to) { to = options.to; }
        var copy = new Doc(getLines(this, from, to), options.mode || this.modeOption, from, this.lineSep, this.direction);
        if (options.sharedHist) { copy.history = this.history
        ; }(this.linked || (this.linked = [])).push({doc: copy, sharedHist: options.sharedHist});
        copy.linked = [{doc: this, isParent: true, sharedHist: options.sharedHist}];
        copySharedMarkers(copy, findSharedMarkers(this));
        return copy
      },
      unlinkDoc: function(other) {
        if (other instanceof CodeMirror) { other = other.doc; }
        if (this.linked) { for (var i = 0; i < this.linked.length; ++i) {
          var link = this.linked[i];
          if (link.doc != other) { continue }
          this.linked.splice(i, 1);
          other.unlinkDoc(this);
          detachSharedMarkers(findSharedMarkers(this));
          break
        } }
        // If the histories were shared, split them again
        if (other.history == this.history) {
          var splitIds = [other.id];
          linkedDocs(other, function (doc) { return splitIds.push(doc.id); }, true);
          other.history = new History(null);
          other.history.done = copyHistoryArray(this.history.done, splitIds);
          other.history.undone = copyHistoryArray(this.history.undone, splitIds);
        }
      },
      iterLinkedDocs: function(f) {linkedDocs(this, f);},

      getMode: function() {return this.mode},
      getEditor: function() {return this.cm},

      splitLines: function(str) {
        if (this.lineSep) { return str.split(this.lineSep) }
        return splitLinesAuto(str)
      },
      lineSeparator: function() { return this.lineSep || "\n" },

      setDirection: docMethodOp(function (dir) {
        if (dir != "rtl") { dir = "ltr"; }
        if (dir == this.direction) { return }
        this.direction = dir;
        this.iter(function (line) { return line.order = null; });
        if (this.cm) { directionChanged(this.cm); }
      })
    });

    // Public alias.
    Doc.prototype.eachLine = Doc.prototype.iter;

    // Kludge to work around strange IE behavior where it'll sometimes
    // re-fire a series of drag-related events right after the drop (#1551)
    var lastDrop = 0;

    function onDrop(e) {
      var cm = this;
      clearDragCursor(cm);
      if (signalDOMEvent(cm, e) || eventInWidget(cm.display, e))
        { return }
      e_preventDefault(e);
      if (ie) { lastDrop = +new Date; }
      var pos = posFromMouse(cm, e, true), files = e.dataTransfer.files;
      if (!pos || cm.isReadOnly()) { return }
      // Might be a file drop, in which case we simply extract the text
      // and insert it.
      if (files && files.length && window.FileReader && window.File) {
        var n = files.length, text = Array(n), read = 0;
        var markAsReadAndPasteIfAllFilesAreRead = function () {
          if (++read == n) {
            operation(cm, function () {
              pos = clipPos(cm.doc, pos);
              var change = {from: pos, to: pos,
                            text: cm.doc.splitLines(
                                text.filter(function (t) { return t != null; }).join(cm.doc.lineSeparator())),
                            origin: "paste"};
              makeChange(cm.doc, change);
              setSelectionReplaceHistory(cm.doc, simpleSelection(clipPos(cm.doc, pos), clipPos(cm.doc, changeEnd(change))));
            })();
          }
        };
        var readTextFromFile = function (file, i) {
          if (cm.options.allowDropFileTypes &&
              indexOf(cm.options.allowDropFileTypes, file.type) == -1) {
            markAsReadAndPasteIfAllFilesAreRead();
            return
          }
          var reader = new FileReader;
          reader.onerror = function () { return markAsReadAndPasteIfAllFilesAreRead(); };
          reader.onload = function () {
            var content = reader.result;
            if (/[\x00-\x08\x0e-\x1f]{2}/.test(content)) {
              markAsReadAndPasteIfAllFilesAreRead();
              return
            }
            text[i] = content;
            markAsReadAndPasteIfAllFilesAreRead();
          };
          reader.readAsText(file);
        };
        for (var i = 0; i < files.length; i++) { readTextFromFile(files[i], i); }
      } else { // Normal drop
        // Don't do a replace if the drop happened inside of the selected text.
        if (cm.state.draggingText && cm.doc.sel.contains(pos) > -1) {
          cm.state.draggingText(e);
          // Ensure the editor is re-focused
          setTimeout(function () { return cm.display.input.focus(); }, 20);
          return
        }
        try {
          var text$1 = e.dataTransfer.getData("Text");
          if (text$1) {
            var selected;
            if (cm.state.draggingText && !cm.state.draggingText.copy)
              { selected = cm.listSelections(); }
            setSelectionNoUndo(cm.doc, simpleSelection(pos, pos));
            if (selected) { for (var i$1 = 0; i$1 < selected.length; ++i$1)
              { replaceRange(cm.doc, "", selected[i$1].anchor, selected[i$1].head, "drag"); } }
            cm.replaceSelection(text$1, "around", "paste");
            cm.display.input.focus();
          }
        }
        catch(e$1){}
      }
    }

    function onDragStart(cm, e) {
      if (ie && (!cm.state.draggingText || +new Date - lastDrop < 100)) { e_stop(e); return }
      if (signalDOMEvent(cm, e) || eventInWidget(cm.display, e)) { return }

      e.dataTransfer.setData("Text", cm.getSelection());
      e.dataTransfer.effectAllowed = "copyMove";

      // Use dummy image instead of default browsers image.
      // Recent Safari (~6.0.2) have a tendency to segfault when this happens, so we don't do it there.
      if (e.dataTransfer.setDragImage && !safari) {
        var img = elt("img", null, null, "position: fixed; left: 0; top: 0;");
        img.src = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
        if (presto) {
          img.width = img.height = 1;
          cm.display.wrapper.appendChild(img);
          // Force a relayout, or Opera won't use our image for some obscure reason
          img._top = img.offsetTop;
        }
        e.dataTransfer.setDragImage(img, 0, 0);
        if (presto) { img.parentNode.removeChild(img); }
      }
    }

    function onDragOver(cm, e) {
      var pos = posFromMouse(cm, e);
      if (!pos) { return }
      var frag = document.createDocumentFragment();
      drawSelectionCursor(cm, pos, frag);
      if (!cm.display.dragCursor) {
        cm.display.dragCursor = elt("div", null, "CodeMirror-cursors CodeMirror-dragcursors");
        cm.display.lineSpace.insertBefore(cm.display.dragCursor, cm.display.cursorDiv);
      }
      removeChildrenAndAdd(cm.display.dragCursor, frag);
    }

    function clearDragCursor(cm) {
      if (cm.display.dragCursor) {
        cm.display.lineSpace.removeChild(cm.display.dragCursor);
        cm.display.dragCursor = null;
      }
    }

    // These must be handled carefully, because naively registering a
    // handler for each editor will cause the editors to never be
    // garbage collected.

    function forEachCodeMirror(f) {
      if (!document.getElementsByClassName) { return }
      var byClass = document.getElementsByClassName("CodeMirror"), editors = [];
      for (var i = 0; i < byClass.length; i++) {
        var cm = byClass[i].CodeMirror;
        if (cm) { editors.push(cm); }
      }
      if (editors.length) { editors[0].operation(function () {
        for (var i = 0; i < editors.length; i++) { f(editors[i]); }
      }); }
    }

    var globalsRegistered = false;
    function ensureGlobalHandlers() {
      if (globalsRegistered) { return }
      registerGlobalHandlers();
      globalsRegistered = true;
    }
    function registerGlobalHandlers() {
      // When the window resizes, we need to refresh active editors.
      var resizeTimer;
      on(window, "resize", function () {
        if (resizeTimer == null) { resizeTimer = setTimeout(function () {
          resizeTimer = null;
          forEachCodeMirror(onResize);
        }, 100); }
      });
      // When the window loses focus, we want to show the editor as blurred
      on(window, "blur", function () { return forEachCodeMirror(onBlur); });
    }
    // Called when the window resizes
    function onResize(cm) {
      var d = cm.display;
      // Might be a text scaling operation, clear size caches.
      d.cachedCharWidth = d.cachedTextHeight = d.cachedPaddingH = null;
      d.scrollbarsClipped = false;
      cm.setSize();
    }

    var keyNames = {
      3: "Pause", 8: "Backspace", 9: "Tab", 13: "Enter", 16: "Shift", 17: "Ctrl", 18: "Alt",
      19: "Pause", 20: "CapsLock", 27: "Esc", 32: "Space", 33: "PageUp", 34: "PageDown", 35: "End",
      36: "Home", 37: "Left", 38: "Up", 39: "Right", 40: "Down", 44: "PrintScrn", 45: "Insert",
      46: "Delete", 59: ";", 61: "=", 91: "Mod", 92: "Mod", 93: "Mod",
      106: "*", 107: "=", 109: "-", 110: ".", 111: "/", 145: "ScrollLock",
      173: "-", 186: ";", 187: "=", 188: ",", 189: "-", 190: ".", 191: "/", 192: "`", 219: "[", 220: "\\",
      221: "]", 222: "'", 224: "Mod", 63232: "Up", 63233: "Down", 63234: "Left", 63235: "Right", 63272: "Delete",
      63273: "Home", 63275: "End", 63276: "PageUp", 63277: "PageDown", 63302: "Insert"
    };

    // Number keys
    for (var i = 0; i < 10; i++) { keyNames[i + 48] = keyNames[i + 96] = String(i); }
    // Alphabetic keys
    for (var i$1 = 65; i$1 <= 90; i$1++) { keyNames[i$1] = String.fromCharCode(i$1); }
    // Function keys
    for (var i$2 = 1; i$2 <= 12; i$2++) { keyNames[i$2 + 111] = keyNames[i$2 + 63235] = "F" + i$2; }

    var keyMap = {};

    keyMap.basic = {
      "Left": "goCharLeft", "Right": "goCharRight", "Up": "goLineUp", "Down": "goLineDown",
      "End": "goLineEnd", "Home": "goLineStartSmart", "PageUp": "goPageUp", "PageDown": "goPageDown",
      "Delete": "delCharAfter", "Backspace": "delCharBefore", "Shift-Backspace": "delCharBefore",
      "Tab": "defaultTab", "Shift-Tab": "indentAuto",
      "Enter": "newlineAndIndent", "Insert": "toggleOverwrite",
      "Esc": "singleSelection"
    };
    // Note that the save and find-related commands aren't defined by
    // default. User code or addons can define them. Unknown commands
    // are simply ignored.
    keyMap.pcDefault = {
      "Ctrl-A": "selectAll", "Ctrl-D": "deleteLine", "Ctrl-Z": "undo", "Shift-Ctrl-Z": "redo", "Ctrl-Y": "redo",
      "Ctrl-Home": "goDocStart", "Ctrl-End": "goDocEnd", "Ctrl-Up": "goLineUp", "Ctrl-Down": "goLineDown",
      "Ctrl-Left": "goGroupLeft", "Ctrl-Right": "goGroupRight", "Alt-Left": "goLineStart", "Alt-Right": "goLineEnd",
      "Ctrl-Backspace": "delGroupBefore", "Ctrl-Delete": "delGroupAfter", "Ctrl-S": "save", "Ctrl-F": "find",
      "Ctrl-G": "findNext", "Shift-Ctrl-G": "findPrev", "Shift-Ctrl-F": "replace", "Shift-Ctrl-R": "replaceAll",
      "Ctrl-[": "indentLess", "Ctrl-]": "indentMore",
      "Ctrl-U": "undoSelection", "Shift-Ctrl-U": "redoSelection", "Alt-U": "redoSelection",
      "fallthrough": "basic"
    };
    // Very basic readline/emacs-style bindings, which are standard on Mac.
    keyMap.emacsy = {
      "Ctrl-F": "goCharRight", "Ctrl-B": "goCharLeft", "Ctrl-P": "goLineUp", "Ctrl-N": "goLineDown",
      "Alt-F": "goWordRight", "Alt-B": "goWordLeft", "Ctrl-A": "goLineStart", "Ctrl-E": "goLineEnd",
      "Ctrl-V": "goPageDown", "Shift-Ctrl-V": "goPageUp", "Ctrl-D": "delCharAfter", "Ctrl-H": "delCharBefore",
      "Alt-D": "delWordAfter", "Alt-Backspace": "delWordBefore", "Ctrl-K": "killLine", "Ctrl-T": "transposeChars",
      "Ctrl-O": "openLine"
    };
    keyMap.macDefault = {
      "Cmd-A": "selectAll", "Cmd-D": "deleteLine", "Cmd-Z": "undo", "Shift-Cmd-Z": "redo", "Cmd-Y": "redo",
      "Cmd-Home": "goDocStart", "Cmd-Up": "goDocStart", "Cmd-End": "goDocEnd", "Cmd-Down": "goDocEnd", "Alt-Left": "goGroupLeft",
      "Alt-Right": "goGroupRight", "Cmd-Left": "goLineLeft", "Cmd-Right": "goLineRight", "Alt-Backspace": "delGroupBefore",
      "Ctrl-Alt-Backspace": "delGroupAfter", "Alt-Delete": "delGroupAfter", "Cmd-S": "save", "Cmd-F": "find",
      "Cmd-G": "findNext", "Shift-Cmd-G": "findPrev", "Cmd-Alt-F": "replace", "Shift-Cmd-Alt-F": "replaceAll",
      "Cmd-[": "indentLess", "Cmd-]": "indentMore", "Cmd-Backspace": "delWrappedLineLeft", "Cmd-Delete": "delWrappedLineRight",
      "Cmd-U": "undoSelection", "Shift-Cmd-U": "redoSelection", "Ctrl-Up": "goDocStart", "Ctrl-Down": "goDocEnd",
      "fallthrough": ["basic", "emacsy"]
    };
    keyMap["default"] = mac ? keyMap.macDefault : keyMap.pcDefault;

    // KEYMAP DISPATCH

    function normalizeKeyName(name) {
      var parts = name.split(/-(?!$)/);
      name = parts[parts.length - 1];
      var alt, ctrl, shift, cmd;
      for (var i = 0; i < parts.length - 1; i++) {
        var mod = parts[i];
        if (/^(cmd|meta|m)$/i.test(mod)) { cmd = true; }
        else if (/^a(lt)?$/i.test(mod)) { alt = true; }
        else if (/^(c|ctrl|control)$/i.test(mod)) { ctrl = true; }
        else if (/^s(hift)?$/i.test(mod)) { shift = true; }
        else { throw new Error("Unrecognized modifier name: " + mod) }
      }
      if (alt) { name = "Alt-" + name; }
      if (ctrl) { name = "Ctrl-" + name; }
      if (cmd) { name = "Cmd-" + name; }
      if (shift) { name = "Shift-" + name; }
      return name
    }

    // This is a kludge to keep keymaps mostly working as raw objects
    // (backwards compatibility) while at the same time support features
    // like normalization and multi-stroke key bindings. It compiles a
    // new normalized keymap, and then updates the old object to reflect
    // this.
    function normalizeKeyMap(keymap) {
      var copy = {};
      for (var keyname in keymap) { if (keymap.hasOwnProperty(keyname)) {
        var value = keymap[keyname];
        if (/^(name|fallthrough|(de|at)tach)$/.test(keyname)) { continue }
        if (value == "...") { delete keymap[keyname]; continue }

        var keys = map(keyname.split(" "), normalizeKeyName);
        for (var i = 0; i < keys.length; i++) {
          var val = (void 0), name = (void 0);
          if (i == keys.length - 1) {
            name = keys.join(" ");
            val = value;
          } else {
            name = keys.slice(0, i + 1).join(" ");
            val = "...";
          }
          var prev = copy[name];
          if (!prev) { copy[name] = val; }
          else if (prev != val) { throw new Error("Inconsistent bindings for " + name) }
        }
        delete keymap[keyname];
      } }
      for (var prop in copy) { keymap[prop] = copy[prop]; }
      return keymap
    }

    function lookupKey(key, map, handle, context) {
      map = getKeyMap(map);
      var found = map.call ? map.call(key, context) : map[key];
      if (found === false) { return "nothing" }
      if (found === "...") { return "multi" }
      if (found != null && handle(found)) { return "handled" }

      if (map.fallthrough) {
        if (Object.prototype.toString.call(map.fallthrough) != "[object Array]")
          { return lookupKey(key, map.fallthrough, handle, context) }
        for (var i = 0; i < map.fallthrough.length; i++) {
          var result = lookupKey(key, map.fallthrough[i], handle, context);
          if (result) { return result }
        }
      }
    }

    // Modifier key presses don't count as 'real' key presses for the
    // purpose of keymap fallthrough.
    function isModifierKey(value) {
      var name = typeof value == "string" ? value : keyNames[value.keyCode];
      return name == "Ctrl" || name == "Alt" || name == "Shift" || name == "Mod"
    }

    function addModifierNames(name, event, noShift) {
      var base = name;
      if (event.altKey && base != "Alt") { name = "Alt-" + name; }
      if ((flipCtrlCmd ? event.metaKey : event.ctrlKey) && base != "Ctrl") { name = "Ctrl-" + name; }
      if ((flipCtrlCmd ? event.ctrlKey : event.metaKey) && base != "Mod") { name = "Cmd-" + name; }
      if (!noShift && event.shiftKey && base != "Shift") { name = "Shift-" + name; }
      return name
    }

    // Look up the name of a key as indicated by an event object.
    function keyName(event, noShift) {
      if (presto && event.keyCode == 34 && event["char"]) { return false }
      var name = keyNames[event.keyCode];
      if (name == null || event.altGraphKey) { return false }
      // Ctrl-ScrollLock has keyCode 3, same as Ctrl-Pause,
      // so we'll use event.code when available (Chrome 48+, FF 38+, Safari 10.1+)
      if (event.keyCode == 3 && event.code) { name = event.code; }
      return addModifierNames(name, event, noShift)
    }

    function getKeyMap(val) {
      return typeof val == "string" ? keyMap[val] : val
    }

    // Helper for deleting text near the selection(s), used to implement
    // backspace, delete, and similar functionality.
    function deleteNearSelection(cm, compute) {
      var ranges = cm.doc.sel.ranges, kill = [];
      // Build up a set of ranges to kill first, merging overlapping
      // ranges.
      for (var i = 0; i < ranges.length; i++) {
        var toKill = compute(ranges[i]);
        while (kill.length && cmp(toKill.from, lst(kill).to) <= 0) {
          var replaced = kill.pop();
          if (cmp(replaced.from, toKill.from) < 0) {
            toKill.from = replaced.from;
            break
          }
        }
        kill.push(toKill);
      }
      // Next, remove those actual ranges.
      runInOp(cm, function () {
        for (var i = kill.length - 1; i >= 0; i--)
          { replaceRange(cm.doc, "", kill[i].from, kill[i].to, "+delete"); }
        ensureCursorVisible(cm);
      });
    }

    function moveCharLogically(line, ch, dir) {
      var target = skipExtendingChars(line.text, ch + dir, dir);
      return target < 0 || target > line.text.length ? null : target
    }

    function moveLogically(line, start, dir) {
      var ch = moveCharLogically(line, start.ch, dir);
      return ch == null ? null : new Pos(start.line, ch, dir < 0 ? "after" : "before")
    }

    function endOfLine(visually, cm, lineObj, lineNo, dir) {
      if (visually) {
        if (cm.doc.direction == "rtl") { dir = -dir; }
        var order = getOrder(lineObj, cm.doc.direction);
        if (order) {
          var part = dir < 0 ? lst(order) : order[0];
          var moveInStorageOrder = (dir < 0) == (part.level == 1);
          var sticky = moveInStorageOrder ? "after" : "before";
          var ch;
          // With a wrapped rtl chunk (possibly spanning multiple bidi parts),
          // it could be that the last bidi part is not on the last visual line,
          // since visual lines contain content order-consecutive chunks.
          // Thus, in rtl, we are looking for the first (content-order) character
          // in the rtl chunk that is on the last line (that is, the same line
          // as the last (content-order) character).
          if (part.level > 0 || cm.doc.direction == "rtl") {
            var prep = prepareMeasureForLine(cm, lineObj);
            ch = dir < 0 ? lineObj.text.length - 1 : 0;
            var targetTop = measureCharPrepared(cm, prep, ch).top;
            ch = findFirst(function (ch) { return measureCharPrepared(cm, prep, ch).top == targetTop; }, (dir < 0) == (part.level == 1) ? part.from : part.to - 1, ch);
            if (sticky == "before") { ch = moveCharLogically(lineObj, ch, 1); }
          } else { ch = dir < 0 ? part.to : part.from; }
          return new Pos(lineNo, ch, sticky)
        }
      }
      return new Pos(lineNo, dir < 0 ? lineObj.text.length : 0, dir < 0 ? "before" : "after")
    }

    function moveVisually(cm, line, start, dir) {
      var bidi = getOrder(line, cm.doc.direction);
      if (!bidi) { return moveLogically(line, start, dir) }
      if (start.ch >= line.text.length) {
        start.ch = line.text.length;
        start.sticky = "before";
      } else if (start.ch <= 0) {
        start.ch = 0;
        start.sticky = "after";
      }
      var partPos = getBidiPartAt(bidi, start.ch, start.sticky), part = bidi[partPos];
      if (cm.doc.direction == "ltr" && part.level % 2 == 0 && (dir > 0 ? part.to > start.ch : part.from < start.ch)) {
        // Case 1: We move within an ltr part in an ltr editor. Even with wrapped lines,
        // nothing interesting happens.
        return moveLogically(line, start, dir)
      }

      var mv = function (pos, dir) { return moveCharLogically(line, pos instanceof Pos ? pos.ch : pos, dir); };
      var prep;
      var getWrappedLineExtent = function (ch) {
        if (!cm.options.lineWrapping) { return {begin: 0, end: line.text.length} }
        prep = prep || prepareMeasureForLine(cm, line);
        return wrappedLineExtentChar(cm, line, prep, ch)
      };
      var wrappedLineExtent = getWrappedLineExtent(start.sticky == "before" ? mv(start, -1) : start.ch);

      if (cm.doc.direction == "rtl" || part.level == 1) {
        var moveInStorageOrder = (part.level == 1) == (dir < 0);
        var ch = mv(start, moveInStorageOrder ? 1 : -1);
        if (ch != null && (!moveInStorageOrder ? ch >= part.from && ch >= wrappedLineExtent.begin : ch <= part.to && ch <= wrappedLineExtent.end)) {
          // Case 2: We move within an rtl part or in an rtl editor on the same visual line
          var sticky = moveInStorageOrder ? "before" : "after";
          return new Pos(start.line, ch, sticky)
        }
      }

      // Case 3: Could not move within this bidi part in this visual line, so leave
      // the current bidi part

      var searchInVisualLine = function (partPos, dir, wrappedLineExtent) {
        var getRes = function (ch, moveInStorageOrder) { return moveInStorageOrder
          ? new Pos(start.line, mv(ch, 1), "before")
          : new Pos(start.line, ch, "after"); };

        for (; partPos >= 0 && partPos < bidi.length; partPos += dir) {
          var part = bidi[partPos];
          var moveInStorageOrder = (dir > 0) == (part.level != 1);
          var ch = moveInStorageOrder ? wrappedLineExtent.begin : mv(wrappedLineExtent.end, -1);
          if (part.from <= ch && ch < part.to) { return getRes(ch, moveInStorageOrder) }
          ch = moveInStorageOrder ? part.from : mv(part.to, -1);
          if (wrappedLineExtent.begin <= ch && ch < wrappedLineExtent.end) { return getRes(ch, moveInStorageOrder) }
        }
      };

      // Case 3a: Look for other bidi parts on the same visual line
      var res = searchInVisualLine(partPos + dir, dir, wrappedLineExtent);
      if (res) { return res }

      // Case 3b: Look for other bidi parts on the next visual line
      var nextCh = dir > 0 ? wrappedLineExtent.end : mv(wrappedLineExtent.begin, -1);
      if (nextCh != null && !(dir > 0 && nextCh == line.text.length)) {
        res = searchInVisualLine(dir > 0 ? 0 : bidi.length - 1, dir, getWrappedLineExtent(nextCh));
        if (res) { return res }
      }

      // Case 4: Nowhere to move
      return null
    }

    // Commands are parameter-less actions that can be performed on an
    // editor, mostly used for keybindings.
    var commands = {
      selectAll: selectAll,
      singleSelection: function (cm) { return cm.setSelection(cm.getCursor("anchor"), cm.getCursor("head"), sel_dontScroll); },
      killLine: function (cm) { return deleteNearSelection(cm, function (range) {
        if (range.empty()) {
          var len = getLine(cm.doc, range.head.line).text.length;
          if (range.head.ch == len && range.head.line < cm.lastLine())
            { return {from: range.head, to: Pos(range.head.line + 1, 0)} }
          else
            { return {from: range.head, to: Pos(range.head.line, len)} }
        } else {
          return {from: range.from(), to: range.to()}
        }
      }); },
      deleteLine: function (cm) { return deleteNearSelection(cm, function (range) { return ({
        from: Pos(range.from().line, 0),
        to: clipPos(cm.doc, Pos(range.to().line + 1, 0))
      }); }); },
      delLineLeft: function (cm) { return deleteNearSelection(cm, function (range) { return ({
        from: Pos(range.from().line, 0), to: range.from()
      }); }); },
      delWrappedLineLeft: function (cm) { return deleteNearSelection(cm, function (range) {
        var top = cm.charCoords(range.head, "div").top + 5;
        var leftPos = cm.coordsChar({left: 0, top: top}, "div");
        return {from: leftPos, to: range.from()}
      }); },
      delWrappedLineRight: function (cm) { return deleteNearSelection(cm, function (range) {
        var top = cm.charCoords(range.head, "div").top + 5;
        var rightPos = cm.coordsChar({left: cm.display.lineDiv.offsetWidth + 100, top: top}, "div");
        return {from: range.from(), to: rightPos }
      }); },
      undo: function (cm) { return cm.undo(); },
      redo: function (cm) { return cm.redo(); },
      undoSelection: function (cm) { return cm.undoSelection(); },
      redoSelection: function (cm) { return cm.redoSelection(); },
      goDocStart: function (cm) { return cm.extendSelection(Pos(cm.firstLine(), 0)); },
      goDocEnd: function (cm) { return cm.extendSelection(Pos(cm.lastLine())); },
      goLineStart: function (cm) { return cm.extendSelectionsBy(function (range) { return lineStart(cm, range.head.line); },
        {origin: "+move", bias: 1}
      ); },
      goLineStartSmart: function (cm) { return cm.extendSelectionsBy(function (range) { return lineStartSmart(cm, range.head); },
        {origin: "+move", bias: 1}
      ); },
      goLineEnd: function (cm) { return cm.extendSelectionsBy(function (range) { return lineEnd(cm, range.head.line); },
        {origin: "+move", bias: -1}
      ); },
      goLineRight: function (cm) { return cm.extendSelectionsBy(function (range) {
        var top = cm.cursorCoords(range.head, "div").top + 5;
        return cm.coordsChar({left: cm.display.lineDiv.offsetWidth + 100, top: top}, "div")
      }, sel_move); },
      goLineLeft: function (cm) { return cm.extendSelectionsBy(function (range) {
        var top = cm.cursorCoords(range.head, "div").top + 5;
        return cm.coordsChar({left: 0, top: top}, "div")
      }, sel_move); },
      goLineLeftSmart: function (cm) { return cm.extendSelectionsBy(function (range) {
        var top = cm.cursorCoords(range.head, "div").top + 5;
        var pos = cm.coordsChar({left: 0, top: top}, "div");
        if (pos.ch < cm.getLine(pos.line).search(/\S/)) { return lineStartSmart(cm, range.head) }
        return pos
      }, sel_move); },
      goLineUp: function (cm) { return cm.moveV(-1, "line"); },
      goLineDown: function (cm) { return cm.moveV(1, "line"); },
      goPageUp: function (cm) { return cm.moveV(-1, "page"); },
      goPageDown: function (cm) { return cm.moveV(1, "page"); },
      goCharLeft: function (cm) { return cm.moveH(-1, "char"); },
      goCharRight: function (cm) { return cm.moveH(1, "char"); },
      goColumnLeft: function (cm) { return cm.moveH(-1, "column"); },
      goColumnRight: function (cm) { return cm.moveH(1, "column"); },
      goWordLeft: function (cm) { return cm.moveH(-1, "word"); },
      goGroupRight: function (cm) { return cm.moveH(1, "group"); },
      goGroupLeft: function (cm) { return cm.moveH(-1, "group"); },
      goWordRight: function (cm) { return cm.moveH(1, "word"); },
      delCharBefore: function (cm) { return cm.deleteH(-1, "codepoint"); },
      delCharAfter: function (cm) { return cm.deleteH(1, "char"); },
      delWordBefore: function (cm) { return cm.deleteH(-1, "word"); },
      delWordAfter: function (cm) { return cm.deleteH(1, "word"); },
      delGroupBefore: function (cm) { return cm.deleteH(-1, "group"); },
      delGroupAfter: function (cm) { return cm.deleteH(1, "group"); },
      indentAuto: function (cm) { return cm.indentSelection("smart"); },
      indentMore: function (cm) { return cm.indentSelection("add"); },
      indentLess: function (cm) { return cm.indentSelection("subtract"); },
      insertTab: function (cm) { return cm.replaceSelection("\t"); },
      insertSoftTab: function (cm) {
        var spaces = [], ranges = cm.listSelections(), tabSize = cm.options.tabSize;
        for (var i = 0; i < ranges.length; i++) {
          var pos = ranges[i].from();
          var col = countColumn(cm.getLine(pos.line), pos.ch, tabSize);
          spaces.push(spaceStr(tabSize - col % tabSize));
        }
        cm.replaceSelections(spaces);
      },
      defaultTab: function (cm) {
        if (cm.somethingSelected()) { cm.indentSelection("add"); }
        else { cm.execCommand("insertTab"); }
      },
      // Swap the two chars left and right of each selection's head.
      // Move cursor behind the two swapped characters afterwards.
      //
      // Doesn't consider line feeds a character.
      // Doesn't scan more than one line above to find a character.
      // Doesn't do anything on an empty line.
      // Doesn't do anything with non-empty selections.
      transposeChars: function (cm) { return runInOp(cm, function () {
        var ranges = cm.listSelections(), newSel = [];
        for (var i = 0; i < ranges.length; i++) {
          if (!ranges[i].empty()) { continue }
          var cur = ranges[i].head, line = getLine(cm.doc, cur.line).text;
          if (line) {
            if (cur.ch == line.length) { cur = new Pos(cur.line, cur.ch - 1); }
            if (cur.ch > 0) {
              cur = new Pos(cur.line, cur.ch + 1);
              cm.replaceRange(line.charAt(cur.ch - 1) + line.charAt(cur.ch - 2),
                              Pos(cur.line, cur.ch - 2), cur, "+transpose");
            } else if (cur.line > cm.doc.first) {
              var prev = getLine(cm.doc, cur.line - 1).text;
              if (prev) {
                cur = new Pos(cur.line, 1);
                cm.replaceRange(line.charAt(0) + cm.doc.lineSeparator() +
                                prev.charAt(prev.length - 1),
                                Pos(cur.line - 1, prev.length - 1), cur, "+transpose");
              }
            }
          }
          newSel.push(new Range(cur, cur));
        }
        cm.setSelections(newSel);
      }); },
      newlineAndIndent: function (cm) { return runInOp(cm, function () {
        var sels = cm.listSelections();
        for (var i = sels.length - 1; i >= 0; i--)
          { cm.replaceRange(cm.doc.lineSeparator(), sels[i].anchor, sels[i].head, "+input"); }
        sels = cm.listSelections();
        for (var i$1 = 0; i$1 < sels.length; i$1++)
          { cm.indentLine(sels[i$1].from().line, null, true); }
        ensureCursorVisible(cm);
      }); },
      openLine: function (cm) { return cm.replaceSelection("\n", "start"); },
      toggleOverwrite: function (cm) { return cm.toggleOverwrite(); }
    };


    function lineStart(cm, lineN) {
      var line = getLine(cm.doc, lineN);
      var visual = visualLine(line);
      if (visual != line) { lineN = lineNo(visual); }
      return endOfLine(true, cm, visual, lineN, 1)
    }
    function lineEnd(cm, lineN) {
      var line = getLine(cm.doc, lineN);
      var visual = visualLineEnd(line);
      if (visual != line) { lineN = lineNo(visual); }
      return endOfLine(true, cm, line, lineN, -1)
    }
    function lineStartSmart(cm, pos) {
      var start = lineStart(cm, pos.line);
      var line = getLine(cm.doc, start.line);
      var order = getOrder(line, cm.doc.direction);
      if (!order || order[0].level == 0) {
        var firstNonWS = Math.max(start.ch, line.text.search(/\S/));
        var inWS = pos.line == start.line && pos.ch <= firstNonWS && pos.ch;
        return Pos(start.line, inWS ? 0 : firstNonWS, start.sticky)
      }
      return start
    }

    // Run a handler that was bound to a key.
    function doHandleBinding(cm, bound, dropShift) {
      if (typeof bound == "string") {
        bound = commands[bound];
        if (!bound) { return false }
      }
      // Ensure previous input has been read, so that the handler sees a
      // consistent view of the document
      cm.display.input.ensurePolled();
      var prevShift = cm.display.shift, done = false;
      try {
        if (cm.isReadOnly()) { cm.state.suppressEdits = true; }
        if (dropShift) { cm.display.shift = false; }
        done = bound(cm) != Pass;
      } finally {
        cm.display.shift = prevShift;
        cm.state.suppressEdits = false;
      }
      return done
    }

    function lookupKeyForEditor(cm, name, handle) {
      for (var i = 0; i < cm.state.keyMaps.length; i++) {
        var result = lookupKey(name, cm.state.keyMaps[i], handle, cm);
        if (result) { return result }
      }
      return (cm.options.extraKeys && lookupKey(name, cm.options.extraKeys, handle, cm))
        || lookupKey(name, cm.options.keyMap, handle, cm)
    }

    // Note that, despite the name, this function is also used to check
    // for bound mouse clicks.

    var stopSeq = new Delayed;

    function dispatchKey(cm, name, e, handle) {
      var seq = cm.state.keySeq;
      if (seq) {
        if (isModifierKey(name)) { return "handled" }
        if (/\'$/.test(name))
          { cm.state.keySeq = null; }
        else
          { stopSeq.set(50, function () {
            if (cm.state.keySeq == seq) {
              cm.state.keySeq = null;
              cm.display.input.reset();
            }
          }); }
        if (dispatchKeyInner(cm, seq + " " + name, e, handle)) { return true }
      }
      return dispatchKeyInner(cm, name, e, handle)
    }

    function dispatchKeyInner(cm, name, e, handle) {
      var result = lookupKeyForEditor(cm, name, handle);

      if (result == "multi")
        { cm.state.keySeq = name; }
      if (result == "handled")
        { signalLater(cm, "keyHandled", cm, name, e); }

      if (result == "handled" || result == "multi") {
        e_preventDefault(e);
        restartBlink(cm);
      }

      return !!result
    }

    // Handle a key from the keydown event.
    function handleKeyBinding(cm, e) {
      var name = keyName(e, true);
      if (!name) { return false }

      if (e.shiftKey && !cm.state.keySeq) {
        // First try to resolve full name (including 'Shift-'). Failing
        // that, see if there is a cursor-motion command (starting with
        // 'go') bound to the keyname without 'Shift-'.
        return dispatchKey(cm, "Shift-" + name, e, function (b) { return doHandleBinding(cm, b, true); })
            || dispatchKey(cm, name, e, function (b) {
                 if (typeof b == "string" ? /^go[A-Z]/.test(b) : b.motion)
                   { return doHandleBinding(cm, b) }
               })
      } else {
        return dispatchKey(cm, name, e, function (b) { return doHandleBinding(cm, b); })
      }
    }

    // Handle a key from the keypress event
    function handleCharBinding(cm, e, ch) {
      return dispatchKey(cm, "'" + ch + "'", e, function (b) { return doHandleBinding(cm, b, true); })
    }

    var lastStoppedKey = null;
    function onKeyDown(e) {
      var cm = this;
      if (e.target && e.target != cm.display.input.getField()) { return }
      cm.curOp.focus = activeElt();
      if (signalDOMEvent(cm, e)) { return }
      // IE does strange things with escape.
      if (ie && ie_version < 11 && e.keyCode == 27) { e.returnValue = false; }
      var code = e.keyCode;
      cm.display.shift = code == 16 || e.shiftKey;
      var handled = handleKeyBinding(cm, e);
      if (presto) {
        lastStoppedKey = handled ? code : null;
        // Opera has no cut event... we try to at least catch the key combo
        if (!handled && code == 88 && !hasCopyEvent && (mac ? e.metaKey : e.ctrlKey))
          { cm.replaceSelection("", null, "cut"); }
      }
      if (gecko && !mac && !handled && code == 46 && e.shiftKey && !e.ctrlKey && document.execCommand)
        { document.execCommand("cut"); }

      // Turn mouse into crosshair when Alt is held on Mac.
      if (code == 18 && !/\bCodeMirror-crosshair\b/.test(cm.display.lineDiv.className))
        { showCrossHair(cm); }
    }

    function showCrossHair(cm) {
      var lineDiv = cm.display.lineDiv;
      addClass(lineDiv, "CodeMirror-crosshair");

      function up(e) {
        if (e.keyCode == 18 || !e.altKey) {
          rmClass(lineDiv, "CodeMirror-crosshair");
          off(document, "keyup", up);
          off(document, "mouseover", up);
        }
      }
      on(document, "keyup", up);
      on(document, "mouseover", up);
    }

    function onKeyUp(e) {
      if (e.keyCode == 16) { this.doc.sel.shift = false; }
      signalDOMEvent(this, e);
    }

    function onKeyPress(e) {
      var cm = this;
      if (e.target && e.target != cm.display.input.getField()) { return }
      if (eventInWidget(cm.display, e) || signalDOMEvent(cm, e) || e.ctrlKey && !e.altKey || mac && e.metaKey) { return }
      var keyCode = e.keyCode, charCode = e.charCode;
      if (presto && keyCode == lastStoppedKey) {lastStoppedKey = null; e_preventDefault(e); return}
      if ((presto && (!e.which || e.which < 10)) && handleKeyBinding(cm, e)) { return }
      var ch = String.fromCharCode(charCode == null ? keyCode : charCode);
      // Some browsers fire keypress events for backspace
      if (ch == "\x08") { return }
      if (handleCharBinding(cm, e, ch)) { return }
      cm.display.input.onKeyPress(e);
    }

    var DOUBLECLICK_DELAY = 400;

    var PastClick = function(time, pos, button) {
      this.time = time;
      this.pos = pos;
      this.button = button;
    };

    PastClick.prototype.compare = function (time, pos, button) {
      return this.time + DOUBLECLICK_DELAY > time &&
        cmp(pos, this.pos) == 0 && button == this.button
    };

    var lastClick, lastDoubleClick;
    function clickRepeat(pos, button) {
      var now = +new Date;
      if (lastDoubleClick && lastDoubleClick.compare(now, pos, button)) {
        lastClick = lastDoubleClick = null;
        return "triple"
      } else if (lastClick && lastClick.compare(now, pos, button)) {
        lastDoubleClick = new PastClick(now, pos, button);
        lastClick = null;
        return "double"
      } else {
        lastClick = new PastClick(now, pos, button);
        lastDoubleClick = null;
        return "single"
      }
    }

    // A mouse down can be a single click, double click, triple click,
    // start of selection drag, start of text drag, new cursor
    // (ctrl-click), rectangle drag (alt-drag), or xwin
    // middle-click-paste. Or it might be a click on something we should
    // not interfere with, such as a scrollbar or widget.
    function onMouseDown(e) {
      var cm = this, display = cm.display;
      if (signalDOMEvent(cm, e) || display.activeTouch && display.input.supportsTouch()) { return }
      display.input.ensurePolled();
      display.shift = e.shiftKey;

      if (eventInWidget(display, e)) {
        if (!webkit) {
          // Briefly turn off draggability, to allow widgets to do
          // normal dragging things.
          display.scroller.draggable = false;
          setTimeout(function () { return display.scroller.draggable = true; }, 100);
        }
        return
      }
      if (clickInGutter(cm, e)) { return }
      var pos = posFromMouse(cm, e), button = e_button(e), repeat = pos ? clickRepeat(pos, button) : "single";
      window.focus();

      // #3261: make sure, that we're not starting a second selection
      if (button == 1 && cm.state.selectingText)
        { cm.state.selectingText(e); }

      if (pos && handleMappedButton(cm, button, pos, repeat, e)) { return }

      if (button == 1) {
        if (pos) { leftButtonDown(cm, pos, repeat, e); }
        else if (e_target(e) == display.scroller) { e_preventDefault(e); }
      } else if (button == 2) {
        if (pos) { extendSelection(cm.doc, pos); }
        setTimeout(function () { return display.input.focus(); }, 20);
      } else if (button == 3) {
        if (captureRightClick) { cm.display.input.onContextMenu(e); }
        else { delayBlurEvent(cm); }
      }
    }

    function handleMappedButton(cm, button, pos, repeat, event) {
      var name = "Click";
      if (repeat == "double") { name = "Double" + name; }
      else if (repeat == "triple") { name = "Triple" + name; }
      name = (button == 1 ? "Left" : button == 2 ? "Middle" : "Right") + name;

      return dispatchKey(cm,  addModifierNames(name, event), event, function (bound) {
        if (typeof bound == "string") { bound = commands[bound]; }
        if (!bound) { return false }
        var done = false;
        try {
          if (cm.isReadOnly()) { cm.state.suppressEdits = true; }
          done = bound(cm, pos) != Pass;
        } finally {
          cm.state.suppressEdits = false;
        }
        return done
      })
    }

    function configureMouse(cm, repeat, event) {
      var option = cm.getOption("configureMouse");
      var value = option ? option(cm, repeat, event) : {};
      if (value.unit == null) {
        var rect = chromeOS ? event.shiftKey && event.metaKey : event.altKey;
        value.unit = rect ? "rectangle" : repeat == "single" ? "char" : repeat == "double" ? "word" : "line";
      }
      if (value.extend == null || cm.doc.extend) { value.extend = cm.doc.extend || event.shiftKey; }
      if (value.addNew == null) { value.addNew = mac ? event.metaKey : event.ctrlKey; }
      if (value.moveOnDrag == null) { value.moveOnDrag = !(mac ? event.altKey : event.ctrlKey); }
      return value
    }

    function leftButtonDown(cm, pos, repeat, event) {
      if (ie) { setTimeout(bind(ensureFocus, cm), 0); }
      else { cm.curOp.focus = activeElt(); }

      var behavior = configureMouse(cm, repeat, event);

      var sel = cm.doc.sel, contained;
      if (cm.options.dragDrop && dragAndDrop && !cm.isReadOnly() &&
          repeat == "single" && (contained = sel.contains(pos)) > -1 &&
          (cmp((contained = sel.ranges[contained]).from(), pos) < 0 || pos.xRel > 0) &&
          (cmp(contained.to(), pos) > 0 || pos.xRel < 0))
        { leftButtonStartDrag(cm, event, pos, behavior); }
      else
        { leftButtonSelect(cm, event, pos, behavior); }
    }

    // Start a text drag. When it ends, see if any dragging actually
    // happen, and treat as a click if it didn't.
    function leftButtonStartDrag(cm, event, pos, behavior) {
      var display = cm.display, moved = false;
      var dragEnd = operation(cm, function (e) {
        if (webkit) { display.scroller.draggable = false; }
        cm.state.draggingText = false;
        if (cm.state.delayingBlurEvent) {
          if (cm.hasFocus()) { cm.state.delayingBlurEvent = false; }
          else { delayBlurEvent(cm); }
        }
        off(display.wrapper.ownerDocument, "mouseup", dragEnd);
        off(display.wrapper.ownerDocument, "mousemove", mouseMove);
        off(display.scroller, "dragstart", dragStart);
        off(display.scroller, "drop", dragEnd);
        if (!moved) {
          e_preventDefault(e);
          if (!behavior.addNew)
            { extendSelection(cm.doc, pos, null, null, behavior.extend); }
          // Work around unexplainable focus problem in IE9 (#2127) and Chrome (#3081)
          if ((webkit && !safari) || ie && ie_version == 9)
            { setTimeout(function () {display.wrapper.ownerDocument.body.focus({preventScroll: true}); display.input.focus();}, 20); }
          else
            { display.input.focus(); }
        }
      });
      var mouseMove = function(e2) {
        moved = moved || Math.abs(event.clientX - e2.clientX) + Math.abs(event.clientY - e2.clientY) >= 10;
      };
      var dragStart = function () { return moved = true; };
      // Let the drag handler handle this.
      if (webkit) { display.scroller.draggable = true; }
      cm.state.draggingText = dragEnd;
      dragEnd.copy = !behavior.moveOnDrag;
      on(display.wrapper.ownerDocument, "mouseup", dragEnd);
      on(display.wrapper.ownerDocument, "mousemove", mouseMove);
      on(display.scroller, "dragstart", dragStart);
      on(display.scroller, "drop", dragEnd);

      cm.state.delayingBlurEvent = true;
      setTimeout(function () { return display.input.focus(); }, 20);
      // IE's approach to draggable
      if (display.scroller.dragDrop) { display.scroller.dragDrop(); }
    }

    function rangeForUnit(cm, pos, unit) {
      if (unit == "char") { return new Range(pos, pos) }
      if (unit == "word") { return cm.findWordAt(pos) }
      if (unit == "line") { return new Range(Pos(pos.line, 0), clipPos(cm.doc, Pos(pos.line + 1, 0))) }
      var result = unit(cm, pos);
      return new Range(result.from, result.to)
    }

    // Normal selection, as opposed to text dragging.
    function leftButtonSelect(cm, event, start, behavior) {
      if (ie) { delayBlurEvent(cm); }
      var display = cm.display, doc = cm.doc;
      e_preventDefault(event);

      var ourRange, ourIndex, startSel = doc.sel, ranges = startSel.ranges;
      if (behavior.addNew && !behavior.extend) {
        ourIndex = doc.sel.contains(start);
        if (ourIndex > -1)
          { ourRange = ranges[ourIndex]; }
        else
          { ourRange = new Range(start, start); }
      } else {
        ourRange = doc.sel.primary();
        ourIndex = doc.sel.primIndex;
      }

      if (behavior.unit == "rectangle") {
        if (!behavior.addNew) { ourRange = new Range(start, start); }
        start = posFromMouse(cm, event, true, true);
        ourIndex = -1;
      } else {
        var range = rangeForUnit(cm, start, behavior.unit);
        if (behavior.extend)
          { ourRange = extendRange(ourRange, range.anchor, range.head, behavior.extend); }
        else
          { ourRange = range; }
      }

      if (!behavior.addNew) {
        ourIndex = 0;
        setSelection(doc, new Selection([ourRange], 0), sel_mouse);
        startSel = doc.sel;
      } else if (ourIndex == -1) {
        ourIndex = ranges.length;
        setSelection(doc, normalizeSelection(cm, ranges.concat([ourRange]), ourIndex),
                     {scroll: false, origin: "*mouse"});
      } else if (ranges.length > 1 && ranges[ourIndex].empty() && behavior.unit == "char" && !behavior.extend) {
        setSelection(doc, normalizeSelection(cm, ranges.slice(0, ourIndex).concat(ranges.slice(ourIndex + 1)), 0),
                     {scroll: false, origin: "*mouse"});
        startSel = doc.sel;
      } else {
        replaceOneSelection(doc, ourIndex, ourRange, sel_mouse);
      }

      var lastPos = start;
      function extendTo(pos) {
        if (cmp(lastPos, pos) == 0) { return }
        lastPos = pos;

        if (behavior.unit == "rectangle") {
          var ranges = [], tabSize = cm.options.tabSize;
          var startCol = countColumn(getLine(doc, start.line).text, start.ch, tabSize);
          var posCol = countColumn(getLine(doc, pos.line).text, pos.ch, tabSize);
          var left = Math.min(startCol, posCol), right = Math.max(startCol, posCol);
          for (var line = Math.min(start.line, pos.line), end = Math.min(cm.lastLine(), Math.max(start.line, pos.line));
               line <= end; line++) {
            var text = getLine(doc, line).text, leftPos = findColumn(text, left, tabSize);
            if (left == right)
              { ranges.push(new Range(Pos(line, leftPos), Pos(line, leftPos))); }
            else if (text.length > leftPos)
              { ranges.push(new Range(Pos(line, leftPos), Pos(line, findColumn(text, right, tabSize)))); }
          }
          if (!ranges.length) { ranges.push(new Range(start, start)); }
          setSelection(doc, normalizeSelection(cm, startSel.ranges.slice(0, ourIndex).concat(ranges), ourIndex),
                       {origin: "*mouse", scroll: false});
          cm.scrollIntoView(pos);
        } else {
          var oldRange = ourRange;
          var range = rangeForUnit(cm, pos, behavior.unit);
          var anchor = oldRange.anchor, head;
          if (cmp(range.anchor, anchor) > 0) {
            head = range.head;
            anchor = minPos(oldRange.from(), range.anchor);
          } else {
            head = range.anchor;
            anchor = maxPos(oldRange.to(), range.head);
          }
          var ranges$1 = startSel.ranges.slice(0);
          ranges$1[ourIndex] = bidiSimplify(cm, new Range(clipPos(doc, anchor), head));
          setSelection(doc, normalizeSelection(cm, ranges$1, ourIndex), sel_mouse);
        }
      }

      var editorSize = display.wrapper.getBoundingClientRect();
      // Used to ensure timeout re-tries don't fire when another extend
      // happened in the meantime (clearTimeout isn't reliable -- at
      // least on Chrome, the timeouts still happen even when cleared,
      // if the clear happens after their scheduled firing time).
      var counter = 0;

      function extend(e) {
        var curCount = ++counter;
        var cur = posFromMouse(cm, e, true, behavior.unit == "rectangle");
        if (!cur) { return }
        if (cmp(cur, lastPos) != 0) {
          cm.curOp.focus = activeElt();
          extendTo(cur);
          var visible = visibleLines(display, doc);
          if (cur.line >= visible.to || cur.line < visible.from)
            { setTimeout(operation(cm, function () {if (counter == curCount) { extend(e); }}), 150); }
        } else {
          var outside = e.clientY < editorSize.top ? -20 : e.clientY > editorSize.bottom ? 20 : 0;
          if (outside) { setTimeout(operation(cm, function () {
            if (counter != curCount) { return }
            display.scroller.scrollTop += outside;
            extend(e);
          }), 50); }
        }
      }

      function done(e) {
        cm.state.selectingText = false;
        counter = Infinity;
        // If e is null or undefined we interpret this as someone trying
        // to explicitly cancel the selection rather than the user
        // letting go of the mouse button.
        if (e) {
          e_preventDefault(e);
          display.input.focus();
        }
        off(display.wrapper.ownerDocument, "mousemove", move);
        off(display.wrapper.ownerDocument, "mouseup", up);
        doc.history.lastSelOrigin = null;
      }

      var move = operation(cm, function (e) {
        if (e.buttons === 0 || !e_button(e)) { done(e); }
        else { extend(e); }
      });
      var up = operation(cm, done);
      cm.state.selectingText = up;
      on(display.wrapper.ownerDocument, "mousemove", move);
      on(display.wrapper.ownerDocument, "mouseup", up);
    }

    // Used when mouse-selecting to adjust the anchor to the proper side
    // of a bidi jump depending on the visual position of the head.
    function bidiSimplify(cm, range) {
      var anchor = range.anchor;
      var head = range.head;
      var anchorLine = getLine(cm.doc, anchor.line);
      if (cmp(anchor, head) == 0 && anchor.sticky == head.sticky) { return range }
      var order = getOrder(anchorLine);
      if (!order) { return range }
      var index = getBidiPartAt(order, anchor.ch, anchor.sticky), part = order[index];
      if (part.from != anchor.ch && part.to != anchor.ch) { return range }
      var boundary = index + ((part.from == anchor.ch) == (part.level != 1) ? 0 : 1);
      if (boundary == 0 || boundary == order.length) { return range }

      // Compute the relative visual position of the head compared to the
      // anchor (<0 is to the left, >0 to the right)
      var leftSide;
      if (head.line != anchor.line) {
        leftSide = (head.line - anchor.line) * (cm.doc.direction == "ltr" ? 1 : -1) > 0;
      } else {
        var headIndex = getBidiPartAt(order, head.ch, head.sticky);
        var dir = headIndex - index || (head.ch - anchor.ch) * (part.level == 1 ? -1 : 1);
        if (headIndex == boundary - 1 || headIndex == boundary)
          { leftSide = dir < 0; }
        else
          { leftSide = dir > 0; }
      }

      var usePart = order[boundary + (leftSide ? -1 : 0)];
      var from = leftSide == (usePart.level == 1);
      var ch = from ? usePart.from : usePart.to, sticky = from ? "after" : "before";
      return anchor.ch == ch && anchor.sticky == sticky ? range : new Range(new Pos(anchor.line, ch, sticky), head)
    }


    // Determines whether an event happened in the gutter, and fires the
    // handlers for the corresponding event.
    function gutterEvent(cm, e, type, prevent) {
      var mX, mY;
      if (e.touches) {
        mX = e.touches[0].clientX;
        mY = e.touches[0].clientY;
      } else {
        try { mX = e.clientX; mY = e.clientY; }
        catch(e$1) { return false }
      }
      if (mX >= Math.floor(cm.display.gutters.getBoundingClientRect().right)) { return false }
      if (prevent) { e_preventDefault(e); }

      var display = cm.display;
      var lineBox = display.lineDiv.getBoundingClientRect();

      if (mY > lineBox.bottom || !hasHandler(cm, type)) { return e_defaultPrevented(e) }
      mY -= lineBox.top - display.viewOffset;

      for (var i = 0; i < cm.display.gutterSpecs.length; ++i) {
        var g = display.gutters.childNodes[i];
        if (g && g.getBoundingClientRect().right >= mX) {
          var line = lineAtHeight(cm.doc, mY);
          var gutter = cm.display.gutterSpecs[i];
          signal(cm, type, cm, line, gutter.className, e);
          return e_defaultPrevented(e)
        }
      }
    }

    function clickInGutter(cm, e) {
      return gutterEvent(cm, e, "gutterClick", true)
    }

    // CONTEXT MENU HANDLING

    // To make the context menu work, we need to briefly unhide the
    // textarea (making it as unobtrusive as possible) to let the
    // right-click take effect on it.
    function onContextMenu(cm, e) {
      if (eventInWidget(cm.display, e) || contextMenuInGutter(cm, e)) { return }
      if (signalDOMEvent(cm, e, "contextmenu")) { return }
      if (!captureRightClick) { cm.display.input.onContextMenu(e); }
    }

    function contextMenuInGutter(cm, e) {
      if (!hasHandler(cm, "gutterContextMenu")) { return false }
      return gutterEvent(cm, e, "gutterContextMenu", false)
    }

    function themeChanged(cm) {
      cm.display.wrapper.className = cm.display.wrapper.className.replace(/\s*cm-s-\S+/g, "") +
        cm.options.theme.replace(/(^|\s)\s*/g, " cm-s-");
      clearCaches(cm);
    }

    var Init = {toString: function(){return "CodeMirror.Init"}};

    var defaults = {};
    var optionHandlers = {};

    function defineOptions(CodeMirror) {
      var optionHandlers = CodeMirror.optionHandlers;

      function option(name, deflt, handle, notOnInit) {
        CodeMirror.defaults[name] = deflt;
        if (handle) { optionHandlers[name] =
          notOnInit ? function (cm, val, old) {if (old != Init) { handle(cm, val, old); }} : handle; }
      }

      CodeMirror.defineOption = option;

      // Passed to option handlers when there is no old value.
      CodeMirror.Init = Init;

      // These two are, on init, called from the constructor because they
      // have to be initialized before the editor can start at all.
      option("value", "", function (cm, val) { return cm.setValue(val); }, true);
      option("mode", null, function (cm, val) {
        cm.doc.modeOption = val;
        loadMode(cm);
      }, true);

      option("indentUnit", 2, loadMode, true);
      option("indentWithTabs", false);
      option("smartIndent", true);
      option("tabSize", 4, function (cm) {
        resetModeState(cm);
        clearCaches(cm);
        regChange(cm);
      }, true);

      option("lineSeparator", null, function (cm, val) {
        cm.doc.lineSep = val;
        if (!val) { return }
        var newBreaks = [], lineNo = cm.doc.first;
        cm.doc.iter(function (line) {
          for (var pos = 0;;) {
            var found = line.text.indexOf(val, pos);
            if (found == -1) { break }
            pos = found + val.length;
            newBreaks.push(Pos(lineNo, found));
          }
          lineNo++;
        });
        for (var i = newBreaks.length - 1; i >= 0; i--)
          { replaceRange(cm.doc, val, newBreaks[i], Pos(newBreaks[i].line, newBreaks[i].ch + val.length)); }
      });
      option("specialChars", /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u200b-\u200c\u200e\u200f\u2028\u2029\ufeff\ufff9-\ufffc]/g, function (cm, val, old) {
        cm.state.specialChars = new RegExp(val.source + (val.test("\t") ? "" : "|\t"), "g");
        if (old != Init) { cm.refresh(); }
      });
      option("specialCharPlaceholder", defaultSpecialCharPlaceholder, function (cm) { return cm.refresh(); }, true);
      option("electricChars", true);
      option("inputStyle", mobile ? "contenteditable" : "textarea", function () {
        throw new Error("inputStyle can not (yet) be changed in a running editor") // FIXME
      }, true);
      option("spellcheck", false, function (cm, val) { return cm.getInputField().spellcheck = val; }, true);
      option("autocorrect", false, function (cm, val) { return cm.getInputField().autocorrect = val; }, true);
      option("autocapitalize", false, function (cm, val) { return cm.getInputField().autocapitalize = val; }, true);
      option("rtlMoveVisually", !windows);
      option("wholeLineUpdateBefore", true);

      option("theme", "default", function (cm) {
        themeChanged(cm);
        updateGutters(cm);
      }, true);
      option("keyMap", "default", function (cm, val, old) {
        var next = getKeyMap(val);
        var prev = old != Init && getKeyMap(old);
        if (prev && prev.detach) { prev.detach(cm, next); }
        if (next.attach) { next.attach(cm, prev || null); }
      });
      option("extraKeys", null);
      option("configureMouse", null);

      option("lineWrapping", false, wrappingChanged, true);
      option("gutters", [], function (cm, val) {
        cm.display.gutterSpecs = getGutters(val, cm.options.lineNumbers);
        updateGutters(cm);
      }, true);
      option("fixedGutter", true, function (cm, val) {
        cm.display.gutters.style.left = val ? compensateForHScroll(cm.display) + "px" : "0";
        cm.refresh();
      }, true);
      option("coverGutterNextToScrollbar", false, function (cm) { return updateScrollbars(cm); }, true);
      option("scrollbarStyle", "native", function (cm) {
        initScrollbars(cm);
        updateScrollbars(cm);
        cm.display.scrollbars.setScrollTop(cm.doc.scrollTop);
        cm.display.scrollbars.setScrollLeft(cm.doc.scrollLeft);
      }, true);
      option("lineNumbers", false, function (cm, val) {
        cm.display.gutterSpecs = getGutters(cm.options.gutters, val);
        updateGutters(cm);
      }, true);
      option("firstLineNumber", 1, updateGutters, true);
      option("lineNumberFormatter", function (integer) { return integer; }, updateGutters, true);
      option("showCursorWhenSelecting", false, updateSelection, true);

      option("resetSelectionOnContextMenu", true);
      option("lineWiseCopyCut", true);
      option("pasteLinesPerSelection", true);
      option("selectionsMayTouch", false);

      option("readOnly", false, function (cm, val) {
        if (val == "nocursor") {
          onBlur(cm);
          cm.display.input.blur();
        }
        cm.display.input.readOnlyChanged(val);
      });

      option("screenReaderLabel", null, function (cm, val) {
        val = (val === '') ? null : val;
        cm.display.input.screenReaderLabelChanged(val);
      });

      option("disableInput", false, function (cm, val) {if (!val) { cm.display.input.reset(); }}, true);
      option("dragDrop", true, dragDropChanged);
      option("allowDropFileTypes", null);

      option("cursorBlinkRate", 530);
      option("cursorScrollMargin", 0);
      option("cursorHeight", 1, updateSelection, true);
      option("singleCursorHeightPerLine", true, updateSelection, true);
      option("workTime", 100);
      option("workDelay", 100);
      option("flattenSpans", true, resetModeState, true);
      option("addModeClass", false, resetModeState, true);
      option("pollInterval", 100);
      option("undoDepth", 200, function (cm, val) { return cm.doc.history.undoDepth = val; });
      option("historyEventDelay", 1250);
      option("viewportMargin", 10, function (cm) { return cm.refresh(); }, true);
      option("maxHighlightLength", 10000, resetModeState, true);
      option("moveInputWithCursor", true, function (cm, val) {
        if (!val) { cm.display.input.resetPosition(); }
      });

      option("tabindex", null, function (cm, val) { return cm.display.input.getField().tabIndex = val || ""; });
      option("autofocus", null);
      option("direction", "ltr", function (cm, val) { return cm.doc.setDirection(val); }, true);
      option("phrases", null);
    }

    function dragDropChanged(cm, value, old) {
      var wasOn = old && old != Init;
      if (!value != !wasOn) {
        var funcs = cm.display.dragFunctions;
        var toggle = value ? on : off;
        toggle(cm.display.scroller, "dragstart", funcs.start);
        toggle(cm.display.scroller, "dragenter", funcs.enter);
        toggle(cm.display.scroller, "dragover", funcs.over);
        toggle(cm.display.scroller, "dragleave", funcs.leave);
        toggle(cm.display.scroller, "drop", funcs.drop);
      }
    }

    function wrappingChanged(cm) {
      if (cm.options.lineWrapping) {
        addClass(cm.display.wrapper, "CodeMirror-wrap");
        cm.display.sizer.style.minWidth = "";
        cm.display.sizerWidth = null;
      } else {
        rmClass(cm.display.wrapper, "CodeMirror-wrap");
        findMaxLine(cm);
      }
      estimateLineHeights(cm);
      regChange(cm);
      clearCaches(cm);
      setTimeout(function () { return updateScrollbars(cm); }, 100);
    }

    // A CodeMirror instance represents an editor. This is the object
    // that user code is usually dealing with.

    function CodeMirror(place, options) {
      var this$1 = this;

      if (!(this instanceof CodeMirror)) { return new CodeMirror(place, options) }

      this.options = options = options ? copyObj(options) : {};
      // Determine effective options based on given values and defaults.
      copyObj(defaults, options, false);

      var doc = options.value;
      if (typeof doc == "string") { doc = new Doc(doc, options.mode, null, options.lineSeparator, options.direction); }
      else if (options.mode) { doc.modeOption = options.mode; }
      this.doc = doc;

      var input = new CodeMirror.inputStyles[options.inputStyle](this);
      var display = this.display = new Display(place, doc, input, options);
      display.wrapper.CodeMirror = this;
      themeChanged(this);
      if (options.lineWrapping)
        { this.display.wrapper.className += " CodeMirror-wrap"; }
      initScrollbars(this);

      this.state = {
        keyMaps: [],  // stores maps added by addKeyMap
        overlays: [], // highlighting overlays, as added by addOverlay
        modeGen: 0,   // bumped when mode/overlay changes, used to invalidate highlighting info
        overwrite: false,
        delayingBlurEvent: false,
        focused: false,
        suppressEdits: false, // used to disable editing during key handlers when in readOnly mode
        pasteIncoming: -1, cutIncoming: -1, // help recognize paste/cut edits in input.poll
        selectingText: false,
        draggingText: false,
        highlight: new Delayed(), // stores highlight worker timeout
        keySeq: null,  // Unfinished key sequence
        specialChars: null
      };

      if (options.autofocus && !mobile) { display.input.focus(); }

      // Override magic textarea content restore that IE sometimes does
      // on our hidden textarea on reload
      if (ie && ie_version < 11) { setTimeout(function () { return this$1.display.input.reset(true); }, 20); }

      registerEventHandlers(this);
      ensureGlobalHandlers();

      startOperation(this);
      this.curOp.forceUpdate = true;
      attachDoc(this, doc);

      if ((options.autofocus && !mobile) || this.hasFocus())
        { setTimeout(function () {
          if (this$1.hasFocus() && !this$1.state.focused) { onFocus(this$1); }
        }, 20); }
      else
        { onBlur(this); }

      for (var opt in optionHandlers) { if (optionHandlers.hasOwnProperty(opt))
        { optionHandlers[opt](this, options[opt], Init); } }
      maybeUpdateLineNumberWidth(this);
      if (options.finishInit) { options.finishInit(this); }
      for (var i = 0; i < initHooks.length; ++i) { initHooks[i](this); }
      endOperation(this);
      // Suppress optimizelegibility in Webkit, since it breaks text
      // measuring on line wrapping boundaries.
      if (webkit && options.lineWrapping &&
          getComputedStyle(display.lineDiv).textRendering == "optimizelegibility")
        { display.lineDiv.style.textRendering = "auto"; }
    }

    // The default configuration options.
    CodeMirror.defaults = defaults;
    // Functions to run when options are changed.
    CodeMirror.optionHandlers = optionHandlers;

    // Attach the necessary event handlers when initializing the editor
    function registerEventHandlers(cm) {
      var d = cm.display;
      on(d.scroller, "mousedown", operation(cm, onMouseDown));
      // Older IE's will not fire a second mousedown for a double click
      if (ie && ie_version < 11)
        { on(d.scroller, "dblclick", operation(cm, function (e) {
          if (signalDOMEvent(cm, e)) { return }
          var pos = posFromMouse(cm, e);
          if (!pos || clickInGutter(cm, e) || eventInWidget(cm.display, e)) { return }
          e_preventDefault(e);
          var word = cm.findWordAt(pos);
          extendSelection(cm.doc, word.anchor, word.head);
        })); }
      else
        { on(d.scroller, "dblclick", function (e) { return signalDOMEvent(cm, e) || e_preventDefault(e); }); }
      // Some browsers fire contextmenu *after* opening the menu, at
      // which point we can't mess with it anymore. Context menu is
      // handled in onMouseDown for these browsers.
      on(d.scroller, "contextmenu", function (e) { return onContextMenu(cm, e); });
      on(d.input.getField(), "contextmenu", function (e) {
        if (!d.scroller.contains(e.target)) { onContextMenu(cm, e); }
      });

      // Used to suppress mouse event handling when a touch happens
      var touchFinished, prevTouch = {end: 0};
      function finishTouch() {
        if (d.activeTouch) {
          touchFinished = setTimeout(function () { return d.activeTouch = null; }, 1000);
          prevTouch = d.activeTouch;
          prevTouch.end = +new Date;
        }
      }
      function isMouseLikeTouchEvent(e) {
        if (e.touches.length != 1) { return false }
        var touch = e.touches[0];
        return touch.radiusX <= 1 && touch.radiusY <= 1
      }
      function farAway(touch, other) {
        if (other.left == null) { return true }
        var dx = other.left - touch.left, dy = other.top - touch.top;
        return dx * dx + dy * dy > 20 * 20
      }
      on(d.scroller, "touchstart", function (e) {
        if (!signalDOMEvent(cm, e) && !isMouseLikeTouchEvent(e) && !clickInGutter(cm, e)) {
          d.input.ensurePolled();
          clearTimeout(touchFinished);
          var now = +new Date;
          d.activeTouch = {start: now, moved: false,
                           prev: now - prevTouch.end <= 300 ? prevTouch : null};
          if (e.touches.length == 1) {
            d.activeTouch.left = e.touches[0].pageX;
            d.activeTouch.top = e.touches[0].pageY;
          }
        }
      });
      on(d.scroller, "touchmove", function () {
        if (d.activeTouch) { d.activeTouch.moved = true; }
      });
      on(d.scroller, "touchend", function (e) {
        var touch = d.activeTouch;
        if (touch && !eventInWidget(d, e) && touch.left != null &&
            !touch.moved && new Date - touch.start < 300) {
          var pos = cm.coordsChar(d.activeTouch, "page"), range;
          if (!touch.prev || farAway(touch, touch.prev)) // Single tap
            { range = new Range(pos, pos); }
          else if (!touch.prev.prev || farAway(touch, touch.prev.prev)) // Double tap
            { range = cm.findWordAt(pos); }
          else // Triple tap
            { range = new Range(Pos(pos.line, 0), clipPos(cm.doc, Pos(pos.line + 1, 0))); }
          cm.setSelection(range.anchor, range.head);
          cm.focus();
          e_preventDefault(e);
        }
        finishTouch();
      });
      on(d.scroller, "touchcancel", finishTouch);

      // Sync scrolling between fake scrollbars and real scrollable
      // area, ensure viewport is updated when scrolling.
      on(d.scroller, "scroll", function () {
        if (d.scroller.clientHeight) {
          updateScrollTop(cm, d.scroller.scrollTop);
          setScrollLeft(cm, d.scroller.scrollLeft, true);
          signal(cm, "scroll", cm);
        }
      });

      // Listen to wheel events in order to try and update the viewport on time.
      on(d.scroller, "mousewheel", function (e) { return onScrollWheel(cm, e); });
      on(d.scroller, "DOMMouseScroll", function (e) { return onScrollWheel(cm, e); });

      // Prevent wrapper from ever scrolling
      on(d.wrapper, "scroll", function () { return d.wrapper.scrollTop = d.wrapper.scrollLeft = 0; });

      d.dragFunctions = {
        enter: function (e) {if (!signalDOMEvent(cm, e)) { e_stop(e); }},
        over: function (e) {if (!signalDOMEvent(cm, e)) { onDragOver(cm, e); e_stop(e); }},
        start: function (e) { return onDragStart(cm, e); },
        drop: operation(cm, onDrop),
        leave: function (e) {if (!signalDOMEvent(cm, e)) { clearDragCursor(cm); }}
      };

      var inp = d.input.getField();
      on(inp, "keyup", function (e) { return onKeyUp.call(cm, e); });
      on(inp, "keydown", operation(cm, onKeyDown));
      on(inp, "keypress", operation(cm, onKeyPress));
      on(inp, "focus", function (e) { return onFocus(cm, e); });
      on(inp, "blur", function (e) { return onBlur(cm, e); });
    }

    var initHooks = [];
    CodeMirror.defineInitHook = function (f) { return initHooks.push(f); };

    // Indent the given line. The how parameter can be "smart",
    // "add"/null, "subtract", or "prev". When aggressive is false
    // (typically set to true for forced single-line indents), empty
    // lines are not indented, and places where the mode returns Pass
    // are left alone.
    function indentLine(cm, n, how, aggressive) {
      var doc = cm.doc, state;
      if (how == null) { how = "add"; }
      if (how == "smart") {
        // Fall back to "prev" when the mode doesn't have an indentation
        // method.
        if (!doc.mode.indent) { how = "prev"; }
        else { state = getContextBefore(cm, n).state; }
      }

      var tabSize = cm.options.tabSize;
      var line = getLine(doc, n), curSpace = countColumn(line.text, null, tabSize);
      if (line.stateAfter) { line.stateAfter = null; }
      var curSpaceString = line.text.match(/^\s*/)[0], indentation;
      if (!aggressive && !/\S/.test(line.text)) {
        indentation = 0;
        how = "not";
      } else if (how == "smart") {
        indentation = doc.mode.indent(state, line.text.slice(curSpaceString.length), line.text);
        if (indentation == Pass || indentation > 150) {
          if (!aggressive) { return }
          how = "prev";
        }
      }
      if (how == "prev") {
        if (n > doc.first) { indentation = countColumn(getLine(doc, n-1).text, null, tabSize); }
        else { indentation = 0; }
      } else if (how == "add") {
        indentation = curSpace + cm.options.indentUnit;
      } else if (how == "subtract") {
        indentation = curSpace - cm.options.indentUnit;
      } else if (typeof how == "number") {
        indentation = curSpace + how;
      }
      indentation = Math.max(0, indentation);

      var indentString = "", pos = 0;
      if (cm.options.indentWithTabs)
        { for (var i = Math.floor(indentation / tabSize); i; --i) {pos += tabSize; indentString += "\t";} }
      if (pos < indentation) { indentString += spaceStr(indentation - pos); }

      if (indentString != curSpaceString) {
        replaceRange(doc, indentString, Pos(n, 0), Pos(n, curSpaceString.length), "+input");
        line.stateAfter = null;
        return true
      } else {
        // Ensure that, if the cursor was in the whitespace at the start
        // of the line, it is moved to the end of that space.
        for (var i$1 = 0; i$1 < doc.sel.ranges.length; i$1++) {
          var range = doc.sel.ranges[i$1];
          if (range.head.line == n && range.head.ch < curSpaceString.length) {
            var pos$1 = Pos(n, curSpaceString.length);
            replaceOneSelection(doc, i$1, new Range(pos$1, pos$1));
            break
          }
        }
      }
    }

    // This will be set to a {lineWise: bool, text: [string]} object, so
    // that, when pasting, we know what kind of selections the copied
    // text was made out of.
    var lastCopied = null;

    function setLastCopied(newLastCopied) {
      lastCopied = newLastCopied;
    }

    function applyTextInput(cm, inserted, deleted, sel, origin) {
      var doc = cm.doc;
      cm.display.shift = false;
      if (!sel) { sel = doc.sel; }

      var recent = +new Date - 200;
      var paste = origin == "paste" || cm.state.pasteIncoming > recent;
      var textLines = splitLinesAuto(inserted), multiPaste = null;
      // When pasting N lines into N selections, insert one line per selection
      if (paste && sel.ranges.length > 1) {
        if (lastCopied && lastCopied.text.join("\n") == inserted) {
          if (sel.ranges.length % lastCopied.text.length == 0) {
            multiPaste = [];
            for (var i = 0; i < lastCopied.text.length; i++)
              { multiPaste.push(doc.splitLines(lastCopied.text[i])); }
          }
        } else if (textLines.length == sel.ranges.length && cm.options.pasteLinesPerSelection) {
          multiPaste = map(textLines, function (l) { return [l]; });
        }
      }

      var updateInput = cm.curOp.updateInput;
      // Normal behavior is to insert the new text into every selection
      for (var i$1 = sel.ranges.length - 1; i$1 >= 0; i$1--) {
        var range = sel.ranges[i$1];
        var from = range.from(), to = range.to();
        if (range.empty()) {
          if (deleted && deleted > 0) // Handle deletion
            { from = Pos(from.line, from.ch - deleted); }
          else if (cm.state.overwrite && !paste) // Handle overwrite
            { to = Pos(to.line, Math.min(getLine(doc, to.line).text.length, to.ch + lst(textLines).length)); }
          else if (paste && lastCopied && lastCopied.lineWise && lastCopied.text.join("\n") == textLines.join("\n"))
            { from = to = Pos(from.line, 0); }
        }
        var changeEvent = {from: from, to: to, text: multiPaste ? multiPaste[i$1 % multiPaste.length] : textLines,
                           origin: origin || (paste ? "paste" : cm.state.cutIncoming > recent ? "cut" : "+input")};
        makeChange(cm.doc, changeEvent);
        signalLater(cm, "inputRead", cm, changeEvent);
      }
      if (inserted && !paste)
        { triggerElectric(cm, inserted); }

      ensureCursorVisible(cm);
      if (cm.curOp.updateInput < 2) { cm.curOp.updateInput = updateInput; }
      cm.curOp.typing = true;
      cm.state.pasteIncoming = cm.state.cutIncoming = -1;
    }

    function handlePaste(e, cm) {
      var pasted = e.clipboardData && e.clipboardData.getData("Text");
      if (pasted) {
        e.preventDefault();
        if (!cm.isReadOnly() && !cm.options.disableInput)
          { runInOp(cm, function () { return applyTextInput(cm, pasted, 0, null, "paste"); }); }
        return true
      }
    }

    function triggerElectric(cm, inserted) {
      // When an 'electric' character is inserted, immediately trigger a reindent
      if (!cm.options.electricChars || !cm.options.smartIndent) { return }
      var sel = cm.doc.sel;

      for (var i = sel.ranges.length - 1; i >= 0; i--) {
        var range = sel.ranges[i];
        if (range.head.ch > 100 || (i && sel.ranges[i - 1].head.line == range.head.line)) { continue }
        var mode = cm.getModeAt(range.head);
        var indented = false;
        if (mode.electricChars) {
          for (var j = 0; j < mode.electricChars.length; j++)
            { if (inserted.indexOf(mode.electricChars.charAt(j)) > -1) {
              indented = indentLine(cm, range.head.line, "smart");
              break
            } }
        } else if (mode.electricInput) {
          if (mode.electricInput.test(getLine(cm.doc, range.head.line).text.slice(0, range.head.ch)))
            { indented = indentLine(cm, range.head.line, "smart"); }
        }
        if (indented) { signalLater(cm, "electricInput", cm, range.head.line); }
      }
    }

    function copyableRanges(cm) {
      var text = [], ranges = [];
      for (var i = 0; i < cm.doc.sel.ranges.length; i++) {
        var line = cm.doc.sel.ranges[i].head.line;
        var lineRange = {anchor: Pos(line, 0), head: Pos(line + 1, 0)};
        ranges.push(lineRange);
        text.push(cm.getRange(lineRange.anchor, lineRange.head));
      }
      return {text: text, ranges: ranges}
    }

    function disableBrowserMagic(field, spellcheck, autocorrect, autocapitalize) {
      field.setAttribute("autocorrect", autocorrect ? "" : "off");
      field.setAttribute("autocapitalize", autocapitalize ? "" : "off");
      field.setAttribute("spellcheck", !!spellcheck);
    }

    function hiddenTextarea() {
      var te = elt("textarea", null, null, "position: absolute; bottom: -1em; padding: 0; width: 1px; height: 1em; outline: none");
      var div = elt("div", [te], null, "overflow: hidden; position: relative; width: 3px; height: 0px;");
      // The textarea is kept positioned near the cursor to prevent the
      // fact that it'll be scrolled into view on input from scrolling
      // our fake cursor out of view. On webkit, when wrap=off, paste is
      // very slow. So make the area wide instead.
      if (webkit) { te.style.width = "1000px"; }
      else { te.setAttribute("wrap", "off"); }
      // If border: 0; -- iOS fails to open keyboard (issue #1287)
      if (ios) { te.style.border = "1px solid black"; }
      disableBrowserMagic(te);
      return div
    }

    // The publicly visible API. Note that methodOp(f) means
    // 'wrap f in an operation, performed on its `this` parameter'.

    // This is not the complete set of editor methods. Most of the
    // methods defined on the Doc type are also injected into
    // CodeMirror.prototype, for backwards compatibility and
    // convenience.

    function addEditorMethods(CodeMirror) {
      var optionHandlers = CodeMirror.optionHandlers;

      var helpers = CodeMirror.helpers = {};

      CodeMirror.prototype = {
        constructor: CodeMirror,
        focus: function(){window.focus(); this.display.input.focus();},

        setOption: function(option, value) {
          var options = this.options, old = options[option];
          if (options[option] == value && option != "mode") { return }
          options[option] = value;
          if (optionHandlers.hasOwnProperty(option))
            { operation(this, optionHandlers[option])(this, value, old); }
          signal(this, "optionChange", this, option);
        },

        getOption: function(option) {return this.options[option]},
        getDoc: function() {return this.doc},

        addKeyMap: function(map, bottom) {
          this.state.keyMaps[bottom ? "push" : "unshift"](getKeyMap(map));
        },
        removeKeyMap: function(map) {
          var maps = this.state.keyMaps;
          for (var i = 0; i < maps.length; ++i)
            { if (maps[i] == map || maps[i].name == map) {
              maps.splice(i, 1);
              return true
            } }
        },

        addOverlay: methodOp(function(spec, options) {
          var mode = spec.token ? spec : CodeMirror.getMode(this.options, spec);
          if (mode.startState) { throw new Error("Overlays may not be stateful.") }
          insertSorted(this.state.overlays,
                       {mode: mode, modeSpec: spec, opaque: options && options.opaque,
                        priority: (options && options.priority) || 0},
                       function (overlay) { return overlay.priority; });
          this.state.modeGen++;
          regChange(this);
        }),
        removeOverlay: methodOp(function(spec) {
          var overlays = this.state.overlays;
          for (var i = 0; i < overlays.length; ++i) {
            var cur = overlays[i].modeSpec;
            if (cur == spec || typeof spec == "string" && cur.name == spec) {
              overlays.splice(i, 1);
              this.state.modeGen++;
              regChange(this);
              return
            }
          }
        }),

        indentLine: methodOp(function(n, dir, aggressive) {
          if (typeof dir != "string" && typeof dir != "number") {
            if (dir == null) { dir = this.options.smartIndent ? "smart" : "prev"; }
            else { dir = dir ? "add" : "subtract"; }
          }
          if (isLine(this.doc, n)) { indentLine(this, n, dir, aggressive); }
        }),
        indentSelection: methodOp(function(how) {
          var ranges = this.doc.sel.ranges, end = -1;
          for (var i = 0; i < ranges.length; i++) {
            var range = ranges[i];
            if (!range.empty()) {
              var from = range.from(), to = range.to();
              var start = Math.max(end, from.line);
              end = Math.min(this.lastLine(), to.line - (to.ch ? 0 : 1)) + 1;
              for (var j = start; j < end; ++j)
                { indentLine(this, j, how); }
              var newRanges = this.doc.sel.ranges;
              if (from.ch == 0 && ranges.length == newRanges.length && newRanges[i].from().ch > 0)
                { replaceOneSelection(this.doc, i, new Range(from, newRanges[i].to()), sel_dontScroll); }
            } else if (range.head.line > end) {
              indentLine(this, range.head.line, how, true);
              end = range.head.line;
              if (i == this.doc.sel.primIndex) { ensureCursorVisible(this); }
            }
          }
        }),

        // Fetch the parser token for a given character. Useful for hacks
        // that want to inspect the mode state (say, for completion).
        getTokenAt: function(pos, precise) {
          return takeToken(this, pos, precise)
        },

        getLineTokens: function(line, precise) {
          return takeToken(this, Pos(line), precise, true)
        },

        getTokenTypeAt: function(pos) {
          pos = clipPos(this.doc, pos);
          var styles = getLineStyles(this, getLine(this.doc, pos.line));
          var before = 0, after = (styles.length - 1) / 2, ch = pos.ch;
          var type;
          if (ch == 0) { type = styles[2]; }
          else { for (;;) {
            var mid = (before + after) >> 1;
            if ((mid ? styles[mid * 2 - 1] : 0) >= ch) { after = mid; }
            else if (styles[mid * 2 + 1] < ch) { before = mid + 1; }
            else { type = styles[mid * 2 + 2]; break }
          } }
          var cut = type ? type.indexOf("overlay ") : -1;
          return cut < 0 ? type : cut == 0 ? null : type.slice(0, cut - 1)
        },

        getModeAt: function(pos) {
          var mode = this.doc.mode;
          if (!mode.innerMode) { return mode }
          return CodeMirror.innerMode(mode, this.getTokenAt(pos).state).mode
        },

        getHelper: function(pos, type) {
          return this.getHelpers(pos, type)[0]
        },

        getHelpers: function(pos, type) {
          var found = [];
          if (!helpers.hasOwnProperty(type)) { return found }
          var help = helpers[type], mode = this.getModeAt(pos);
          if (typeof mode[type] == "string") {
            if (help[mode[type]]) { found.push(help[mode[type]]); }
          } else if (mode[type]) {
            for (var i = 0; i < mode[type].length; i++) {
              var val = help[mode[type][i]];
              if (val) { found.push(val); }
            }
          } else if (mode.helperType && help[mode.helperType]) {
            found.push(help[mode.helperType]);
          } else if (help[mode.name]) {
            found.push(help[mode.name]);
          }
          for (var i$1 = 0; i$1 < help._global.length; i$1++) {
            var cur = help._global[i$1];
            if (cur.pred(mode, this) && indexOf(found, cur.val) == -1)
              { found.push(cur.val); }
          }
          return found
        },

        getStateAfter: function(line, precise) {
          var doc = this.doc;
          line = clipLine(doc, line == null ? doc.first + doc.size - 1: line);
          return getContextBefore(this, line + 1, precise).state
        },

        cursorCoords: function(start, mode) {
          var pos, range = this.doc.sel.primary();
          if (start == null) { pos = range.head; }
          else if (typeof start == "object") { pos = clipPos(this.doc, start); }
          else { pos = start ? range.from() : range.to(); }
          return cursorCoords(this, pos, mode || "page")
        },

        charCoords: function(pos, mode) {
          return charCoords(this, clipPos(this.doc, pos), mode || "page")
        },

        coordsChar: function(coords, mode) {
          coords = fromCoordSystem(this, coords, mode || "page");
          return coordsChar(this, coords.left, coords.top)
        },

        lineAtHeight: function(height, mode) {
          height = fromCoordSystem(this, {top: height, left: 0}, mode || "page").top;
          return lineAtHeight(this.doc, height + this.display.viewOffset)
        },
        heightAtLine: function(line, mode, includeWidgets) {
          var end = false, lineObj;
          if (typeof line == "number") {
            var last = this.doc.first + this.doc.size - 1;
            if (line < this.doc.first) { line = this.doc.first; }
            else if (line > last) { line = last; end = true; }
            lineObj = getLine(this.doc, line);
          } else {
            lineObj = line;
          }
          return intoCoordSystem(this, lineObj, {top: 0, left: 0}, mode || "page", includeWidgets || end).top +
            (end ? this.doc.height - heightAtLine(lineObj) : 0)
        },

        defaultTextHeight: function() { return textHeight(this.display) },
        defaultCharWidth: function() { return charWidth(this.display) },

        getViewport: function() { return {from: this.display.viewFrom, to: this.display.viewTo}},

        addWidget: function(pos, node, scroll, vert, horiz) {
          var display = this.display;
          pos = cursorCoords(this, clipPos(this.doc, pos));
          var top = pos.bottom, left = pos.left;
          node.style.position = "absolute";
          node.setAttribute("cm-ignore-events", "true");
          this.display.input.setUneditable(node);
          display.sizer.appendChild(node);
          if (vert == "over") {
            top = pos.top;
          } else if (vert == "above" || vert == "near") {
            var vspace = Math.max(display.wrapper.clientHeight, this.doc.height),
            hspace = Math.max(display.sizer.clientWidth, display.lineSpace.clientWidth);
            // Default to positioning above (if specified and possible); otherwise default to positioning below
            if ((vert == 'above' || pos.bottom + node.offsetHeight > vspace) && pos.top > node.offsetHeight)
              { top = pos.top - node.offsetHeight; }
            else if (pos.bottom + node.offsetHeight <= vspace)
              { top = pos.bottom; }
            if (left + node.offsetWidth > hspace)
              { left = hspace - node.offsetWidth; }
          }
          node.style.top = top + "px";
          node.style.left = node.style.right = "";
          if (horiz == "right") {
            left = display.sizer.clientWidth - node.offsetWidth;
            node.style.right = "0px";
          } else {
            if (horiz == "left") { left = 0; }
            else if (horiz == "middle") { left = (display.sizer.clientWidth - node.offsetWidth) / 2; }
            node.style.left = left + "px";
          }
          if (scroll)
            { scrollIntoView(this, {left: left, top: top, right: left + node.offsetWidth, bottom: top + node.offsetHeight}); }
        },

        triggerOnKeyDown: methodOp(onKeyDown),
        triggerOnKeyPress: methodOp(onKeyPress),
        triggerOnKeyUp: onKeyUp,
        triggerOnMouseDown: methodOp(onMouseDown),

        execCommand: function(cmd) {
          if (commands.hasOwnProperty(cmd))
            { return commands[cmd].call(null, this) }
        },

        triggerElectric: methodOp(function(text) { triggerElectric(this, text); }),

        findPosH: function(from, amount, unit, visually) {
          var dir = 1;
          if (amount < 0) { dir = -1; amount = -amount; }
          var cur = clipPos(this.doc, from);
          for (var i = 0; i < amount; ++i) {
            cur = findPosH(this.doc, cur, dir, unit, visually);
            if (cur.hitSide) { break }
          }
          return cur
        },

        moveH: methodOp(function(dir, unit) {
          var this$1 = this;

          this.extendSelectionsBy(function (range) {
            if (this$1.display.shift || this$1.doc.extend || range.empty())
              { return findPosH(this$1.doc, range.head, dir, unit, this$1.options.rtlMoveVisually) }
            else
              { return dir < 0 ? range.from() : range.to() }
          }, sel_move);
        }),

        deleteH: methodOp(function(dir, unit) {
          var sel = this.doc.sel, doc = this.doc;
          if (sel.somethingSelected())
            { doc.replaceSelection("", null, "+delete"); }
          else
            { deleteNearSelection(this, function (range) {
              var other = findPosH(doc, range.head, dir, unit, false);
              return dir < 0 ? {from: other, to: range.head} : {from: range.head, to: other}
            }); }
        }),

        findPosV: function(from, amount, unit, goalColumn) {
          var dir = 1, x = goalColumn;
          if (amount < 0) { dir = -1; amount = -amount; }
          var cur = clipPos(this.doc, from);
          for (var i = 0; i < amount; ++i) {
            var coords = cursorCoords(this, cur, "div");
            if (x == null) { x = coords.left; }
            else { coords.left = x; }
            cur = findPosV(this, coords, dir, unit);
            if (cur.hitSide) { break }
          }
          return cur
        },

        moveV: methodOp(function(dir, unit) {
          var this$1 = this;

          var doc = this.doc, goals = [];
          var collapse = !this.display.shift && !doc.extend && doc.sel.somethingSelected();
          doc.extendSelectionsBy(function (range) {
            if (collapse)
              { return dir < 0 ? range.from() : range.to() }
            var headPos = cursorCoords(this$1, range.head, "div");
            if (range.goalColumn != null) { headPos.left = range.goalColumn; }
            goals.push(headPos.left);
            var pos = findPosV(this$1, headPos, dir, unit);
            if (unit == "page" && range == doc.sel.primary())
              { addToScrollTop(this$1, charCoords(this$1, pos, "div").top - headPos.top); }
            return pos
          }, sel_move);
          if (goals.length) { for (var i = 0; i < doc.sel.ranges.length; i++)
            { doc.sel.ranges[i].goalColumn = goals[i]; } }
        }),

        // Find the word at the given position (as returned by coordsChar).
        findWordAt: function(pos) {
          var doc = this.doc, line = getLine(doc, pos.line).text;
          var start = pos.ch, end = pos.ch;
          if (line) {
            var helper = this.getHelper(pos, "wordChars");
            if ((pos.sticky == "before" || end == line.length) && start) { --start; } else { ++end; }
            var startChar = line.charAt(start);
            var check = isWordChar(startChar, helper)
              ? function (ch) { return isWordChar(ch, helper); }
              : /\s/.test(startChar) ? function (ch) { return /\s/.test(ch); }
              : function (ch) { return (!/\s/.test(ch) && !isWordChar(ch)); };
            while (start > 0 && check(line.charAt(start - 1))) { --start; }
            while (end < line.length && check(line.charAt(end))) { ++end; }
          }
          return new Range(Pos(pos.line, start), Pos(pos.line, end))
        },

        toggleOverwrite: function(value) {
          if (value != null && value == this.state.overwrite) { return }
          if (this.state.overwrite = !this.state.overwrite)
            { addClass(this.display.cursorDiv, "CodeMirror-overwrite"); }
          else
            { rmClass(this.display.cursorDiv, "CodeMirror-overwrite"); }

          signal(this, "overwriteToggle", this, this.state.overwrite);
        },
        hasFocus: function() { return this.display.input.getField() == activeElt() },
        isReadOnly: function() { return !!(this.options.readOnly || this.doc.cantEdit) },

        scrollTo: methodOp(function (x, y) { scrollToCoords(this, x, y); }),
        getScrollInfo: function() {
          var scroller = this.display.scroller;
          return {left: scroller.scrollLeft, top: scroller.scrollTop,
                  height: scroller.scrollHeight - scrollGap(this) - this.display.barHeight,
                  width: scroller.scrollWidth - scrollGap(this) - this.display.barWidth,
                  clientHeight: displayHeight(this), clientWidth: displayWidth(this)}
        },

        scrollIntoView: methodOp(function(range, margin) {
          if (range == null) {
            range = {from: this.doc.sel.primary().head, to: null};
            if (margin == null) { margin = this.options.cursorScrollMargin; }
          } else if (typeof range == "number") {
            range = {from: Pos(range, 0), to: null};
          } else if (range.from == null) {
            range = {from: range, to: null};
          }
          if (!range.to) { range.to = range.from; }
          range.margin = margin || 0;

          if (range.from.line != null) {
            scrollToRange(this, range);
          } else {
            scrollToCoordsRange(this, range.from, range.to, range.margin);
          }
        }),

        setSize: methodOp(function(width, height) {
          var this$1 = this;

          var interpret = function (val) { return typeof val == "number" || /^\d+$/.test(String(val)) ? val + "px" : val; };
          if (width != null) { this.display.wrapper.style.width = interpret(width); }
          if (height != null) { this.display.wrapper.style.height = interpret(height); }
          if (this.options.lineWrapping) { clearLineMeasurementCache(this); }
          var lineNo = this.display.viewFrom;
          this.doc.iter(lineNo, this.display.viewTo, function (line) {
            if (line.widgets) { for (var i = 0; i < line.widgets.length; i++)
              { if (line.widgets[i].noHScroll) { regLineChange(this$1, lineNo, "widget"); break } } }
            ++lineNo;
          });
          this.curOp.forceUpdate = true;
          signal(this, "refresh", this);
        }),

        operation: function(f){return runInOp(this, f)},
        startOperation: function(){return startOperation(this)},
        endOperation: function(){return endOperation(this)},

        refresh: methodOp(function() {
          var oldHeight = this.display.cachedTextHeight;
          regChange(this);
          this.curOp.forceUpdate = true;
          clearCaches(this);
          scrollToCoords(this, this.doc.scrollLeft, this.doc.scrollTop);
          updateGutterSpace(this.display);
          if (oldHeight == null || Math.abs(oldHeight - textHeight(this.display)) > .5 || this.options.lineWrapping)
            { estimateLineHeights(this); }
          signal(this, "refresh", this);
        }),

        swapDoc: methodOp(function(doc) {
          var old = this.doc;
          old.cm = null;
          // Cancel the current text selection if any (#5821)
          if (this.state.selectingText) { this.state.selectingText(); }
          attachDoc(this, doc);
          clearCaches(this);
          this.display.input.reset();
          scrollToCoords(this, doc.scrollLeft, doc.scrollTop);
          this.curOp.forceScroll = true;
          signalLater(this, "swapDoc", this, old);
          return old
        }),

        phrase: function(phraseText) {
          var phrases = this.options.phrases;
          return phrases && Object.prototype.hasOwnProperty.call(phrases, phraseText) ? phrases[phraseText] : phraseText
        },

        getInputField: function(){return this.display.input.getField()},
        getWrapperElement: function(){return this.display.wrapper},
        getScrollerElement: function(){return this.display.scroller},
        getGutterElement: function(){return this.display.gutters}
      };
      eventMixin(CodeMirror);

      CodeMirror.registerHelper = function(type, name, value) {
        if (!helpers.hasOwnProperty(type)) { helpers[type] = CodeMirror[type] = {_global: []}; }
        helpers[type][name] = value;
      };
      CodeMirror.registerGlobalHelper = function(type, name, predicate, value) {
        CodeMirror.registerHelper(type, name, value);
        helpers[type]._global.push({pred: predicate, val: value});
      };
    }

    // Used for horizontal relative motion. Dir is -1 or 1 (left or
    // right), unit can be "codepoint", "char", "column" (like char, but
    // doesn't cross line boundaries), "word" (across next word), or
    // "group" (to the start of next group of word or
    // non-word-non-whitespace chars). The visually param controls
    // whether, in right-to-left text, direction 1 means to move towards
    // the next index in the string, or towards the character to the right
    // of the current position. The resulting position will have a
    // hitSide=true property if it reached the end of the document.
    function findPosH(doc, pos, dir, unit, visually) {
      var oldPos = pos;
      var origDir = dir;
      var lineObj = getLine(doc, pos.line);
      var lineDir = visually && doc.direction == "rtl" ? -dir : dir;
      function findNextLine() {
        var l = pos.line + lineDir;
        if (l < doc.first || l >= doc.first + doc.size) { return false }
        pos = new Pos(l, pos.ch, pos.sticky);
        return lineObj = getLine(doc, l)
      }
      function moveOnce(boundToLine) {
        var next;
        if (unit == "codepoint") {
          var ch = lineObj.text.charCodeAt(pos.ch + (unit > 0 ? 0 : -1));
          if (isNaN(ch)) {
            next = null;
          } else {
            var astral = dir > 0 ? ch >= 0xD800 && ch < 0xDC00 : ch >= 0xDC00 && ch < 0xDFFF;
            next = new Pos(pos.line, Math.max(0, Math.min(lineObj.text.length, pos.ch + dir * (astral ? 2 : 1))), -dir);
          }
        } else if (visually) {
          next = moveVisually(doc.cm, lineObj, pos, dir);
        } else {
          next = moveLogically(lineObj, pos, dir);
        }
        if (next == null) {
          if (!boundToLine && findNextLine())
            { pos = endOfLine(visually, doc.cm, lineObj, pos.line, lineDir); }
          else
            { return false }
        } else {
          pos = next;
        }
        return true
      }

      if (unit == "char" || unit == "codepoint") {
        moveOnce();
      } else if (unit == "column") {
        moveOnce(true);
      } else if (unit == "word" || unit == "group") {
        var sawType = null, group = unit == "group";
        var helper = doc.cm && doc.cm.getHelper(pos, "wordChars");
        for (var first = true;; first = false) {
          if (dir < 0 && !moveOnce(!first)) { break }
          var cur = lineObj.text.charAt(pos.ch) || "\n";
          var type = isWordChar(cur, helper) ? "w"
            : group && cur == "\n" ? "n"
            : !group || /\s/.test(cur) ? null
            : "p";
          if (group && !first && !type) { type = "s"; }
          if (sawType && sawType != type) {
            if (dir < 0) {dir = 1; moveOnce(); pos.sticky = "after";}
            break
          }

          if (type) { sawType = type; }
          if (dir > 0 && !moveOnce(!first)) { break }
        }
      }
      var result = skipAtomic(doc, pos, oldPos, origDir, true);
      if (equalCursorPos(oldPos, result)) { result.hitSide = true; }
      return result
    }

    // For relative vertical movement. Dir may be -1 or 1. Unit can be
    // "page" or "line". The resulting position will have a hitSide=true
    // property if it reached the end of the document.
    function findPosV(cm, pos, dir, unit) {
      var doc = cm.doc, x = pos.left, y;
      if (unit == "page") {
        var pageSize = Math.min(cm.display.wrapper.clientHeight, window.innerHeight || document.documentElement.clientHeight);
        var moveAmount = Math.max(pageSize - .5 * textHeight(cm.display), 3);
        y = (dir > 0 ? pos.bottom : pos.top) + dir * moveAmount;

      } else if (unit == "line") {
        y = dir > 0 ? pos.bottom + 3 : pos.top - 3;
      }
      var target;
      for (;;) {
        target = coordsChar(cm, x, y);
        if (!target.outside) { break }
        if (dir < 0 ? y <= 0 : y >= doc.height) { target.hitSide = true; break }
        y += dir * 5;
      }
      return target
    }

    // CONTENTEDITABLE INPUT STYLE

    var ContentEditableInput = function(cm) {
      this.cm = cm;
      this.lastAnchorNode = this.lastAnchorOffset = this.lastFocusNode = this.lastFocusOffset = null;
      this.polling = new Delayed();
      this.composing = null;
      this.gracePeriod = false;
      this.readDOMTimeout = null;
    };

    ContentEditableInput.prototype.init = function (display) {
        var this$1 = this;

      var input = this, cm = input.cm;
      var div = input.div = display.lineDiv;
      disableBrowserMagic(div, cm.options.spellcheck, cm.options.autocorrect, cm.options.autocapitalize);

      function belongsToInput(e) {
        for (var t = e.target; t; t = t.parentNode) {
          if (t == div) { return true }
          if (/\bCodeMirror-(?:line)?widget\b/.test(t.className)) { break }
        }
        return false
      }

      on(div, "paste", function (e) {
        if (!belongsToInput(e) || signalDOMEvent(cm, e) || handlePaste(e, cm)) { return }
        // IE doesn't fire input events, so we schedule a read for the pasted content in this way
        if (ie_version <= 11) { setTimeout(operation(cm, function () { return this$1.updateFromDOM(); }), 20); }
      });

      on(div, "compositionstart", function (e) {
        this$1.composing = {data: e.data, done: false};
      });
      on(div, "compositionupdate", function (e) {
        if (!this$1.composing) { this$1.composing = {data: e.data, done: false}; }
      });
      on(div, "compositionend", function (e) {
        if (this$1.composing) {
          if (e.data != this$1.composing.data) { this$1.readFromDOMSoon(); }
          this$1.composing.done = true;
        }
      });

      on(div, "touchstart", function () { return input.forceCompositionEnd(); });

      on(div, "input", function () {
        if (!this$1.composing) { this$1.readFromDOMSoon(); }
      });

      function onCopyCut(e) {
        if (!belongsToInput(e) || signalDOMEvent(cm, e)) { return }
        if (cm.somethingSelected()) {
          setLastCopied({lineWise: false, text: cm.getSelections()});
          if (e.type == "cut") { cm.replaceSelection("", null, "cut"); }
        } else if (!cm.options.lineWiseCopyCut) {
          return
        } else {
          var ranges = copyableRanges(cm);
          setLastCopied({lineWise: true, text: ranges.text});
          if (e.type == "cut") {
            cm.operation(function () {
              cm.setSelections(ranges.ranges, 0, sel_dontScroll);
              cm.replaceSelection("", null, "cut");
            });
          }
        }
        if (e.clipboardData) {
          e.clipboardData.clearData();
          var content = lastCopied.text.join("\n");
          // iOS exposes the clipboard API, but seems to discard content inserted into it
          e.clipboardData.setData("Text", content);
          if (e.clipboardData.getData("Text") == content) {
            e.preventDefault();
            return
          }
        }
        // Old-fashioned briefly-focus-a-textarea hack
        var kludge = hiddenTextarea(), te = kludge.firstChild;
        cm.display.lineSpace.insertBefore(kludge, cm.display.lineSpace.firstChild);
        te.value = lastCopied.text.join("\n");
        var hadFocus = document.activeElement;
        selectInput(te);
        setTimeout(function () {
          cm.display.lineSpace.removeChild(kludge);
          hadFocus.focus();
          if (hadFocus == div) { input.showPrimarySelection(); }
        }, 50);
      }
      on(div, "copy", onCopyCut);
      on(div, "cut", onCopyCut);
    };

    ContentEditableInput.prototype.screenReaderLabelChanged = function (label) {
      // Label for screenreaders, accessibility
      if(label) {
        this.div.setAttribute('aria-label', label);
      } else {
        this.div.removeAttribute('aria-label');
      }
    };

    ContentEditableInput.prototype.prepareSelection = function () {
      var result = prepareSelection(this.cm, false);
      result.focus = document.activeElement == this.div;
      return result
    };

    ContentEditableInput.prototype.showSelection = function (info, takeFocus) {
      if (!info || !this.cm.display.view.length) { return }
      if (info.focus || takeFocus) { this.showPrimarySelection(); }
      this.showMultipleSelections(info);
    };

    ContentEditableInput.prototype.getSelection = function () {
      return this.cm.display.wrapper.ownerDocument.getSelection()
    };

    ContentEditableInput.prototype.showPrimarySelection = function () {
      var sel = this.getSelection(), cm = this.cm, prim = cm.doc.sel.primary();
      var from = prim.from(), to = prim.to();

      if (cm.display.viewTo == cm.display.viewFrom || from.line >= cm.display.viewTo || to.line < cm.display.viewFrom) {
        sel.removeAllRanges();
        return
      }

      var curAnchor = domToPos(cm, sel.anchorNode, sel.anchorOffset);
      var curFocus = domToPos(cm, sel.focusNode, sel.focusOffset);
      if (curAnchor && !curAnchor.bad && curFocus && !curFocus.bad &&
          cmp(minPos(curAnchor, curFocus), from) == 0 &&
          cmp(maxPos(curAnchor, curFocus), to) == 0)
        { return }

      var view = cm.display.view;
      var start = (from.line >= cm.display.viewFrom && posToDOM(cm, from)) ||
          {node: view[0].measure.map[2], offset: 0};
      var end = to.line < cm.display.viewTo && posToDOM(cm, to);
      if (!end) {
        var measure = view[view.length - 1].measure;
        var map = measure.maps ? measure.maps[measure.maps.length - 1] : measure.map;
        end = {node: map[map.length - 1], offset: map[map.length - 2] - map[map.length - 3]};
      }

      if (!start || !end) {
        sel.removeAllRanges();
        return
      }

      var old = sel.rangeCount && sel.getRangeAt(0), rng;
      try { rng = range(start.node, start.offset, end.offset, end.node); }
      catch(e) {} // Our model of the DOM might be outdated, in which case the range we try to set can be impossible
      if (rng) {
        if (!gecko && cm.state.focused) {
          sel.collapse(start.node, start.offset);
          if (!rng.collapsed) {
            sel.removeAllRanges();
            sel.addRange(rng);
          }
        } else {
          sel.removeAllRanges();
          sel.addRange(rng);
        }
        if (old && sel.anchorNode == null) { sel.addRange(old); }
        else if (gecko) { this.startGracePeriod(); }
      }
      this.rememberSelection();
    };

    ContentEditableInput.prototype.startGracePeriod = function () {
        var this$1 = this;

      clearTimeout(this.gracePeriod);
      this.gracePeriod = setTimeout(function () {
        this$1.gracePeriod = false;
        if (this$1.selectionChanged())
          { this$1.cm.operation(function () { return this$1.cm.curOp.selectionChanged = true; }); }
      }, 20);
    };

    ContentEditableInput.prototype.showMultipleSelections = function (info) {
      removeChildrenAndAdd(this.cm.display.cursorDiv, info.cursors);
      removeChildrenAndAdd(this.cm.display.selectionDiv, info.selection);
    };

    ContentEditableInput.prototype.rememberSelection = function () {
      var sel = this.getSelection();
      this.lastAnchorNode = sel.anchorNode; this.lastAnchorOffset = sel.anchorOffset;
      this.lastFocusNode = sel.focusNode; this.lastFocusOffset = sel.focusOffset;
    };

    ContentEditableInput.prototype.selectionInEditor = function () {
      var sel = this.getSelection();
      if (!sel.rangeCount) { return false }
      var node = sel.getRangeAt(0).commonAncestorContainer;
      return contains(this.div, node)
    };

    ContentEditableInput.prototype.focus = function () {
      if (this.cm.options.readOnly != "nocursor") {
        if (!this.selectionInEditor() || document.activeElement != this.div)
          { this.showSelection(this.prepareSelection(), true); }
        this.div.focus();
      }
    };
    ContentEditableInput.prototype.blur = function () { this.div.blur(); };
    ContentEditableInput.prototype.getField = function () { return this.div };

    ContentEditableInput.prototype.supportsTouch = function () { return true };

    ContentEditableInput.prototype.receivedFocus = function () {
      var input = this;
      if (this.selectionInEditor())
        { this.pollSelection(); }
      else
        { runInOp(this.cm, function () { return input.cm.curOp.selectionChanged = true; }); }

      function poll() {
        if (input.cm.state.focused) {
          input.pollSelection();
          input.polling.set(input.cm.options.pollInterval, poll);
        }
      }
      this.polling.set(this.cm.options.pollInterval, poll);
    };

    ContentEditableInput.prototype.selectionChanged = function () {
      var sel = this.getSelection();
      return sel.anchorNode != this.lastAnchorNode || sel.anchorOffset != this.lastAnchorOffset ||
        sel.focusNode != this.lastFocusNode || sel.focusOffset != this.lastFocusOffset
    };

    ContentEditableInput.prototype.pollSelection = function () {
      if (this.readDOMTimeout != null || this.gracePeriod || !this.selectionChanged()) { return }
      var sel = this.getSelection(), cm = this.cm;
      // On Android Chrome (version 56, at least), backspacing into an
      // uneditable block element will put the cursor in that element,
      // and then, because it's not editable, hide the virtual keyboard.
      // Because Android doesn't allow us to actually detect backspace
      // presses in a sane way, this code checks for when that happens
      // and simulates a backspace press in this case.
      if (android && chrome && this.cm.display.gutterSpecs.length && isInGutter(sel.anchorNode)) {
        this.cm.triggerOnKeyDown({type: "keydown", keyCode: 8, preventDefault: Math.abs});
        this.blur();
        this.focus();
        return
      }
      if (this.composing) { return }
      this.rememberSelection();
      var anchor = domToPos(cm, sel.anchorNode, sel.anchorOffset);
      var head = domToPos(cm, sel.focusNode, sel.focusOffset);
      if (anchor && head) { runInOp(cm, function () {
        setSelection(cm.doc, simpleSelection(anchor, head), sel_dontScroll);
        if (anchor.bad || head.bad) { cm.curOp.selectionChanged = true; }
      }); }
    };

    ContentEditableInput.prototype.pollContent = function () {
      if (this.readDOMTimeout != null) {
        clearTimeout(this.readDOMTimeout);
        this.readDOMTimeout = null;
      }

      var cm = this.cm, display = cm.display, sel = cm.doc.sel.primary();
      var from = sel.from(), to = sel.to();
      if (from.ch == 0 && from.line > cm.firstLine())
        { from = Pos(from.line - 1, getLine(cm.doc, from.line - 1).length); }
      if (to.ch == getLine(cm.doc, to.line).text.length && to.line < cm.lastLine())
        { to = Pos(to.line + 1, 0); }
      if (from.line < display.viewFrom || to.line > display.viewTo - 1) { return false }

      var fromIndex, fromLine, fromNode;
      if (from.line == display.viewFrom || (fromIndex = findViewIndex(cm, from.line)) == 0) {
        fromLine = lineNo(display.view[0].line);
        fromNode = display.view[0].node;
      } else {
        fromLine = lineNo(display.view[fromIndex].line);
        fromNode = display.view[fromIndex - 1].node.nextSibling;
      }
      var toIndex = findViewIndex(cm, to.line);
      var toLine, toNode;
      if (toIndex == display.view.length - 1) {
        toLine = display.viewTo - 1;
        toNode = display.lineDiv.lastChild;
      } else {
        toLine = lineNo(display.view[toIndex + 1].line) - 1;
        toNode = display.view[toIndex + 1].node.previousSibling;
      }

      if (!fromNode) { return false }
      var newText = cm.doc.splitLines(domTextBetween(cm, fromNode, toNode, fromLine, toLine));
      var oldText = getBetween(cm.doc, Pos(fromLine, 0), Pos(toLine, getLine(cm.doc, toLine).text.length));
      while (newText.length > 1 && oldText.length > 1) {
        if (lst(newText) == lst(oldText)) { newText.pop(); oldText.pop(); toLine--; }
        else if (newText[0] == oldText[0]) { newText.shift(); oldText.shift(); fromLine++; }
        else { break }
      }

      var cutFront = 0, cutEnd = 0;
      var newTop = newText[0], oldTop = oldText[0], maxCutFront = Math.min(newTop.length, oldTop.length);
      while (cutFront < maxCutFront && newTop.charCodeAt(cutFront) == oldTop.charCodeAt(cutFront))
        { ++cutFront; }
      var newBot = lst(newText), oldBot = lst(oldText);
      var maxCutEnd = Math.min(newBot.length - (newText.length == 1 ? cutFront : 0),
                               oldBot.length - (oldText.length == 1 ? cutFront : 0));
      while (cutEnd < maxCutEnd &&
             newBot.charCodeAt(newBot.length - cutEnd - 1) == oldBot.charCodeAt(oldBot.length - cutEnd - 1))
        { ++cutEnd; }
      // Try to move start of change to start of selection if ambiguous
      if (newText.length == 1 && oldText.length == 1 && fromLine == from.line) {
        while (cutFront && cutFront > from.ch &&
               newBot.charCodeAt(newBot.length - cutEnd - 1) == oldBot.charCodeAt(oldBot.length - cutEnd - 1)) {
          cutFront--;
          cutEnd++;
        }
      }

      newText[newText.length - 1] = newBot.slice(0, newBot.length - cutEnd).replace(/^\u200b+/, "");
      newText[0] = newText[0].slice(cutFront).replace(/\u200b+$/, "");

      var chFrom = Pos(fromLine, cutFront);
      var chTo = Pos(toLine, oldText.length ? lst(oldText).length - cutEnd : 0);
      if (newText.length > 1 || newText[0] || cmp(chFrom, chTo)) {
        replaceRange(cm.doc, newText, chFrom, chTo, "+input");
        return true
      }
    };

    ContentEditableInput.prototype.ensurePolled = function () {
      this.forceCompositionEnd();
    };
    ContentEditableInput.prototype.reset = function () {
      this.forceCompositionEnd();
    };
    ContentEditableInput.prototype.forceCompositionEnd = function () {
      if (!this.composing) { return }
      clearTimeout(this.readDOMTimeout);
      this.composing = null;
      this.updateFromDOM();
      this.div.blur();
      this.div.focus();
    };
    ContentEditableInput.prototype.readFromDOMSoon = function () {
        var this$1 = this;

      if (this.readDOMTimeout != null) { return }
      this.readDOMTimeout = setTimeout(function () {
        this$1.readDOMTimeout = null;
        if (this$1.composing) {
          if (this$1.composing.done) { this$1.composing = null; }
          else { return }
        }
        this$1.updateFromDOM();
      }, 80);
    };

    ContentEditableInput.prototype.updateFromDOM = function () {
        var this$1 = this;

      if (this.cm.isReadOnly() || !this.pollContent())
        { runInOp(this.cm, function () { return regChange(this$1.cm); }); }
    };

    ContentEditableInput.prototype.setUneditable = function (node) {
      node.contentEditable = "false";
    };

    ContentEditableInput.prototype.onKeyPress = function (e) {
      if (e.charCode == 0 || this.composing) { return }
      e.preventDefault();
      if (!this.cm.isReadOnly())
        { operation(this.cm, applyTextInput)(this.cm, String.fromCharCode(e.charCode == null ? e.keyCode : e.charCode), 0); }
    };

    ContentEditableInput.prototype.readOnlyChanged = function (val) {
      this.div.contentEditable = String(val != "nocursor");
    };

    ContentEditableInput.prototype.onContextMenu = function () {};
    ContentEditableInput.prototype.resetPosition = function () {};

    ContentEditableInput.prototype.needsContentAttribute = true;

    function posToDOM(cm, pos) {
      var view = findViewForLine(cm, pos.line);
      if (!view || view.hidden) { return null }
      var line = getLine(cm.doc, pos.line);
      var info = mapFromLineView(view, line, pos.line);

      var order = getOrder(line, cm.doc.direction), side = "left";
      if (order) {
        var partPos = getBidiPartAt(order, pos.ch);
        side = partPos % 2 ? "right" : "left";
      }
      var result = nodeAndOffsetInLineMap(info.map, pos.ch, side);
      result.offset = result.collapse == "right" ? result.end : result.start;
      return result
    }

    function isInGutter(node) {
      for (var scan = node; scan; scan = scan.parentNode)
        { if (/CodeMirror-gutter-wrapper/.test(scan.className)) { return true } }
      return false
    }

    function badPos(pos, bad) { if (bad) { pos.bad = true; } return pos }

    function domTextBetween(cm, from, to, fromLine, toLine) {
      var text = "", closing = false, lineSep = cm.doc.lineSeparator(), extraLinebreak = false;
      function recognizeMarker(id) { return function (marker) { return marker.id == id; } }
      function close() {
        if (closing) {
          text += lineSep;
          if (extraLinebreak) { text += lineSep; }
          closing = extraLinebreak = false;
        }
      }
      function addText(str) {
        if (str) {
          close();
          text += str;
        }
      }
      function walk(node) {
        if (node.nodeType == 1) {
          var cmText = node.getAttribute("cm-text");
          if (cmText) {
            addText(cmText);
            return
          }
          var markerID = node.getAttribute("cm-marker"), range;
          if (markerID) {
            var found = cm.findMarks(Pos(fromLine, 0), Pos(toLine + 1, 0), recognizeMarker(+markerID));
            if (found.length && (range = found[0].find(0)))
              { addText(getBetween(cm.doc, range.from, range.to).join(lineSep)); }
            return
          }
          if (node.getAttribute("contenteditable") == "false") { return }
          var isBlock = /^(pre|div|p|li|table|br)$/i.test(node.nodeName);
          if (!/^br$/i.test(node.nodeName) && node.textContent.length == 0) { return }

          if (isBlock) { close(); }
          for (var i = 0; i < node.childNodes.length; i++)
            { walk(node.childNodes[i]); }

          if (/^(pre|p)$/i.test(node.nodeName)) { extraLinebreak = true; }
          if (isBlock) { closing = true; }
        } else if (node.nodeType == 3) {
          addText(node.nodeValue.replace(/\u200b/g, "").replace(/\u00a0/g, " "));
        }
      }
      for (;;) {
        walk(from);
        if (from == to) { break }
        from = from.nextSibling;
        extraLinebreak = false;
      }
      return text
    }

    function domToPos(cm, node, offset) {
      var lineNode;
      if (node == cm.display.lineDiv) {
        lineNode = cm.display.lineDiv.childNodes[offset];
        if (!lineNode) { return badPos(cm.clipPos(Pos(cm.display.viewTo - 1)), true) }
        node = null; offset = 0;
      } else {
        for (lineNode = node;; lineNode = lineNode.parentNode) {
          if (!lineNode || lineNode == cm.display.lineDiv) { return null }
          if (lineNode.parentNode && lineNode.parentNode == cm.display.lineDiv) { break }
        }
      }
      for (var i = 0; i < cm.display.view.length; i++) {
        var lineView = cm.display.view[i];
        if (lineView.node == lineNode)
          { return locateNodeInLineView(lineView, node, offset) }
      }
    }

    function locateNodeInLineView(lineView, node, offset) {
      var wrapper = lineView.text.firstChild, bad = false;
      if (!node || !contains(wrapper, node)) { return badPos(Pos(lineNo(lineView.line), 0), true) }
      if (node == wrapper) {
        bad = true;
        node = wrapper.childNodes[offset];
        offset = 0;
        if (!node) {
          var line = lineView.rest ? lst(lineView.rest) : lineView.line;
          return badPos(Pos(lineNo(line), line.text.length), bad)
        }
      }

      var textNode = node.nodeType == 3 ? node : null, topNode = node;
      if (!textNode && node.childNodes.length == 1 && node.firstChild.nodeType == 3) {
        textNode = node.firstChild;
        if (offset) { offset = textNode.nodeValue.length; }
      }
      while (topNode.parentNode != wrapper) { topNode = topNode.parentNode; }
      var measure = lineView.measure, maps = measure.maps;

      function find(textNode, topNode, offset) {
        for (var i = -1; i < (maps ? maps.length : 0); i++) {
          var map = i < 0 ? measure.map : maps[i];
          for (var j = 0; j < map.length; j += 3) {
            var curNode = map[j + 2];
            if (curNode == textNode || curNode == topNode) {
              var line = lineNo(i < 0 ? lineView.line : lineView.rest[i]);
              var ch = map[j] + offset;
              if (offset < 0 || curNode != textNode) { ch = map[j + (offset ? 1 : 0)]; }
              return Pos(line, ch)
            }
          }
        }
      }
      var found = find(textNode, topNode, offset);
      if (found) { return badPos(found, bad) }

      // FIXME this is all really shaky. might handle the few cases it needs to handle, but likely to cause problems
      for (var after = topNode.nextSibling, dist = textNode ? textNode.nodeValue.length - offset : 0; after; after = after.nextSibling) {
        found = find(after, after.firstChild, 0);
        if (found)
          { return badPos(Pos(found.line, found.ch - dist), bad) }
        else
          { dist += after.textContent.length; }
      }
      for (var before = topNode.previousSibling, dist$1 = offset; before; before = before.previousSibling) {
        found = find(before, before.firstChild, -1);
        if (found)
          { return badPos(Pos(found.line, found.ch + dist$1), bad) }
        else
          { dist$1 += before.textContent.length; }
      }
    }

    // TEXTAREA INPUT STYLE

    var TextareaInput = function(cm) {
      this.cm = cm;
      // See input.poll and input.reset
      this.prevInput = "";

      // Flag that indicates whether we expect input to appear real soon
      // now (after some event like 'keypress' or 'input') and are
      // polling intensively.
      this.pollingFast = false;
      // Self-resetting timeout for the poller
      this.polling = new Delayed();
      // Used to work around IE issue with selection being forgotten when focus moves away from textarea
      this.hasSelection = false;
      this.composing = null;
    };

    TextareaInput.prototype.init = function (display) {
        var this$1 = this;

      var input = this, cm = this.cm;
      this.createField(display);
      var te = this.textarea;

      display.wrapper.insertBefore(this.wrapper, display.wrapper.firstChild);

      // Needed to hide big blue blinking cursor on Mobile Safari (doesn't seem to work in iOS 8 anymore)
      if (ios) { te.style.width = "0px"; }

      on(te, "input", function () {
        if (ie && ie_version >= 9 && this$1.hasSelection) { this$1.hasSelection = null; }
        input.poll();
      });

      on(te, "paste", function (e) {
        if (signalDOMEvent(cm, e) || handlePaste(e, cm)) { return }

        cm.state.pasteIncoming = +new Date;
        input.fastPoll();
      });

      function prepareCopyCut(e) {
        if (signalDOMEvent(cm, e)) { return }
        if (cm.somethingSelected()) {
          setLastCopied({lineWise: false, text: cm.getSelections()});
        } else if (!cm.options.lineWiseCopyCut) {
          return
        } else {
          var ranges = copyableRanges(cm);
          setLastCopied({lineWise: true, text: ranges.text});
          if (e.type == "cut") {
            cm.setSelections(ranges.ranges, null, sel_dontScroll);
          } else {
            input.prevInput = "";
            te.value = ranges.text.join("\n");
            selectInput(te);
          }
        }
        if (e.type == "cut") { cm.state.cutIncoming = +new Date; }
      }
      on(te, "cut", prepareCopyCut);
      on(te, "copy", prepareCopyCut);

      on(display.scroller, "paste", function (e) {
        if (eventInWidget(display, e) || signalDOMEvent(cm, e)) { return }
        if (!te.dispatchEvent) {
          cm.state.pasteIncoming = +new Date;
          input.focus();
          return
        }

        // Pass the `paste` event to the textarea so it's handled by its event listener.
        var event = new Event("paste");
        event.clipboardData = e.clipboardData;
        te.dispatchEvent(event);
      });

      // Prevent normal selection in the editor (we handle our own)
      on(display.lineSpace, "selectstart", function (e) {
        if (!eventInWidget(display, e)) { e_preventDefault(e); }
      });

      on(te, "compositionstart", function () {
        var start = cm.getCursor("from");
        if (input.composing) { input.composing.range.clear(); }
        input.composing = {
          start: start,
          range: cm.markText(start, cm.getCursor("to"), {className: "CodeMirror-composing"})
        };
      });
      on(te, "compositionend", function () {
        if (input.composing) {
          input.poll();
          input.composing.range.clear();
          input.composing = null;
        }
      });
    };

    TextareaInput.prototype.createField = function (_display) {
      // Wraps and hides input textarea
      this.wrapper = hiddenTextarea();
      // The semihidden textarea that is focused when the editor is
      // focused, and receives input.
      this.textarea = this.wrapper.firstChild;
    };

    TextareaInput.prototype.screenReaderLabelChanged = function (label) {
      // Label for screenreaders, accessibility
      if(label) {
        this.textarea.setAttribute('aria-label', label);
      } else {
        this.textarea.removeAttribute('aria-label');
      }
    };

    TextareaInput.prototype.prepareSelection = function () {
      // Redraw the selection and/or cursor
      var cm = this.cm, display = cm.display, doc = cm.doc;
      var result = prepareSelection(cm);

      // Move the hidden textarea near the cursor to prevent scrolling artifacts
      if (cm.options.moveInputWithCursor) {
        var headPos = cursorCoords(cm, doc.sel.primary().head, "div");
        var wrapOff = display.wrapper.getBoundingClientRect(), lineOff = display.lineDiv.getBoundingClientRect();
        result.teTop = Math.max(0, Math.min(display.wrapper.clientHeight - 10,
                                            headPos.top + lineOff.top - wrapOff.top));
        result.teLeft = Math.max(0, Math.min(display.wrapper.clientWidth - 10,
                                             headPos.left + lineOff.left - wrapOff.left));
      }

      return result
    };

    TextareaInput.prototype.showSelection = function (drawn) {
      var cm = this.cm, display = cm.display;
      removeChildrenAndAdd(display.cursorDiv, drawn.cursors);
      removeChildrenAndAdd(display.selectionDiv, drawn.selection);
      if (drawn.teTop != null) {
        this.wrapper.style.top = drawn.teTop + "px";
        this.wrapper.style.left = drawn.teLeft + "px";
      }
    };

    // Reset the input to correspond to the selection (or to be empty,
    // when not typing and nothing is selected)
    TextareaInput.prototype.reset = function (typing) {
      if (this.contextMenuPending || this.composing) { return }
      var cm = this.cm;
      if (cm.somethingSelected()) {
        this.prevInput = "";
        var content = cm.getSelection();
        this.textarea.value = content;
        if (cm.state.focused) { selectInput(this.textarea); }
        if (ie && ie_version >= 9) { this.hasSelection = content; }
      } else if (!typing) {
        this.prevInput = this.textarea.value = "";
        if (ie && ie_version >= 9) { this.hasSelection = null; }
      }
    };

    TextareaInput.prototype.getField = function () { return this.textarea };

    TextareaInput.prototype.supportsTouch = function () { return false };

    TextareaInput.prototype.focus = function () {
      if (this.cm.options.readOnly != "nocursor" && (!mobile || activeElt() != this.textarea)) {
        try { this.textarea.focus(); }
        catch (e) {} // IE8 will throw if the textarea is display: none or not in DOM
      }
    };

    TextareaInput.prototype.blur = function () { this.textarea.blur(); };

    TextareaInput.prototype.resetPosition = function () {
      this.wrapper.style.top = this.wrapper.style.left = 0;
    };

    TextareaInput.prototype.receivedFocus = function () { this.slowPoll(); };

    // Poll for input changes, using the normal rate of polling. This
    // runs as long as the editor is focused.
    TextareaInput.prototype.slowPoll = function () {
        var this$1 = this;

      if (this.pollingFast) { return }
      this.polling.set(this.cm.options.pollInterval, function () {
        this$1.poll();
        if (this$1.cm.state.focused) { this$1.slowPoll(); }
      });
    };

    // When an event has just come in that is likely to add or change
    // something in the input textarea, we poll faster, to ensure that
    // the change appears on the screen quickly.
    TextareaInput.prototype.fastPoll = function () {
      var missed = false, input = this;
      input.pollingFast = true;
      function p() {
        var changed = input.poll();
        if (!changed && !missed) {missed = true; input.polling.set(60, p);}
        else {input.pollingFast = false; input.slowPoll();}
      }
      input.polling.set(20, p);
    };

    // Read input from the textarea, and update the document to match.
    // When something is selected, it is present in the textarea, and
    // selected (unless it is huge, in which case a placeholder is
    // used). When nothing is selected, the cursor sits after previously
    // seen text (can be empty), which is stored in prevInput (we must
    // not reset the textarea when typing, because that breaks IME).
    TextareaInput.prototype.poll = function () {
        var this$1 = this;

      var cm = this.cm, input = this.textarea, prevInput = this.prevInput;
      // Since this is called a *lot*, try to bail out as cheaply as
      // possible when it is clear that nothing happened. hasSelection
      // will be the case when there is a lot of text in the textarea,
      // in which case reading its value would be expensive.
      if (this.contextMenuPending || !cm.state.focused ||
          (hasSelection(input) && !prevInput && !this.composing) ||
          cm.isReadOnly() || cm.options.disableInput || cm.state.keySeq)
        { return false }

      var text = input.value;
      // If nothing changed, bail.
      if (text == prevInput && !cm.somethingSelected()) { return false }
      // Work around nonsensical selection resetting in IE9/10, and
      // inexplicable appearance of private area unicode characters on
      // some key combos in Mac (#2689).
      if (ie && ie_version >= 9 && this.hasSelection === text ||
          mac && /[\uf700-\uf7ff]/.test(text)) {
        cm.display.input.reset();
        return false
      }

      if (cm.doc.sel == cm.display.selForContextMenu) {
        var first = text.charCodeAt(0);
        if (first == 0x200b && !prevInput) { prevInput = "\u200b"; }
        if (first == 0x21da) { this.reset(); return this.cm.execCommand("undo") }
      }
      // Find the part of the input that is actually new
      var same = 0, l = Math.min(prevInput.length, text.length);
      while (same < l && prevInput.charCodeAt(same) == text.charCodeAt(same)) { ++same; }

      runInOp(cm, function () {
        applyTextInput(cm, text.slice(same), prevInput.length - same,
                       null, this$1.composing ? "*compose" : null);

        // Don't leave long text in the textarea, since it makes further polling slow
        if (text.length > 1000 || text.indexOf("\n") > -1) { input.value = this$1.prevInput = ""; }
        else { this$1.prevInput = text; }

        if (this$1.composing) {
          this$1.composing.range.clear();
          this$1.composing.range = cm.markText(this$1.composing.start, cm.getCursor("to"),
                                             {className: "CodeMirror-composing"});
        }
      });
      return true
    };

    TextareaInput.prototype.ensurePolled = function () {
      if (this.pollingFast && this.poll()) { this.pollingFast = false; }
    };

    TextareaInput.prototype.onKeyPress = function () {
      if (ie && ie_version >= 9) { this.hasSelection = null; }
      this.fastPoll();
    };

    TextareaInput.prototype.onContextMenu = function (e) {
      var input = this, cm = input.cm, display = cm.display, te = input.textarea;
      if (input.contextMenuPending) { input.contextMenuPending(); }
      var pos = posFromMouse(cm, e), scrollPos = display.scroller.scrollTop;
      if (!pos || presto) { return } // Opera is difficult.

      // Reset the current text selection only if the click is done outside of the selection
      // and 'resetSelectionOnContextMenu' option is true.
      var reset = cm.options.resetSelectionOnContextMenu;
      if (reset && cm.doc.sel.contains(pos) == -1)
        { operation(cm, setSelection)(cm.doc, simpleSelection(pos), sel_dontScroll); }

      var oldCSS = te.style.cssText, oldWrapperCSS = input.wrapper.style.cssText;
      var wrapperBox = input.wrapper.offsetParent.getBoundingClientRect();
      input.wrapper.style.cssText = "position: static";
      te.style.cssText = "position: absolute; width: 30px; height: 30px;\n      top: " + (e.clientY - wrapperBox.top - 5) + "px; left: " + (e.clientX - wrapperBox.left - 5) + "px;\n      z-index: 1000; background: " + (ie ? "rgba(255, 255, 255, .05)" : "transparent") + ";\n      outline: none; border-width: 0; outline: none; overflow: hidden; opacity: .05; filter: alpha(opacity=5);";
      var oldScrollY;
      if (webkit) { oldScrollY = window.scrollY; } // Work around Chrome issue (#2712)
      display.input.focus();
      if (webkit) { window.scrollTo(null, oldScrollY); }
      display.input.reset();
      // Adds "Select all" to context menu in FF
      if (!cm.somethingSelected()) { te.value = input.prevInput = " "; }
      input.contextMenuPending = rehide;
      display.selForContextMenu = cm.doc.sel;
      clearTimeout(display.detectingSelectAll);

      // Select-all will be greyed out if there's nothing to select, so
      // this adds a zero-width space so that we can later check whether
      // it got selected.
      function prepareSelectAllHack() {
        if (te.selectionStart != null) {
          var selected = cm.somethingSelected();
          var extval = "\u200b" + (selected ? te.value : "");
          te.value = "\u21da"; // Used to catch context-menu undo
          te.value = extval;
          input.prevInput = selected ? "" : "\u200b";
          te.selectionStart = 1; te.selectionEnd = extval.length;
          // Re-set this, in case some other handler touched the
          // selection in the meantime.
          display.selForContextMenu = cm.doc.sel;
        }
      }
      function rehide() {
        if (input.contextMenuPending != rehide) { return }
        input.contextMenuPending = false;
        input.wrapper.style.cssText = oldWrapperCSS;
        te.style.cssText = oldCSS;
        if (ie && ie_version < 9) { display.scrollbars.setScrollTop(display.scroller.scrollTop = scrollPos); }

        // Try to detect the user choosing select-all
        if (te.selectionStart != null) {
          if (!ie || (ie && ie_version < 9)) { prepareSelectAllHack(); }
          var i = 0, poll = function () {
            if (display.selForContextMenu == cm.doc.sel && te.selectionStart == 0 &&
                te.selectionEnd > 0 && input.prevInput == "\u200b") {
              operation(cm, selectAll)(cm);
            } else if (i++ < 10) {
              display.detectingSelectAll = setTimeout(poll, 500);
            } else {
              display.selForContextMenu = null;
              display.input.reset();
            }
          };
          display.detectingSelectAll = setTimeout(poll, 200);
        }
      }

      if (ie && ie_version >= 9) { prepareSelectAllHack(); }
      if (captureRightClick) {
        e_stop(e);
        var mouseup = function () {
          off(window, "mouseup", mouseup);
          setTimeout(rehide, 20);
        };
        on(window, "mouseup", mouseup);
      } else {
        setTimeout(rehide, 50);
      }
    };

    TextareaInput.prototype.readOnlyChanged = function (val) {
      if (!val) { this.reset(); }
      this.textarea.disabled = val == "nocursor";
      this.textarea.readOnly = !!val;
    };

    TextareaInput.prototype.setUneditable = function () {};

    TextareaInput.prototype.needsContentAttribute = false;

    function fromTextArea(textarea, options) {
      options = options ? copyObj(options) : {};
      options.value = textarea.value;
      if (!options.tabindex && textarea.tabIndex)
        { options.tabindex = textarea.tabIndex; }
      if (!options.placeholder && textarea.placeholder)
        { options.placeholder = textarea.placeholder; }
      // Set autofocus to true if this textarea is focused, or if it has
      // autofocus and no other element is focused.
      if (options.autofocus == null) {
        var hasFocus = activeElt();
        options.autofocus = hasFocus == textarea ||
          textarea.getAttribute("autofocus") != null && hasFocus == document.body;
      }

      function save() {textarea.value = cm.getValue();}

      var realSubmit;
      if (textarea.form) {
        on(textarea.form, "submit", save);
        // Deplorable hack to make the submit method do the right thing.
        if (!options.leaveSubmitMethodAlone) {
          var form = textarea.form;
          realSubmit = form.submit;
          try {
            var wrappedSubmit = form.submit = function () {
              save();
              form.submit = realSubmit;
              form.submit();
              form.submit = wrappedSubmit;
            };
          } catch(e) {}
        }
      }

      options.finishInit = function (cm) {
        cm.save = save;
        cm.getTextArea = function () { return textarea; };
        cm.toTextArea = function () {
          cm.toTextArea = isNaN; // Prevent this from being ran twice
          save();
          textarea.parentNode.removeChild(cm.getWrapperElement());
          textarea.style.display = "";
          if (textarea.form) {
            off(textarea.form, "submit", save);
            if (!options.leaveSubmitMethodAlone && typeof textarea.form.submit == "function")
              { textarea.form.submit = realSubmit; }
          }
        };
      };

      textarea.style.display = "none";
      var cm = CodeMirror(function (node) { return textarea.parentNode.insertBefore(node, textarea.nextSibling); },
        options);
      return cm
    }

    function addLegacyProps(CodeMirror) {
      CodeMirror.off = off;
      CodeMirror.on = on;
      CodeMirror.wheelEventPixels = wheelEventPixels;
      CodeMirror.Doc = Doc;
      CodeMirror.splitLines = splitLinesAuto;
      CodeMirror.countColumn = countColumn;
      CodeMirror.findColumn = findColumn;
      CodeMirror.isWordChar = isWordCharBasic;
      CodeMirror.Pass = Pass;
      CodeMirror.signal = signal;
      CodeMirror.Line = Line;
      CodeMirror.changeEnd = changeEnd;
      CodeMirror.scrollbarModel = scrollbarModel;
      CodeMirror.Pos = Pos;
      CodeMirror.cmpPos = cmp;
      CodeMirror.modes = modes;
      CodeMirror.mimeModes = mimeModes;
      CodeMirror.resolveMode = resolveMode;
      CodeMirror.getMode = getMode;
      CodeMirror.modeExtensions = modeExtensions;
      CodeMirror.extendMode = extendMode;
      CodeMirror.copyState = copyState;
      CodeMirror.startState = startState;
      CodeMirror.innerMode = innerMode;
      CodeMirror.commands = commands;
      CodeMirror.keyMap = keyMap;
      CodeMirror.keyName = keyName;
      CodeMirror.isModifierKey = isModifierKey;
      CodeMirror.lookupKey = lookupKey;
      CodeMirror.normalizeKeyMap = normalizeKeyMap;
      CodeMirror.StringStream = StringStream;
      CodeMirror.SharedTextMarker = SharedTextMarker;
      CodeMirror.TextMarker = TextMarker;
      CodeMirror.LineWidget = LineWidget;
      CodeMirror.e_preventDefault = e_preventDefault;
      CodeMirror.e_stopPropagation = e_stopPropagation;
      CodeMirror.e_stop = e_stop;
      CodeMirror.addClass = addClass;
      CodeMirror.contains = contains;
      CodeMirror.rmClass = rmClass;
      CodeMirror.keyNames = keyNames;
    }

    // EDITOR CONSTRUCTOR

    defineOptions(CodeMirror);

    addEditorMethods(CodeMirror);

    // Set up methods on CodeMirror's prototype to redirect to the editor's document.
    var dontDelegate = "iter insert remove copy getEditor constructor".split(" ");
    for (var prop in Doc.prototype) { if (Doc.prototype.hasOwnProperty(prop) && indexOf(dontDelegate, prop) < 0)
      { CodeMirror.prototype[prop] = (function(method) {
        return function() {return method.apply(this.doc, arguments)}
      })(Doc.prototype[prop]); } }

    eventMixin(Doc);
    CodeMirror.inputStyles = {"textarea": TextareaInput, "contenteditable": ContentEditableInput};

    // Extra arguments are stored as the mode's dependencies, which is
    // used by (legacy) mechanisms like loadmode.js to automatically
    // load a mode. (Preferred mechanism is the require/define calls.)
    CodeMirror.defineMode = function(name/*, mode, …*/) {
      if (!CodeMirror.defaults.mode && name != "null") { CodeMirror.defaults.mode = name; }
      defineMode.apply(this, arguments);
    };

    CodeMirror.defineMIME = defineMIME;

    // Minimal default mode.
    CodeMirror.defineMode("null", function () { return ({token: function (stream) { return stream.skipToEnd(); }}); });
    CodeMirror.defineMIME("text/plain", "null");

    // EXTENSIONS

    CodeMirror.defineExtension = function (name, func) {
      CodeMirror.prototype[name] = func;
    };
    CodeMirror.defineDocExtension = function (name, func) {
      Doc.prototype[name] = func;
    };

    CodeMirror.fromTextArea = fromTextArea;

    addLegacyProps(CodeMirror);

    CodeMirror.version = "5.59.1";

    return CodeMirror;

  })));
  });

  var xml$1 = createCommonjsModule(function (module, exports) {
  // CodeMirror, copyright (c) by Marijn Haverbeke and others
  // Distributed under an MIT license: https://codemirror.net/LICENSE

  (function(mod) {
    mod(codemirror);
  })(function(CodeMirror) {

  var htmlConfig = {
    autoSelfClosers: {'area': true, 'base': true, 'br': true, 'col': true, 'command': true,
                      'embed': true, 'frame': true, 'hr': true, 'img': true, 'input': true,
                      'keygen': true, 'link': true, 'meta': true, 'param': true, 'source': true,
                      'track': true, 'wbr': true, 'menuitem': true},
    implicitlyClosed: {'dd': true, 'li': true, 'optgroup': true, 'option': true, 'p': true,
                       'rp': true, 'rt': true, 'tbody': true, 'td': true, 'tfoot': true,
                       'th': true, 'tr': true},
    contextGrabbers: {
      'dd': {'dd': true, 'dt': true},
      'dt': {'dd': true, 'dt': true},
      'li': {'li': true},
      'option': {'option': true, 'optgroup': true},
      'optgroup': {'optgroup': true},
      'p': {'address': true, 'article': true, 'aside': true, 'blockquote': true, 'dir': true,
            'div': true, 'dl': true, 'fieldset': true, 'footer': true, 'form': true,
            'h1': true, 'h2': true, 'h3': true, 'h4': true, 'h5': true, 'h6': true,
            'header': true, 'hgroup': true, 'hr': true, 'menu': true, 'nav': true, 'ol': true,
            'p': true, 'pre': true, 'section': true, 'table': true, 'ul': true},
      'rp': {'rp': true, 'rt': true},
      'rt': {'rp': true, 'rt': true},
      'tbody': {'tbody': true, 'tfoot': true},
      'td': {'td': true, 'th': true},
      'tfoot': {'tbody': true},
      'th': {'td': true, 'th': true},
      'thead': {'tbody': true, 'tfoot': true},
      'tr': {'tr': true}
    },
    doNotIndent: {"pre": true},
    allowUnquoted: true,
    allowMissing: true,
    caseFold: true
  };

  var xmlConfig = {
    autoSelfClosers: {},
    implicitlyClosed: {},
    contextGrabbers: {},
    doNotIndent: {},
    allowUnquoted: false,
    allowMissing: false,
    allowMissingTagName: false,
    caseFold: false
  };

  CodeMirror.defineMode("xml", function(editorConf, config_) {
    var indentUnit = editorConf.indentUnit;
    var config = {};
    var defaults = config_.htmlMode ? htmlConfig : xmlConfig;
    for (var prop in defaults) config[prop] = defaults[prop];
    for (var prop in config_) config[prop] = config_[prop];

    // Return variables for tokenizers
    var type, setStyle;

    function inText(stream, state) {
      function chain(parser) {
        state.tokenize = parser;
        return parser(stream, state);
      }

      var ch = stream.next();
      if (ch == "<") {
        if (stream.eat("!")) {
          if (stream.eat("[")) {
            if (stream.match("CDATA[")) return chain(inBlock("atom", "]]>"));
            else return null;
          } else if (stream.match("--")) {
            return chain(inBlock("comment", "-->"));
          } else if (stream.match("DOCTYPE", true, true)) {
            stream.eatWhile(/[\w\._\-]/);
            return chain(doctype(1));
          } else {
            return null;
          }
        } else if (stream.eat("?")) {
          stream.eatWhile(/[\w\._\-]/);
          state.tokenize = inBlock("meta", "?>");
          return "meta";
        } else {
          type = stream.eat("/") ? "closeTag" : "openTag";
          state.tokenize = inTag;
          return "tag bracket";
        }
      } else if (ch == "&") {
        var ok;
        if (stream.eat("#")) {
          if (stream.eat("x")) {
            ok = stream.eatWhile(/[a-fA-F\d]/) && stream.eat(";");
          } else {
            ok = stream.eatWhile(/[\d]/) && stream.eat(";");
          }
        } else {
          ok = stream.eatWhile(/[\w\.\-:]/) && stream.eat(";");
        }
        return ok ? "atom" : "error";
      } else {
        stream.eatWhile(/[^&<]/);
        return null;
      }
    }
    inText.isInText = true;

    function inTag(stream, state) {
      var ch = stream.next();
      if (ch == ">" || (ch == "/" && stream.eat(">"))) {
        state.tokenize = inText;
        type = ch == ">" ? "endTag" : "selfcloseTag";
        return "tag bracket";
      } else if (ch == "=") {
        type = "equals";
        return null;
      } else if (ch == "<") {
        state.tokenize = inText;
        state.state = baseState;
        state.tagName = state.tagStart = null;
        var next = state.tokenize(stream, state);
        return next ? next + " tag error" : "tag error";
      } else if (/[\'\"]/.test(ch)) {
        state.tokenize = inAttribute(ch);
        state.stringStartCol = stream.column();
        return state.tokenize(stream, state);
      } else {
        stream.match(/^[^\s\u00a0=<>\"\']*[^\s\u00a0=<>\"\'\/]/);
        return "word";
      }
    }

    function inAttribute(quote) {
      var closure = function(stream, state) {
        while (!stream.eol()) {
          if (stream.next() == quote) {
            state.tokenize = inTag;
            break;
          }
        }
        return "string";
      };
      closure.isInAttribute = true;
      return closure;
    }

    function inBlock(style, terminator) {
      return function(stream, state) {
        while (!stream.eol()) {
          if (stream.match(terminator)) {
            state.tokenize = inText;
            break;
          }
          stream.next();
        }
        return style;
      }
    }

    function doctype(depth) {
      return function(stream, state) {
        var ch;
        while ((ch = stream.next()) != null) {
          if (ch == "<") {
            state.tokenize = doctype(depth + 1);
            return state.tokenize(stream, state);
          } else if (ch == ">") {
            if (depth == 1) {
              state.tokenize = inText;
              break;
            } else {
              state.tokenize = doctype(depth - 1);
              return state.tokenize(stream, state);
            }
          }
        }
        return "meta";
      };
    }

    function Context(state, tagName, startOfLine) {
      this.prev = state.context;
      this.tagName = tagName || "";
      this.indent = state.indented;
      this.startOfLine = startOfLine;
      if (config.doNotIndent.hasOwnProperty(tagName) || (state.context && state.context.noIndent))
        this.noIndent = true;
    }
    function popContext(state) {
      if (state.context) state.context = state.context.prev;
    }
    function maybePopContext(state, nextTagName) {
      var parentTagName;
      while (true) {
        if (!state.context) {
          return;
        }
        parentTagName = state.context.tagName;
        if (!config.contextGrabbers.hasOwnProperty(parentTagName) ||
            !config.contextGrabbers[parentTagName].hasOwnProperty(nextTagName)) {
          return;
        }
        popContext(state);
      }
    }

    function baseState(type, stream, state) {
      if (type == "openTag") {
        state.tagStart = stream.column();
        return tagNameState;
      } else if (type == "closeTag") {
        return closeTagNameState;
      } else {
        return baseState;
      }
    }
    function tagNameState(type, stream, state) {
      if (type == "word") {
        state.tagName = stream.current();
        setStyle = "tag";
        return attrState;
      } else if (config.allowMissingTagName && type == "endTag") {
        setStyle = "tag bracket";
        return attrState(type, stream, state);
      } else {
        setStyle = "error";
        return tagNameState;
      }
    }
    function closeTagNameState(type, stream, state) {
      if (type == "word") {
        var tagName = stream.current();
        if (state.context && state.context.tagName != tagName &&
            config.implicitlyClosed.hasOwnProperty(state.context.tagName))
          popContext(state);
        if ((state.context && state.context.tagName == tagName) || config.matchClosing === false) {
          setStyle = "tag";
          return closeState;
        } else {
          setStyle = "tag error";
          return closeStateErr;
        }
      } else if (config.allowMissingTagName && type == "endTag") {
        setStyle = "tag bracket";
        return closeState(type, stream, state);
      } else {
        setStyle = "error";
        return closeStateErr;
      }
    }

    function closeState(type, _stream, state) {
      if (type != "endTag") {
        setStyle = "error";
        return closeState;
      }
      popContext(state);
      return baseState;
    }
    function closeStateErr(type, stream, state) {
      setStyle = "error";
      return closeState(type, stream, state);
    }

    function attrState(type, _stream, state) {
      if (type == "word") {
        setStyle = "attribute";
        return attrEqState;
      } else if (type == "endTag" || type == "selfcloseTag") {
        var tagName = state.tagName, tagStart = state.tagStart;
        state.tagName = state.tagStart = null;
        if (type == "selfcloseTag" ||
            config.autoSelfClosers.hasOwnProperty(tagName)) {
          maybePopContext(state, tagName);
        } else {
          maybePopContext(state, tagName);
          state.context = new Context(state, tagName, tagStart == state.indented);
        }
        return baseState;
      }
      setStyle = "error";
      return attrState;
    }
    function attrEqState(type, stream, state) {
      if (type == "equals") return attrValueState;
      if (!config.allowMissing) setStyle = "error";
      return attrState(type, stream, state);
    }
    function attrValueState(type, stream, state) {
      if (type == "string") return attrContinuedState;
      if (type == "word" && config.allowUnquoted) {setStyle = "string"; return attrState;}
      setStyle = "error";
      return attrState(type, stream, state);
    }
    function attrContinuedState(type, stream, state) {
      if (type == "string") return attrContinuedState;
      return attrState(type, stream, state);
    }

    return {
      startState: function(baseIndent) {
        var state = {tokenize: inText,
                     state: baseState,
                     indented: baseIndent || 0,
                     tagName: null, tagStart: null,
                     context: null};
        if (baseIndent != null) state.baseIndent = baseIndent;
        return state
      },

      token: function(stream, state) {
        if (!state.tagName && stream.sol())
          state.indented = stream.indentation();

        if (stream.eatSpace()) return null;
        type = null;
        var style = state.tokenize(stream, state);
        if ((style || type) && style != "comment") {
          setStyle = null;
          state.state = state.state(type || style, stream, state);
          if (setStyle)
            style = setStyle == "error" ? style + " error" : setStyle;
        }
        return style;
      },

      indent: function(state, textAfter, fullLine) {
        var context = state.context;
        // Indent multi-line strings (e.g. css).
        if (state.tokenize.isInAttribute) {
          if (state.tagStart == state.indented)
            return state.stringStartCol + 1;
          else
            return state.indented + indentUnit;
        }
        if (context && context.noIndent) return CodeMirror.Pass;
        if (state.tokenize != inTag && state.tokenize != inText)
          return fullLine ? fullLine.match(/^(\s*)/)[0].length : 0;
        // Indent the starts of attribute names.
        if (state.tagName) {
          if (config.multilineTagIndentPastTag !== false)
            return state.tagStart + state.tagName.length + 2;
          else
            return state.tagStart + indentUnit * (config.multilineTagIndentFactor || 1);
        }
        if (config.alignCDATA && /<!\[CDATA\[/.test(textAfter)) return 0;
        var tagAfter = textAfter && /^<(\/)?([\w_:\.-]*)/.exec(textAfter);
        if (tagAfter && tagAfter[1]) { // Closing tag spotted
          while (context) {
            if (context.tagName == tagAfter[2]) {
              context = context.prev;
              break;
            } else if (config.implicitlyClosed.hasOwnProperty(context.tagName)) {
              context = context.prev;
            } else {
              break;
            }
          }
        } else if (tagAfter) { // Opening tag spotted
          while (context) {
            var grabbers = config.contextGrabbers[context.tagName];
            if (grabbers && grabbers.hasOwnProperty(tagAfter[2]))
              context = context.prev;
            else
              break;
          }
        }
        while (context && context.prev && !context.startOfLine)
          context = context.prev;
        if (context) return context.indent + indentUnit;
        else return state.baseIndent || 0;
      },

      electricInput: /<\/[\s\w:]+>$/,
      blockCommentStart: "<!--",
      blockCommentEnd: "-->",

      configuration: config.htmlMode ? "html" : "xml",
      helperType: config.htmlMode ? "html" : "xml",

      skipAttribute: function(state) {
        if (state.state == attrValueState)
          state.state = attrState;
      },

      xmlCurrentTag: function(state) {
        return state.tagName ? {name: state.tagName, close: state.type == "closeTag"} : null
      },

      xmlCurrentContext: function(state) {
        var context = [];
        for (var cx = state.context; cx; cx = cx.prev)
          context.push(cx.tagName);
        return context.reverse()
      }
    };
  });

  CodeMirror.defineMIME("text/xml", "xml");
  CodeMirror.defineMIME("application/xml", "xml");
  if (!CodeMirror.mimeModes.hasOwnProperty("text/html"))
    CodeMirror.defineMIME("text/html", {name: "xml", htmlMode: true});

  });
  });

  var showHint = createCommonjsModule(function (module, exports) {
  // CodeMirror, copyright (c) by Marijn Haverbeke and others
  // Distributed under an MIT license: https://codemirror.net/LICENSE

  // declare global: DOMRect

  (function(mod) {
    mod(codemirror);
  })(function(CodeMirror) {

    var HINT_ELEMENT_CLASS        = "CodeMirror-hint";
    var ACTIVE_HINT_ELEMENT_CLASS = "CodeMirror-hint-active";

    // This is the old interface, kept around for now to stay
    // backwards-compatible.
    CodeMirror.showHint = function(cm, getHints, options) {
      if (!getHints) return cm.showHint(options);
      if (options && options.async) getHints.async = true;
      var newOpts = {hint: getHints};
      if (options) for (var prop in options) newOpts[prop] = options[prop];
      return cm.showHint(newOpts);
    };

    CodeMirror.defineExtension("showHint", function(options) {
      options = parseOptions(this, this.getCursor("start"), options);
      var selections = this.listSelections();
      if (selections.length > 1) return;
      // By default, don't allow completion when something is selected.
      // A hint function can have a `supportsSelection` property to
      // indicate that it can handle selections.
      if (this.somethingSelected()) {
        if (!options.hint.supportsSelection) return;
        // Don't try with cross-line selections
        for (var i = 0; i < selections.length; i++)
          if (selections[i].head.line != selections[i].anchor.line) return;
      }

      if (this.state.completionActive) this.state.completionActive.close();
      var completion = this.state.completionActive = new Completion(this, options);
      if (!completion.options.hint) return;

      CodeMirror.signal(this, "startCompletion", this);
      completion.update(true);
    });

    CodeMirror.defineExtension("closeHint", function() {
      if (this.state.completionActive) this.state.completionActive.close();
    });

    function Completion(cm, options) {
      this.cm = cm;
      this.options = options;
      this.widget = null;
      this.debounce = 0;
      this.tick = 0;
      this.startPos = this.cm.getCursor("start");
      this.startLen = this.cm.getLine(this.startPos.line).length - this.cm.getSelection().length;

      var self = this;
      cm.on("cursorActivity", this.activityFunc = function() { self.cursorActivity(); });
    }

    var requestAnimationFrame = window.requestAnimationFrame || function(fn) {
      return setTimeout(fn, 1000/60);
    };
    var cancelAnimationFrame = window.cancelAnimationFrame || clearTimeout;

    Completion.prototype = {
      close: function() {
        if (!this.active()) return;
        this.cm.state.completionActive = null;
        this.tick = null;
        this.cm.off("cursorActivity", this.activityFunc);

        if (this.widget && this.data) CodeMirror.signal(this.data, "close");
        if (this.widget) this.widget.close();
        CodeMirror.signal(this.cm, "endCompletion", this.cm);
      },

      active: function() {
        return this.cm.state.completionActive == this;
      },

      pick: function(data, i) {
        var completion = data.list[i], self = this;
        this.cm.operation(function() {
          if (completion.hint)
            completion.hint(self.cm, data, completion);
          else
            self.cm.replaceRange(getText(completion), completion.from || data.from,
                                 completion.to || data.to, "complete");
          CodeMirror.signal(data, "pick", completion);
          self.cm.scrollIntoView();
        });
        if (this.options.closeOnPick) {
          this.close();
        }
      },

      cursorActivity: function() {
        if (this.debounce) {
          cancelAnimationFrame(this.debounce);
          this.debounce = 0;
        }

        var identStart = this.startPos;
        if(this.data) {
          identStart = this.data.from;
        }

        var pos = this.cm.getCursor(), line = this.cm.getLine(pos.line);
        if (pos.line != this.startPos.line || line.length - pos.ch != this.startLen - this.startPos.ch ||
            pos.ch < identStart.ch || this.cm.somethingSelected() ||
            (!pos.ch || this.options.closeCharacters.test(line.charAt(pos.ch - 1)))) {
          if (this.options.closeOnCursorActivity) {
            this.close();
          }
        } else {
          var self = this;
          this.debounce = requestAnimationFrame(function() {self.update();});
          if (this.widget) this.widget.disable();
        }
      },

      update: function(first) {
        if (this.tick == null) return
        var self = this, myTick = ++this.tick;
        fetchHints(this.options.hint, this.cm, this.options, function(data) {
          if (self.tick == myTick) self.finishUpdate(data, first);
        });
      },

      finishUpdate: function(data, first) {
        if (this.data) CodeMirror.signal(this.data, "update");

        var picked = (this.widget && this.widget.picked) || (first && this.options.completeSingle);
        if (this.widget) this.widget.close();

        this.data = data;

        if (data && data.list.length) {
          if (picked && data.list.length == 1) {
            this.pick(data, 0);
          } else {
            this.widget = new Widget(this, data);
            CodeMirror.signal(data, "shown");
          }
        }
      }
    };

    function parseOptions(cm, pos, options) {
      var editor = cm.options.hintOptions;
      var out = {};
      for (var prop in defaultOptions) out[prop] = defaultOptions[prop];
      if (editor) for (var prop in editor)
        if (editor[prop] !== undefined) out[prop] = editor[prop];
      if (options) for (var prop in options)
        if (options[prop] !== undefined) out[prop] = options[prop];
      if (out.hint.resolve) out.hint = out.hint.resolve(cm, pos);
      return out;
    }

    function getText(completion) {
      if (typeof completion == "string") return completion;
      else return completion.text;
    }

    function buildKeyMap(completion, handle) {
      var baseMap = {
        Up: function() {handle.moveFocus(-1);},
        Down: function() {handle.moveFocus(1);},
        PageUp: function() {handle.moveFocus(-handle.menuSize() + 1, true);},
        PageDown: function() {handle.moveFocus(handle.menuSize() - 1, true);},
        Home: function() {handle.setFocus(0);},
        End: function() {handle.setFocus(handle.length - 1);},
        Enter: handle.pick,
        Tab: handle.pick,
        Esc: handle.close
      };

      var mac = /Mac/.test(navigator.platform);

      if (mac) {
        baseMap["Ctrl-P"] = function() {handle.moveFocus(-1);};
        baseMap["Ctrl-N"] = function() {handle.moveFocus(1);};
      }

      var custom = completion.options.customKeys;
      var ourMap = custom ? {} : baseMap;
      function addBinding(key, val) {
        var bound;
        if (typeof val != "string")
          bound = function(cm) { return val(cm, handle); };
        // This mechanism is deprecated
        else if (baseMap.hasOwnProperty(val))
          bound = baseMap[val];
        else
          bound = val;
        ourMap[key] = bound;
      }
      if (custom)
        for (var key in custom) if (custom.hasOwnProperty(key))
          addBinding(key, custom[key]);
      var extra = completion.options.extraKeys;
      if (extra)
        for (var key in extra) if (extra.hasOwnProperty(key))
          addBinding(key, extra[key]);
      return ourMap;
    }

    function getHintElement(hintsElement, el) {
      while (el && el != hintsElement) {
        if (el.nodeName.toUpperCase() === "LI" && el.parentNode == hintsElement) return el;
        el = el.parentNode;
      }
    }

    function Widget(completion, data) {
      this.completion = completion;
      this.data = data;
      this.picked = false;
      var widget = this, cm = completion.cm;
      var ownerDocument = cm.getInputField().ownerDocument;
      var parentWindow = ownerDocument.defaultView || ownerDocument.parentWindow;

      var hints = this.hints = ownerDocument.createElement("ul");
      var theme = completion.cm.options.theme;
      hints.className = "CodeMirror-hints " + theme;
      this.selectedHint = data.selectedHint || 0;

      var completions = data.list;
      for (var i = 0; i < completions.length; ++i) {
        var elt = hints.appendChild(ownerDocument.createElement("li")), cur = completions[i];
        var className = HINT_ELEMENT_CLASS + (i != this.selectedHint ? "" : " " + ACTIVE_HINT_ELEMENT_CLASS);
        if (cur.className != null) className = cur.className + " " + className;
        elt.className = className;
        if (cur.render) cur.render(elt, data, cur);
        else elt.appendChild(ownerDocument.createTextNode(cur.displayText || getText(cur)));
        elt.hintId = i;
      }

      var container = completion.options.container || ownerDocument.body;
      var pos = cm.cursorCoords(completion.options.alignWithWord ? data.from : null);
      var left = pos.left, top = pos.bottom, below = true;
      var offsetLeft = 0, offsetTop = 0;
      if (container !== ownerDocument.body) {
        // We offset the cursor position because left and top are relative to the offsetParent's top left corner.
        var isContainerPositioned = ['absolute', 'relative', 'fixed'].indexOf(parentWindow.getComputedStyle(container).position) !== -1;
        var offsetParent = isContainerPositioned ? container : container.offsetParent;
        var offsetParentPosition = offsetParent.getBoundingClientRect();
        var bodyPosition = ownerDocument.body.getBoundingClientRect();
        offsetLeft = (offsetParentPosition.left - bodyPosition.left - offsetParent.scrollLeft);
        offsetTop = (offsetParentPosition.top - bodyPosition.top - offsetParent.scrollTop);
      }
      hints.style.left = (left - offsetLeft) + "px";
      hints.style.top = (top - offsetTop) + "px";

      // If we're at the edge of the screen, then we want the menu to appear on the left of the cursor.
      var winW = parentWindow.innerWidth || Math.max(ownerDocument.body.offsetWidth, ownerDocument.documentElement.offsetWidth);
      var winH = parentWindow.innerHeight || Math.max(ownerDocument.body.offsetHeight, ownerDocument.documentElement.offsetHeight);
      container.appendChild(hints);

      var box = completion.options.moveOnOverlap ? hints.getBoundingClientRect() : new DOMRect();
      var scrolls = completion.options.paddingForScrollbar ? hints.scrollHeight > hints.clientHeight + 1 : false;

      // Compute in the timeout to avoid reflow on init
      var startScroll;
      setTimeout(function() { startScroll = cm.getScrollInfo(); });

      var overlapY = box.bottom - winH;
      if (overlapY > 0) {
        var height = box.bottom - box.top, curTop = pos.top - (pos.bottom - box.top);
        if (curTop - height > 0) { // Fits above cursor
          hints.style.top = (top = pos.top - height - offsetTop) + "px";
          below = false;
        } else if (height > winH) {
          hints.style.height = (winH - 5) + "px";
          hints.style.top = (top = pos.bottom - box.top - offsetTop) + "px";
          var cursor = cm.getCursor();
          if (data.from.ch != cursor.ch) {
            pos = cm.cursorCoords(cursor);
            hints.style.left = (left = pos.left - offsetLeft) + "px";
            box = hints.getBoundingClientRect();
          }
        }
      }
      var overlapX = box.right - winW;
      if (overlapX > 0) {
        if (box.right - box.left > winW) {
          hints.style.width = (winW - 5) + "px";
          overlapX -= (box.right - box.left) - winW;
        }
        hints.style.left = (left = pos.left - overlapX - offsetLeft) + "px";
      }
      if (scrolls) for (var node = hints.firstChild; node; node = node.nextSibling)
        node.style.paddingRight = cm.display.nativeBarWidth + "px";

      cm.addKeyMap(this.keyMap = buildKeyMap(completion, {
        moveFocus: function(n, avoidWrap) { widget.changeActive(widget.selectedHint + n, avoidWrap); },
        setFocus: function(n) { widget.changeActive(n); },
        menuSize: function() { return widget.screenAmount(); },
        length: completions.length,
        close: function() { completion.close(); },
        pick: function() { widget.pick(); },
        data: data
      }));

      if (completion.options.closeOnUnfocus) {
        var closingOnBlur;
        cm.on("blur", this.onBlur = function() { closingOnBlur = setTimeout(function() { completion.close(); }, 100); });
        cm.on("focus", this.onFocus = function() { clearTimeout(closingOnBlur); });
      }

      cm.on("scroll", this.onScroll = function() {
        var curScroll = cm.getScrollInfo(), editor = cm.getWrapperElement().getBoundingClientRect();
        var newTop = top + startScroll.top - curScroll.top;
        var point = newTop - (parentWindow.pageYOffset || (ownerDocument.documentElement || ownerDocument.body).scrollTop);
        if (!below) point += hints.offsetHeight;
        if (point <= editor.top || point >= editor.bottom) return completion.close();
        hints.style.top = newTop + "px";
        hints.style.left = (left + startScroll.left - curScroll.left) + "px";
      });

      CodeMirror.on(hints, "dblclick", function(e) {
        var t = getHintElement(hints, e.target || e.srcElement);
        if (t && t.hintId != null) {widget.changeActive(t.hintId); widget.pick();}
      });

      CodeMirror.on(hints, "click", function(e) {
        var t = getHintElement(hints, e.target || e.srcElement);
        if (t && t.hintId != null) {
          widget.changeActive(t.hintId);
          if (completion.options.completeOnSingleClick) widget.pick();
        }
      });

      CodeMirror.on(hints, "mousedown", function() {
        setTimeout(function(){cm.focus();}, 20);
      });

      // The first hint doesn't need to be scrolled to on init
      var selectedHintRange = this.getSelectedHintRange();
      if (selectedHintRange.from !== 0 || selectedHintRange.to !== 0) {
        this.scrollToActive();
      }

      CodeMirror.signal(data, "select", completions[this.selectedHint], hints.childNodes[this.selectedHint]);
      return true;
    }

    Widget.prototype = {
      close: function() {
        if (this.completion.widget != this) return;
        this.completion.widget = null;
        this.hints.parentNode.removeChild(this.hints);
        this.completion.cm.removeKeyMap(this.keyMap);

        var cm = this.completion.cm;
        if (this.completion.options.closeOnUnfocus) {
          cm.off("blur", this.onBlur);
          cm.off("focus", this.onFocus);
        }
        cm.off("scroll", this.onScroll);
      },

      disable: function() {
        this.completion.cm.removeKeyMap(this.keyMap);
        var widget = this;
        this.keyMap = {Enter: function() { widget.picked = true; }};
        this.completion.cm.addKeyMap(this.keyMap);
      },

      pick: function() {
        this.completion.pick(this.data, this.selectedHint);
      },

      changeActive: function(i, avoidWrap) {
        if (i >= this.data.list.length)
          i = avoidWrap ? this.data.list.length - 1 : 0;
        else if (i < 0)
          i = avoidWrap ? 0  : this.data.list.length - 1;
        if (this.selectedHint == i) return;
        var node = this.hints.childNodes[this.selectedHint];
        if (node) node.className = node.className.replace(" " + ACTIVE_HINT_ELEMENT_CLASS, "");
        node = this.hints.childNodes[this.selectedHint = i];
        node.className += " " + ACTIVE_HINT_ELEMENT_CLASS;
        this.scrollToActive();
        CodeMirror.signal(this.data, "select", this.data.list[this.selectedHint], node);
      },

      scrollToActive: function() {
        var selectedHintRange = this.getSelectedHintRange();
        var node1 = this.hints.childNodes[selectedHintRange.from];
        var node2 = this.hints.childNodes[selectedHintRange.to];
        var firstNode = this.hints.firstChild;
        if (node1.offsetTop < this.hints.scrollTop)
          this.hints.scrollTop = node1.offsetTop - firstNode.offsetTop;
        else if (node2.offsetTop + node2.offsetHeight > this.hints.scrollTop + this.hints.clientHeight)
          this.hints.scrollTop = node2.offsetTop + node2.offsetHeight - this.hints.clientHeight + firstNode.offsetTop;
      },

      screenAmount: function() {
        return Math.floor(this.hints.clientHeight / this.hints.firstChild.offsetHeight) || 1;
      },

      getSelectedHintRange: function() {
        var margin = this.completion.options.scrollMargin || 0;
        return {
          from: Math.max(0, this.selectedHint - margin),
          to: Math.min(this.data.list.length - 1, this.selectedHint + margin),
        };
      }
    };

    function applicableHelpers(cm, helpers) {
      if (!cm.somethingSelected()) return helpers
      var result = [];
      for (var i = 0; i < helpers.length; i++)
        if (helpers[i].supportsSelection) result.push(helpers[i]);
      return result
    }

    function fetchHints(hint, cm, options, callback) {
      if (hint.async) {
        hint(cm, callback, options);
      } else {
        var result = hint(cm, options);
        if (result && result.then) result.then(callback);
        else callback(result);
      }
    }

    function resolveAutoHints(cm, pos) {
      var helpers = cm.getHelpers(pos, "hint"), words;
      if (helpers.length) {
        var resolved = function(cm, callback, options) {
          var app = applicableHelpers(cm, helpers);
          function run(i) {
            if (i == app.length) return callback(null)
            fetchHints(app[i], cm, options, function(result) {
              if (result && result.list.length > 0) callback(result);
              else run(i + 1);
            });
          }
          run(0);
        };
        resolved.async = true;
        resolved.supportsSelection = true;
        return resolved
      } else if (words = cm.getHelper(cm.getCursor(), "hintWords")) {
        return function(cm) { return CodeMirror.hint.fromList(cm, {words: words}) }
      } else if (CodeMirror.hint.anyword) {
        return function(cm, options) { return CodeMirror.hint.anyword(cm, options) }
      } else {
        return function() {}
      }
    }

    CodeMirror.registerHelper("hint", "auto", {
      resolve: resolveAutoHints
    });

    CodeMirror.registerHelper("hint", "fromList", function(cm, options) {
      var cur = cm.getCursor(), token = cm.getTokenAt(cur);
      var term, from = CodeMirror.Pos(cur.line, token.start), to = cur;
      if (token.start < cur.ch && /\w/.test(token.string.charAt(cur.ch - token.start - 1))) {
        term = token.string.substr(0, cur.ch - token.start);
      } else {
        term = "";
        from = cur;
      }
      var found = [];
      for (var i = 0; i < options.words.length; i++) {
        var word = options.words[i];
        if (word.slice(0, term.length) == term)
          found.push(word);
      }

      if (found.length) return {list: found, from: from, to: to};
    });

    CodeMirror.commands.autocomplete = CodeMirror.showHint;

    var defaultOptions = {
      hint: CodeMirror.hint.auto,
      completeSingle: true,
      alignWithWord: true,
      closeCharacters: /[\s()\[\]{};:>,]/,
      closeOnCursorActivity: true,
      closeOnPick: true,
      closeOnUnfocus: true,
      completeOnSingleClick: true,
      container: null,
      customKeys: null,
      extraKeys: null,
      paddingForScrollbar: true,
      moveOnOverlap: true,
    };

    CodeMirror.defineOption("hintOptions", null);
  });
  });

  var xmlHint = createCommonjsModule(function (module, exports) {
  // CodeMirror, copyright (c) by Marijn Haverbeke and others
  // Distributed under an MIT license: https://codemirror.net/LICENSE

  (function(mod) {
    mod(codemirror);
  })(function(CodeMirror) {

    var Pos = CodeMirror.Pos;

    function matches(hint, typed, matchInMiddle) {
      if (matchInMiddle) return hint.indexOf(typed) >= 0;
      else return hint.lastIndexOf(typed, 0) == 0;
    }

    function getHints(cm, options) {
      var tags = options && options.schemaInfo;
      var quote = (options && options.quoteChar) || '"';
      var matchInMiddle = options && options.matchInMiddle;
      if (!tags) return;
      var cur = cm.getCursor(), token = cm.getTokenAt(cur);
      if (token.end > cur.ch) {
        token.end = cur.ch;
        token.string = token.string.slice(0, cur.ch - token.start);
      }
      var inner = CodeMirror.innerMode(cm.getMode(), token.state);
      if (!inner.mode.xmlCurrentTag) return
      var result = [], replaceToken = false, prefix;
      var tag = /\btag\b/.test(token.type) && !/>$/.test(token.string);
      var tagName = tag && /^\w/.test(token.string), tagStart;

      if (tagName) {
        var before = cm.getLine(cur.line).slice(Math.max(0, token.start - 2), token.start);
        var tagType = /<\/$/.test(before) ? "close" : /<$/.test(before) ? "open" : null;
        if (tagType) tagStart = token.start - (tagType == "close" ? 2 : 1);
      } else if (tag && token.string == "<") {
        tagType = "open";
      } else if (tag && token.string == "</") {
        tagType = "close";
      }

      var tagInfo = inner.mode.xmlCurrentTag(inner.state);
      if (!tag && !tagInfo || tagType) {
        if (tagName)
          prefix = token.string;
        replaceToken = tagType;
        var context = inner.mode.xmlCurrentContext ? inner.mode.xmlCurrentContext(inner.state) : [];
        var inner = context.length && context[context.length - 1];
        var curTag = inner && tags[inner];
        var childList = inner ? curTag && curTag.children : tags["!top"];
        if (childList && tagType != "close") {
          for (var i = 0; i < childList.length; ++i) if (!prefix || matches(childList[i], prefix, matchInMiddle))
            result.push("<" + childList[i]);
        } else if (tagType != "close") {
          for (var name in tags)
            if (tags.hasOwnProperty(name) && name != "!top" && name != "!attrs" && (!prefix || matches(name, prefix, matchInMiddle)))
              result.push("<" + name);
        }
        if (inner && (!prefix || tagType == "close" && matches(inner, prefix, matchInMiddle)))
          result.push("</" + inner + ">");
      } else {
        // Attribute completion
        var curTag = tagInfo && tags[tagInfo.name], attrs = curTag && curTag.attrs;
        var globalAttrs = tags["!attrs"];
        if (!attrs && !globalAttrs) return;
        if (!attrs) {
          attrs = globalAttrs;
        } else if (globalAttrs) { // Combine tag-local and global attributes
          var set = {};
          for (var nm in globalAttrs) if (globalAttrs.hasOwnProperty(nm)) set[nm] = globalAttrs[nm];
          for (var nm in attrs) if (attrs.hasOwnProperty(nm)) set[nm] = attrs[nm];
          attrs = set;
        }
        if (token.type == "string" || token.string == "=") { // A value
          var before = cm.getRange(Pos(cur.line, Math.max(0, cur.ch - 60)),
                                   Pos(cur.line, token.type == "string" ? token.start : token.end));
          var atName = before.match(/([^\s\u00a0=<>\"\']+)=$/), atValues;
          if (!atName || !attrs.hasOwnProperty(atName[1]) || !(atValues = attrs[atName[1]])) return;
          if (typeof atValues == 'function') atValues = atValues.call(this, cm); // Functions can be used to supply values for autocomplete widget
          if (token.type == "string") {
            prefix = token.string;
            var n = 0;
            if (/['"]/.test(token.string.charAt(0))) {
              quote = token.string.charAt(0);
              prefix = token.string.slice(1);
              n++;
            }
            var len = token.string.length;
            if (/['"]/.test(token.string.charAt(len - 1))) {
              quote = token.string.charAt(len - 1);
              prefix = token.string.substr(n, len - 2);
            }
            if (n) { // an opening quote
              var line = cm.getLine(cur.line);
              if (line.length > token.end && line.charAt(token.end) == quote) token.end++; // include a closing quote
            }
            replaceToken = true;
          }
          var returnHintsFromAtValues = function(atValues) {
            if (atValues)
              for (var i = 0; i < atValues.length; ++i) if (!prefix || matches(atValues[i], prefix, matchInMiddle))
                result.push(quote + atValues[i] + quote);
            return returnHints();
          };
          if (atValues && atValues.then) return atValues.then(returnHintsFromAtValues);
          return returnHintsFromAtValues(atValues);
        } else { // An attribute name
          if (token.type == "attribute") {
            prefix = token.string;
            replaceToken = true;
          }
          for (var attr in attrs) if (attrs.hasOwnProperty(attr) && (!prefix || matches(attr, prefix, matchInMiddle)))
            result.push(attr);
        }
      }
      function returnHints() {
        return {
          list: result,
          from: replaceToken ? Pos(cur.line, tagStart == null ? token.start : tagStart) : cur,
          to: replaceToken ? Pos(cur.line, token.end) : cur
        };
      }
      return returnHints();
    }

    CodeMirror.registerHelper("hint", "xml", getHints);
  });
  });

  var foldcode = createCommonjsModule(function (module, exports) {
  // CodeMirror, copyright (c) by Marijn Haverbeke and others
  // Distributed under an MIT license: https://codemirror.net/LICENSE

  (function(mod) {
    mod(codemirror);
  })(function(CodeMirror) {

    function doFold(cm, pos, options, force) {
      if (options && options.call) {
        var finder = options;
        options = null;
      } else {
        var finder = getOption(cm, options, "rangeFinder");
      }
      if (typeof pos == "number") pos = CodeMirror.Pos(pos, 0);
      var minSize = getOption(cm, options, "minFoldSize");

      function getRange(allowFolded) {
        var range = finder(cm, pos);
        if (!range || range.to.line - range.from.line < minSize) return null;
        var marks = cm.findMarksAt(range.from);
        for (var i = 0; i < marks.length; ++i) {
          if (marks[i].__isFold && force !== "fold") {
            if (!allowFolded) return null;
            range.cleared = true;
            marks[i].clear();
          }
        }
        return range;
      }

      var range = getRange(true);
      if (getOption(cm, options, "scanUp")) while (!range && pos.line > cm.firstLine()) {
        pos = CodeMirror.Pos(pos.line - 1, 0);
        range = getRange(false);
      }
      if (!range || range.cleared || force === "unfold") return;

      var myWidget = makeWidget(cm, options, range);
      CodeMirror.on(myWidget, "mousedown", function(e) {
        myRange.clear();
        CodeMirror.e_preventDefault(e);
      });
      var myRange = cm.markText(range.from, range.to, {
        replacedWith: myWidget,
        clearOnEnter: getOption(cm, options, "clearOnEnter"),
        __isFold: true
      });
      myRange.on("clear", function(from, to) {
        CodeMirror.signal(cm, "unfold", cm, from, to);
      });
      CodeMirror.signal(cm, "fold", cm, range.from, range.to);
    }

    function makeWidget(cm, options, range) {
      var widget = getOption(cm, options, "widget");

      if (typeof widget == "function") {
        widget = widget(range.from, range.to);
      }

      if (typeof widget == "string") {
        var text = document.createTextNode(widget);
        widget = document.createElement("span");
        widget.appendChild(text);
        widget.className = "CodeMirror-foldmarker";
      } else if (widget) {
        widget = widget.cloneNode(true);
      }
      return widget;
    }

    // Clumsy backwards-compatible interface
    CodeMirror.newFoldFunction = function(rangeFinder, widget) {
      return function(cm, pos) { doFold(cm, pos, {rangeFinder: rangeFinder, widget: widget}); };
    };

    // New-style interface
    CodeMirror.defineExtension("foldCode", function(pos, options, force) {
      doFold(this, pos, options, force);
    });

    CodeMirror.defineExtension("isFolded", function(pos) {
      var marks = this.findMarksAt(pos);
      for (var i = 0; i < marks.length; ++i)
        if (marks[i].__isFold) return true;
    });

    CodeMirror.commands.toggleFold = function(cm) {
      cm.foldCode(cm.getCursor());
    };
    CodeMirror.commands.fold = function(cm) {
      cm.foldCode(cm.getCursor(), null, "fold");
    };
    CodeMirror.commands.unfold = function(cm) {
      cm.foldCode(cm.getCursor(), null, "unfold");
    };
    CodeMirror.commands.foldAll = function(cm) {
      cm.operation(function() {
        for (var i = cm.firstLine(), e = cm.lastLine(); i <= e; i++)
          cm.foldCode(CodeMirror.Pos(i, 0), null, "fold");
      });
    };
    CodeMirror.commands.unfoldAll = function(cm) {
      cm.operation(function() {
        for (var i = cm.firstLine(), e = cm.lastLine(); i <= e; i++)
          cm.foldCode(CodeMirror.Pos(i, 0), null, "unfold");
      });
    };

    CodeMirror.registerHelper("fold", "combine", function() {
      var funcs = Array.prototype.slice.call(arguments, 0);
      return function(cm, start) {
        for (var i = 0; i < funcs.length; ++i) {
          var found = funcs[i](cm, start);
          if (found) return found;
        }
      };
    });

    CodeMirror.registerHelper("fold", "auto", function(cm, start) {
      var helpers = cm.getHelpers(start, "fold");
      for (var i = 0; i < helpers.length; i++) {
        var cur = helpers[i](cm, start);
        if (cur) return cur;
      }
    });

    var defaultOptions = {
      rangeFinder: CodeMirror.fold.auto,
      widget: "\u2194",
      minFoldSize: 0,
      scanUp: false,
      clearOnEnter: true
    };

    CodeMirror.defineOption("foldOptions", null);

    function getOption(cm, options, name) {
      if (options && options[name] !== undefined)
        return options[name];
      var editorOptions = cm.options.foldOptions;
      if (editorOptions && editorOptions[name] !== undefined)
        return editorOptions[name];
      return defaultOptions[name];
    }

    CodeMirror.defineExtension("foldOption", function(options, name) {
      return getOption(this, options, name);
    });
  });
  });

  var foldgutter = createCommonjsModule(function (module, exports) {
  // CodeMirror, copyright (c) by Marijn Haverbeke and others
  // Distributed under an MIT license: https://codemirror.net/LICENSE

  (function(mod) {
    mod(codemirror, foldcode);
  })(function(CodeMirror) {

    CodeMirror.defineOption("foldGutter", false, function(cm, val, old) {
      if (old && old != CodeMirror.Init) {
        cm.clearGutter(cm.state.foldGutter.options.gutter);
        cm.state.foldGutter = null;
        cm.off("gutterClick", onGutterClick);
        cm.off("changes", onChange);
        cm.off("viewportChange", onViewportChange);
        cm.off("fold", onFold);
        cm.off("unfold", onFold);
        cm.off("swapDoc", onChange);
      }
      if (val) {
        cm.state.foldGutter = new State(parseOptions(val));
        updateInViewport(cm);
        cm.on("gutterClick", onGutterClick);
        cm.on("changes", onChange);
        cm.on("viewportChange", onViewportChange);
        cm.on("fold", onFold);
        cm.on("unfold", onFold);
        cm.on("swapDoc", onChange);
      }
    });

    var Pos = CodeMirror.Pos;

    function State(options) {
      this.options = options;
      this.from = this.to = 0;
    }

    function parseOptions(opts) {
      if (opts === true) opts = {};
      if (opts.gutter == null) opts.gutter = "CodeMirror-foldgutter";
      if (opts.indicatorOpen == null) opts.indicatorOpen = "CodeMirror-foldgutter-open";
      if (opts.indicatorFolded == null) opts.indicatorFolded = "CodeMirror-foldgutter-folded";
      return opts;
    }

    function isFolded(cm, line) {
      var marks = cm.findMarks(Pos(line, 0), Pos(line + 1, 0));
      for (var i = 0; i < marks.length; ++i) {
        if (marks[i].__isFold) {
          var fromPos = marks[i].find(-1);
          if (fromPos && fromPos.line === line)
            return marks[i];
        }
      }
    }

    function marker(spec) {
      if (typeof spec == "string") {
        var elt = document.createElement("div");
        elt.className = spec + " CodeMirror-guttermarker-subtle";
        return elt;
      } else {
        return spec.cloneNode(true);
      }
    }

    function updateFoldInfo(cm, from, to) {
      var opts = cm.state.foldGutter.options, cur = from - 1;
      var minSize = cm.foldOption(opts, "minFoldSize");
      var func = cm.foldOption(opts, "rangeFinder");
      // we can reuse the built-in indicator element if its className matches the new state
      var clsFolded = typeof opts.indicatorFolded == "string" && classTest(opts.indicatorFolded);
      var clsOpen = typeof opts.indicatorOpen == "string" && classTest(opts.indicatorOpen);
      cm.eachLine(from, to, function(line) {
        ++cur;
        var mark = null;
        var old = line.gutterMarkers;
        if (old) old = old[opts.gutter];
        if (isFolded(cm, cur)) {
          if (clsFolded && old && clsFolded.test(old.className)) return;
          mark = marker(opts.indicatorFolded);
        } else {
          var pos = Pos(cur, 0);
          var range = func && func(cm, pos);
          if (range && range.to.line - range.from.line >= minSize) {
            if (clsOpen && old && clsOpen.test(old.className)) return;
            mark = marker(opts.indicatorOpen);
          }
        }
        if (!mark && !old) return;
        cm.setGutterMarker(line, opts.gutter, mark);
      });
    }

    // copied from CodeMirror/src/util/dom.js
    function classTest(cls) { return new RegExp("(^|\\s)" + cls + "(?:$|\\s)\\s*") }

    function updateInViewport(cm) {
      var vp = cm.getViewport(), state = cm.state.foldGutter;
      if (!state) return;
      cm.operation(function() {
        updateFoldInfo(cm, vp.from, vp.to);
      });
      state.from = vp.from; state.to = vp.to;
    }

    function onGutterClick(cm, line, gutter) {
      var state = cm.state.foldGutter;
      if (!state) return;
      var opts = state.options;
      if (gutter != opts.gutter) return;
      var folded = isFolded(cm, line);
      if (folded) folded.clear();
      else cm.foldCode(Pos(line, 0), opts);
    }

    function onChange(cm) {
      var state = cm.state.foldGutter;
      if (!state) return;
      var opts = state.options;
      state.from = state.to = 0;
      clearTimeout(state.changeUpdate);
      state.changeUpdate = setTimeout(function() { updateInViewport(cm); }, opts.foldOnChangeTimeSpan || 600);
    }

    function onViewportChange(cm) {
      var state = cm.state.foldGutter;
      if (!state) return;
      var opts = state.options;
      clearTimeout(state.changeUpdate);
      state.changeUpdate = setTimeout(function() {
        var vp = cm.getViewport();
        if (state.from == state.to || vp.from - state.to > 20 || state.from - vp.to > 20) {
          updateInViewport(cm);
        } else {
          cm.operation(function() {
            if (vp.from < state.from) {
              updateFoldInfo(cm, vp.from, state.from);
              state.from = vp.from;
            }
            if (vp.to > state.to) {
              updateFoldInfo(cm, state.to, vp.to);
              state.to = vp.to;
            }
          });
        }
      }, opts.updateViewportTimeSpan || 400);
    }

    function onFold(cm, from) {
      var state = cm.state.foldGutter;
      if (!state) return;
      var line = from.line;
      if (line >= state.from && line < state.to)
        updateFoldInfo(cm, line, line + 1);
    }
  });
  });

  var xmlFold = createCommonjsModule(function (module, exports) {
  // CodeMirror, copyright (c) by Marijn Haverbeke and others
  // Distributed under an MIT license: https://codemirror.net/LICENSE

  (function(mod) {
    mod(codemirror);
  })(function(CodeMirror) {

    var Pos = CodeMirror.Pos;
    function cmp(a, b) { return a.line - b.line || a.ch - b.ch; }

    var nameStartChar = "A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD";
    var nameChar = nameStartChar + "\-\:\.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040";
    var xmlTagStart = new RegExp("<(/?)([" + nameStartChar + "][" + nameChar + "]*)", "g");

    function Iter(cm, line, ch, range) {
      this.line = line; this.ch = ch;
      this.cm = cm; this.text = cm.getLine(line);
      this.min = range ? Math.max(range.from, cm.firstLine()) : cm.firstLine();
      this.max = range ? Math.min(range.to - 1, cm.lastLine()) : cm.lastLine();
    }

    function tagAt(iter, ch) {
      var type = iter.cm.getTokenTypeAt(Pos(iter.line, ch));
      return type && /\btag\b/.test(type);
    }

    function nextLine(iter) {
      if (iter.line >= iter.max) return;
      iter.ch = 0;
      iter.text = iter.cm.getLine(++iter.line);
      return true;
    }
    function prevLine(iter) {
      if (iter.line <= iter.min) return;
      iter.text = iter.cm.getLine(--iter.line);
      iter.ch = iter.text.length;
      return true;
    }

    function toTagEnd(iter) {
      for (;;) {
        var gt = iter.text.indexOf(">", iter.ch);
        if (gt == -1) { if (nextLine(iter)) continue; else return; }
        if (!tagAt(iter, gt + 1)) { iter.ch = gt + 1; continue; }
        var lastSlash = iter.text.lastIndexOf("/", gt);
        var selfClose = lastSlash > -1 && !/\S/.test(iter.text.slice(lastSlash + 1, gt));
        iter.ch = gt + 1;
        return selfClose ? "selfClose" : "regular";
      }
    }
    function toTagStart(iter) {
      for (;;) {
        var lt = iter.ch ? iter.text.lastIndexOf("<", iter.ch - 1) : -1;
        if (lt == -1) { if (prevLine(iter)) continue; else return; }
        if (!tagAt(iter, lt + 1)) { iter.ch = lt; continue; }
        xmlTagStart.lastIndex = lt;
        iter.ch = lt;
        var match = xmlTagStart.exec(iter.text);
        if (match && match.index == lt) return match;
      }
    }

    function toNextTag(iter) {
      for (;;) {
        xmlTagStart.lastIndex = iter.ch;
        var found = xmlTagStart.exec(iter.text);
        if (!found) { if (nextLine(iter)) continue; else return; }
        if (!tagAt(iter, found.index + 1)) { iter.ch = found.index + 1; continue; }
        iter.ch = found.index + found[0].length;
        return found;
      }
    }
    function toPrevTag(iter) {
      for (;;) {
        var gt = iter.ch ? iter.text.lastIndexOf(">", iter.ch - 1) : -1;
        if (gt == -1) { if (prevLine(iter)) continue; else return; }
        if (!tagAt(iter, gt + 1)) { iter.ch = gt; continue; }
        var lastSlash = iter.text.lastIndexOf("/", gt);
        var selfClose = lastSlash > -1 && !/\S/.test(iter.text.slice(lastSlash + 1, gt));
        iter.ch = gt + 1;
        return selfClose ? "selfClose" : "regular";
      }
    }

    function findMatchingClose(iter, tag) {
      var stack = [];
      for (;;) {
        var next = toNextTag(iter), end, startLine = iter.line, startCh = iter.ch - (next ? next[0].length : 0);
        if (!next || !(end = toTagEnd(iter))) return;
        if (end == "selfClose") continue;
        if (next[1]) { // closing tag
          for (var i = stack.length - 1; i >= 0; --i) if (stack[i] == next[2]) {
            stack.length = i;
            break;
          }
          if (i < 0 && (!tag || tag == next[2])) return {
            tag: next[2],
            from: Pos(startLine, startCh),
            to: Pos(iter.line, iter.ch)
          };
        } else { // opening tag
          stack.push(next[2]);
        }
      }
    }
    function findMatchingOpen(iter, tag) {
      var stack = [];
      for (;;) {
        var prev = toPrevTag(iter);
        if (!prev) return;
        if (prev == "selfClose") { toTagStart(iter); continue; }
        var endLine = iter.line, endCh = iter.ch;
        var start = toTagStart(iter);
        if (!start) return;
        if (start[1]) { // closing tag
          stack.push(start[2]);
        } else { // opening tag
          for (var i = stack.length - 1; i >= 0; --i) if (stack[i] == start[2]) {
            stack.length = i;
            break;
          }
          if (i < 0 && (!tag || tag == start[2])) return {
            tag: start[2],
            from: Pos(iter.line, iter.ch),
            to: Pos(endLine, endCh)
          };
        }
      }
    }

    CodeMirror.registerHelper("fold", "xml", function(cm, start) {
      var iter = new Iter(cm, start.line, 0);
      for (;;) {
        var openTag = toNextTag(iter);
        if (!openTag || iter.line != start.line) return
        var end = toTagEnd(iter);
        if (!end) return
        if (!openTag[1] && end != "selfClose") {
          var startPos = Pos(iter.line, iter.ch);
          var endPos = findMatchingClose(iter, openTag[2]);
          return endPos && cmp(endPos.from, startPos) > 0 ? {from: startPos, to: endPos.from} : null
        }
      }
    });
    CodeMirror.findMatchingTag = function(cm, pos, range) {
      var iter = new Iter(cm, pos.line, pos.ch, range);
      if (iter.text.indexOf(">") == -1 && iter.text.indexOf("<") == -1) return;
      var end = toTagEnd(iter), to = end && Pos(iter.line, iter.ch);
      var start = end && toTagStart(iter);
      if (!end || !start || cmp(iter, pos) > 0) return;
      var here = {from: Pos(iter.line, iter.ch), to: to, tag: start[2]};
      if (end == "selfClose") return {open: here, close: null, at: "open"};

      if (start[1]) { // closing tag
        return {open: findMatchingOpen(iter, start[2]), close: here, at: "close"};
      } else { // opening tag
        iter = new Iter(cm, to.line, to.ch, range);
        return {open: here, close: findMatchingClose(iter, start[2]), at: "open"};
      }
    };

    CodeMirror.findEnclosingTag = function(cm, pos, range, tag) {
      var iter = new Iter(cm, pos.line, pos.ch, range);
      for (;;) {
        var open = findMatchingOpen(iter, tag);
        if (!open) break;
        var forward = new Iter(cm, pos.line, pos.ch, range);
        var close = findMatchingClose(forward, open.tag);
        if (close) return {open: open, close: close};
      }
    };

    // Used by addon/edit/closetag.js
    CodeMirror.scanForClosingTag = function(cm, pos, name, end) {
      var iter = new Iter(cm, pos.line, pos.ch, end ? {from: 0, to: end} : null);
      return findMatchingClose(iter, name);
    };
  });
  });

  var matchtags = createCommonjsModule(function (module, exports) {
  // CodeMirror, copyright (c) by Marijn Haverbeke and others
  // Distributed under an MIT license: https://codemirror.net/LICENSE

  (function(mod) {
    mod(codemirror, xmlFold);
  })(function(CodeMirror) {

    CodeMirror.defineOption("matchTags", false, function(cm, val, old) {
      if (old && old != CodeMirror.Init) {
        cm.off("cursorActivity", doMatchTags);
        cm.off("viewportChange", maybeUpdateMatch);
        clear(cm);
      }
      if (val) {
        cm.state.matchBothTags = typeof val == "object" && val.bothTags;
        cm.on("cursorActivity", doMatchTags);
        cm.on("viewportChange", maybeUpdateMatch);
        doMatchTags(cm);
      }
    });

    function clear(cm) {
      if (cm.state.tagHit) cm.state.tagHit.clear();
      if (cm.state.tagOther) cm.state.tagOther.clear();
      cm.state.tagHit = cm.state.tagOther = null;
    }

    function doMatchTags(cm) {
      cm.state.failedTagMatch = false;
      cm.operation(function() {
        clear(cm);
        if (cm.somethingSelected()) return;
        var cur = cm.getCursor(), range = cm.getViewport();
        range.from = Math.min(range.from, cur.line); range.to = Math.max(cur.line + 1, range.to);
        var match = CodeMirror.findMatchingTag(cm, cur, range);
        if (!match) return;
        if (cm.state.matchBothTags) {
          var hit = match.at == "open" ? match.open : match.close;
          if (hit) cm.state.tagHit = cm.markText(hit.from, hit.to, {className: "CodeMirror-matchingtag"});
        }
        var other = match.at == "close" ? match.open : match.close;
        if (other)
          cm.state.tagOther = cm.markText(other.from, other.to, {className: "CodeMirror-matchingtag"});
        else
          cm.state.failedTagMatch = true;
      });
    }

    function maybeUpdateMatch(cm) {
      if (cm.state.failedTagMatch) doMatchTags(cm);
    }

    CodeMirror.commands.toMatchingTag = function(cm) {
      var found = CodeMirror.findMatchingTag(cm, cm.getCursor());
      if (found) {
        var other = found.at == "close" ? found.open : found.close;
        if (other) cm.extendSelection(other.to, other.from);
      }
    };
  });
  });

  var closetag = createCommonjsModule(function (module, exports) {
  // CodeMirror, copyright (c) by Marijn Haverbeke and others
  // Distributed under an MIT license: https://codemirror.net/LICENSE

  /**
   * Tag-closer extension for CodeMirror.
   *
   * This extension adds an "autoCloseTags" option that can be set to
   * either true to get the default behavior, or an object to further
   * configure its behavior.
   *
   * These are supported options:
   *
   * `whenClosing` (default true)
   *   Whether to autoclose when the '/' of a closing tag is typed.
   * `whenOpening` (default true)
   *   Whether to autoclose the tag when the final '>' of an opening
   *   tag is typed.
   * `dontCloseTags` (default is empty tags for HTML, none for XML)
   *   An array of tag names that should not be autoclosed.
   * `indentTags` (default is block tags for HTML, none for XML)
   *   An array of tag names that should, when opened, cause a
   *   blank line to be added inside the tag, and the blank line and
   *   closing line to be indented.
   * `emptyTags` (default is none)
   *   An array of XML tag names that should be autoclosed with '/>'.
   *
   * See demos/closetag.html for a usage example.
   */

  (function(mod) {
    mod(codemirror, xmlFold);
  })(function(CodeMirror) {
    CodeMirror.defineOption("autoCloseTags", false, function(cm, val, old) {
      if (old != CodeMirror.Init && old)
        cm.removeKeyMap("autoCloseTags");
      if (!val) return;
      var map = {name: "autoCloseTags"};
      if (typeof val != "object" || val.whenClosing !== false)
        map["'/'"] = function(cm) { return autoCloseSlash(cm); };
      if (typeof val != "object" || val.whenOpening !== false)
        map["'>'"] = function(cm) { return autoCloseGT(cm); };
      cm.addKeyMap(map);
    });

    var htmlDontClose = ["area", "base", "br", "col", "command", "embed", "hr", "img", "input", "keygen", "link", "meta", "param",
                         "source", "track", "wbr"];
    var htmlIndent = ["applet", "blockquote", "body", "button", "div", "dl", "fieldset", "form", "frameset", "h1", "h2", "h3", "h4",
                      "h5", "h6", "head", "html", "iframe", "layer", "legend", "object", "ol", "p", "select", "table", "ul"];

    function autoCloseGT(cm) {
      if (cm.getOption("disableInput")) return CodeMirror.Pass;
      var ranges = cm.listSelections(), replacements = [];
      var opt = cm.getOption("autoCloseTags");
      for (var i = 0; i < ranges.length; i++) {
        if (!ranges[i].empty()) return CodeMirror.Pass;
        var pos = ranges[i].head, tok = cm.getTokenAt(pos);
        var inner = CodeMirror.innerMode(cm.getMode(), tok.state), state = inner.state;
        var tagInfo = inner.mode.xmlCurrentTag && inner.mode.xmlCurrentTag(state);
        var tagName = tagInfo && tagInfo.name;
        if (!tagName) return CodeMirror.Pass

        var html = inner.mode.configuration == "html";
        var dontCloseTags = (typeof opt == "object" && opt.dontCloseTags) || (html && htmlDontClose);
        var indentTags = (typeof opt == "object" && opt.indentTags) || (html && htmlIndent);

        if (tok.end > pos.ch) tagName = tagName.slice(0, tagName.length - tok.end + pos.ch);
        var lowerTagName = tagName.toLowerCase();
        // Don't process the '>' at the end of an end-tag or self-closing tag
        if (!tagName ||
            tok.type == "string" && (tok.end != pos.ch || !/[\"\']/.test(tok.string.charAt(tok.string.length - 1)) || tok.string.length == 1) ||
            tok.type == "tag" && tagInfo.close ||
            tok.string.indexOf("/") == (pos.ch - tok.start - 1) || // match something like <someTagName />
            dontCloseTags && indexOf(dontCloseTags, lowerTagName) > -1 ||
            closingTagExists(cm, inner.mode.xmlCurrentContext && inner.mode.xmlCurrentContext(state) || [], tagName, pos, true))
          return CodeMirror.Pass;

        var emptyTags = typeof opt == "object" && opt.emptyTags;
        if (emptyTags && indexOf(emptyTags, tagName) > -1) {
          replacements[i] = { text: "/>", newPos: CodeMirror.Pos(pos.line, pos.ch + 2) };
          continue;
        }

        var indent = indentTags && indexOf(indentTags, lowerTagName) > -1;
        replacements[i] = {indent: indent,
                           text: ">" + (indent ? "\n\n" : "") + "</" + tagName + ">",
                           newPos: indent ? CodeMirror.Pos(pos.line + 1, 0) : CodeMirror.Pos(pos.line, pos.ch + 1)};
      }

      var dontIndentOnAutoClose = (typeof opt == "object" && opt.dontIndentOnAutoClose);
      for (var i = ranges.length - 1; i >= 0; i--) {
        var info = replacements[i];
        cm.replaceRange(info.text, ranges[i].head, ranges[i].anchor, "+insert");
        var sel = cm.listSelections().slice(0);
        sel[i] = {head: info.newPos, anchor: info.newPos};
        cm.setSelections(sel);
        if (!dontIndentOnAutoClose && info.indent) {
          cm.indentLine(info.newPos.line, null, true);
          cm.indentLine(info.newPos.line + 1, null, true);
        }
      }
    }

    function autoCloseCurrent(cm, typingSlash) {
      var ranges = cm.listSelections(), replacements = [];
      var head = typingSlash ? "/" : "</";
      var opt = cm.getOption("autoCloseTags");
      var dontIndentOnAutoClose = (typeof opt == "object" && opt.dontIndentOnSlash);
      for (var i = 0; i < ranges.length; i++) {
        if (!ranges[i].empty()) return CodeMirror.Pass;
        var pos = ranges[i].head, tok = cm.getTokenAt(pos);
        var inner = CodeMirror.innerMode(cm.getMode(), tok.state), state = inner.state;
        if (typingSlash && (tok.type == "string" || tok.string.charAt(0) != "<" ||
                            tok.start != pos.ch - 1))
          return CodeMirror.Pass;
        // Kludge to get around the fact that we are not in XML mode
        // when completing in JS/CSS snippet in htmlmixed mode. Does not
        // work for other XML embedded languages (there is no general
        // way to go from a mixed mode to its current XML state).
        var replacement, mixed = inner.mode.name != "xml" && cm.getMode().name == "htmlmixed";
        if (mixed && inner.mode.name == "javascript") {
          replacement = head + "script";
        } else if (mixed && inner.mode.name == "css") {
          replacement = head + "style";
        } else {
          var context = inner.mode.xmlCurrentContext && inner.mode.xmlCurrentContext(state);
          var top = context.length ? context[context.length - 1] : "";
          if (!context || (context.length && closingTagExists(cm, context, top, pos)))
            return CodeMirror.Pass;
          replacement = head + top;
        }
        if (cm.getLine(pos.line).charAt(tok.end) != ">") replacement += ">";
        replacements[i] = replacement;
      }
      cm.replaceSelections(replacements);
      ranges = cm.listSelections();
      if (!dontIndentOnAutoClose) {
          for (var i = 0; i < ranges.length; i++)
              if (i == ranges.length - 1 || ranges[i].head.line < ranges[i + 1].head.line)
                  cm.indentLine(ranges[i].head.line);
      }
    }

    function autoCloseSlash(cm) {
      if (cm.getOption("disableInput")) return CodeMirror.Pass;
      return autoCloseCurrent(cm, true);
    }

    CodeMirror.commands.closeTag = function(cm) { return autoCloseCurrent(cm); };

    function indexOf(collection, elt) {
      if (collection.indexOf) return collection.indexOf(elt);
      for (var i = 0, e = collection.length; i < e; ++i)
        if (collection[i] == elt) return i;
      return -1;
    }

    // If xml-fold is loaded, we use its functionality to try and verify
    // whether a given tag is actually unclosed.
    function closingTagExists(cm, context, tagName, pos, newTag) {
      if (!CodeMirror.scanForClosingTag) return false;
      var end = Math.min(cm.lastLine() + 1, pos.line + 500);
      var nextClose = CodeMirror.scanForClosingTag(cm, pos, null, end);
      if (!nextClose || nextClose.tag != tagName) return false;
      // If the immediate wrapping context contains onCx instances of
      // the same tag, a closing tag only exists if there are at least
      // that many closing tags of that type following.
      var onCx = newTag ? 1 : 0;
      for (var i = context.length - 1; i >= 0; i--) {
        if (context[i] == tagName) ++onCx;
        else break
      }
      pos = nextClose.to;
      for (var i = 1; i < onCx; i++) {
        var next = CodeMirror.scanForClosingTag(cm, pos, null, end);
        if (!next || next.tag != tagName) return false;
        pos = next.to;
      }
      return true;
    }
  });
  });

  // https://codemirror.net/demo/xmlcomplete.html
  function completeAfter(cm, pred) {
    if (!pred || pred()) {
      setTimeout(() => {
        if (!cm.state.completionActive) {
          cm.showHint({ completeSingle: false });
        }
      }, 100);
    }
    return codemirror.Pass;
  }

  function completeIfAfterLt(cm) {
    return completeAfter(cm, () => {
      const cur = cm.getCursor();
      return cm.getRange(codemirror.Pos(cur.line, cur.ch - 1), cur) === "<"; // eslint-disable-line new-cap
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
      const inner = codemirror.innerMode(cm.getMode(), tok.state).state;
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

  var editor = codemirror.fromTextArea(document.getElementById("editor"), {
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

  /* eslint-env browser */

  prism.manual = true;

  prism.plugins.toolbar.registerButton("edit", {
    text: "Edit",
    onClick: (env) => {
      editor.setValue(env.code);
    },
  });
  // http://prismjs.com/plugins/toolbar/
  prism.plugins.toolbar.registerButton("select", {
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

  function setup(params = {}) {
    console.log(params);

    const client = client_1({
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
        prism.highlightElement(code);
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
        notie_min.input(options);
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
        notie_min.select(options);
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

}());
//# sourceMappingURL=bundle.js.map
