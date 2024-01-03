import fs from 'fs';
import path from 'path';
import YAML from 'yaml'

//in charge of executing the pipeline in the server
class BackendServer
{
    constructor()
    {
        this.last_id = 1;
        this.users = {};
        this.online_users = 0;

        this.pool = {}
        this.loadPool( "pool/" )
    }

    loadPool(path)
    {
        console.log("loading pool of actions")
        var files = fs.readdirSync(path);
        for(var i = 0; i < files.length; ++i)
            if(files[i].indexOf("yaml") != -1)
            {
                var action = this.loadActionDescription(path + "/" + files[i]);
                this.pool[action.name] = action;
            }
    }

    loadActionDescription(path)
    {
        var data = fs.readFileSync(path, 'utf8');
        var node_info = YAML.parse(data)
        console.log(node_info)
        return node_info
    }

    onEnter(ws)
    {
        ws.id = this.last_id++;
        this.users[ws.id] = ws;
        this.online_users++;
        console.log("User joined",ws.id)
        var welcome = {
            id: ws.id
        }
        ws.send(welcome)
    }

    onMessage(msg, channel)
    {
        console.log("<< ", msg);
        channel.send("Received!");
    }

    onLeave(ws)
    {
        console.log("User left",ws.id);
        this.online_users--;
        delete this.users[ ws.id ];
    }

    registerHTTP(app)
    {
        app.get('/info',(req, res, next)=>{
            res.send(JSON.stringify(this.getInfo()));
            res.end();
          })
    }

    getInfo()
    {
        return { actions: this.pool }
    }
}



export { BackendServer };