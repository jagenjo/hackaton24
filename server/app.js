import express from 'express'
import expressWs from 'express-ws'
import WebSocket from 'ws'  //This is the type package @types/ws
import logger from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from './backend.js'
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let wsConnections = []
const app = expressWs(express(), undefined, {wsOptions: {clientTracking: true}}).app

//our server
var backend = new Server();

//ws messages
app.ws('/ws', (ws) => {
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
app.listen( port, () => console.log(`API Server started on port ${port}!`))