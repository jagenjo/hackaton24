
//namespace
var VACIO = {}

//represents one session from one user
class Session {
    constructor(id)
    {
        this.id = id;

        var graph = this.graph = new LGraph();
        var node_const = LiteGraph.createNode("basic/const");
        node_const.pos = [200, 200];
        graph.add(node_const);
        node_const.setValue(4.5);
        
        var node_watch = LiteGraph.createNode("math/formula");
        node_watch.pos = [200, 300];
        graph.add(node_watch);
        
        var node_watch = LiteGraph.createNode("basic/watch");
        node_watch.pos = [700, 200];
        graph.add(node_watch);
        
        node_const.connect(0, node_watch, 0);
        
        graph.start();
    }
}

//connects to backend to execute stuff remotely
class BackendClient {
    constructor()
    {

    }

    connect( url )
    {
        this.socket = new WebSocket(url);
        this.socket.onmessage = this.onMessage.bind(this);
        this.socket.onopen = ()=>{  console.log("socket open"); this.send("hello from client") }
        this.socket.onclose = (err)=>{ console.log("socket closed",err) }
        this.socket.onerror = (err)=>{ console.log("error",err) }
    }

    send(msg)
    {
        if(!this.socket)
            throw("no connected");
        if(msg.constructor !== String)
            msg = JSON.stringify(msg);
        this.socket.send(msg);
    }

    onMessage(msg,ws)
    {
        console.log("Backend <<",msg.data);
    }
}

//shows graph editor in the screen
class Editor {
    constructor( container )
    {
        this.loadConfig();

        this.graphcanvas = new LGraphCanvas( container, null );
        this.graphcanvas.resize();
        this.graphcanvas.autoresize = true;
    }

    loadConfig()
    {
        fetch("./info").then(resp=>resp.json()).then((json)=>{
            this.processConfig(json);
        })
    }

    processConfig(json)
    {
        this.config = json;
        for(var i in json.actions)
        {
            console.log("action: ",i)
            //define node here
        }
    }

    connect(url)
    {
        if(!this.backend)        
            this.backend = new BackendClient();
        this.backend.connect( "ws://" + (url || location.host) );
    }

    setSession(session)
    {
        this.session = session;
        this.graphcanvas.setGraph( this.session.graph );
    }
};



export { Editor, Session, BackendClient }