//import fs from 'fs';
import {ActionsDB,ActionsHost} from './actionsHost.js'

var paths = {
    session: "sessions/",
    pool: "pool/"
}

//in charge of handling user sessions
class BackendServer
{
    constructor()
    {
        this.last_id = 1;
        this.users = {};
        this.online_users = 0;

        ActionsDB.load( paths.pool, true );
        this.sessions = {}; //all

    }

    onEnter(ws)
    {
        var id = this.last_id++;
        console.log("User joined",id);
        var user = ws.user = this.users[id] = { 
            id,
            connection: ws,
            sessions: {},
            send: function(msg){ 
                if(msg.constructor !== String )
                {
                    msg.user_id = this.id;
                    msg = JSON.stringify(msg);
                }
                //console.log(">>",msg)
                this.connection.send(msg);
            }
        };
        this.online_users++;
        var welcome = {
            type: "WELCOME",
            user_id: user.id
        }
        user.send(welcome);
    }

    onLeave(ws)
    {
        this.online_users--;
        var user = ws.user;
        if(!user) return;
        console.log("User left",user.id);
        for(var i in user.sessions)
        {
            var session = user.sessions[i];
            delete this.sessions[ session.id ];
            session.destroy();
        }
        delete this.users[ ws.user.id ];
    }    

    //called from websocket
    onMessage(msg, channel)
    {
        var user = channel.user;
        if(!user)
            throw("message without user");
        if(msg[0] != "{") 
            return console.log("Backend <<",msg);
        //console.log("<<",msg);
        var event = JSON.parse( msg );
        var session = null;
        if(event.session_id)
            session = user.sessions[event.session_id];
        switch(event.type)
        {
            case "NEW_SESSION": 
                this.startSession(user, event.session_id, event.data);
                break;
            case "KILL_SESSION": 
                //TO OD
                break; 
            case "START_ACTION":
                if(!session)
                    session = this.startSession(user, event.session_id, event.data, true);
                if(session)
                {
                    session.executeAction(event.action, event.params, event.node_id, onNodeStd)
                    .then((data)=>user.send({type:"ACTION_FINISHED",session_id:event.session_id, node_id: event.node_id, data, time: Date.now()}))
                    .catch((err)=>{user.send({type:"ACTION_ERROR",session_id:event.session_id, node_id: event.node_id, error: err,time: Date.now()});console.error(err)});

                    user.send({type:"ACTION_STARTED",session_id:event.session_id, node_id: event.node_id});
                }
                break;
            default:
                console.log("Unknown type: " , event.type);
        }

        function onNodeStd(node,std,data)
        {
            //log locally too?
            user.send({type:"ACTION_PROGRESS",session_id:event.session_id, node_id: event.node_id, std, data, time: Date.now()});
        }
    }

    startSession(user, session_id, graph_data, silent)
    {
        var session = new ActionsHost( session_id, paths.session );
        this.sessions[ session_id ] = session;
        user.sessions[ session_id ] = session;
        session.prepare();
        if(!silent)
            user.send({type:"SESSION_READY",session_id,time: Date.now()});
        else
            console.log("action silent");
        return session;
    }

    registerHTTP(app)
    {
        app.get('/info',(req, res, next)=>{
            res.send(JSON.stringify(this.getInfo()));
            res.end();
          });

          app.get('/session/:session_id',(req, res, next)=>{
            //console.log(req.query);
            var session_id = req.params.session_id;
            var folder = req.query.folder || "";
            //console.log(req.params);
            this.getSessionFiles(session_id, folder).then(files=>{
                res.send(JSON.stringify({files: files}));
                res.end();
            }).catch((err)=>{
                res.send(JSON.stringify({error:1,msg:err}));
                res.end();
            });
          });          
    }

    getInfo()
    {
        return { actions: ActionsDB.actions }
    }

    getSessionFiles(session_id,folder = "")
    {
        var session = this.sessions[session_id];

        return new Promise((resolve,reject)=>{
            if(!session)
                return reject({error:1, msg:"session not found: " + session_id});
            resolve(session.getFiles(folder));
        });
    }

    //called when closing the server
    onExit()
    {
        console.log("destroy all!");
    }
}

export { BackendServer };