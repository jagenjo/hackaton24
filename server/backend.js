//in charge of executing the pipeline in the server
class BackendServer
{
    constructor()
    {
        this.last_id = 1;
        this.users = {};
        this.online_users = 0;
    }

    onEnter(ws)
    {
        ws.id = this.last_id++;
        this.users[ws.id] = ws;
        this.online_users++;
        console.log("User joined",ws.id)
    }

    onMessage(msg, channel)
    {
        console.log("<< ", msg);
        channel.send("Welcome");
    }

    onLeave(ws)
    {
        console.log("User left",ws.id);
        this.online_users--;
        delete this.users[ ws.id ];
    }    
}



export { BackendServer };