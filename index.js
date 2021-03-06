"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = _default;

var _defineProperty2 = _interopRequireDefault(require("@babel/runtime/helpers/defineProperty"));

var _objectWithoutProperties2 = _interopRequireDefault(require("@babel/runtime/helpers/objectWithoutProperties"));

var _fs = _interopRequireDefault(require("fs"));

var _path = _interopRequireDefault(require("path"));

var _mkdirp = _interopRequireDefault(require("mkdirp"));

var _generator = _interopRequireDefault(require("@babel/generator"));

var _conf = require("@lingui/conf");

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { (0, _defineProperty2.default)(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

var CONFIG = Symbol("I18nConfig"); // Map of messages

var MESSAGES = Symbol("I18nMessages"); // We need to remember all processed nodes. When JSX expressions are
// replaced with CallExpressions, all children are traversed for each CallExpression.
// Then, i18n._ methods are visited multiple times for each parent CallExpression.

var VISITED = Symbol("I18nVisited");

function addMessage(path, messages, _ref) {
  var id = _ref.id,
      newDefault = _ref.message,
      origin = _ref.origin,
      comment = _ref.comment,
      props = (0, _objectWithoutProperties2.default)(_ref, ["id", "message", "origin", "comment"]);
  // prevent from adding undefined msgid
  if (id === undefined) return;

  if (messages.has(id)) {
    var message = messages.get(id); // only set/check default language when it's defined.

    if (message.message && newDefault && message.message !== newDefault) {
      throw path.buildCodeFrameError("Different defaults for the same message ID.");
    }

    if (newDefault) {
      message.message = newDefault;
    }

    ;
    [].push.apply(message.origin, origin);

    if (comment) {
      ;
      [].push.apply(message.extractedComments, [comment]);
    }
  } else {
    var extractedComments = comment ? [comment] : [];
    messages.set(id, _objectSpread(_objectSpread({}, props), {}, {
      message: newDefault,
      origin: origin,
      extractedComments: extractedComments
    }));
  }
}

function _default(_ref2) {
  var t = _ref2.types;
  var localTransComponentName;

  function isTransComponent(node) {
    return t.isJSXElement(node) && t.isJSXIdentifier(node.openingElement.name, {
      name: localTransComponentName
    });
  }

  var isI18nMethod = function isI18nMethod(node) {
    return t.isMemberExpression(node) && t.isIdentifier(node.object, {
      name: "i18n"
    }) && t.isIdentifier(node.property, {
      name: "_"
    });
  };

  function collectMessage(path, file, props) {
    var messages = file.get(MESSAGES);
    var rootDir = file.get(CONFIG).rootDir;

    var filename = _path.default.relative(rootDir, file.opts.filename).replace(/\\/g, "/");

    var line = path.node.loc ? path.node.loc.start.line : null;
    props.origin = [[filename, line]];
    addMessage(path, messages, props);
  }

  return {
    visitor: {
      // Get the local name of Trans component. Usually it's just `Trans`, but
      // it might be different when the import is aliased:
      // import { Trans as T } from '@lingui/react';
      ImportDeclaration: function ImportDeclaration(path) {
        var node = path.node;
        var moduleName = node.source.value;
        if (
			!["@lingui/react", "@lingui/macro", "@lingui/core"].includes(moduleName)
			&& !moduleName.includes('locale/Trans')
		) {
			return;
		}
        var importDeclarations = {};

        if (moduleName === "@lingui/react" || moduleName === "@lingui/macro" || moduleName.includes('locale/Trans')) {
          node.specifiers.forEach(function (specifier) {
            importDeclarations[specifier.imported.name] = specifier.local.name;
          }); // Trans import might be missing if there's just Plural or similar macro.
          // If there's no alias, consider it was imported as Trans.

          localTransComponentName = importDeclarations["Trans"] || "Trans";
        }

        if (!node.specifiers.length) {
          path.remove();
        }
      },
      // Extract translation from <Trans /> component.
      JSXElement: function JSXElement(path, _ref3) {
        var file = _ref3.file;
        var node = path.node;
        if (!localTransComponentName || !isTransComponent(node)) return;
        var attrs = node.openingElement.attributes || [];
        var props = attrs.reduce(function (acc, item) {
          var key = item.name.name;

          if (key === "id" || key === "message" || key === "comment") {
            if (item.value.value) {
              acc[key] = item.value.value;
            } else if (item.value.expression && t.isStringLiteral(item.value.expression)) {
              acc[key] = item.value.expression.value;
            }
          }

          return acc;
        }, {});

        if (!props.id) {
          // <Trans id={message} /> is valid, don't raise warning
          var idProp = attrs.filter(function (item) {
            return item.name.name === "id";
          })[0];

          if (idProp === undefined || t.isLiteral(props.id)) {
            console.warn("Missing message ID, skipping.");
            console.warn((0, _generator.default)(node).code);
          }

          return;
        }

        collectMessage(path, file, props);
      },
      CallExpression: function CallExpression(path, _ref4) {
        var file = _ref4.file;
        var visited = file.get(VISITED);
        if (visited.has(path.node)) return;
        var hasComment = [path.node, path.parent].find(function (_ref5) {
          var leadingComments = _ref5.leadingComments;
          return leadingComments && leadingComments.filter(function (node) {
            return node.value.match(/^\s*i18n\s*$/);
          })[0];
        });
        if (!hasComment) return;
        var props = {
          id: path.node.arguments[0].value
        };

        if (!props.id) {
          console.warn("Missing message ID, skipping.");
          console.warn((0, _generator.default)(path.node).code);
          return;
        }

        var copyOptions = ["message", "comment"];

        if (t.isObjectExpression(path.node.arguments[2])) {
          path.node.arguments[2].properties.forEach(function (property) {
            if (!copyOptions.includes(property.key.name)) return;
            props[property.key.name] = property.value.value;
          });
        }

        visited.add(path.node);
        collectMessage(path, file, props);
      },
      StringLiteral: function StringLiteral(path, _ref6) {
        var file = _ref6.file;
        var visited = file.get(VISITED);
        var comment = path.node.leadingComments && path.node.leadingComments.filter(function (node) {
          return node.value.match(/^\s*i18n/);
        })[0];

        if (!comment || visited.has(path.node)) {
          return;
        }

        visited.add(path.node);
        var props = {
          id: path.node.value
        };

        if (!props.id) {
          console.warn("Missing message ID, skipping.");
          console.warn((0, _generator.default)(path.node).code);
          return;
        }

        collectMessage(path, file, props);
      },
      // Extract message descriptors
      ObjectExpression: function ObjectExpression(path, _ref7) {
        var file = _ref7.file;
        var visited = file.get(VISITED);
        var comment = path.node.leadingComments && path.node.leadingComments.filter(function (node) {
          return node.value.match(/^\s*i18n/);
        })[0];

        if (!comment || visited.has(path.node)) {
          return;
        }

        visited.add(path.node);
        var props = {};
        var copyProps = ["id", "message", "comment"];
        path.node.properties.filter(function (_ref8) {
          var key = _ref8.key;
          return copyProps.indexOf(key.name) !== -1;
        }).forEach(function (_ref9, i) {
          var key = _ref9.key,
              value = _ref9.value;

          if (key.name === "comment" && !t.isStringLiteral(value)) {
            throw path.get("properties.".concat(i, ".value")).buildCodeFrameError("Only strings are supported as comments.");
          }

          props[key.name] = value.value;
        });
        collectMessage(path, file, props);
      }
    },
    pre: function pre(file) {
      localTransComponentName = null; // Skip validation because config is loaded for each file.
      // Config was already validated in CLI.

      file.set(CONFIG, (0, _conf.getConfig)({
        cwd: file.opts.filename,
        skipValidation: true
      })); // Ignore else path for now. Collision is possible if other plugin is
      // using the same Symbol('I18nMessages').
      // istanbul ignore else

      if (!file.has(MESSAGES)) {
        file.set(MESSAGES, new Map());
      }

      file.set(VISITED, new WeakSet());
    },
    post: function post(file) {
      /* Write catalog to directory `localeDir`/_build/`path.to.file`/`filename`.json
       * e.g: if file is src/components/App.js (relative to package.json), then
       * catalog will be in locale/_build/src/components/App.json
       */
      var config = file.get(CONFIG);
      var localeDir = this.opts.localeDir || config.localeDir;
      var filename = file.opts.filename;
      var rootDir = config.rootDir;

      var baseDir = _path.default.dirname(_path.default.relative(rootDir, filename));

      var targetDir = _path.default.join(localeDir, "_build", baseDir);

      var messages = file.get(MESSAGES);
      var catalog = {};

      var baseName = _path.default.basename(filename);

      var catalogFilename = _path.default.join(targetDir, "".concat(baseName, ".json"));

      _mkdirp.default.sync(targetDir); // no messages, skip file


      if (!messages.size) {
        // clean any existing catalog
        if (_fs.default.existsSync(catalogFilename)) {
          _fs.default.writeFileSync(catalogFilename, JSON.stringify({}));
        }

        return;
      }

      messages.forEach(function (value, key) {
        catalog[key] = value;
      });

      _fs.default.writeFileSync(catalogFilename, JSON.stringify(catalog, null, 2));
    }
  };
}