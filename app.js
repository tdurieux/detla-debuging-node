var DebuggerClient = require("./lib/DebuggerClient").DebuggerClient;
var utility = require("./lib/debuggerUtility");
var async = require("async")


var debug, client;

var getScope = function (scope, frame) {
    return new Promise(function(resolve, reject) {
        client.request('scope', {
            number: scope.index,
            fromFrame: frame.index,
        }, function (err, data) {
            var objectId = data.object.ref;
            var handle = parseInt(objectId, 10);
            var request = { handles: [handle], includeSource: false };
            client.request('lookup', request, function (err, data, refs) {
                if(err) {
                    return reject(err);
                }
                var obj = data[handle];
                var props = obj.properties;
                props = props.map(function(prop) {
                    var ref = refs[prop.ref];
                    var inspectorProperty = {
                        name: String(prop.name),
                        writable: !(prop.attributes & 1 << 0),
                        enumerable: !(prop.attributes & 1 << 1),
                        configurable: !(prop.attributes & 1 << 2),
                        value: utility.v8ResultToInspectorResult(ref)
                    };
                    return inspectorProperty;
                });

                console.log(utility.v8ScopeTypeToString(scope.type));
                props = props.filter(function (prop) {
                    return prop.value.description.indexOf('[native') == -1;
                }).sort(function (a, b) {
                    if(a.name > b.name) {
                        return 1;
                    }
                    if(a.name < b.name) {
                        return -1;
                    }
                    return 0;
                })
                props.forEach(function (prop) {
                    console.log("\t" + prop.name + ": " + prop.value.description.replace('\n','').substring(0, 25))
                });
                resolve(props);
            });
        });
    });
}
var getState = function (frames) {
    var frame = frames[0];
    return new Promise(function(resolve, reject) {
        var state = {}
        var ref = utility.v8RefToInspectorObject(frame.receiver);
        if(ref.objectId != '1') {
            return resolve(null);
        }
        console.log(utility.printFrame(frame));
        async.each(frame.scopes, function (scope, callback) {
            getScope(scope, frame).then(function (scope) {
                callback(null, scope);
            }, function (error) {
                callback(error);
            });
        }, function () {
            resolve(state);
        })
    });
}
var loadFile = function () {
    return new Promise(function(resolve, reject) {
        client.request('continue', { 
            "stepaction" : "in"
        }, function () {
            client.request('scripts', {"filter": "app"}, function (err, data) {
                if(data.length == 0) {
                    client.request('continue', { 
                        "stepaction" : "out"
                    }, function () {
                        return loadFile().then(resolve, reject)
                    });
                } else {
                    var script = data[0];
                    client.request('listbreakpoints', {}, function (err, data) {
                        async.each(data.breakpoints, function (breakpoint, callback) {
                            client.request('setbreakpoint', { 
                                "breakpoint": breakpoint.number
                            }, callback);
                        }, function () {
                            client.request('setbreakpoint', { 
                                "type"        : 'scriptId',
                                "target"      : script.id,
                                "line"        : 1,
                                "column"      : 0,
                                "enabled"     : true,
                                "condition"   : "true",
                                "ignoreCount" : 0
                            }, function () {
                                return resolve();
                            });
                        })
                    });
                }
            });
        });
    });
}
var getStates = function (program) {
    var states = [];
    setTimeout(function () {
        console.log("Timeout");
        utility.stopInstance(client, debug);
    }, 60000);

    process.on('exit', function() {
        utility.stopInstance(client, debug);
    });

    return new Promise(function(resolve, reject) {
        utility.initDebugger(program).then(function (d) {
            debug = d;
            utility.setupDebugger().then(function (c) {
                client = c;
                loadFile().then(function () {
                    client.on('break', function() {
                        client.request('backtrace', {
                            inlineRefs: true,
                            fromFrame: 0,
                        }, function (err, data) {
                            var exit = data.frames.length < 7;
                            if(!exit) {
                                
                            }
                            getState(data.frames).then(function () {
                                client.request('continue', { 
                                    "stepaction" : exit?"out": "next"
                                });
                            }, function () {
                                client.request('continue', { 
                                    "stepaction" : exit?"out": "next"
                                });
                            })
                        });
                    });

                    client.request('continue', { 
                        "stepaction" : "next", 
                        "stepcount": 10000
                    });
                });

            })
        });
    });
}


getStates('testProjects/sample2/testPass.js').then(function (state) {

}, function (error) {

});
