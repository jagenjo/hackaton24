//app launcher
//it instantiates express, expressWS and binds events
//it also servers the public folder for static files
//it creates the BackendServer

import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import logger from 'morgan';
import express from 'express';
import ExpressWs from 'express-ws'
var app = ExpressWs(express()).app;

app.use(function (req, res, next) {
  return next();
});

app.use(logger('dev')); //to log
app.use(express.static(path.join(__dirname, 'public'))); //to serve static files

//??
app.get('/', function(req, res, next){
  //console.log('get route');
  res.end();
});

//our server
import { BackendServer } from './backend.js'
var server = new BackendServer();

app.ws('/', function(ws, req) {
    //console.log('user connected');
    server.onEnter(ws,req);
    ws.on('message', function(msg) {
        //console.log(msg);
        server.onMessage(msg,ws);
    });
    ws.on('close', function(msg) {
        server.onLeave(ws,req);
    });
});

server.registerHTTP(app);

var port = 3000;
console.log("Listening in port " + port)
app.listen(port);