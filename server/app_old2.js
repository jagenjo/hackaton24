import express from 'express'
import http from 'http';
import WebSocket from 'websockets'
import url from 'url';
import logger from 'morgan';
import { Server } from './backend.js'

import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* secondary option
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ httpServer: server });
app.use(express.static(path.join(__dirname, 'public')));

wss.on('connection', function connection(ws) {
  console.log('NEW WEBSOCKET USER!!!');
  ws.send('Welcome!');
  ws.on('message', function (message) {
    console.log('NEW MSG: ' + message); // process WebSocket message
  });
  ws.on('close', function () {
    console.log('USER IS GONE'); // close user connection
  });
});

server.listen( 3000, function() {
  console.log("Server ready!" );
});
*/


//*
import expressWs from 'express-ws'

let wsConnections = []
const app = expressWs(express(), undefined, {wsOptions: {clientTracking: true}}).app

//our server
var backend = new Server();

//ws messages
app.ws('/ws', (ws,req) => {
  //IT NEVER ENTERS HERE
  const wsClientId = randomBytes(2).toString('hex')
  console.log(`New websocket connection open by client ${wsClientId}`)
  ws.send(JSON.stringify({data: 'hello from server'}))
  wsConnections.push({[wsClientId]: ws})

  ws.on('message', function(msg) {
    console.log(msg);
    backend.onMessage(msg, ws);
  });
})

//http reqs
app.use(logger('dev'));
app.use(express.static(path.join(__dirname, 'public')));


//launch
let port = 3000
app.listen( port )
//*/