'use strict';

var app = require('connect')();
var http = require('http');
var swaggerTools = require('swagger-tools');
var jsyaml = require('js-yaml');
var fs = require('fs');
var serverPort = 8080;
var program = require('commander');
var jsontype = 'application/json';
var _ = require('lodash');

// swaggerRouter configuration
var options = {
  swaggerUi: '/swagger.json',
};

program
  .version('0.0.1')
  .option('-j, --json <value>', 'path to swagger json', './api/swagger.json')
  .option('-b, --basePath <value>', 'basePath to change in swagger', '/')
  .option('-s, --shift <value>', 'all path will be starts with this path', '/cb/api')
  .option('-p, --paths <item>', 'list of swagger paths', '{}' )
  .option('-u, --setupPath <value>', 'all maintanance endpoint will start with this path', '/cb/api')
  .parse(process.argv);

var configurationendpoints = {
  [program.setupPath + "/setup"] : {
    "post" : {
      "operationId" : "setUp",
      "schemes" : [ "http", "https" ],
      "consumes" : [ "application/json" ],
      "produces" : [ "application/json" ],
      "parameters" : [ {
          "in" : "body",
          "name" : "body",
          "required" : true,
          "schema" : {
            "type" : "object"
          }
        } ],
      "responses" : {
        "200" : {
          "description" : "successful operation",
          "schema" : {
            "type" : "object"
          }
        }
      }
    }
  },
  [program.setupPath + "/trace"] : {
    "get" : {
      "operationId" : "getTrace",
      "schemes" : [ "http", "https" ],
      "consumes" : [ "application/json" ],
      "produces" : [ "application/json" ],
      "parameters" : [],
      "responses" : {
        "200" : {
          "description" : "successful operation",
          "schema" : {
            "type" : "object"
          }
        }
      }
    }
  },
  [program.setupPath + "/resettrace"] : {
    "post" : {
      "operationId" : "resetTrace",
      "schemes" : [ "http", "https" ],
      "consumes" : [ "application/json" ],
      "produces" : [ "application/json" ],
      "parameters" : [],
      "responses" : {
        "200" : {
          "description" : "successful operation",
          "schema" : {
            "type" : "object"
          }
        }
      }
    }
  },
  [program.setupPath + "/reset"] : {
    "post" : {
      "operationId" : "reset",
      "schemes" : [ "http", "https" ],
      "consumes" : [ "application/json" ],
      "produces" : [ "application/json" ],
      "parameters" : [],
      "responses" : {
        "200" : {
          "description" : "successful operation",
          "schema" : {
            "type" : "object"
          }
        }
      }
    }
  }
};

// The Swagger document (require it, build it programmatically, fetch it from a URL, ...)
var swaggerDoc = JSON.parse(fs.readFileSync(program.json, 'utf8'));
swaggerDoc.basePath = program.basePath;

var orig = swaggerDoc.paths;
var repl = {};

var addendpoints = function(orig, res, shift) {
  Object.keys(orig).map(function(key, index) {
    console.log(' key to add : ' , key, ' - ' , orig[key]);
    res[ shift + key ] = orig[key];
  });
  return res;
}

repl = addendpoints( orig, {}, program.shift);
repl = addendpoints(configurationendpoints, repl, '');
repl = addendpoints(JSON.parse(program.paths), repl, '');

swaggerDoc.paths=repl;

var respond = function(res, contenttype, statuscode, content) {
  res.setHeader('Content-Type', contenttype);
  res.statusCode = statuscode;
  if(typeof content !== 'undefined') {
    res.end(content);
  } else {
    res.end();
  }
  return res;
}

var resetTrace = function() {
  global.requesttraces = [];
}

var resetResponses = function() {
  global.responses = _.cloneDeep(require('./responses/responses.js').responses);
}

resetTrace();
resetResponses();

// Initialize the Swagger middleware
swaggerTools.initializeMiddleware(swaggerDoc, function (middleware) {
  // Interpret Swagger resources and attach metadata to request - must be first in swagger-tools middleware chain
  app.use(middleware.swaggerMetadata());

  app.use(function custom(req, res, next) {
    if (req.swagger.apiPath === program.setupPath +'/trace' ) {
      res = respond(res, jsontype, 200, JSON.stringify(requesttraces));
    } else if (req.swagger.apiPath === program.setupPath + '/setup') {
      responses[req.swagger.params.body.value.operationid] = {
        "responses":req.swagger.params.body.value.responses,
      }
      res = respond(res, jsontype, 200 );
    } else if (req.swagger.apiPath === program.setupPath + '/resettrace') {
      resetTrace();
      res = respond(res, jsontype, 200 );
    } else if (req.swagger.apiPath === program.setupPath + '/reset') {
      resetResponses();
      res = respond(res, jsontype, 200 );
    } else {
      console.log('service call: ', req.originalUrl);
      requesttraces.push({"url": req.originalUrl, "params": req.swagger.params});
      var response;
      if (typeof responses[req.swagger.operation.operationId] !== 'undefined') {
        response = responses[req.swagger.operation.operationId].responses;
        console.log('potential responses for the request: ', JSON.stringify(response));
      }
      if (typeof response !== 'undefined') {
         console.log('there is  at least one response');
         response.every(function(element) {
           setTimeout(function () {
             console.log('checking element', element);
             if (typeof element.condition === 'undefined' || element.condition === '') {
               console.log('response without condition');
               res = respond(res, jsontype, element.statusCode, JSON.stringify(element.response));
               return true;
             } else {
               console.log('more responses', element.condition);
               var isthistheresponse = false;
               try {
                 var f = new Function('params', element.condition);
                 isthistheresponse = f(req.swagger.params);
                 console.log('check: ', isthistheresponse, " - " , req.swagger.params['name']);
               } catch (err) {
                 console.log("Err: " + err);
               }
               if (isthistheresponse) {
                 res = respond(res, jsontype, element.statusCode, JSON.stringify(element.response));
                 return false;
               }
             }
             return true;
           }, element.delayTime);
         });
      } else {
         res = respond(res, jsontype, 200 );
      }
    }
    next();
  })

  // Serve the Swagger documents and Swagger UI
  app.use(middleware.swaggerUi());

  // Start the server
  http.createServer(app).listen(serverPort, function () {
    console.log('Your server is listening on port %d (http://localhost:%d)', serverPort, serverPort);
    console.log('Swagger-ui is available on http://localhost:%d/docs', serverPort);
  });
});
