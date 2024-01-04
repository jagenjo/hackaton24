import fs from 'fs';
import path from 'path';
import YAML from 'yaml'
import { spawn, exec, ChildProcess } from 'child_process';

var paths = {
    session: "sessions/",
    pool: "pool/"
}

//spawn("sleep",["3"])

var actionsDB = {};

class BackendSession
{
    constructor(id, user)
    {
        this.id = id;
        this.user = user;
    }

    prepare()
    {
        var path = paths.session + "S" + this.id;
        //create folder
        if (!fs.existsSync(path)) {
            console.log(" + creating session: ", this.id );
            fs.mkdirSync(path);
        }
    }

    executeAction( action, params, node_id, output_callback )
    {
        var that = this;
        var action_info = actionsDB[action];
        if(!action_info)
            return false;

        console.log("executing action:", action);

        //execute code sync
        /*
        var cp = exec('ls', function(err, stdout, stderr) {
            // handle err, stdout, stderr
            that.progressAction(node_id,stdout,stderr);
        });
        */

        return new Promise((resolve,reject)=>{
            var t = tokenize(action_info.script);
            console.log(t);
            const child = spawn(t[0], t.slice(1));
            //const child = spawn(action_info.script, []);
            //const child = spawn('sh', [action_info.script]);
            //const child = spawn('sleep', [5]);

            var stdout = [];
            var stderr = [];

            child.stdout.on('data', (data) => {
                stdout.push(data.toString());
                if(output_callback)
                    output_callback(node_id,"out",data);
            });
            
            child.stderr.on('data', (data) => {
                stderr.push(data.toString());
                if(output_callback)
                    output_callback(node_id,"err",data);
            });

            child.on('error', (err) => {
                console.log(`Error in action ${err}`);
                reject(node_id,err);
              });              
            
            child.on('exit', (code) => {
              console.log(`Child exited with code ${code}`);
              resolve({node_id,code,stdout,stderr});
            });         
        });
    }

    destroy()
    {
        var path = paths.session + "S" + this.id;
        if (fs.existsSync(path)) {
            console.log(" + deleting session: ", this.id );
            fs.rmSync(path, { recursive: true, force: true });
        }
    }
}

//in charge of executing the pipeline in the server
class BackendServer
{
    constructor()
    {
        this.last_id = 1;
        this.users = {};
        this.online_users = 0;

        this.loadActionsPool( paths.pool );
        this.sessions = {}; //all
    }

    loadActionsPool(path)
    {
        console.log("loading pool of actions")
        var files = fs.readdirSync(path);
        for(var i = 0; i < files.length; ++i)
            if(files[i].indexOf("yaml") != -1)
            {
                var action = this.loadActionDescription(path + "/" + files[i]);
                actionsDB[action.name] = action;
            }
    }

    loadActionDescription(path)
    {
        var data = fs.readFileSync(path, 'utf8');
        var node_info = YAML.parse(data)
        console.log(" * " + node_info.name)
        return node_info
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
        console.log(msg);
        var user = channel.user;
        if(!user)
            throw("message without user");
        if(msg[0] != "{") 
            return console.log("Backend <<",msg);
        var event = JSON.parse( msg );
        var session = null;
        if(event.session_id)
            session = user.sessions[event.session_id];
        switch(event.type)
        {
            case "NEW_SESSION": 
                this.startSession(user, event.session_id);
                break;
            case "START_ACTION":
                if(session)
                {
                    session.executeAction(event.action, event.params, event.node_id)
                    .then((data)=>user.send({type:"ACTION_FINISHED",session_id:event.session_id, node_id: event.node_id, data}))
                    .catch((err)=>user.send({type:"ACTION_ERROR",session_id:event.session_id, node_id: event.node_id, error: err}));

                    user.send({type:"ACTION_STARTED",session_id:event.session_id, node_id: event.node_id});
                }
                break;
            default:
                console.log("Unknown type: " , event.type);
        }
    }

    startSession(user, session_id)
    {
        var session = new BackendSession(session_id,user);
        this.sessions[session_id] = session;
        session.prepare();
        user.sessions[ session_id ] = session;
        user.send({type:"SESSION_READY",session_id});
    }

    registerHTTP(app)
    {
        app.get('/info',(req, res, next)=>{
            res.send(JSON.stringify(this.getInfo()));
            res.end();
          });
    }

    getInfo()
    {
        return { actions: actionsDB }
    }

    //called when closing the server
    onExit()
    {
        console.log("destroy all!");
    }
}

function tokenize(str)
{
    //The parenthesis in the regex creates a captured group within the quotes
    var myRegexp = /[^\s"]+|"([^"]*)"/gi;
    var result = [];

    do {
        //Each call to exec returns the next regex match as an array
        var match = myRegexp.exec(str);
        if (match != null)
        {
            //Index 1 in the array is the captured group if it exists
            //Index 0 is the matched text, which we use if no captured group exists
            result.push(match[1] ? match[1] : match[0]);
        }
    } while (match != null);
    return result; 
}


export { BackendServer };