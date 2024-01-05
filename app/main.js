//app launcher
//it instantiates express, expressWS and binds events
//it also servers the public folder for static files
//it creates the BackendServer

import path from 'path';
import logger from 'morgan'; //to log
import express from 'express'; //for http request
import ExpressWs from 'express-ws' //for websockets

import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

//create express and express websocket router
var app = ExpressWs(express()).app;

//???
app.use(function (req, res, next) {
  return next();
});

//app.use(logger('dev')); //to log any HTTP request
app.use(express.static(path.join(__dirname, 'public'))); //to serve static files

//??
app.get('/', function(req, res, next){
  //console.log('get route');
  res.end();
});

//create our own server
import { BackendServer } from './backend.js'
var server = new BackendServer();

//on websocket connection, redirect to server
app.ws('/', function(ws, req) {
  server.onEnter(ws,req);
  ws.on('message', function(msg) {
      server.onMessage(msg,ws);
  });
  ws.on('close', function(msg) {
      server.onLeave(ws,req);
  });
});

//register some extra routes for the HTTP Server
server.registerHTTP(app);

//error handling
app.use((err, req, res, next) => {
  console.log("Error in execution");
  console.error(err.stack)
  res.status(500).send('Error in backend. Something broke!')
})

//not working??
process.on('SIGINT', function() {
  console.log("Caught interrupt signal");
  server.onExit();
  process.exit();
});

//launch server
var port = 3000;
console.log("Listening in port " + port)
app.listen(port);