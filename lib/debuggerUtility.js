var DebuggerClient = require("./DebuggerClient").DebuggerClient;

var DEBUG_PORT = 61000;


function stopInstance(client, debug) {
  return new Promise(function(resolve, reject) {
    debug.kill();
  });
}

var setupDebugger = function () {
  var debuggerClient = new DebuggerClient(DEBUG_PORT);
  return new Promise(function(resolve, reject) {
    debuggerClient.on('connect', function() {
      resolve(debuggerClient);
    });
    debuggerClient.on('error', function(e) {
      reject(new Error('Debugger connection error: ' + e));
    });
    debuggerClient.connect();
  });
};


var initDebugger = function (pathProject) {
  return new Promise(function(resolve, reject) {
      var spawn = require('child_process').spawn,
          debug  = spawn('node', ['--debug-brk='+DEBUG_PORT, pathProject]);

      var startupTimer = setTimeout(function() {
          reject(new Error('Timeout while waiting for the child process to initialize the debugger.'));
      }, 5000);

      debug.stderr.on('data', function(data) {
        // Wait for the child process to initialize the debugger before connecting
        // Node v0.10 prints "debugger listening..."
        // Node v0.11 prints "Debugger listening..."
        if (/^[Dd]ebugger listening on port \d+$/m.test(data.toString())) {
          clearTimeout(startupTimer);
          // give the child process some time to finish the initialization code
          // this is especially important when breakOnStart is true
          setTimeout(resolve, 200, debug);
        } else {
          // Forward any error messages from the child process
          // to our stderr to make troubleshooting easier
          debug.stderr.write(data);
        }
      });
  });
};

var v8ScopeTypeToString = function(v8ScopeType) {
  switch (v8ScopeType) {
    case 0:
      return 'global';
    case 1:
      return 'local';
    case 2:
      return 'with';
    case 3:
      return 'closure';
    case 4:
      return 'catch';
    default:
      return 'unknown';
  }
};
var v8ResultToInspectorResult = function(result) {
  var subtype,
      inspectorResult;
  if (['object', 'function', 'regexp', 'error'].indexOf(result.type) > -1) {
    return v8RefToInspectorObject(result);
  }

  if (result.type == 'null') {
    // workaround for the problem with front-end's setVariableValue
    // implementation not preserving null type
    result.value = null;
    subtype = 'null';
  }

  inspectorResult = {
    type: result.type,
    subtype: subtype,
    value: result.value,
    description: String(result.value)
  };

  return inspectorResult;
};
var v8RefToInspectorObject = function(ref) {
  var desc = '',
      type = ref.type,
      subtype,
      size,
      name,
      objectId,
      inspectorResult;

  switch (type) {
    case 'object':
      name = /#<(\w+)>/.exec(ref.text);
      if (name && name.length > 1) {
        desc = name[1];
        if (desc === 'Array' || desc === 'Buffer') {
          size = ref.properties.filter(function(p) { return /^\d+$/.test(p.name);}).length;
          desc += '[' + size + ']';
          subtype = 'array';
        }
      } else if (ref.className === 'Date') {
        desc = new Date(ref.value || NaN).toString();
        subtype = 'date';
      } else {
        desc = ref.className || 'Object';
      }
      break;
    case 'regexp':
      type = 'object';
      subtype = 'regexp';
      desc = ref.text || '';
      /*
        We need to collect RegExp flags and append they to description,
        or open issue in NodeJS same as 'RegExp text serialized without flags'
      */
      break;
    case 'function':
      desc = ref.text || 'function()';
      break;
    case 'error':
      type = 'object';
      desc = ref.text || 'Error';
      break;
    default:
      desc = ref.text || '';
      break;
  }
  if (desc.length > 100) {
    desc = desc.substring(0, 100) + '\u2026';
  }

  objectId = ref.handle;
  if (objectId === undefined)
    objectId = ref.ref;

  inspectorResult = {
    type: type,
    subtype: subtype,
    objectId: String(objectId),
    className: ref.className,
    description: desc
  };

  return inspectorResult;
};

var printValue = function (variable) {
  var name = variable.name;
  var value = variable.value.value;
  if(!value) {
      value = variable.value.className;
      if(!value) {
          value = "null";
      } else {
          value += ":" + variable.value.ref
      }
  }
  return name + ": " + value;
};

var printFrame = function (frame) {
  var output = "";
  output += frame.sourceLineText.substring(frame.column);
  /*output += "\n Values:\n";
  for (var i = 0; i < frame.locals.length; i++) {
      output += "\t" + printValue(frame.locals[i]) + "\n";
  }*/
  return output;
};

module.exports = {
  printFrame: printFrame,
  v8RefToInspectorObject: v8RefToInspectorObject,
  v8ScopeTypeToString: v8ScopeTypeToString,
  setupDebugger: setupDebugger,
  initDebugger: initDebugger,
  stopInstance: stopInstance,
  v8ResultToInspectorResult: v8ResultToInspectorResult
}