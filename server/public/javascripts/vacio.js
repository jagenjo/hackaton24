
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

//connects to backend
class Backend {
    constructor()
    {

    }

    connect( url )
    {
        this.socket = new WebSocket(url);
        this.socket.onmessage = this.onMessage.bind(this);
        this.socket.onopen = ()=>{  console.log("socket open"); this.send("hello from client") }
        this.socket.onclose = (err)=>{ console.log("socket closed",err) }
    }

    send(msg)
    {
        if(!this.socket)
            throw("no connected");
        if(msg.constructor !== String)
            msg = JSON.stringify(msg);
        this.socket.send(msg);
    }

    onMessage(msg)
    {
        console.log("Backend Client",msg);
    }
}

//shows editor
class Editor {
    constructor( container )
    {
        this.graphcanvas = new LGraphCanvas( container, null );
        this.graphcanvas.resize();
        this.graphcanvas.autoresize = true;
    }

    connect(url)
    {
        if(!this.backend)        
            this.backend = new Backend();
        this.backend.connect( "ws://" + (url || location.host) + "/ws/" );
    }

    setSession(session)
    {
        this.session = session;
        this.graphcanvas.setGraph( this.session.graph );
    }
};



export { Editor, Session, Backend }